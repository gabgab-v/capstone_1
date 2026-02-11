import { prisma } from "@/lib/prisma";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH_SIZE = 100;

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function isExpoPushToken(token) {
  return (
    typeof token === "string" &&
    (token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken["))
  );
}

async function postExpoPushNotifications(messages) {
  if (!messages.length) {
    return { tickets: [], invalidTokens: [] };
  }

  const invalidTokens = [];
  const tickets = [];

  const batches = chunkArray(messages, EXPO_BATCH_SIZE);
  for (const batch of batches) {
    try {
      const response = await fetch(EXPO_PUSH_ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batch),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        console.error("Expo push request failed:", response.status, payload);
        continue;
      }

      const data = Array.isArray(payload?.data) ? payload.data : [];
      data.forEach((ticket, index) => {
        tickets.push(ticket);
        if (
          ticket?.status === "error" &&
          ticket?.details?.error === "DeviceNotRegistered"
        ) {
          const token = batch[index]?.to;
          if (token) {
            invalidTokens.push(token);
          }
        }
      });
    } catch (error) {
      console.error("Expo push request error:", error);
    }
  }

  return { tickets, invalidTokens };
}

export async function sendPushToUsers(userIds, { title, body, data } = {}) {
  const uniqueUserIds = Array.from(new Set((userIds || []).filter(Boolean)));
  if (!uniqueUserIds.length) {
    return { sent: 0, invalidated: 0 };
  }

  const tokens = await prisma.pushToken.findMany({
    where: {
      userId: { in: uniqueUserIds },
      isActive: true,
    },
  });

  const validTokens = Array.from(
    new Set(tokens.map((entry) => entry.token).filter(isExpoPushToken)),
  );

  if (!validTokens.length) {
    return { sent: 0, invalidated: 0 };
  }

  const messages = validTokens.map((token) => ({
    to: token,
    title: title ?? "",
    body: body ?? "",
    data: data ?? null,
    sound: "default",
  }));

  const { invalidTokens } = await postExpoPushNotifications(messages);

  if (invalidTokens.length) {
    await prisma.pushToken.updateMany({
      where: {
        token: { in: invalidTokens },
      },
      data: { isActive: false },
    });
  }

  return { sent: messages.length, invalidated: invalidTokens.length };
}

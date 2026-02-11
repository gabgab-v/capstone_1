import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth";
import { isExpoPushToken } from "@/lib/pushNotifications";

function normalizePlatform(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length ? normalized : null;
}

export async function POST(req) {
  try {
    const user = await getUserFromToken(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await req.json().catch(() => null);
    const token = typeof payload?.token === "string" ? payload.token.trim() : "";
    const platform = normalizePlatform(payload?.platform);
    const deviceId =
      typeof payload?.deviceId === "string" && payload.deviceId.trim().length
        ? payload.deviceId.trim()
        : null;

    if (!isExpoPushToken(token)) {
      return NextResponse.json({ error: "Invalid push token." }, { status: 400 });
    }

    await prisma.pushToken.upsert({
      where: { token },
      update: {
        userId: user.id,
        platform,
        deviceId,
        isActive: true,
        lastSeenAt: new Date(),
      },
      create: {
        token,
        userId: user.id,
        platform,
        deviceId,
        isActive: true,
        lastSeenAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("Failed to register push token:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const user = await getUserFromToken(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await req.json().catch(() => null);
    const token = typeof payload?.token === "string" ? payload.token.trim() : "";

    if (!token) {
      return NextResponse.json({ error: "Token is required." }, { status: 400 });
    }

    await prisma.pushToken.updateMany({
      where: {
        token,
        userId: user.id,
      },
      data: {
        isActive: false,
        lastSeenAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("Failed to unregister push token:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

import { prisma } from '@/lib/prisma';

export const participantUserSelect = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
};

export const messageInclude = {
  sender: {
    select: participantUserSelect,
  },
};

export const eventSelect = {
  id: true,
  title: true,
  organizerId: true,
};

export const CHAT_ELIGIBLE_STATUSES = new Set(['APPROVED', 'CONFIRMED']);

export function isChatEligibleStatus(status) {
  if (!status || typeof status !== 'string') {
    return false;
  }
  return CHAT_ELIGIBLE_STATUSES.has(status.trim().toUpperCase());
}

export function buildConversationPayload(conversation, currentUserId) {
  const participants = conversation.participants.map((participant) => ({
    id: participant.id,
    userId: participant.userId,
    lastReadAt: participant.lastReadAt,
    createdAt: participant.createdAt,
    user: participant.user
      ? {
          id: participant.user.id,
          name: participant.user.name,
          email: participant.user.email,
          avatarUrl: participant.user.avatarUrl,
        }
      : null,
    isSelf: participant.userId === currentUserId,
  }));

  const peers = participants.filter((participant) => !participant.isSelf).map((participant) => participant.user);

  const lastMessageRecord = Array.isArray(conversation.messages) ? conversation.messages[0] : null;
  const lastMessage = lastMessageRecord
    ? {
        id: lastMessageRecord.id,
        body: lastMessageRecord.body,
        createdAt: lastMessageRecord.createdAt,
        sender: lastMessageRecord.sender
          ? {
              id: lastMessageRecord.sender.id,
              name: lastMessageRecord.sender.name,
              email: lastMessageRecord.sender.email,
              avatarUrl: lastMessageRecord.sender.avatarUrl,
            }
          : null,
      }
    : null;

  return {
    id: conversation.id,
    event: conversation.event
      ? {
          id: conversation.event.id,
          title: conversation.event.title,
          organizerId: conversation.event.organizerId,
        }
      : null,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    participants,
    peers,
    lastMessage,
  };
}

export async function appendUnreadCounts(conversations, currentUserId) {
  return Promise.all(
    conversations.map(async (conversation) => {
      const payload = buildConversationPayload(conversation, currentUserId);
      const selfParticipant = conversation.participants.find((participant) => participant.userId === currentUserId);

      if (!selfParticipant) {
        return { ...payload, unreadCount: 0 };
      }

      const unreadCount = await prisma.message.count({
        where: {
          conversationId: conversation.id,
          senderId: { not: currentUserId },
          createdAt: {
            gt: selfParticipant.lastReadAt ?? new Date(0),
          },
        },
      });

      return { ...payload, unreadCount };
    }),
  );
}

export async function syncEventGroupConversation(eventId) {
  if (!eventId) {
    return;
  }

  const eventWithBookings = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      organizerId: true,
      bookings: {
        select: {
          userId: true,
          status: true,
        },
      },
    },
  });

  if (!eventWithBookings) {
    return;
  }

  const desiredUserIds = new Set([eventWithBookings.organizerId]);
  for (const booking of eventWithBookings.bookings) {
    if (isChatEligibleStatus(booking.status)) {
      desiredUserIds.add(booking.userId);
    }
  }

  if (desiredUserIds.size < 2) {
    const existingConversation = await prisma.conversation.findUnique({
      where: { eventId },
      select: { id: true },
    });

    if (existingConversation) {
      await prisma.conversationParticipant.deleteMany({
        where: {
          conversationId: existingConversation.id,
          userId: {
            not: eventWithBookings.organizerId,
          },
        },
      });
    }
    return;
  }

  const conversation = await prisma.conversation.findUnique({
    where: { eventId },
    include: {
      participants: {
        select: {
          userId: true,
        },
      },
    },
  });

  const targetUserIds = Array.from(desiredUserIds);
  const now = new Date();

  if (!conversation) {
    await prisma.conversation.create({
      data: {
        event: {
          connect: {
            id: eventId,
          },
        },
        participants: {
          create: targetUserIds.map((userId) => ({
            userId,
            lastReadAt: now,
          })),
        },
      },
    });
    return;
  }

  const existingUserIds = new Set(conversation.participants.map((participant) => participant.userId));
  const toAdd = targetUserIds.filter((userId) => !existingUserIds.has(userId));
  const toRemove = conversation.participants
    .map((participant) => participant.userId)
    .filter((userId) => !desiredUserIds.has(userId));

  const operations = [];

  if (toAdd.length > 0) {
    operations.push(
      prisma.conversationParticipant.createMany({
        data: toAdd.map((userId) => ({
          conversationId: conversation.id,
          userId,
          lastReadAt: now,
        })),
        skipDuplicates: true,
      }),
    );
  }

  if (toRemove.length > 0) {
    operations.push(
      prisma.conversationParticipant.deleteMany({
        where: {
          conversationId: conversation.id,
          userId: {
            in: toRemove,
          },
        },
      }),
    );
  }

  if (operations.length > 0) {
    await prisma.$transaction(operations);
  }
}

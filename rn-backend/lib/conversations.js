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
  status: true,
  completedAt: true,
};

export const CHAT_ELIGIBLE_STATUSES = new Set(['APPROVED', 'CONFIRMED']);
export const NORMAL_CHAT_RETENTION_DAYS = 365;
export const EVENT_CHAT_RETENTION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isChatEligibleStatus(status) {
  if (!status || typeof status !== 'string') {
    return false;
  }
  return CHAT_ELIGIBLE_STATUSES.has(status.trim().toUpperCase());
}

export function getEventChatDeletionMeta(event) {
  if (!event?.completedAt) return null;

  const completedAt = new Date(event.completedAt);
  const deletionAt = new Date(completedAt.getTime() + EVENT_CHAT_RETENTION_DAYS * DAY_MS);
  const msRemaining = deletionAt.getTime() - Date.now();

  if (msRemaining <= 0) {
    return {
      scheduledDeletionAt: deletionAt,
      daysRemaining: 0,
      expired: true,
    };
  }

  return {
    scheduledDeletionAt: deletionAt,
    daysRemaining: Math.ceil(msRemaining / DAY_MS),
    expired: false,
  };
}

export function buildRetentionInfo(conversation) {
  if (conversation?.event) {
    const meta = getEventChatDeletionMeta(conversation.event);
    if (meta) {
      return {
        type: 'event_chat',
        scheduledDeletionAt: meta.scheduledDeletionAt,
        daysRemaining: meta.daysRemaining,
        expired: meta.expired,
        reminder: meta.expired
          ? 'This event chat is scheduled for removal after completion and is no longer available.'
          : `This event chat will be deleted in ${meta.daysRemaining} day(s) after the event was completed.`,
      };
    }
  }

  return {
    type: 'direct_chat',
    messageRetentionDays: NORMAL_CHAT_RETENTION_DAYS,
    reminder: `Messages older than ${NORMAL_CHAT_RETENTION_DAYS} days may be purged.`,
  };
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
          status: conversation.event.status ?? null,
          completedAt: conversation.event.completedAt ?? null,
        }
      : null,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    participants,
    peers,
    lastMessage,
    retention: buildRetentionInfo(conversation),
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
      status: true,
      completedAt: true,
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

  const deletionMeta = getEventChatDeletionMeta(eventWithBookings);
  const now = new Date();

  const existingConversation = await prisma.conversation.findUnique({
    where: { eventId },
    include: {
      participants: {
        select: {
          userId: true,
        },
      },
    },
  });

  if (deletionMeta?.expired || (deletionMeta && deletionMeta.scheduledDeletionAt <= now)) {
    if (existingConversation) {
      await prisma.conversation.delete({ where: { id: existingConversation.id } });
    }
    return;
  }

  const desiredUserIds = new Set([eventWithBookings.organizerId]);
  for (const booking of eventWithBookings.bookings) {
    if (isChatEligibleStatus(booking.status)) {
      desiredUserIds.add(booking.userId);
    }
  }

  if (desiredUserIds.size < 2) {
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

  const targetUserIds = Array.from(desiredUserIds);

  if (!existingConversation) {
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

  const existingUserIds = new Set(existingConversation.participants.map((participant) => participant.userId));
  const toAdd = targetUserIds.filter((userId) => !existingUserIds.has(userId));
  const toRemove = existingConversation.participants
    .map((participant) => participant.userId)
    .filter((userId) => !desiredUserIds.has(userId));

  const operations = [];

  if (toAdd.length > 0) {
    operations.push(
      prisma.conversationParticipant.createMany({
        data: toAdd.map((userId) => ({
          conversationId: existingConversation.id,
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
          conversationId: existingConversation.id,
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

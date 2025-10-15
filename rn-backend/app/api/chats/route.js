import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromToken } from '@/lib/auth';

const participantUserSelect = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
};

const messageInclude = {
  sender: {
    select: participantUserSelect,
  },
};

const eventSelect = {
  id: true,
  title: true,
  organizerId: true,
};

function buildConversationPayload(conversation, currentUserId) {
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

async function appendUnreadCounts(conversations, currentUserId) {
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

export async function GET(request) {
  try {
    const user = await getUserFromToken(request);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const conversations = await prisma.conversation.findMany({
      where: {
        participants: {
          some: {
            userId: user.id,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      include: {
        participants: {
          include: {
            user: {
              select: participantUserSelect,
            },
          },
        },
        event: {
          select: eventSelect,
        },
        messages: {
          take: 1,
          orderBy: {
            createdAt: 'desc',
          },
          include: messageInclude,
        },
      },
    });

    const payload = await appendUnreadCounts(conversations, user.id);

    return NextResponse.json(payload);
  } catch (error) {
    console.error('GET /api/chats failed:', error);
    return NextResponse.json({ error: 'Failed to load conversations.' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const authUser = await getUserFromToken(request);

    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const targetUserId = body?.userId;

    if (!targetUserId || typeof targetUserId !== 'string') {
      return NextResponse.json({ error: 'userId is required.' }, { status: 400 });
    }

    if (targetUserId === authUser.id) {
      return NextResponse.json({ error: 'Cannot start a conversation with yourself.' }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    const existingConversation = await prisma.conversation.findFirst({
      where: {
        AND: [
          {
            participants: {
              some: { userId: authUser.id },
            },
          },
          {
            participants: {
              some: { userId: targetUserId },
            },
          },
          {
            participants: {
              every: {
                userId: {
                  in: [authUser.id, targetUserId],
                },
              },
            },
          },
        ],
      },
      include: {
        participants: {
          include: {
            user: {
              select: participantUserSelect,
            },
          },
        },
        event: {
          select: eventSelect,
        },
        messages: {
          take: 1,
          orderBy: {
            createdAt: 'desc',
          },
          include: messageInclude,
        },
      },
    });

    if (existingConversation) {
      const [payloadWithUnread] = await appendUnreadCounts([existingConversation], authUser.id);
      return NextResponse.json(payloadWithUnread, { status: 200 });
    }

    const conversation = await prisma.conversation.create({
      data: {
        participants: {
          create: [
            {
              userId: authUser.id,
              lastReadAt: new Date(),
            },
            {
              userId: targetUserId,
            },
          ],
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: participantUserSelect,
            },
          },
        },
        event: {
          select: eventSelect,
        },
        messages: {
          take: 1,
          orderBy: {
            createdAt: 'desc',
          },
          include: messageInclude,
        },
      },
    });

    const [payloadWithUnread] = await appendUnreadCounts([conversation], authUser.id);

    return NextResponse.json(payloadWithUnread, { status: 201 });
  } catch (error) {
    console.error('POST /api/chats failed:', error);
    return NextResponse.json({ error: 'Failed to create conversation.' }, { status: 500 });
  }
}

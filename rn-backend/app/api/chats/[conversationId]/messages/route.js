import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromToken } from '@/lib/auth';
import { getEventChatDeletionMeta } from '@/lib/conversations';

const messageUserSelect = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
};

const MAX_PAGE_SIZE = 50;

function toPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function mapMessage(message) {
  if (!message) {
    return null;
  }

  return {
    id: message.id,
    body: message.body,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    sender: message.sender
      ? {
          id: message.sender.id,
          name: message.sender.name,
          email: message.sender.email,
          avatarUrl: message.sender.avatarUrl,
        }
      : null,
  };
}

async function ensureParticipant(conversationId, userId) {
  const participant = await prisma.conversationParticipant.findUnique({
    where: {
      conversationId_userId: {
        conversationId,
        userId,
      },
    },
  });

  return participant;
}

export async function GET(request, { params }) {
  try {
    const authUser = await getUserFromToken(request);

    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const conversationId = params?.conversationId;

    if (!conversationId) {
      return NextResponse.json({ error: 'Conversation id is required.' }, { status: 400 });
    }

    const participant = await ensureParticipant(conversationId, authUser.id);

    if (!participant) {
      return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        event: {
          select: {
            completedAt: true,
          },
        },
      },
    });

    const deletionMeta = getEventChatDeletionMeta(conversation?.event);
    if (deletionMeta?.expired || (deletionMeta && deletionMeta.scheduledDeletionAt <= new Date())) {
      try {
        await prisma.conversation.delete({ where: { id: conversationId } });
      } catch (deleteError) {
        console.error('Failed to delete expired event conversation:', deleteError);
      }
      return NextResponse.json(
        { error: 'This event chat was deleted 7 days after the event was completed.' },
        { status: 410 },
      );
    }

    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor');
    const takeParam = url.searchParams.get('take');
    const markRead = url.searchParams.get('markRead') === 'true';

    const take = Math.min(toPositiveInteger(takeParam, 30), MAX_PAGE_SIZE);

    const messageQuery = {
      where: {
        conversationId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: take + 1,
      include: {
        sender: {
          select: messageUserSelect,
        },
      },
    };

    if (cursor) {
      messageQuery.cursor = { id: cursor };
      messageQuery.skip = 1;
    }

    const messages = await prisma.message.findMany(messageQuery);

    const hasMore = messages.length > take;
    const trimmed = hasMore ? messages.slice(0, -1) : messages;
    const ordered = trimmed.slice().reverse().map(mapMessage).filter(Boolean);

    if (markRead) {
      await prisma.conversationParticipant.update({
        where: {
          conversationId_userId: {
            conversationId,
            userId: authUser.id,
          },
        },
        data: {
          lastReadAt: new Date(),
        },
      });
    }

    const nextCursor = hasMore ? trimmed[trimmed.length - 1].id : null;

    return NextResponse.json({
      messages: ordered,
      nextCursor,
    });
  } catch (error) {
    console.error(`GET /api/chats/${params?.conversationId}/messages failed:`, error);
    return NextResponse.json({ error: 'Failed to load messages.' }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const authUser = await getUserFromToken(request);

    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const conversationId = params?.conversationId;

    if (!conversationId) {
      return NextResponse.json({ error: 'Conversation id is required.' }, { status: 400 });
    }

    const participant = await ensureParticipant(conversationId, authUser.id);

    if (!participant) {
      return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        event: {
          select: {
            completedAt: true,
          },
        },
      },
    });

    const deletionMeta = getEventChatDeletionMeta(conversation?.event);
    if (deletionMeta?.expired || (deletionMeta && deletionMeta.scheduledDeletionAt <= new Date())) {
      try {
        await prisma.conversation.delete({ where: { id: conversationId } });
      } catch (deleteError) {
        console.error('Failed to delete expired event conversation:', deleteError);
      }
      return NextResponse.json(
        { error: 'This event chat was deleted 7 days after the event was completed.' },
        { status: 410 },
      );
    }

    const payload = await request.json();
    const body = typeof payload?.body === 'string' ? payload.body.trim() : '';

    if (!body) {
      return NextResponse.json({ error: 'Message body is required.' }, { status: 400 });
    }

    const now = new Date();

    const [message] = await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId,
          senderId: authUser.id,
          body,
        },
        include: {
          sender: {
            select: messageUserSelect,
          },
        },
      }),
      prisma.conversation.update({
        where: { id: conversationId },
        data: {
          updatedAt: now,
        },
      }),
      prisma.conversationParticipant.update({
        where: {
          conversationId_userId: {
            conversationId,
            userId: authUser.id,
          },
        },
        data: {
          lastReadAt: now,
        },
      }),
    ]);

    return NextResponse.json(mapMessage(message), { status: 201 });
  } catch (error) {
    console.error(`POST /api/chats/${params?.conversationId}/messages failed:`, error);
    return NextResponse.json({ error: 'Failed to send message.' }, { status: 500 });
  }
}

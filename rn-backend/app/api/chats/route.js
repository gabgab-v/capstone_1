import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromToken } from '@/lib/auth';
import {
  participantUserSelect,
  messageInclude,
  eventSelect,
  appendUnreadCounts,
} from '@/lib/conversations';

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

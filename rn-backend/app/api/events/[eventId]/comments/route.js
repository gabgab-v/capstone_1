import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromToken } from '@/lib/auth';

function sanitizeContent(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function ensureEventExists(eventId) {
  if (!eventId) {
    return false;
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true },
  });

  return Boolean(event);
}

function mapComment(comment) {
  if (!comment) {
    return null;
  }

  const { user, ...rest } = comment;
  return {
    ...rest,
    author: user
      ? {
          id: user.id,
          name: user.name ?? null,
          email: user.email ?? null,
          avatarUrl: user.avatarUrl ?? null,
        }
      : null,
  };
}

export async function GET(_request, { params }) {
  try {
    const eventId = params?.eventId;
    if (!(await ensureEventExists(eventId))) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const comments = await prisma.eventComment.findMany({
      where: { eventId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({
      comments: comments.map(mapComment),
      commentCount: comments.length,
    });
  } catch (error) {
    console.error(`GET /api/events/${params?.eventId}/comments error:`, error);
    return NextResponse.json({ error: 'Failed to load comments' }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const authUser = await getUserFromToken(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const eventId = params?.eventId;
    if (!(await ensureEventExists(eventId))) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const payload = await request.json();
    const content = sanitizeContent(payload?.content);
    if (!content) {
      return NextResponse.json({ error: 'Please enter a comment.' }, { status: 400 });
    }

    const comment = await prisma.eventComment.create({
      data: {
        content,
        eventId,
        userId: authUser.id,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    });

    const commentCount = await prisma.eventComment.count({ where: { eventId } });

    return NextResponse.json(
      {
        comment: mapComment(comment),
        commentCount,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error(`POST /api/events/${params?.eventId}/comments error:`, error);
    return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 });
  }
}

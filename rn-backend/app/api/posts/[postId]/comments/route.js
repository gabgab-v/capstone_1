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

async function ensurePostExists(postId) {
  if (!postId) {
    return false;
  }

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true },
  });

  return Boolean(post);
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
    const postId = params?.postId;
    if (!(await ensurePostExists(postId))) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const comments = await prisma.postComment.findMany({
      where: { postId },
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
    });
  } catch (error) {
    console.error(`GET /api/posts/${params?.postId}/comments error:`, error);
    return NextResponse.json({ error: 'Failed to load comments' }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const authUser = await getUserFromToken(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const postId = params?.postId;
    if (!(await ensurePostExists(postId))) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const payload = await request.json();
    const content = sanitizeContent(payload?.content);
    if (!content) {
      return NextResponse.json({ error: 'Please enter a comment.' }, { status: 400 });
    }

    const comment = await prisma.postComment.create({
      data: {
        content,
        postId,
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

    const commentCount = await prisma.postComment.count({ where: { postId } });

    return NextResponse.json(
      {
        comment: mapComment(comment),
        commentCount,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error(`POST /api/posts/${params?.postId}/comments error:`, error);
    return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 });
  }
}

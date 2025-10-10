import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromToken } from '@/lib/auth';

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

    await prisma.postLike.upsert({
      where: {
        postId_userId: {
          postId,
          userId: authUser.id,
        },
      },
      update: {},
      create: {
        postId,
        userId: authUser.id,
      },
    });

    const likeCount = await prisma.postLike.count({ where: { postId } });

    return NextResponse.json({ liked: true, likeCount });
  } catch (error) {
    console.error(`POST /api/posts/${params?.postId}/like error:`, error);
    return NextResponse.json({ error: 'Failed to like post' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const authUser = await getUserFromToken(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const postId = params?.postId;
    if (!(await ensurePostExists(postId))) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    await prisma.postLike.deleteMany({
      where: {
        postId,
        userId: authUser.id,
      },
    });

    const likeCount = await prisma.postLike.count({ where: { postId } });

    return NextResponse.json({ liked: false, likeCount });
  } catch (error) {
    console.error(`DELETE /api/posts/${params?.postId}/like error:`, error);
    return NextResponse.json({ error: 'Failed to unlike post' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromToken } from '@/lib/auth';

async function buildFollowSummary(targetUserId, viewerId) {
  const [followersCount, followingCount, viewerFollowingCount, followRecord] = await Promise.all([
    prisma.follow.count({
      where: { followingId: targetUserId },
    }),
    prisma.follow.count({
      where: { followerId: targetUserId },
    }),
    prisma.follow.count({
      where: { followerId: viewerId },
    }),
    prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: viewerId,
          followingId: targetUserId,
        },
      },
    }),
  ]);

  return {
    followersCount,
    followingCount,
    viewerFollowingCount,
    isFollowing: Boolean(followRecord),
  };
}

function resolveTargetUserId(rawUserId, viewerId) {
  if (!rawUserId) {
    return null;
  }

  if (rawUserId === 'me') {
    return viewerId;
  }

  return rawUserId;
}

export async function POST(request, { params }) {
  try {
    const authUser = await getUserFromToken(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const targetUserId = resolveTargetUserId(params?.userId, authUser.id);
    if (!targetUserId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    if (targetUserId === authUser.id) {
      return NextResponse.json({ error: 'You cannot follow yourself' }, { status: 400 });
    }

    const targetExists = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });

    if (!targetExists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await prisma.follow.upsert({
      where: {
        followerId_followingId: {
          followerId: authUser.id,
          followingId: targetUserId,
        },
      },
      update: {},
      create: {
        followerId: authUser.id,
        followingId: targetUserId,
      },
    });

    const summary = await buildFollowSummary(targetUserId, authUser.id);
    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    console.error('POST /api/users/[userId]/follow error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const authUser = await getUserFromToken(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const targetUserId = resolveTargetUserId(params?.userId, authUser.id);
    if (!targetUserId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    if (targetUserId === authUser.id) {
      return NextResponse.json({ error: 'You cannot unfollow yourself' }, { status: 400 });
    }

    const targetExists = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });

    if (!targetExists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await prisma.follow.deleteMany({
      where: {
        followerId: authUser.id,
        followingId: targetUserId,
      },
    });

    const summary = await buildFollowSummary(targetUserId, authUser.id);
    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    console.error('DELETE /api/users/[userId]/follow error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

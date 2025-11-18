import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromToken } from '@/lib/auth';

const CONNECTION_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
  bio: true,
  role: true,
};

function parseKind(searchParams) {
  const value = (searchParams.get('kind') || 'followers').toLowerCase();
  return value === 'following' ? 'following' : 'followers';
}

function parseLimit(searchParams) {
  const raw = Number(searchParams.get('limit'));
  if (Number.isFinite(raw)) {
    return Math.min(Math.max(Math.floor(raw), 1), 200);
  }
  return 50;
}

function buildWhere(kind, targetUserId, searchQuery) {
  const base =
    kind === 'followers'
      ? { followingId: targetUserId }
      : { followerId: targetUserId };

  if (!searchQuery) {
    return base;
  }

  const relationKey = kind === 'followers' ? 'follower' : 'following';
  return {
    ...base,
    [relationKey]: {
      is: {
        OR: [
          { name: { contains: searchQuery, mode: 'insensitive' } },
          { email: { contains: searchQuery, mode: 'insensitive' } },
          { bio: { contains: searchQuery, mode: 'insensitive' } },
        ],
      },
    },
  };
}

export async function GET(request, { params }) {
  try {
    const authUser = await getUserFromToken(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rawUserId = params?.userId;
    if (!rawUserId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    const targetUserId = rawUserId === 'me' ? authUser.id : rawUserId;

    const userExists = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });

    if (!userExists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const searchParams = request.nextUrl.searchParams;
    const kind = parseKind(searchParams);
    const limit = parseLimit(searchParams);
    const query = (searchParams.get('q') ?? '').trim();

    const where = buildWhere(kind, targetUserId, query);
    const include =
      kind === 'followers'
        ? { follower: { select: CONNECTION_USER_SELECT } }
        : { following: { select: CONNECTION_USER_SELECT } };

    const records = await prisma.follow.findMany({
      where,
      include,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const users = records
      .map((record) =>
        kind === 'followers' ? record.follower : record.following,
      )
      .filter(Boolean);

    let viewerFollowingRecords = [];
    if (users.length) {
      viewerFollowingRecords = await prisma.follow.findMany({
        where: {
          followerId: authUser.id,
          followingId: { in: users.map((user) => user.id) },
        },
        select: { followingId: true },
      });
    }

    const viewerFollowingSet = new Set(
      viewerFollowingRecords.map((record) => record.followingId),
    );

    const payload = users.map((user) => ({
      id: user.id,
      name: user.name ?? null,
      email: user.email ?? null,
      avatarUrl: user.avatarUrl ?? null,
      bio: user.bio ?? null,
      role: user.role ?? null,
      isSelf: user.id === authUser.id,
      isViewerFollowing: viewerFollowingSet.has(user.id),
    }));

    return NextResponse.json({
      kind,
      count: payload.length,
      users: payload,
    });
  } catch (error) {
    console.error('GET /api/users/[userId]/connections error:', error);
    return NextResponse.json(
      { error: 'Failed to load connections' },
      { status: 500 },
    );
  }
}

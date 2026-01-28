import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const SEARCH_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
  bio: true,
  role: true,
};

function parseLimit(searchParams) {
  const raw = Number(searchParams.get('limit'));
  if (Number.isFinite(raw)) {
    return Math.min(Math.max(Math.floor(raw), 1), 50);
  }
  return 20;
}

function buildSearchWhere(query, viewerId) {
  if (!query) {
    return {
      id: { not: viewerId },
    };
  }

  return {
    id: { not: viewerId },
    OR: [
      { name: { contains: query, mode: 'insensitive' } },
      { email: { contains: query, mode: 'insensitive' } },
      { bio: { contains: query, mode: 'insensitive' } },
    ],
  };
}

export async function GET(request) {
  try {
    const authUser = await getUserFromToken(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const query = (searchParams.get('q') ?? '').trim();
    if (!query) {
      return NextResponse.json({ count: 0, users: [] });
    }

    const limit = parseLimit(searchParams);
    const users = await prisma.user.findMany({
      where: buildSearchWhere(query, authUser.id),
      select: SEARCH_USER_SELECT,
      orderBy: [{ name: 'asc' }, { createdAt: 'desc' }],
      take: limit,
    });

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

    return NextResponse.json({ count: payload.length, users: payload });
  } catch (error) {
    console.error('GET /api/users/search error:', error);
    return NextResponse.json(
      { error: 'Failed to search users.' },
      { status: 500 },
    );
  }
}

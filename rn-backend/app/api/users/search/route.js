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
  organizerTrustTier: true,
  expertBadgeAwarded: true,
  experienceLevelLocked: true,
  lastActiveAt: true,
  createdAt: true,
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

function buildBadges(user) {
  const badges = [];
  if (user.organizerTrustTier === 'VERIFIED_ORGANIZER') {
    badges.push('VERIFIED_ORGANIZER');
  } else if (user.role === 'ORGANIZER') {
    badges.push('ORGANIZER');
  }
  if (user.expertBadgeAwarded || user.experienceLevelLocked) {
    badges.push('EXPERT');
  }
  return badges;
}

function mapUser(user, viewerId, viewerFollowingSet, mutualCounts) {
  return {
    id: user.id,
    name: user.name ?? null,
    email: user.email ?? null,
    avatarUrl: user.avatarUrl ?? null,
    bio: user.bio ?? null,
    role: user.role ?? null,
    badges: buildBadges(user),
    isSelf: user.id === viewerId,
    isViewerFollowing: viewerFollowingSet.has(user.id),
    mutualCount: mutualCounts.get(user.id) ?? 0,
  };
}

async function buildMutualCounts(viewerFollowingIds, candidateIds) {
  const counts = new Map();
  if (!viewerFollowingIds.length || !candidateIds.length) {
    return counts;
  }

  const records = await prisma.follow.findMany({
    where: {
      followerId: { in: viewerFollowingIds },
      followingId: { in: candidateIds },
    },
    select: { followingId: true },
  });

  records.forEach((record) => {
    counts.set(record.followingId, (counts.get(record.followingId) ?? 0) + 1);
  });

  return counts;
}

export async function GET(request) {
  try {
    const authUser = await getUserFromToken(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const query = (searchParams.get('q') ?? '').trim();
    const limit = parseLimit(searchParams);
    const viewerFollowingRecords = await prisma.follow.findMany({
      where: { followerId: authUser.id },
      select: { followingId: true },
    });
    const viewerFollowingIds = viewerFollowingRecords.map(
      (record) => record.followingId,
    );
    const viewerFollowingSet = new Set(viewerFollowingIds);

    if (query) {
      const users = await prisma.user.findMany({
        where: buildSearchWhere(query, authUser.id),
        select: SEARCH_USER_SELECT,
        orderBy: [{ name: 'asc' }, { createdAt: 'desc' }],
        take: limit,
      });

      const mutualCounts = await buildMutualCounts(
        viewerFollowingIds,
        users.map((user) => user.id),
      );
      const payload = users.map((user) =>
        mapUser(user, authUser.id, viewerFollowingSet, mutualCounts),
      );

      return NextResponse.json({ count: payload.length, users: payload });
    }

    const suggestionLimit = Math.min(limit, 12);
    const badgedLimit = Math.min(limit, 12);

    let suggestedUsers = [];
    let suggestedMutualCounts = new Map();

    if (viewerFollowingIds.length) {
      const suggestionGroups = await prisma.follow.groupBy({
        by: ['followingId'],
        where: {
          followerId: { in: viewerFollowingIds },
          followingId: { notIn: [authUser.id, ...viewerFollowingIds] },
        },
        _count: { followingId: true },
        orderBy: { _count: { followingId: 'desc' } },
        take: suggestionLimit * 3,
      });

      const suggestionIds = suggestionGroups.map((entry) => entry.followingId);
      if (suggestionIds.length) {
        const users = await prisma.user.findMany({
          where: { id: { in: suggestionIds } },
          select: SEARCH_USER_SELECT,
        });

        const countMap = new Map(
          suggestionGroups.map((entry) => [
            entry.followingId,
            entry._count.followingId,
          ]),
        );

        users.sort(
          (a, b) => (countMap.get(b.id) ?? 0) - (countMap.get(a.id) ?? 0),
        );
        suggestedUsers = users.slice(0, suggestionLimit);
        suggestedMutualCounts = countMap;
      }
    }

    if (!suggestedUsers.length) {
      const excludeIds = [authUser.id, ...viewerFollowingIds];
      suggestedUsers = await prisma.user.findMany({
        where: { id: { notIn: excludeIds } },
        select: SEARCH_USER_SELECT,
        orderBy: [{ lastActiveAt: 'desc' }, { createdAt: 'desc' }],
        take: suggestionLimit,
      });
      suggestedMutualCounts = await buildMutualCounts(
        viewerFollowingIds,
        suggestedUsers.map((user) => user.id),
      );
    }

    const suggestedIds = new Set(suggestedUsers.map((user) => user.id));
    const excludedBadgedIds = new Set([
      authUser.id,
      ...viewerFollowingIds,
      ...suggestedIds,
    ]);

    const badgedUsers = await prisma.user.findMany({
      where: {
        id: { notIn: Array.from(excludedBadgedIds) },
        OR: [
          { expertBadgeAwarded: true },
          { experienceLevelLocked: true },
          { organizerTrustTier: 'VERIFIED_ORGANIZER' },
          { role: 'ORGANIZER' },
        ],
      },
      select: SEARCH_USER_SELECT,
      orderBy: [{ lastActiveAt: 'desc' }, { createdAt: 'desc' }],
      take: badgedLimit,
    });

    const badgedMutualCounts = await buildMutualCounts(
      viewerFollowingIds,
      badgedUsers.map((user) => user.id),
    );

    const suggestedPayload = suggestedUsers.map((user) =>
      mapUser(user, authUser.id, viewerFollowingSet, suggestedMutualCounts),
    );
    const badgedPayload = badgedUsers.map((user) =>
      mapUser(user, authUser.id, viewerFollowingSet, badgedMutualCounts),
    );

    return NextResponse.json({
      count: 0,
      users: [],
      suggested: suggestedPayload,
      badged: badgedPayload,
    });
  } catch (error) {
    console.error('GET /api/users/search error:', error);
    return NextResponse.json(
      { error: 'Failed to search users.' },
      { status: 500 },
    );
  }
}

import { prisma } from '@/lib/prisma';

export const PostVisibility = {
  PUBLIC: 'PUBLIC',
  FRIENDS: 'FRIENDS',
  PRIVATE: 'PRIVATE',
};

export function sanitizePostContent(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function sanitizePostImageUrls(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
}

export function sanitizePostTrailId(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function normalizePostVisibility(value) {
  if (typeof value !== 'string') {
    return PostVisibility.PUBLIC;
  }
  const normalized = value.trim().toUpperCase();
  if (normalized === 'FRIENDS' || normalized === 'FOLLOWERS') {
    return PostVisibility.FRIENDS;
  }
  if (normalized === 'PRIVATE' || normalized === 'ONLY_ME' || normalized === 'ME') {
    return PostVisibility.PRIVATE;
  }
  return PostVisibility.PUBLIC;
}

export function buildPostInclude(currentUserId) {
  const include = {
    user: {
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
      },
    },
    trail: {
      select: {
        id: true,
        label: true,
        startedAt: true,
        endedAt: true,
        totalDistanceMeters: true,
        geoJson: true,
        createdAt: true,
        updatedAt: true,
      },
    },
    _count: {
      select: {
        likes: true,
        comments: true,
      },
    },
  };

  if (currentUserId) {
    include.likes = {
      where: { userId: currentUserId },
      select: { id: true },
    };
  }

  return include;
}

function mapTrail(trail) {
  if (!trail) {
    return null;
  }
  return {
    id: trail.id,
    label: trail.label ?? null,
    startedAt: trail.startedAt,
    endedAt: trail.endedAt ?? null,
    totalDistanceMeters:
      typeof trail.totalDistanceMeters === 'number'
        ? trail.totalDistanceMeters
        : trail.totalDistanceMeters == null
          ? null
          : Number(trail.totalDistanceMeters),
    geoJson: trail.geoJson ?? null,
    createdAt: trail.createdAt,
    updatedAt: trail.updatedAt,
  };
}

export function mapPost(post) {
  if (!post) {
    return null;
  }

  const { user, likes, _count, ...rest } = post;
  return {
    ...rest,
    content: post.content ?? '',
    imageUrls: post.imageUrls ?? [],
    visibility: post.visibility ?? PostVisibility.PUBLIC,
    likeCount: _count?.likes ?? 0,
    commentCount: _count?.comments ?? 0,
    likedByCurrentUser: Array.isArray(likes) ? likes.length > 0 : false,
    trail: mapTrail(post.trail),
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

export function buildPostVisibilityWhereClause(viewerId) {
  if (!viewerId) {
    return { visibility: PostVisibility.PUBLIC };
  }

  return {
    OR: [
      { userId: viewerId },
      { visibility: PostVisibility.PUBLIC },
      {
        visibility: PostVisibility.FRIENDS,
        AND: [
          { user: { followers: { some: { followerId: viewerId } } } },
          { user: { following: { some: { followingId: viewerId } } } },
        ],
      },
    ],
  };
}

async function hasMutualFollow(userAId, userBId) {
  if (!userAId || !userBId) {
    return false;
  }
  if (userAId === userBId) {
    return true;
  }

  const connections = await prisma.follow.findMany({
    where: {
      OR: [
        { followerId: userAId, followingId: userBId },
        { followerId: userBId, followingId: userAId },
      ],
    },
    select: {
      followerId: true,
      followingId: true,
    },
  });

  if (connections.length < 2) {
    return false;
  }

  let aFollowsB = false;
  let bFollowsA = false;
  for (const connection of connections) {
    if (connection.followerId === userAId && connection.followingId === userBId) {
      aFollowsB = true;
    }
    if (connection.followerId === userBId && connection.followingId === userAId) {
      bFollowsA = true;
    }
  }

  return aFollowsB && bFollowsA;
}

async function canViewerAccessPostRecord(post, viewerId) {
  if (!post) {
    return false;
  }

  const visibility = post.visibility ?? PostVisibility.PUBLIC;
  if (visibility === PostVisibility.PUBLIC) {
    return true;
  }

  if (!viewerId) {
    return false;
  }

  if (post.userId === viewerId) {
    return true;
  }

  if (visibility === PostVisibility.PRIVATE) {
    return false;
  }

  if (visibility === PostVisibility.FRIENDS) {
    return hasMutualFollow(post.userId, viewerId);
  }

  return false;
}

export async function ensureViewerCanAccessPost(postId, viewerId) {
  if (!postId) {
    return { post: null, allowed: false };
  }

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      id: true,
      userId: true,
      visibility: true,
    },
  });

  if (!post) {
    return { post: null, allowed: false };
  }

  const allowed = await canViewerAccessPostRecord(post, viewerId);
  return { post, allowed };
}

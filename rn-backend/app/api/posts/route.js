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

function sanitizeImageUrls(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
}

function sanitizeTrailId(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function buildPostInclude(currentUserId) {
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

function mapPost(post) {
  if (!post) {
    return null;
  }

  const { user, likes, _count, ...rest } = post;
  return {
    ...rest,
    content: post.content ?? '',
    imageUrls: post.imageUrls ?? [],
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

export async function GET(request) {
  try {
    const authUser = await getUserFromToken(request);
    const url = request.nextUrl;
    const userId = url.searchParams.get('userId');

    const where = userId ? { userId } : {};

    const include = buildPostInclude(authUser?.id);

    const posts = await prisma.post.findMany({
      where,
      include,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(posts.map(mapPost));
  } catch (error) {
    console.error('GET /api/posts error:', error);
    return NextResponse.json({ error: 'Failed to load posts' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const authUser = await getUserFromToken(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json();
    const content = sanitizeContent(payload?.content);
    const imageUrls = sanitizeImageUrls(payload?.imageUrls);
    const trailId = sanitizeTrailId(payload?.trailId);

    if (!content && imageUrls.length === 0) {
      return NextResponse.json(
        { error: 'Please add some text or include at least one image.' },
        { status: 400 },
      );
    }

    let selectedTrailId = null;
    if (trailId) {
      const trail = await prisma.trail.findFirst({
        where: { id: trailId, userId: authUser.id },
        select: { id: true },
      });
      if (!trail) {
        return NextResponse.json(
          { error: 'Trail not found or not owned by this user.' },
          { status: 404 },
        );
      }
      selectedTrailId = trail.id;
    }

    const post = await prisma.post.create({
      data: {
        content,
        imageUrls,
        userId: authUser.id,
        trailId: selectedTrailId,
      },
    });

    const postWithRelations = await prisma.post.findUnique({
      where: { id: post.id },
      include: buildPostInclude(authUser.id),
    });

    return NextResponse.json(mapPost(postWithRelations), { status: 201 });
  } catch (error) {
    console.error('POST /api/posts error:', error);
    return NextResponse.json({ error: 'Failed to create post' }, { status: 500 });
  }
}

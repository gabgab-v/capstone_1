import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromToken } from '@/lib/auth';

function mapPost(post) {
  if (!post) {
    return null;
  }

  const { user, ...rest } = post;
  return {
    ...rest,
    content: post.content ?? '',
    imageUrls: post.imageUrls ?? [],
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

const userProfileSelect = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  bio: true,
  experienceLevel: true,
  preferredDifficulty: true,
  preferredTrailType: true,
  preferredDurationHrs: true,
  budgetRange: true,
};

function shouldIncludePosts(searchParams) {
  const value = searchParams.get('includePosts');
  if (value === null) {
    return false;
  }
  return ['1', 'true', 'yes'].includes(value.toLowerCase());
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

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: userProfileSelect,
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const isSelf = authUser.id === targetUserId;

    const includePosts = shouldIncludePosts(request.nextUrl.searchParams);

    const [followersCount, followingCount, postCount, isFollowing, posts] = await Promise.all([
      prisma.follow.count({
        where: { followingId: targetUserId },
      }),
      prisma.follow.count({
        where: { followerId: targetUserId },
      }),
      prisma.post.count({
        where: { userId: targetUserId },
      }),
      isSelf
        ? Promise.resolve(false)
        : prisma.follow
            .findUnique({
              where: {
                followerId_followingId: {
                  followerId: authUser.id,
                  followingId: targetUserId,
                },
              },
            })
            .then((follow) => Boolean(follow)),
      includePosts
        ? prisma.post
            .findMany({
              where: { userId: targetUserId },
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
              orderBy: { createdAt: 'desc' },
            })
            .then((data) => data.map(mapPost))
        : Promise.resolve([]),
    ]);

    const response = {
      ...user,
      followersCount,
      followingCount,
      postCount,
      isSelf,
      isFollowing,
    };

    if (includePosts) {
      response.posts = posts;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error(`GET /api/users/[userId] error:`, error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

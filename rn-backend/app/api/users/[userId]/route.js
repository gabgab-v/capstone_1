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
  role: true,
  experienceLevel: true,
  experienceLevelLocked: true,
  expertBadgeAwarded: true,
  expertVerifiedAt: true,
  preferredDifficulty: true,
  preferredTrailType: true,
  preferredDurationHrs: true,
  preferredDistanceKm: true,
  preferredElevationM: true,
  budgetRange: true,
  previousPreferences: true,
  organizerApplication: {
    select: {
      organizationName: true,
    },
  },
};

const COMPLETED_BOOKING_STATUSES = ['APPROVED', 'CONFIRMED'];

function shouldIncludePosts(searchParams) {
  const value = searchParams.get('includePosts');
  if (value === null) {
    return false;
  }
  return ['1', 'true', 'yes'].includes(value.toLowerCase());
}

function shouldIncludeCompletedEvents(searchParams) {
  const value = searchParams.get('includeCompletedEvents');
  if (value === null) {
    return false;
  }
  return ['1', 'true', 'yes'].includes(value.toLowerCase());
}

function shouldIncludeTrailRecordings(searchParams) {
  const value = searchParams.get('includeTrailRecordings');
  if (value === null) {
    return false;
  }
  return ['1', 'true', 'yes'].includes(value.toLowerCase());
}

function mapTrailRecording(trail) {
  if (!trail) {
    return null;
  }
  return {
    id: trail.id,
    label: trail.label ?? null,
    originTrailId: trail.originTrailId ?? null,
    startedAt: trail.startedAt,
    endedAt: trail.endedAt,
    totalDistanceMeters:
      typeof trail.totalDistanceMeters === 'number'
        ? trail.totalDistanceMeters
        : trail.totalDistanceMeters == null
          ? null
          : Number(trail.totalDistanceMeters),
    createdAt: trail.createdAt,
    updatedAt: trail.updatedAt,
    geoJson: trail.geoJson ?? null,
    samples: trail.samples ?? null,
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

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: userProfileSelect,
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const isSelf = authUser.id === targetUserId;

    const includePosts = shouldIncludePosts(request.nextUrl.searchParams);
    const includeCompletedEvents = shouldIncludeCompletedEvents(request.nextUrl.searchParams);
    const includeTrailRecordings = shouldIncludeTrailRecordings(request.nextUrl.searchParams);

    const [followersCount, followingCount, postCount, isFollowing, posts, trailRecordings] =
      await Promise.all([
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
        includeTrailRecordings
          ? prisma.trail.findMany({
              where: { userId: targetUserId },
              orderBy: { startedAt: 'desc' },
              take: 10,
              select: {
                id: true,
                label: true,
                originTrailId: true,
                startedAt: true,
                endedAt: true,
                totalDistanceMeters: true,
                createdAt: true,
                updatedAt: true,
                geoJson: true,
                samples: true,
              },
            })
          : Promise.resolve([]),
      ]);

    const response = {
      ...user,
      followersCount,
      followingCount,
      postCount,
      isSelf,
      isFollowing,
      viewerCanReview: !isSelf && user.role === 'ORGANIZER',
    };

    if (user.role === 'ORGANIZER') {
      const [aggregate, recentReviews, viewerReview] = await Promise.all([
        prisma.organizerReview.aggregate({
          where: { organizerId: targetUserId },
          _avg: { rating: true },
          _count: true,
        }),
        prisma.organizerReview.findMany({
          where: { organizerId: targetUserId },
          include: {
            reviewer: {
              select: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        prisma.organizerReview.findUnique({
          where: {
            organizerId_reviewerId: {
              organizerId: targetUserId,
              reviewerId: authUser.id,
            },
          },
        }),
      ]);

      const average = aggregate._avg?.rating ?? null;
      const reviewCount = typeof aggregate._count === 'number' ? aggregate._count : 0;

      response.organizerRating = {
        averageRating: average === null ? null : Number(average),
        reviewCount,
        reviews: recentReviews.map((review) => ({
          id: review.id,
          rating: review.rating,
          feedback: review.feedback ?? null,
          createdAt: review.createdAt,
          reviewer: review.reviewer
            ? {
                id: review.reviewer.id,
                name: review.reviewer.name ?? null,
                email: review.reviewer.email ?? null,
                avatarUrl: review.reviewer.avatarUrl ?? null,
              }
            : null,
        })),
        viewerReview: viewerReview
          ? {
              id: viewerReview.id,
              rating: viewerReview.rating,
              feedback: viewerReview.feedback ?? null,
              createdAt: viewerReview.createdAt,
              updatedAt: viewerReview.updatedAt,
            }
          : null,
      };
    } else {
      response.organizerRating = null;
    }

    if (includePosts) {
      response.posts = posts;
    }

    response.trailRecordings = includeTrailRecordings
      ? trailRecordings.map(mapTrailRecording).filter(Boolean)
      : [];

    if (includeCompletedEvents) {
      const completedBookings = await prisma.booking.findMany({
        where: {
          userId: targetUserId,
          status: { in: COMPLETED_BOOKING_STATUSES },
          event: {
            completedAt: {
              not: null,
            },
          },
        },
        orderBy: [
          { event: { completedAt: 'desc' } },
          { createdAt: 'desc' },
        ],
        take: 20,
        select: {
          id: true,
          status: true,
          createdAt: true,
          event: {
            select: {
              id: true,
              title: true,
              imageUrl: true,
              completedAt: true,
              startsAt: true,
              trailType: true,
              difficulty: true,
              distanceKm: true,
              durationHrs: true,
              elevationM: true,
              trailDistanceMeters: true,
              locationName: true,
              locationLatitude: true,
              locationLongitude: true,
              organizer: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  avatarUrl: true,
                },
              },
            },
          },
        },
      });

      response.completedEvents = completedBookings
        .map((booking) => {
          if (!booking.event) {
            return null;
          }

          return {
            bookingId: booking.id,
            bookingStatus: booking.status ?? null,
            recordedAt: booking.createdAt,
            id: booking.event.id,
            title: booking.event.title ?? null,
            imageUrl: booking.event.imageUrl ?? null,
            completedAt: booking.event.completedAt,
            startsAt: booking.event.startsAt,
            trailType: booking.event.trailType ?? null,
            difficulty: booking.event.difficulty ?? null,
            distanceKm: booking.event.distanceKm ?? null,
            durationHrs: booking.event.durationHrs ?? null,
            elevationM: booking.event.elevationM ?? null,
            trailDistanceMeters: booking.event.trailDistanceMeters ?? null,
            locationName: booking.event.locationName ?? null,
            locationLatitude: booking.event.locationLatitude ?? null,
            locationLongitude: booking.event.locationLongitude ?? null,
            organizer: booking.event.organizer
              ? {
                  id: booking.event.organizer.id,
                  name: booking.event.organizer.name ?? null,
                  email: booking.event.organizer.email ?? null,
                  avatarUrl: booking.event.organizer.avatarUrl ?? null,
                }
              : null,
          };
        })
        .filter(Boolean);
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error(`GET /api/users/[userId] error:`, error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

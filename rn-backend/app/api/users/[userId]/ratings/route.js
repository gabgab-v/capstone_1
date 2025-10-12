import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromToken } from '@/lib/auth';

async function getRatingSummary(organizerId, viewerId) {
  const [aggregate, recentReviews, viewerReview] = await Promise.all([
    prisma.organizerReview.aggregate({
      where: { organizerId },
      _avg: { rating: true },
      _count: true,
    }),
    prisma.organizerReview.findMany({
      where: { organizerId },
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
          organizerId,
          reviewerId: viewerId,
        },
      },
    }),
  ]);

  const average = aggregate._avg?.rating ?? null;
  const reviewCount = typeof aggregate._count === 'number' ? aggregate._count : 0;

  return {
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
}

function sanitizeFeedback(feedback) {
  if (typeof feedback !== 'string') {
    return null;
  }

  const trimmed = feedback.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function POST(request, { params }) {
  try {
    const authUser = await getUserFromToken(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizerIdParam = params?.userId;
    if (!organizerIdParam) {
      return NextResponse.json({ error: 'Missing organizer id' }, { status: 400 });
    }

    const organizerId = organizerIdParam === 'me' ? authUser.id : organizerIdParam;

    if (organizerId === authUser.id) {
      return NextResponse.json({ error: 'You cannot rate yourself.' }, { status: 400 });
    }

    const organizer = await prisma.user.findUnique({
      where: { id: organizerId },
      select: { id: true, role: true },
    });

    if (!organizer || organizer.role !== 'ORGANIZER') {
      return NextResponse.json({ error: 'Organizer not found.' }, { status: 404 });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const rating = Number(payload?.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Rating must be an integer between 1 and 5.' }, { status: 400 });
    }

    const feedback = sanitizeFeedback(payload?.feedback);

    const review = await prisma.organizerReview.upsert({
      where: {
        organizerId_reviewerId: {
          organizerId,
          reviewerId: authUser.id,
        },
      },
      create: {
        organizerId,
        reviewerId: authUser.id,
        rating,
        feedback,
      },
      update: {
        rating,
        feedback,
      },
      select: {
        id: true,
        rating: true,
        feedback: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const organizerRating = await getRatingSummary(organizerId, authUser.id);

    return NextResponse.json({
      review,
      organizerRating,
    });
  } catch (error) {
    console.error('POST /api/users/[userId]/ratings error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const authUser = await getUserFromToken(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizerIdParam = params?.userId;
    if (!organizerIdParam) {
      return NextResponse.json({ error: 'Missing organizer id' }, { status: 400 });
    }

    const organizerId = organizerIdParam === 'me' ? authUser.id : organizerIdParam;

    const existingReview = await prisma.organizerReview.findUnique({
      where: {
        organizerId_reviewerId: {
          organizerId,
          reviewerId: authUser.id,
        },
      },
    });

    if (!existingReview) {
      return NextResponse.json({ error: 'Review not found.' }, { status: 404 });
    }

    await prisma.organizerReview.delete({
      where: {
        organizerId_reviewerId: {
          organizerId,
          reviewerId: authUser.id,
        },
      },
    });

    const organizerRating = await getRatingSummary(organizerId, authUser.id);

    return NextResponse.json({
      review: null,
      organizerRating,
    });
  } catch (error) {
    console.error('DELETE /api/users/[userId]/ratings error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

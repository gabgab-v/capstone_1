import { NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const userSelect = {
  id: true,
  email: true,
  name: true,
  gcashNumber: true,
  avatarUrl: true,
  bio: true,
  birthdate: true,
  experienceLevel: true,
  experienceLevelLocked: true,
  expertBadgeAwarded: true,
  expertVerifiedAt: true,
  preferredDifficulty: true,
  preferredTrailType: true,
  preferredDurationHrs: true,
  preferredDistanceKm: true,
  preferredElevationM: true,
  preferredMountains: true,
  mountainSuggestionsEnabled: true,
  budgetRange: true,
  previousPreferences: true,
  role: true,
  organizerRequestPending: true,
  organizerApplication: {
    select: {
      id: true,
      status: true,
      legalName: true,
      organizationName: true,
      certifications: true,
      governmentIdNumber: true,
      experienceYears: true,
      bio: true,
      additionalNotes: true,
      documentUrls: true,
      reviewNotes: true,
      reviewedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  expertApplication: {
    select: {
      id: true,
      status: true,
      summitName: true,
      summitDate: true,
      peakPhotoUrl: true,
      certificateUrl: true,
      additionalNotes: true,
      reviewNotes: true,
      reviewedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  businessVerification: {
    select: {
      id: true,
      status: true,
      businessName: true,
      businessAddress: true,
      tin: true,
      referenceNumber: true,
      documentType: true,
      documentUrls: true,
      issueDate: true,
      expiryDate: true,
      qrData: true,
      extractedFields: true,
      validationFindings: true,
      failureReasons: true,
      score: true,
      processedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  facebookVerification: {
    select: {
      id: true,
      status: true,
      pageId: true,
      pageName: true,
      pageUrl: true,
      score: true,
      engagementScore: true,
      hikingRatio: true,
      postSample: true,
      failureReasons: true,
      lastCheckedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  identityVerification: {
    select: {
      id: true,
      status: true,
      score: true,
      faceMatchScore: true,
      livenessPassed: true,
      extractedFields: true,
      validationFindings: true,
      failureReasons: true,
      documentUrls: true,
      selfieUrl: true,
      processedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  organizerTrustScore: true,
  organizerTrustTier: true,
};

export async function GET(request) {
  try {
    const authUser = await getUserFromToken(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let dbUser =
      (await prisma.user.findUnique({
        where: { id: authUser.id },
        select: userSelect,
      })) ?? {
        id: authUser.id,
        email: authUser.email,
        name: authUser.name,
        gcashNumber: authUser.gcashNumber,
        avatarUrl: authUser.avatarUrl,
        bio: authUser.bio,
        birthdate: authUser.birthdate,
        experienceLevel: authUser.experienceLevel,
        experienceLevelLocked: authUser.experienceLevelLocked ?? false,
        expertBadgeAwarded: authUser.expertBadgeAwarded ?? false,
        expertVerifiedAt: authUser.expertVerifiedAt ?? null,
        preferredDifficulty: authUser.preferredDifficulty,
        preferredTrailType: authUser.preferredTrailType,
        preferredDurationHrs: authUser.preferredDurationHrs,
        preferredDistanceKm: authUser.preferredDistanceKm,
        preferredElevationM: authUser.preferredElevationM,
        preferredMountains: authUser.preferredMountains ?? [],
        mountainSuggestionsEnabled: authUser.mountainSuggestionsEnabled ?? true,
        budgetRange: authUser.budgetRange,
        previousPreferences: authUser.previousPreferences ?? null,
        role: authUser.role,
        organizerRequestPending: authUser.organizerRequestPending ?? false,
        organizerApplication: null,
        expertApplication: null,
        businessVerification: null,
        facebookVerification: null,
        identityVerification: null,
        organizerTrustScore: null,
        organizerTrustTier: null,
      };

    if (!dbUser?.email) {
      if (authUser.email) {
        await prisma.user.update({
          where: { id: authUser.id },
          data: {
            email: authUser.email,
          },
        });
        dbUser = { ...dbUser, email: authUser.email };
      } else {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
    }

    const [followersCount, followingCount, postCount] = await Promise.all([
      prisma.follow.count({
        where: { followingId: dbUser.id },
      }),
      prisma.follow.count({
        where: { followerId: dbUser.id },
      }),
      prisma.post.count({
        where: { userId: dbUser.id },
      }),
    ]);

    const profileComplete = Boolean(dbUser.name && dbUser.birthdate);
    const preferencesComplete = Boolean(
      dbUser.experienceLevel &&
        dbUser.preferredDifficulty &&
        dbUser.preferredTrailType &&
        dbUser.preferredDurationHrs &&
        dbUser.preferredDistanceKm &&
        dbUser.preferredElevationM &&
        dbUser.budgetRange,
    );

    const organizerApplication = dbUser.organizerApplication
      ? {
          ...dbUser.organizerApplication,
          documentUrls: dbUser.organizerApplication.documentUrls ?? [],
        }
      : null;

    const expertApplication = dbUser.expertApplication ? { ...dbUser.expertApplication } : null;

    const businessVerification = dbUser.businessVerification
      ? {
          ...dbUser.businessVerification,
          documentUrls: dbUser.businessVerification.documentUrls ?? [],
          failureReasons: Array.isArray(dbUser.businessVerification.failureReasons)
            ? dbUser.businessVerification.failureReasons
            : dbUser.businessVerification.failureReasons
              ? [String(dbUser.businessVerification.failureReasons)]
              : [],
          validationFindings: dbUser.businessVerification.validationFindings ?? null,
        }
      : null;

    const facebookVerification = dbUser.facebookVerification
      ? {
          ...dbUser.facebookVerification,
          failureReasons: Array.isArray(dbUser.facebookVerification.failureReasons)
            ? dbUser.facebookVerification.failureReasons
            : dbUser.facebookVerification.failureReasons
              ? [String(dbUser.facebookVerification.failureReasons)]
              : [],
          postSample: dbUser.facebookVerification.postSample ?? [],
        }
      : null;

    const identityVerification = dbUser.identityVerification
      ? {
          ...dbUser.identityVerification,
          documentUrls: dbUser.identityVerification.documentUrls ?? [],
          failureReasons: Array.isArray(dbUser.identityVerification.failureReasons)
            ? dbUser.identityVerification.failureReasons
            : dbUser.identityVerification.failureReasons
              ? [String(dbUser.identityVerification.failureReasons)]
              : [],
          validationFindings: dbUser.identityVerification.validationFindings ?? null,
        }
      : null;

    let organizerRating = null;
    if (dbUser.role === 'ORGANIZER') {
      const [aggregate, recentReviews] = await Promise.all([
        prisma.organizerReview.aggregate({
          where: { organizerId: dbUser.id },
          _avg: { rating: true },
          _count: true,
        }),
        prisma.organizerReview.findMany({
          where: { organizerId: dbUser.id },
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
      ]);

      const average = aggregate._avg?.rating ?? null;
      const reviewCount = typeof aggregate._count === 'number' ? aggregate._count : 0;

      organizerRating = {
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
        viewerReview: null,
      };
    }

    return NextResponse.json({
      ...dbUser,
      organizerApplication,
      expertApplication,
      businessVerification,
      facebookVerification,
      identityVerification,
      organizerTrustScore: dbUser.organizerTrustScore ?? null,
      organizerTrustTier: dbUser.organizerTrustTier ?? null,
      profileComplete,
      preferencesComplete,
      followersCount,
      followingCount,
      postCount,
      viewerCanReview: false,
      organizerRating,
    });
  } catch (err) {
    console.error('GET /api/users/me error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const authUser = await getUserFromToken(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, birthdate } = await request.json();

    if (!name || !birthdate) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const updatedUser = await prisma.user.update({
      where: { id: authUser.id },
      data: {
        name,
        birthdate: new Date(birthdate),
      },
      select: userSelect,
    });

    const profileComplete = Boolean(updatedUser.name && updatedUser.birthdate);
    const preferencesComplete = Boolean(
      updatedUser.experienceLevel &&
        updatedUser.preferredDifficulty &&
        updatedUser.preferredTrailType &&
        updatedUser.preferredDurationHrs &&
        updatedUser.preferredDistanceKm &&
        updatedUser.preferredElevationM &&
        updatedUser.budgetRange,
    );

    const organizerApplication = updatedUser.organizerApplication
      ? {
          ...updatedUser.organizerApplication,
          documentUrls: updatedUser.organizerApplication.documentUrls ?? [],
        }
      : null;

    return NextResponse.json({
      ...updatedUser,
      organizerApplication,
      profileComplete,
      preferencesComplete,
    });
  } catch (err) {
    console.error('PUT /api/users/me error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const authUser = await getUserFromToken(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let avatarUrl = null;
    try {
      const body = await request.json();
      avatarUrl = body?.avatarUrl ?? null;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (avatarUrl !== null && typeof avatarUrl !== 'string') {
      return NextResponse.json({ error: 'avatarUrl must be a string or null' }, { status: 400 });
    }

    const updatedUser = await prisma.user.update({
      where: { id: authUser.id },
      data: {
        avatarUrl,
      },
      select: userSelect,
    });

    const profileComplete = Boolean(updatedUser.name && updatedUser.birthdate);
    const preferencesComplete = Boolean(
      updatedUser.experienceLevel &&
        updatedUser.preferredDifficulty &&
        updatedUser.preferredTrailType &&
        updatedUser.preferredDurationHrs &&
        updatedUser.preferredDistanceKm &&
        updatedUser.preferredElevationM &&
        updatedUser.budgetRange,
    );

    const organizerApplication = updatedUser.organizerApplication
      ? {
          ...updatedUser.organizerApplication,
          documentUrls: updatedUser.organizerApplication.documentUrls ?? [],
        }
      : null;

    return NextResponse.json({
      ...updatedUser,
      organizerApplication,
      profileComplete,
      preferencesComplete,
    });
  } catch (err) {
    console.error('PATCH /api/users/me error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function parseDuration(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

function parsePositiveNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

export async function POST(request) {
  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
    }

    const {
      experience_level,
      preferred_difficulty,
      preferred_trail_type,
      preferred_duration_hours,
      preferred_distance_km,
      preferred_elevation_m,
      budget_range,
    } = body;

    const missingFields = [];
    if (!preferred_difficulty) missingFields.push('preferred_difficulty');
    if (!preferred_trail_type) missingFields.push('preferred_trail_type');
    if (!preferred_duration_hours && preferred_duration_hours !== 0)
      missingFields.push('preferred_duration_hours');
    if (!preferred_distance_km && preferred_distance_km !== 0) missingFields.push('preferred_distance_km');
    if (!preferred_elevation_m && preferred_elevation_m !== 0) missingFields.push('preferred_elevation_m');
    if (!budget_range) missingFields.push('budget_range');

    if (missingFields.length > 0) {
      return NextResponse.json(
        {
          error: `Missing required field${missingFields.length > 1 ? 's' : ''}: ${missingFields.join(', ')}`,
        },
        { status: 400 },
      );
    }

    const durationValue = parseDuration(preferred_duration_hours);
    if (durationValue === null || durationValue <= 0) {
      return NextResponse.json(
        { error: 'preferred_duration_hours must be a positive number.' },
        { status: 400 },
      );
    }

    const distanceValue = parsePositiveNumber(preferred_distance_km);
    if (distanceValue === null || distanceValue <= 0) {
      return NextResponse.json(
        { error: 'preferred_distance_km must be a positive number.' },
        { status: 400 },
      );
    }

    const elevationValue = parsePositiveNumber(preferred_elevation_m);
    if (elevationValue === null || elevationValue <= 0) {
      return NextResponse.json(
        { error: 'preferred_elevation_m must be a positive number.' },
        { status: 400 },
      );
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        preferredDifficulty: true,
        preferredTrailType: true,
        preferredDurationHrs: true,
        preferredDistanceKm: true,
        preferredElevationM: true,
        budgetRange: true,
        experienceLevel: true,
        experienceLevelLocked: true,
        previousPreferences: true,
      },
    });

    const isLocked = Boolean(currentUser?.experienceLevelLocked);

    if (!isLocked && !experience_level) {
      return NextResponse.json({ error: 'experience_level is required.' }, { status: 400 });
    }

    const data = {
      preferredDifficulty: preferred_difficulty,
      preferredTrailType: preferred_trail_type,
      preferredDurationHrs: durationValue,
      preferredDistanceKm: distanceValue,
      preferredElevationM: elevationValue,
      budgetRange: budget_range,
    };

    if (!isLocked) {
      data.experienceLevel = experience_level;
    }

    const hasExistingPreferences = Boolean(
      currentUser &&
        (currentUser.experienceLevel ||
          currentUser.preferredDifficulty ||
          currentUser.preferredTrailType ||
          currentUser.preferredDurationHrs ||
          currentUser.preferredDistanceKm ||
          currentUser.preferredElevationM ||
          currentUser.budgetRange),
    );

    if (hasExistingPreferences) {
      data.previousPreferences = {
        experienceLevel: currentUser?.experienceLevel ?? null,
        preferredDifficulty: currentUser?.preferredDifficulty ?? null,
        preferredTrailType: currentUser?.preferredTrailType ?? null,
        preferredDurationHrs: currentUser?.preferredDurationHrs ?? null,
        preferredDistanceKm: currentUser?.preferredDistanceKm ?? null,
        preferredElevationM: currentUser?.preferredElevationM ?? null,
        budgetRange: currentUser?.budgetRange ?? null,
        capturedAt: new Date().toISOString(),
      };
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        birthdate: true,
        experienceLevel: true,
        experienceLevelLocked: true,
        expertBadgeAwarded: true,
        preferredDifficulty: true,
        preferredTrailType: true,
        preferredDurationHrs: true,
        preferredDistanceKm: true,
        preferredElevationM: true,
        budgetRange: true,
        previousPreferences: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Preferences saved successfully',
      user: updatedUser,
    });
  } catch (error) {
    console.error('POST /api/users/preferences error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Normalize duration input and reject non-numeric values.
function parseDuration(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

// Normalize numeric preference inputs (distance/elevation).
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

    // Preference parameters (request payload):
    // - experience_level: user's hiking experience (required unless locked)
    // - preferred_difficulty: trail difficulty preference
    // - preferred_trail_type: trail type preference
    // - preferred_duration_hours: preferred duration in hours
    // - preferred_distance_km: preferred distance in kilometers
    // - preferred_elevation_m: preferred elevation gain in meters
    // - budget_range: preferred budget/price range
    const {
      experience_level,
      preferred_difficulty,
      preferred_trail_type,
      preferred_duration_hours,
      preferred_distance_km,
      preferred_elevation_m,
      budget_range,
    } = body;

    // Preferences are required as a full set on first save.
    const missingFields = [];
    // Difficulty and trail type preferences (required for recommendations).
    if (!preferred_difficulty) missingFields.push('preferred_difficulty');
    if (!preferred_trail_type) missingFields.push('preferred_trail_type');
    if (!preferred_duration_hours && preferred_duration_hours !== 0)
      missingFields.push('preferred_duration_hours');
    if (!preferred_distance_km && preferred_distance_km !== 0) missingFields.push('preferred_distance_km');
    if (!preferred_elevation_m && preferred_elevation_m !== 0) missingFields.push('preferred_elevation_m');
    // Budget/price preference.
    if (!budget_range) missingFields.push('budget_range');

    if (missingFields.length > 0) {
      return NextResponse.json(
        {
          error: `Missing required field${missingFields.length > 1 ? 's' : ''}: ${missingFields.join(', ')}`,
        },
        { status: 400 },
      );
    }

    // Duration preference (hours).
    const durationValue = parseDuration(preferred_duration_hours);
    if (durationValue === null || durationValue <= 0) {
      return NextResponse.json(
        { error: 'preferred_duration_hours must be a positive number.' },
        { status: 400 },
      );
    }

    // Distance preference (kilometers).
    const distanceValue = parsePositiveNumber(preferred_distance_km);
    if (distanceValue === null || distanceValue <= 0) {
      return NextResponse.json(
        { error: 'preferred_distance_km must be a positive number.' },
        { status: 400 },
      );
    }

    // Elevation preference (meters).
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

    // When locked, experience_level is read-only (e.g. expert verification).
    const isLocked = Boolean(currentUser?.experienceLevelLocked);

    // Experience level must be provided the first time unless locked.
    if (!isLocked && !experience_level) {
      return NextResponse.json({ error: 'experience_level is required.' }, { status: 400 });
    }

    // Map API field names to Prisma fields for storage.
    const data = {
      preferredDifficulty: preferred_difficulty, // difficulty preference
      preferredTrailType: preferred_trail_type, // trail type preference
      preferredDurationHrs: durationValue, // duration preference (hours)
      preferredDistanceKm: distanceValue, // distance preference (kilometers)
      preferredElevationM: elevationValue, // elevation preference (meters)
      budgetRange: budget_range, // budget/price preference
    };

    // Experience level preference (only editable when not locked).
    if (!isLocked) {
      data.experienceLevel = experience_level;
    }

    // Capture a snapshot of previous preferences before overwriting.
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

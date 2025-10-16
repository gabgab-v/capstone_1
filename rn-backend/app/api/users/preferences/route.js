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
      budget_range,
    } = body;

    const missingFields = [];
    if (!preferred_difficulty) missingFields.push('preferred_difficulty');
    if (!preferred_trail_type) missingFields.push('preferred_trail_type');
    if (!preferred_duration_hours && preferred_duration_hours !== 0)
      missingFields.push('preferred_duration_hours');
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

    const currentUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        experienceLevel: true,
        experienceLevelLocked: true,
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
      budgetRange: budget_range,
    };

    if (!isLocked) {
      data.experienceLevel = experience_level;
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
        budgetRange: true,
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

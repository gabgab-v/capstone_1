import { NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function sanitizeMountains(values) {
  if (!Array.isArray(values)) {
    return null;
  }
  const cleaned = values
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value.length > 0);
  if (!cleaned.length) {
    return [];
  }
  const unique = Array.from(new Set(cleaned));
  return unique.slice(0, 25);
}

export async function PUT(request) {
  try {
    const authUser = await getUserFromToken(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body = null;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const preferredMountains = sanitizeMountains(body?.preferred_mountains ?? body?.mountains);
    const mountainSuggestionsEnabled =
      typeof body?.mountain_suggestions_enabled === 'boolean'
        ? body.mountain_suggestions_enabled
        : null;

    if (preferredMountains === null && mountainSuggestionsEnabled === null) {
      return NextResponse.json(
        { error: 'Nothing to update. Provide preferred_mountains or mountain_suggestions_enabled.' },
        { status: 400 },
      );
    }

    const data = {};
    if (preferredMountains !== null) {
      data.preferredMountains = preferredMountains;
    }
    if (mountainSuggestionsEnabled !== null) {
      data.mountainSuggestionsEnabled = mountainSuggestionsEnabled;
    }

    const updatedUser = await prisma.user.update({
      where: { id: authUser.id },
      data,
      select: {
        id: true,
        preferredMountains: true,
        mountainSuggestionsEnabled: true,
      },
    });

    return NextResponse.json({
      success: true,
      user: updatedUser,
    });
  } catch (error) {
    console.error('PUT /api/users/mountains error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

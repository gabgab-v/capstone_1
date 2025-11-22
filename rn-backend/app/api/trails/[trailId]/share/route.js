import { NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function normalizeRecipients(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const ids = value
    .map((entry) => {
      if (typeof entry === 'string') {
        const trimmed = entry.trim();
        return trimmed.length > 0 ? trimmed : null;
      }
      return null;
    })
    .filter(Boolean);

  return Array.from(new Set(ids));
}

export async function POST(request, { params }) {
  const trailId = params?.trailId ?? null;
  try {
    const authUser = await getUserFromToken(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!trailId) {
      return NextResponse.json({ error: 'Trail ID is required' }, { status: 400 });
    }

    let payload;
    try {
      payload = await request.json();
    } catch (_error) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const recipientUserIds = normalizeRecipients(payload?.recipientUserIds);
    if (recipientUserIds.length === 0) {
      return NextResponse.json(
        { error: 'Select at least one organizer to share with.' },
        { status: 400 },
      );
    }

    const trail = await prisma.trail.findUnique({
      where: { id: trailId },
      select: {
        id: true,
        userId: true,
        label: true,
        startedAt: true,
        endedAt: true,
        totalDistanceMeters: true,
        geoJson: true,
        samples: true,
      },
    });

    if (!trail) {
      return NextResponse.json({ error: 'Trail not found' }, { status: 404 });
    }

    if (trail.userId !== authUser.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const organizers = await prisma.user.findMany({
      where: {
        id: { in: recipientUserIds },
        role: 'ORGANIZER',
      },
      select: { id: true },
    });

    if (!organizers.length) {
      return NextResponse.json(
        { error: 'No matching organizer recipients were found.' },
        { status: 400 },
      );
    }

    const organizerIds = organizers.map((record) => record.id);

    const existingCopies = await prisma.trail.findMany({
      where: {
        userId: { in: organizerIds },
        originTrailId: trail.id,
      },
      select: { userId: true },
    });

    const skipSet = new Set(existingCopies.map((entry) => entry.userId));
    const recipientIdsToCreate = organizerIds.filter(
      (userId) => !skipSet.has(userId),
    );

    if (recipientIdsToCreate.length === 0) {
      return NextResponse.json({
        sharedCount: 0,
        skipped: organizerIds.length,
        message: 'These organizers already have access to this trail.',
      });
    }

    const copies = await prisma.$transaction(
      recipientIdsToCreate.map((recipientId) =>
        prisma.trail.create({
          data: {
            userId: recipientId,
            label: trail.label,
            startedAt: trail.startedAt,
            endedAt: trail.endedAt,
            totalDistanceMeters: trail.totalDistanceMeters ?? 0,
            geoJson: trail.geoJson,
            samples: trail.samples ?? [],
            originTrailId: trail.id,
          },
          select: { id: true, userId: true },
        }),
      ),
    );

    return NextResponse.json({
      sharedCount: copies.length,
      skipped: organizerIds.length - copies.length,
    });
  } catch (error) {
    console.error(`POST /api/trails/${params?.trailId ?? ''}/share error:`, error);
    return NextResponse.json(
      { error: 'Failed to share this trail.' },
      { status: 500 },
    );
  }
}

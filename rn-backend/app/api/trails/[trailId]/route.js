import { NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request, context) {
  const trailId = context?.params?.trailId ?? null;
  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!trailId) {
      return NextResponse.json({ error: 'Trail ID is required' }, { status: 400 });
    }

    const trail = await prisma.trail.findUnique({
      where: { id: trailId },
    });

    if (!trail) {
      return NextResponse.json({ error: 'Trail not found' }, { status: 404 });
    }

    if (trail.userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json(trail);
  } catch (error) {
    console.error('GET /api/trails/' + trailId + ' error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PATCH(request, context) {
  const trailId = context?.params?.trailId ?? null;
  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!trailId) {
      return NextResponse.json({ error: 'Trail ID is required' }, { status: 400 });
    }

    const existing = await prisma.trail.findUnique({
      where: { id: trailId },
      select: { id: true, userId: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Trail not found' }, { status: 404 });
    }

    if (existing.userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let payload;
    try {
      payload = await request.json();
    } catch (_error) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const hasLabelField =
      payload && Object.prototype.hasOwnProperty.call(payload, 'label');

    if (!hasLabelField) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    let normalizedLabel = null;
    if (typeof payload.label === 'string') {
      const trimmed = payload.label.trim();
      normalizedLabel = trimmed.length > 0 ? trimmed : null;
    } else if (payload.label === null || typeof payload.label === 'undefined') {
      normalizedLabel = null;
    } else {
      return NextResponse.json(
        { error: 'Label must be a string or null' },
        { status: 400 },
      );
    }

    const updated = await prisma.trail.update({
      where: { id: trailId },
      data: {
        label: normalizedLabel,
      },
      select: {
        id: true,
        label: true,
        originTrailId: true,
        startedAt: true,
        endedAt: true,
        totalDistanceMeters: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('PATCH /api/trails/' + trailId + ' error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

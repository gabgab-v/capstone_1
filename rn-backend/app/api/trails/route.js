import { NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function sanitizePoints(points) {
  if (!Array.isArray(points)) {
    return [];
  }

  return points
    .map((point) => {
      if (!point) {
        return null;
      }

      const lng = Number(point.lng ?? point.longitude);
      const lat = Number(point.lat ?? point.latitude);
      const timestamp = point.at ?? point.timestamp ?? null;
      const accuracy = point.accuracy ?? null;

      if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        return null;
      }

      return {
        lng,
        lat,
        at: timestamp,
        accuracy: typeof accuracy === 'number' ? accuracy : null,
      };
    })
    .filter(Boolean);
}

function buildLineString(points) {
  return {
    type: 'LineString',
    coordinates: points.map((point) => [point.lng, point.lat]),
  };
}

export async function GET(request) {
  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const trails = await prisma.trail.findMany({
      where: { userId: user.id },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        label: true,
        startedAt: true,
        endedAt: true,
        totalDistanceMeters: true,
        geoJson: true,
        createdAt: true,
        updatedAt: true,
        originTrailId: true,
      },
    });

    return NextResponse.json(trails);
  } catch (error) {
    console.error('GET /api/trails error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const points = sanitizePoints(body?.points);

    if (!body?.startedAt || points.length === 0) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const totalDistanceMeters = Number(body.totalDistanceMeters ?? 0);
    const label = typeof body.label === 'string' && body.label.trim().length > 0 ? body.label.trim() : null;

    const trail = await prisma.trail.create({
      data: {
        userId: user.id,
        label,
        startedAt: new Date(body.startedAt),
        endedAt: body.endedAt ? new Date(body.endedAt) : null,
        totalDistanceMeters: Number.isFinite(totalDistanceMeters) ? totalDistanceMeters : 0,
        geoJson: buildLineString(points),
        samples: points,
      },
    });

    return NextResponse.json(trail, { status: 201 });
  } catch (error) {
    console.error('POST /api/trails error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

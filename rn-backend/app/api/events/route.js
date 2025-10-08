import { prisma } from '@/lib/prisma';
import { getUserFromToken } from '@/lib/auth';

const ATTENDEE_STATUSES = ['APPROVED', 'CONFIRMED'];

function sanitizeString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toFloat(value) {
  const number = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(number) ? number : null;
}

function toInt(value) {
  const number = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(number) ? Math.round(number) : null;
}

function sanitizeBounds(bounds) {
  if (!bounds || typeof bounds !== 'object') {
    return null;
  }

  const pickCoords = (key) => {
    const coords = bounds[key];
    if (!Array.isArray(coords) || coords.length !== 2) {
      return null;
    }
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      return null;
    }
    return [lng, lat];
  };

  const northEast = pickCoords('northEast');
  const southWest = pickCoords('southWest');

  if (!northEast || !southWest) {
    return null;
  }

  return { northEast, southWest };
}

function sanitizeGeoJson(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  if (value.type === 'LineString' && Array.isArray(value.coordinates)) {
    return value;
  }
  return null;
}

export async function POST(req) {
  try {
    const user = await getUserFromToken(req);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const body = await req.json();
    const title = sanitizeString(body?.title);

    if (!title) {
      return new Response(JSON.stringify({ error: 'Title is required.' }), { status: 400 });
    }

    let selectedTrail = null;
    const requestedTrailId = sanitizeString(body?.trailId) ?? body?.trailId;
    if (requestedTrailId) {
      selectedTrail = await prisma.trail.findFirst({
        where: {
          id: requestedTrailId,
          userId: user.id,
        },
      });

      if (!selectedTrail) {
        return new Response(
          JSON.stringify({ error: 'Trail not found or not owned by the current user.' }),
          { status: 400 },
        );
      }
    }

    const distanceKm = toFloat(body?.distanceKm);
    const durationHrs = toFloat(body?.durationHrs);
    const steps = toInt(body?.steps);
    const elevationM = toFloat(body?.elevationM);
    const price = toInt(body?.price) ?? 0;

    const locationLatitude = toFloat(body?.locationLatitude);
    const locationLongitude = toFloat(body?.locationLongitude);

    const data = {
      title,
      overview: sanitizeString(body?.overview),
      itinerary: sanitizeString(body?.itinerary),
      directions: sanitizeString(body?.directions),
      distanceKm,
      durationHrs,
      steps,
      elevationM,
      price,
      imageUrl: sanitizeString(body?.imageUrl),
      gcashNumber: sanitizeString(body?.gcashNumber),
      locationName: sanitizeString(body?.locationName),
      locationLatitude: Number.isFinite(locationLatitude) ? locationLatitude : null,
      locationLongitude: Number.isFinite(locationLongitude) ? locationLongitude : null,
      locationZoomLevel: toFloat(body?.locationZoomLevel),
      locationBounds: sanitizeBounds(body?.locationBounds),
      trailId: selectedTrail?.id ?? null,
      trailGeoJson: selectedTrail?.geoJson ?? sanitizeGeoJson(body?.trailGeoJson),
      trailDistanceMeters:
        selectedTrail?.totalDistanceMeters ?? toFloat(body?.trailDistanceMeters),
      organizerId: user.id,
    };

    const event = await prisma.event.create({
      data,
      include: {
        trail: {
          select: {
            id: true,
            label: true,
            totalDistanceMeters: true,
          },
        },
      },
    });

    return new Response(JSON.stringify(event), { status: 201 });
  } catch (err) {
    console.error('POST /api/events error:', err);
    return new Response(
      JSON.stringify({ error: 'Unauthorized or invalid data' }),
      { status: 401 },
    );
  }
}

export async function GET() {
  const [events, approvedCounts, totalCounts] = await Promise.all([
    prisma.event.findMany({
      include: {
        organizer: { select: { id: true, email: true, name: true } },
        trail: { select: { id: true, label: true, totalDistanceMeters: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.booking.groupBy({
      by: ['eventId'],
      where: {
        status: {
          in: ATTENDEE_STATUSES,
        },
      },
      _count: { _all: true },
    }),
    prisma.booking.groupBy({
      by: ['eventId'],
      _count: { _all: true },
    }),
  ]);

  const approvedCountMap = new Map(
    approvedCounts.map((entry) => [entry.eventId, entry._count?._all ?? 0]),
  );
  const totalCountMap = new Map(
    totalCounts.map((entry) => [entry.eventId, entry._count?._all ?? 0]),
  );

  const enrichedEvents = events.map((event) => ({
    ...event,
    approvedAttendeeCount: approvedCountMap.get(event.id) ?? 0,
    totalBookingCount: totalCountMap.get(event.id) ?? 0,
  }));

  return new Response(JSON.stringify(enrichedEvents));
}

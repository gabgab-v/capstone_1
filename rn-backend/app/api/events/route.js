import { prisma } from '@/lib/prisma';
import { getUserFromToken } from '@/lib/auth';

const ATTENDEE_STATUSES = ['APPROVED', 'CONFIRMED'];
const DIFFICULTY_CANONICAL = {
  beginner: 'BEGINNER',
  easy: 'BEGINNER',
  intermediate: 'INTERMEDIATE',
  moderate: 'INTERMEDIATE',
  medium: 'INTERMEDIATE',
  technical: 'TECHNICAL',
  expert: 'EXPERT',
  advanced: 'EXPERT',
  hard: 'EXPERT',
  difficult: 'EXPERT',
};

function sanitizeDifficulty(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (DIFFICULTY_CANONICAL[normalized]) {
    return DIFFICULTY_CANONICAL[normalized];
  }

  for (const [keyword, canonical] of Object.entries(DIFFICULTY_CANONICAL)) {
    if (normalized.includes(keyword)) {
      return canonical;
    }
  }

  return null;
}

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

function normalizeAge(value) {
  const age = toInt(value);
  if (!Number.isFinite(age) || age <= 0) {
    return null;
  }
  const clamped = Math.min(Math.max(age, 10), 100);
  return clamped;
}

function toDate(value) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.valueOf()) ? null : value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.valueOf())) {
      return null;
    }
    return parsed;
  }
  return null;
}

const EVENT_STATUSES = new Set(['DRAFT', 'PUBLISHED', 'CLOSED', 'COMPLETED', 'CANCELLED']);
const CLOSING_SOON_THRESHOLD_HOURS = 72;

async function ensureEventColumns() {
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "mountainTag" TEXT;');
  } catch (error) {
    console.error('ensureEventColumns error:', error);
  }
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
    await ensureEventColumns();
    const user = await getUserFromToken(req);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const body = await req.json();
    const title = sanitizeString(body?.title);

    if (!title) {
      return new Response(JSON.stringify({ error: 'Title is required.' }), { status: 400 });
    }

    const difficulty = sanitizeDifficulty(body?.difficulty);
    if (!difficulty) {
      return new Response(
        JSON.stringify({
          error: 'Difficulty must be Beginner, Intermediate, Technical, or Expert.',
        }),
        { status: 400 },
      );
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
    const minAge = normalizeAge(body?.minAge);

    const startsAt = toDate(body?.startsAt);
    if (!startsAt) {
      return new Response(JSON.stringify({ error: 'Event start date/time is required.' }), {
        status: 400,
      });
    }

    const endsAt = toDate(body?.endsAt);
    if (endsAt && endsAt <= startsAt) {
      return new Response(
        JSON.stringify({ error: 'End time must be later than the start time.' }),
        { status: 400 },
      );
    }

    const registrationOpensAt = toDate(body?.registrationOpensAt);
    const registrationClosesAt = toDate(body?.registrationClosesAt);

    if (registrationOpensAt && registrationClosesAt && registrationClosesAt <= registrationOpensAt) {
      return new Response(
        JSON.stringify({
          error: 'Registration closing time must be after the opening time.',
        }),
        { status: 400 },
      );
    }

    if (registrationClosesAt && registrationClosesAt >= startsAt) {
      return new Response(
        JSON.stringify({
          error: 'Registration must close before the event starts.',
        }),
        { status: 400 },
      );
    }

    const locationLatitude = toFloat(body?.locationLatitude);
    const locationLongitude = toFloat(body?.locationLongitude);
    const trailType = sanitizeString(body?.trailType);
    const mountainTag = sanitizeString(body?.mountainTag);

    const minParticipants = Math.max(0, toInt(body?.minParticipants) ?? 0);
    const maxParticipantsRaw = toInt(body?.maxParticipants);
    const maxParticipants =
      Number.isFinite(maxParticipantsRaw) && maxParticipantsRaw > 0 ? maxParticipantsRaw : null;

    if (maxParticipants !== null && minParticipants > maxParticipants) {
      return new Response(
        JSON.stringify({
          error: 'Maximum hikers must be greater than or equal to the minimum hikers required.',
        }),
        { status: 400 },
      );
    }

    let status = 'PUBLISHED';
    if (Object.prototype.hasOwnProperty.call(body, 'status')) {
      const incomingStatus =
        typeof body.status === 'string' ? body.status.trim().toUpperCase() : null;
      if (!incomingStatus || !EVENT_STATUSES.has(incomingStatus)) {
        return new Response(JSON.stringify({ error: 'Invalid event status.' }), { status: 400 });
      }
      status = incomingStatus;
    }

    const announceAt = toDate(body?.announceAt);
    if (announceAt && announceAt >= startsAt) {
      return new Response(
        JSON.stringify({ error: 'Announcement time must be before the event starts.' }),
        { status: 400 },
      );
    }

    const data = {
      title,
      overview: sanitizeString(body?.overview),
      itinerary: sanitizeString(body?.itinerary),
      directions: sanitizeString(body?.directions),
      distanceKm,
      durationHrs,
      startsAt,
      endsAt,
      registrationOpensAt,
      registrationClosesAt,
      steps,
      elevationM,
      price,
      imageUrl: sanitizeString(body?.imageUrl),
      gcashNumber: sanitizeString(body?.gcashNumber),
      locationName: sanitizeString(body?.locationName),
      difficulty,
      locationLatitude: Number.isFinite(locationLatitude) ? locationLatitude : null,
      locationLongitude: Number.isFinite(locationLongitude) ? locationLongitude : null,
      locationZoomLevel: toFloat(body?.locationZoomLevel),
      locationBounds: sanitizeBounds(body?.locationBounds),
      trailId: selectedTrail?.id ?? null,
      trailGeoJson: selectedTrail?.geoJson ?? sanitizeGeoJson(body?.trailGeoJson),
      trailDistanceMeters:
        selectedTrail?.totalDistanceMeters ?? toFloat(body?.trailDistanceMeters),
      trailType,
      mountainTag,
      organizerId: user.id,
      minParticipants,
      maxParticipants,
      status,
      announceAt,
      minAge,
    };

    if (status === 'COMPLETED') {
      data.completedAt = new Date();
    }

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
    ensureEventColumns(),
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
    isClosingSoon: computeIsClosingSoon(event),
    registrationClosed: computeIsRegistrationClosed(event),
    isFull: computeIsFull(event, approvedCountMap.get(event.id)),
  }));

  return new Response(JSON.stringify(enrichedEvents));
}

function computeIsClosingSoon(event) {
  if (!event?.registrationClosesAt || event.status !== 'PUBLISHED') {
    return false;
  }
  const closesAt = new Date(event.registrationClosesAt);
  if (Number.isNaN(closesAt.valueOf())) {
    return false;
  }
  const now = new Date();
  if (closesAt <= now) {
    return false;
  }
  const diffHours = (closesAt.getTime() - now.getTime()) / (1000 * 60 * 60);
  return diffHours <= CLOSING_SOON_THRESHOLD_HOURS;
}

function computeIsRegistrationClosed(event) {
  if (!event) {
    return false;
  }
  if (event.status !== 'PUBLISHED') {
    return true;
  }
  if (!event.registrationClosesAt) {
    return false;
  }
  const closesAt = new Date(event.registrationClosesAt);
  if (Number.isNaN(closesAt.valueOf())) {
    return false;
  }
  const now = new Date();
  return closesAt <= now;
}

function computeIsFull(event, approvedCount = 0) {
  if (!event?.maxParticipants) {
    return false;
  }
  const normalizedApproved = Number.isFinite(approvedCount) ? approvedCount : 0;
  return normalizedApproved >= event.maxParticipants;
}

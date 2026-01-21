import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth";
import { ensureBookingColumns } from "@/lib/bookingColumns";

const DIFFICULTY_CANONICAL = {
  beginner: "BEGINNER",
  easy: "BEGINNER",
  intermediate: "INTERMEDIATE",
  moderate: "INTERMEDIATE",
  medium: "INTERMEDIATE",
  technical: "TECHNICAL",
  expert: "EXPERT",
  advanced: "EXPERT",
  hard: "EXPERT",
  difficult: "EXPERT",
};

function sanitizeString(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toFloat(value) {
  const number = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(number) ? number : null;
}

function toInt(value) {
  const number = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(number) ? Math.round(number) : null;
}

function normalizeAge(value) {
  const age = toInt(value);
  if (!Number.isFinite(age) || age <= 0) {
    return null;
  }
  return Math.min(Math.max(age, 10), 100);
}

function toDate(value) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.valueOf()) ? null : value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.valueOf())) {
      return null;
    }
    return parsed;
  }
  return null;
}

function toTimestamp(value) {
  const date = toDate(value);
  return date ? date.getTime() : null;
}

function normalizeCoordinate(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return null;
  }
  return Math.round(number * 10000) / 10000;
}

function sanitizeBounds(bounds) {
  if (!bounds || typeof bounds !== "object") {
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

  const northEast = pickCoords("northEast");
  const southWest = pickCoords("southWest");

  if (!northEast || !southWest) {
    return null;
  }

  return { northEast, southWest };
}

function sanitizeGeoJson(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  if (value.type === "LineString" && Array.isArray(value.coordinates)) {
    return value;
  }
  return null;
}

function sanitizeDifficulty(value) {
  if (typeof value !== "string") {
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

async function findOwnedTrail(userId, trailId) {
  if (!trailId) {
    return null;
  }

  return prisma.trail.findFirst({
    where: {
      id: trailId,
      userId,
    },
  });
}

const EVENT_STATUSES = new Set(["DRAFT", "PUBLISHED", "CLOSED", "COMPLETED", "CANCELLED"]);
const ATTENDEE_STATUSES = new Set(["APPROVED", "CONFIRMED"]);
const VERIFIED_IDENTITY_STATUS = "VERIFIED";
const MAX_RESCHEDULE_REASON_LENGTH = 240;
const RESCHEDULE_APPROVAL_PENDING = "PENDING";
const RESCHEDULE_APPROVAL_ELIGIBLE_STATUSES = new Set([
  "PENDING",
  "APPROVED",
  "CONFIRMED",
  "RESCHEDULE_REQUESTED",
]);

const EVENT_COLUMN_QUERIES = [
  'ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "mountainTag" TEXT;',
  'ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "trailType" TEXT;',
  'ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "trailGeoJson" JSONB;',
  'ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "trailDistanceMeters" DOUBLE PRECISION;',
  'ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "locationZoomLevel" DOUBLE PRECISION;',
  'ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "locationBounds" JSONB;',
  'ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "announceAt" TIMESTAMP;',
  'ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "announceSentAt" TIMESTAMP;',
  'ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "attendanceCheckSentAt" TIMESTAMP;',
  'ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "gcashNumber" TEXT;',
  'ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "rescheduleReason" TEXT;',
  'ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "rescheduledAt" TIMESTAMP;',
  'ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "reschedulePollOpensAt" TIMESTAMP;',
  'ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "reschedulePollClosesAt" TIMESTAMP;',
  'ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "reschedulePollStatus" TEXT;',
];

async function ensureEventColumns() {
  for (const query of EVENT_COLUMN_QUERIES) {
    try {
      await prisma.$executeRawUnsafe(query);
    } catch (error) {
      console.error('ensureEventColumns error:', { query, message: error?.message || error });
    }
  }
}

async function requireVerifiedIdentity(user) {
  if (!user || user.role === "ADMIN") {
    return { allowed: true, status: VERIFIED_IDENTITY_STATUS };
  }

  let verification = null;
  try {
    verification = await prisma.identityVerification.findUnique({
      where: { userId: user.id },
      select: { status: true, score: true },
    });
  } catch (error) {
    console.error("Identity verification lookup failed:", error);
    return { allowed: false, status: "UNAVAILABLE", error: "Identity verification lookup failed." };
  }

  const status = verification?.status ?? "PENDING";
  if (status !== VERIFIED_IDENTITY_STATUS) {
    return {
      allowed: false,
      status,
      score: verification?.score ?? null,
    };
  }

  return { allowed: true, status };
}

export async function GET(request, { params }) {
  const { eventId } = params;

  try {
    await ensureEventColumns();
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!eventId) {
      return NextResponse.json({ error: "Event id is required." }, { status: 400 });
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        organizer: { select: { id: true, email: true, name: true } },
        trail: true,
      },
    });

    if (!event) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }

    const isOrganizer = event.organizerId === user.id;
    const userRole = typeof user.role === "string" ? user.role.trim().toUpperCase() : "";
    const isAdmin = userRole === "ADMIN";
    const normalizedStatus =
      typeof event.status === "string" && event.status.trim()
        ? event.status.trim().toUpperCase()
        : "";
    const isPublished = normalizedStatus === "PUBLISHED";

    if (!isOrganizer && !isAdmin && !isPublished) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(event, { status: 200 });
  } catch (error) {
    console.error(`GET /api/events/${params?.eventId} error:`, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  const { eventId } = params;

  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureEventColumns();
    await ensureBookingColumns();

    const identityResult = await requireVerifiedIdentity(user);
    if (!identityResult.allowed) {
      const errorMessage =
        identityResult.status === "UNAVAILABLE"
          ? "Identity verification is unavailable. Please run the latest migrations and retry."
          : "Complete organizer identity verification via AccuraScan before updating events.";
      return NextResponse.json(
        {
          error: "Identity verification required",
          message: errorMessage,
          status: identityResult.status,
          score: identityResult.score,
        },
        { status: 403 },
      );
    }

    if (!eventId) {
      return NextResponse.json({ error: "Event id is required." }, { status: 400 });
    }

    const existingEvent = await prisma.event.findUnique({
      where: { id: eventId },
      include: { trail: true },
    });

    if (!existingEvent) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }

    if (existingEvent.organizerId !== user.id && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const rescheduleReasonRaw = sanitizeString(body?.rescheduleReason);
    const normalizedRescheduleReason = rescheduleReasonRaw
      ? rescheduleReasonRaw.slice(0, MAX_RESCHEDULE_REASON_LENGTH)
      : null;

    const title = sanitizeString(body?.title);
    if (!title) {
      return NextResponse.json({ error: "Title is required." }, { status: 400 });
    }

    const trimmedGcash = sanitizeString(body?.gcashNumber);
    if (!trimmedGcash) {
      return NextResponse.json({ error: "GCash number is required." }, { status: 400 });
    }

    const requestedTrailId = sanitizeString(body?.trailId) ?? body?.trailId;
    let selectedTrail = existingEvent.trail ?? null;

    if (requestedTrailId && requestedTrailId !== existingEvent.trailId) {
      selectedTrail = await findOwnedTrail(user.id, requestedTrailId);
      if (!selectedTrail) {
        return NextResponse.json(
          { error: "Trail not found or not owned by the current user." },
          { status: 400 },
        );
      }
    } else if (requestedTrailId && !selectedTrail) {
      selectedTrail = await findOwnedTrail(user.id, requestedTrailId);
      if (!selectedTrail) {
        return NextResponse.json(
          { error: "Trail not found or not owned by the current user." },
          { status: 400 },
        );
      }
    }

    if (!selectedTrail) {
      return NextResponse.json(
        { error: "A valid trail is required to update the event." },
        { status: 400 },
      );
    }

    const distanceKm = toFloat(body?.distanceKm);
    const durationHrs = toFloat(body?.durationHrs);
    const steps = toInt(body?.steps);
    const elevationM = toFloat(body?.elevationM);
    const price = toInt(body?.price);

    const locationLatitude = toFloat(body?.locationLatitude);
    const locationLongitude = toFloat(body?.locationLongitude);
    const locationName = sanitizeString(body?.locationName);

    let difficultyValue = existingEvent.difficulty ?? "BEGINNER";
    if (Object.prototype.hasOwnProperty.call(body, "difficulty")) {
      const sanitizedDifficulty = sanitizeDifficulty(body?.difficulty);
      if (!sanitizedDifficulty) {
        return NextResponse.json(
          { error: "Difficulty must be Beginner, Intermediate, or Expert." },
          { status: 400 },
        );
      }
      difficultyValue = sanitizedDifficulty;
    }

    let startsAt = existingEvent.startsAt;
    if (Object.prototype.hasOwnProperty.call(body, "startsAt")) {
      startsAt = toDate(body?.startsAt);
      if (!startsAt) {
        return NextResponse.json(
          { error: "Event start date/time is required." },
          { status: 400 },
        );
      }
    }

    let endsAt = existingEvent.endsAt;
    if (Object.prototype.hasOwnProperty.call(body, "endsAt")) {
      const nextEndsAt = toDate(body?.endsAt);
      if (nextEndsAt && startsAt && nextEndsAt <= startsAt) {
        return NextResponse.json(
          { error: "End time must be later than the start time." },
          { status: 400 },
        );
      }
      endsAt = nextEndsAt;
    } else if (endsAt && startsAt && endsAt <= startsAt) {
      endsAt = null;
    }

    let registrationOpensAt = existingEvent.registrationOpensAt;
    if (Object.prototype.hasOwnProperty.call(body, "registrationOpensAt")) {
      registrationOpensAt = toDate(body?.registrationOpensAt);
    }

    let registrationClosesAt = existingEvent.registrationClosesAt;
    if (Object.prototype.hasOwnProperty.call(body, "registrationClosesAt")) {
      registrationClosesAt = toDate(body?.registrationClosesAt);
    }

    if (
      registrationOpensAt &&
      registrationClosesAt &&
      registrationClosesAt <= registrationOpensAt
    ) {
      return NextResponse.json(
        { error: "Registration closing time must be after the opening time." },
        { status: 400 },
      );
    }

    if (registrationClosesAt && startsAt && registrationClosesAt >= startsAt) {
      return NextResponse.json(
        { error: "Registration must close before the event starts." },
        { status: 400 },
      );
    }

    let minParticipants = existingEvent.minParticipants ?? 0;
    if (Object.prototype.hasOwnProperty.call(body, "minParticipants")) {
      const parsedMin = toInt(body?.minParticipants);
      minParticipants = Math.max(0, parsedMin ?? 0);
    }

    let minAge = existingEvent.minAge ?? null;
    if (Object.prototype.hasOwnProperty.call(body, "minAge")) {
      minAge = normalizeAge(body?.minAge);
    }

    let maxParticipants = existingEvent.maxParticipants ?? null;
    if (Object.prototype.hasOwnProperty.call(body, "maxParticipants")) {
      const parsedMax = toInt(body?.maxParticipants);
      maxParticipants =
        Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : null;
    }

    if (maxParticipants !== null && minParticipants > maxParticipants) {
      return NextResponse.json(
        {
          error:
            "Maximum hikers must be greater than or equal to the minimum hikers required.",
        },
        { status: 400 },
      );
    }

    let status = existingEvent.status ?? "PUBLISHED";
    if (Object.prototype.hasOwnProperty.call(body, "status")) {
      const incomingStatus =
        typeof body.status === "string" ? body.status.trim().toUpperCase() : null;
      if (!incomingStatus || !EVENT_STATUSES.has(incomingStatus)) {
        return NextResponse.json({ error: "Invalid event status." }, { status: 400 });
      }
      status = incomingStatus;
    }

    const announceAt = Object.prototype.hasOwnProperty.call(body, "announceAt")
      ? toDate(body?.announceAt)
      : existingEvent.announceAt ?? null;

    const reschedulePollOpensAt = Object.prototype.hasOwnProperty.call(
      body,
      "reschedulePollOpensAt",
    )
      ? toDate(body?.reschedulePollOpensAt)
      : existingEvent.reschedulePollOpensAt ?? null;
    const reschedulePollClosesAt = Object.prototype.hasOwnProperty.call(
      body,
      "reschedulePollClosesAt",
    )
      ? toDate(body?.reschedulePollClosesAt)
      : existingEvent.reschedulePollClosesAt ?? null;

    if (announceAt && startsAt && announceAt >= startsAt) {
      return NextResponse.json(
        { error: "Announcement time must be before the event starts." },
        { status: 400 },
      );
    }

    const scheduleChanged =
      toTimestamp(existingEvent.startsAt) !== toTimestamp(startsAt) ||
      toTimestamp(existingEvent.endsAt) !== toTimestamp(endsAt) ||
      sanitizeString(existingEvent.locationName) !== locationName ||
      normalizeCoordinate(existingEvent.locationLatitude) !== normalizeCoordinate(locationLatitude) ||
      normalizeCoordinate(existingEvent.locationLongitude) !== normalizeCoordinate(locationLongitude);

    if (scheduleChanged) {
      if (!normalizedRescheduleReason) {
        return NextResponse.json(
          { error: "Reschedule reason is required when moving the schedule." },
          { status: 400 },
        );
      }
      if (!reschedulePollOpensAt || !reschedulePollClosesAt) {
        return NextResponse.json(
          { error: "Reschedule poll start and end times are required." },
          { status: 400 },
        );
      }
      if (reschedulePollClosesAt <= reschedulePollOpensAt) {
        return NextResponse.json(
          { error: "Reschedule poll must close after it opens." },
          { status: 400 },
        );
      }
      if (startsAt && reschedulePollClosesAt >= startsAt) {
        return NextResponse.json(
          { error: "Reschedule poll must close before the event starts." },
          { status: 400 },
        );
      }
    }

    let approvedCount = 0;
    if (maxParticipants !== null || status === "COMPLETED" || status === "CLOSED") {
      approvedCount = await prisma.booking.count({
        where: {
          eventId,
          status: { in: Array.from(ATTENDEE_STATUSES) },
        },
      });
    }

    if (maxParticipants !== null && approvedCount > maxParticipants) {
      return NextResponse.json(
        {
          error: `Cannot set the maximum hikers below the currently approved count (${approvedCount}).`,
        },
        { status: 400 },
      );
    }

    const hasTrailTypeField = Object.prototype.hasOwnProperty.call(body, "trailType");
    const normalizedTrailType = hasTrailTypeField ? sanitizeString(body?.trailType) : null;
    const hasMountainTagField = Object.prototype.hasOwnProperty.call(body, "mountainTag");
    const normalizedMountainTag = hasMountainTagField ? sanitizeString(body?.mountainTag) : null;

    const updateData = {
      title,
      overview: sanitizeString(body?.overview),
      itinerary: sanitizeString(body?.itinerary),
      directions: sanitizeString(body?.directions),
      distanceKm,
      durationHrs,
      steps,
      elevationM,
      price: price ?? existingEvent.price ?? 0,
      imageUrl: sanitizeString(body?.imageUrl) ?? existingEvent.imageUrl ?? null,
      gcashNumber: trimmedGcash,
      locationName,
      locationLatitude: Number.isFinite(locationLatitude) ? locationLatitude : null,
      locationLongitude: Number.isFinite(locationLongitude) ? locationLongitude : null,
      locationZoomLevel: toFloat(body?.locationZoomLevel),
      locationBounds: sanitizeBounds(body?.locationBounds),
      difficulty: difficultyValue,
      startsAt,
      endsAt,
      registrationOpensAt,
      registrationClosesAt,
      minParticipants,
      maxParticipants,
      status,
      announceAt,
      minAge,
      trailType: hasTrailTypeField ? normalizedTrailType : existingEvent.trailType,
      mountainTag: hasMountainTagField ? normalizedMountainTag : existingEvent.mountainTag,
      trailId: selectedTrail.id,
      trailGeoJson: selectedTrail.geoJson ?? sanitizeGeoJson(body?.trailGeoJson) ?? existingEvent.trailGeoJson,
      trailDistanceMeters:
        selectedTrail.totalDistanceMeters ??
        toFloat(body?.trailDistanceMeters) ??
        existingEvent.trailDistanceMeters,
    };

    if (scheduleChanged) {
      updateData.rescheduleReason = normalizedRescheduleReason;
      updateData.rescheduledAt = new Date();
      updateData.reschedulePollOpensAt = reschedulePollOpensAt;
      updateData.reschedulePollClosesAt = reschedulePollClosesAt;
      updateData.reschedulePollStatus = "PENDING";
    }

    if (status === "COMPLETED") {
      updateData.completedAt = existingEvent.completedAt ?? new Date();
    } else {
      updateData.completedAt = null;
    }

    const updatedEvent = await prisma.$transaction(async (tx) => {
      const savedEvent = await tx.event.update({
        where: { id: eventId },
        data: updateData,
        include: {
          organizer: { select: { id: true, email: true, name: true } },
          trail: {
            select: {
              id: true,
              label: true,
              totalDistanceMeters: true,
              geoJson: true,
            },
          },
        },
      });

      if (scheduleChanged) {
        await tx.booking.updateMany({
          where: {
            eventId,
            status: { in: Array.from(RESCHEDULE_APPROVAL_ELIGIBLE_STATUSES) },
          },
          data: {
            rescheduleApprovalStatus: RESCHEDULE_APPROVAL_PENDING,
            rescheduleApprovalAt: null,
          },
        });
      }

      return savedEvent;
    });

    return NextResponse.json(updatedEvent, { status: 200 });
  } catch (error) {
    console.error(`PATCH /api/events/${params?.eventId} error:`, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

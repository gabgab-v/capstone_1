import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth";

const DIFFICULTY_CANONICAL = {
  beginner: "BEGINNER",
  easy: "BEGINNER",
  intermediate: "INTERMEDIATE",
  moderate: "INTERMEDIATE",
  medium: "INTERMEDIATE",
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

export async function GET(request, { params }) {
  const { eventId } = params;

  try {
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

    if (event.organizerId !== user.id && user.role !== "ADMIN") {
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
      locationName: sanitizeString(body?.locationName),
      locationLatitude: Number.isFinite(locationLatitude) ? locationLatitude : null,
      locationLongitude: Number.isFinite(locationLongitude) ? locationLongitude : null,
      locationZoomLevel: toFloat(body?.locationZoomLevel),
      locationBounds: sanitizeBounds(body?.locationBounds),
      difficulty: difficultyValue,
      trailId: selectedTrail.id,
      trailGeoJson: selectedTrail.geoJson ?? sanitizeGeoJson(body?.trailGeoJson) ?? existingEvent.trailGeoJson,
      trailDistanceMeters:
        selectedTrail.totalDistanceMeters ??
        toFloat(body?.trailDistanceMeters) ??
        existingEvent.trailDistanceMeters,
    };

    const updatedEvent = await prisma.event.update({
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

    return NextResponse.json(updatedEvent, { status: 200 });
  } catch (error) {
    console.error(`PATCH /api/events/${params?.eventId} error:`, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

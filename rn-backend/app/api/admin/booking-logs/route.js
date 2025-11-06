import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminFromToken } from "@/lib/auth";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
const ALLOWED_OUTCOMES = new Set(["PENDING", "SUCCESS", "REJECTED", "RATE_LIMITED", "ERROR"]);

function parseLimit(rawValue) {
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(parsed, MAX_LIMIT);
}

function normalizeOutcome(rawValue) {
  if (typeof rawValue !== "string") {
    return null;
  }
  const upper = rawValue.trim().toUpperCase();
  return ALLOWED_OUTCOMES.has(upper) ? upper : null;
}

export async function GET(request) {
  try {
    const admin = await getAdminFromToken(request);
    if (!admin) {
      return NextResponse.json({ message: "Authentication failed or not an admin" }, { status: 403 });
    }

    const url = new URL(request.url);
    const outcomeFilter = normalizeOutcome(url.searchParams.get("outcome"));
    const limit = parseLimit(url.searchParams.get("limit"));

    const logs = await prisma.bookingRequestLog.findMany({
      where: outcomeFilter ? { outcome: outcomeFilter } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        user: { select: { id: true, name: true, email: true } },
        event: { select: { id: true, title: true, difficulty: true, startsAt: true } },
        booking: { select: { id: true, status: true } },
      },
    });

    const payload = logs.map((log) => ({
      id: log.id,
      createdAt: log.createdAt,
      outcome: log.outcome,
      responseStatus: log.responseStatus,
      errorMessage: log.errorMessage,
      responseBody: log.responseBody ?? null,
      idempotencyKey: log.idempotencyKey,
      ipAddress: log.ipAddress,
      userId: log.userId,
      eventId: log.eventId,
      bookingId: log.bookingId,
      user: log.user,
      event: log.event,
      booking: log.booking,
    }));

    return NextResponse.json({ logs: payload });
  } catch (error) {
    console.error("Failed to fetch booking request logs:", error);
    return NextResponse.json(
      { message: "An internal server error occurred." },
      { status: 500 },
    );
  }
}

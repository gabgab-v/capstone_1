import { randomUUID } from "crypto";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { BookingRequestOutcome } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth";

const ALLOWED_RECEIPT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/jpg",
]);
const FALLBACK_EXTENSIONS = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};
const RECEIPT_BUCKET = process.env.SUPABASE_RECEIPT_BUCKET || "Capstone";
const RECEIPT_FOLDER = "receipts";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseStorageClient =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey)
    : null;

const ACTIVE_BOOKING_STATUSES = new Set(["PENDING", "APPROVED", "CONFIRMED"]);
const RATE_LIMIT_MAX_REQUESTS = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const IDEMPOTENCY_KEY_HEADER = "idempotency-key";
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9:/._-]{8,128}$/;

async function persistReceipt(file) {
  if (!file) {
    return null;
  }

  const mimeType = typeof file.type === "string" ? file.type.toLowerCase() : "";
  if (mimeType && !ALLOWED_RECEIPT_TYPES.has(mimeType)) {
    throw new Error("Unsupported receipt file type. Please upload an image.");
  }

  const arrayBuffer = await file.arrayBuffer();
  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    throw new Error("Uploaded receipt is empty.");
  }

  if (!supabaseStorageClient) {
    throw new Error("Supabase storage is not configured on the server.");
  }

  const originalName = typeof file.name === "string" ? file.name : "receipt";
  const extensionFromName = path.extname(originalName) || "";
  const extension =
    extensionFromName.toLowerCase() || FALLBACK_EXTENSIONS[mimeType] || ".jpg";
  const safeExtension = extension.startsWith(".") ? extension : `.${extension}`;
  const fileName = `${Date.now()}-${randomUUID()}${safeExtension}`;

  const objectPath = `${RECEIPT_FOLDER}/${fileName}`;

  const { error: uploadError } = await supabaseStorageClient.storage
    .from(RECEIPT_BUCKET)
    .upload(objectPath, Buffer.from(arrayBuffer), {
      contentType: mimeType || "image/jpeg",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Failed to upload receipt: ${uploadError.message}`);
  }

  const { data: publicUrlData, error: publicUrlError } =
    supabaseStorageClient.storage.from(RECEIPT_BUCKET).getPublicUrl(objectPath);

  if (publicUrlError || !publicUrlData?.publicUrl) {
    throw new Error("Unable to generate public URL for uploaded receipt.");
  }

  return publicUrlData.publicUrl;
}

function jsonResponse(body, status, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

function extractClientIp(req) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const firstIp = forwarded.split(",").map((part) => part.trim()).find(Boolean);
    if (firstIp) {
      return firstIp;
    }
  }
  const realIp = req.headers.get("x-real-ip");
  return realIp ? realIp.trim() : null;
}

function normalizeIdempotencyKey(rawKey) {
  if (typeof rawKey !== "string") {
    return null;
  }
  const trimmed = rawKey.trim();
  if (!trimmed || trimmed.length > 128) {
    return null;
  }
  if (!IDEMPOTENCY_KEY_PATTERN.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function normalizeResponseBody(body) {
  if (body === undefined) {
    return null;
  }
  try {
    return JSON.parse(JSON.stringify(body));
  } catch {
    return body ?? null;
  }
}

export async function POST(req) {
  const clientIp = extractClientIp(req);
  let baseLogData = null;
  let requestLog = null;
  let attemptCount = 0;

  const respondWithLog = async (
    status,
    body,
    outcome,
    errorMessage = null,
    headers = {},
    bookingId = null,
  ) => {
    const safeBody = normalizeResponseBody(body);

    if (requestLog) {
      try {
        await prisma.bookingRequestLog.update({
          where: { id: requestLog.id },
          data: {
            outcome,
            responseStatus: status,
            responseBody: safeBody,
            errorMessage,
            ...(bookingId ? { bookingId } : {}),
          },
        });
      } catch (logError) {
        console.error("Failed to update booking request log:", logError);
      }
    } else if (baseLogData && baseLogData.userId) {
      try {
        await prisma.bookingRequestLog.create({
          data: {
            ...baseLogData,
            outcome,
            responseStatus: status,
            responseBody: safeBody,
            errorMessage,
            ...(bookingId ? { bookingId } : {}),
          },
        });
      } catch (logError) {
        console.error("Failed to persist booking request log:", logError);
      }
    }

    const rateHeaders =
      baseLogData && baseLogData.userId
        ? {
            "X-RateLimit-Limit": String(RATE_LIMIT_MAX_REQUESTS),
            "X-RateLimit-Remaining": String(
              Math.max(RATE_LIMIT_MAX_REQUESTS - (attemptCount + (requestLog ? 1 : 0)), 0),
            ),
          }
        : {};

    return jsonResponse(body, status, {
      ...rateHeaders,
      ...headers,
    });
  };

  try {
    const user = await getUserFromToken(req);
    if (!user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const rawIdempotencyKey = req.headers.get(IDEMPOTENCY_KEY_HEADER);
    const idempotencyKey = normalizeIdempotencyKey(rawIdempotencyKey);
    if (!idempotencyKey) {
      return jsonResponse(
        { error: "A valid idempotency key is required for booking submissions." },
        400,
        { "X-Idempotency-Status": "MISSING" },
      );
    }

    baseLogData = {
      userId: user.id,
      idempotencyKey,
      ipAddress: clientIp,
    };

    const existingLog = await prisma.bookingRequestLog.findUnique({
      where: {
        userId_idempotencyKey: {
          userId: user.id,
          idempotencyKey,
        },
      },
    });

    if (existingLog) {
      const storedBody =
        existingLog.responseBody && typeof existingLog.responseBody === "object"
          ? existingLog.responseBody
          : { error: existingLog.errorMessage || "This booking request has already been processed." };

      const status =
        existingLog.responseStatus ??
        (existingLog.outcome === BookingRequestOutcome.SUCCESS ? 201 : 409);

      return jsonResponse(storedBody, status, {
        "X-Idempotency-Status":
          existingLog.outcome === BookingRequestOutcome.SUCCESS ? "REPLAY" : "LOCKED",
      });
    }

    const formData = await req.formData();
    const eventIdRaw = formData.get("eventId");
    const amountRaw = formData.get("amount");
    const receipt = formData.get("receipt");

    const eventId = typeof eventIdRaw === "string" ? eventIdRaw : null;
    if (eventId) {
      baseLogData = { ...baseLogData, eventId };
    }

    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
    attemptCount = await prisma.bookingRequestLog.count({
      where: {
        userId: user.id,
        createdAt: { gte: windowStart },
      },
    });

    if (attemptCount >= RATE_LIMIT_MAX_REQUESTS) {
      const retryAfterSeconds = Math.ceil(RATE_LIMIT_WINDOW_MS / 1000);
      const responseBody = {
        error: "Too many booking attempts. Please wait a moment and try again.",
      };

      await prisma.bookingRequestLog.create({
        data: {
          ...baseLogData,
          outcome: BookingRequestOutcome.RATE_LIMITED,
          responseStatus: 429,
          responseBody,
          errorMessage: "Rate limit exceeded",
        },
      });

      return jsonResponse(responseBody, 429, {
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Limit": String(RATE_LIMIT_MAX_REQUESTS),
        "X-RateLimit-Remaining": "0",
        "X-Idempotency-Status": "RATE_LIMITED",
      });
    }

    requestLog = await prisma.bookingRequestLog.create({
      data: {
        ...baseLogData,
        outcome: BookingRequestOutcome.PENDING,
      },
    });

    if (!eventId) {
      return respondWithLog(
        400,
        { error: "Missing event identifier." },
        BookingRequestOutcome.REJECTED,
        "Missing event identifier",
        { "X-Idempotency-Status": "REJECTED" },
      );
    }

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      return respondWithLog(
        404,
        { error: "Event not found." },
        BookingRequestOutcome.REJECTED,
        "Event not found",
        { "X-Idempotency-Status": "REJECTED" },
      );
    }

    const now = new Date();
    const normalizedStatus = (event.status || "").toUpperCase();
    if (normalizedStatus !== "PUBLISHED") {
      return respondWithLog(
        403,
        { error: "Bookings are closed for this event." },
        BookingRequestOutcome.REJECTED,
        "Event not published",
        { "X-Idempotency-Status": "REJECTED" },
      );
    }

    if (event.startsAt) {
      const startsAt = new Date(event.startsAt);
      if (!Number.isNaN(startsAt.valueOf()) && startsAt <= now) {
        return respondWithLog(
          403,
          { error: "This event has already started or finished." },
          BookingRequestOutcome.REJECTED,
          "Event already started",
          { "X-Idempotency-Status": "REJECTED" },
        );
      }
    }

    if (event.registrationOpensAt) {
      const opensAt = new Date(event.registrationOpensAt);
      if (!Number.isNaN(opensAt.valueOf()) && opensAt > now) {
        return respondWithLog(
          403,
          { error: "Registration has not opened yet." },
          BookingRequestOutcome.REJECTED,
          "Registration not open",
          { "X-Idempotency-Status": "REJECTED" },
        );
      }
    }

    if (event.registrationClosesAt) {
      const closesAt = new Date(event.registrationClosesAt);
      if (!Number.isNaN(closesAt.valueOf()) && closesAt <= now) {
        return respondWithLog(
          403,
          { error: "Registration for this event is already closed." },
          BookingRequestOutcome.REJECTED,
          "Registration closed",
          { "X-Idempotency-Status": "REJECTED" },
        );
      }
    }

    const existingBooking = await prisma.booking.findFirst({
      where: {
        eventId,
        userId: user.id,
      },
    });

    if (
      existingBooking &&
      !["DECLINED", "CANCELLED"].includes((existingBooking.status || "").toUpperCase())
    ) {
      return respondWithLog(
        409,
        { error: "You have already submitted a booking for this event." },
        BookingRequestOutcome.REJECTED,
        "Duplicate active booking",
        { "X-Idempotency-Status": "REJECTED" },
        existingBooking.id,
      );
    }

    const expectedAmount = Number(event.price ?? 0);
    const submittedAmount = Number(amountRaw ?? expectedAmount);
    const totalAmount = Number.isFinite(expectedAmount) ? expectedAmount : submittedAmount || 0;

    if (expectedAmount > 0 && Math.abs(submittedAmount - expectedAmount) > 0.01) {
      return respondWithLog(
        400,
        { error: "Submitted amount does not match the event price." },
        BookingRequestOutcome.REJECTED,
        "Amount mismatch",
        { "X-Idempotency-Status": "REJECTED" },
      );
    }

    let paymentUrl = null;

    if (expectedAmount > 0) {
      if (!receipt || typeof receipt.arrayBuffer !== "function") {
        return respondWithLog(
          400,
          { error: "Receipt is required for paid events." },
          BookingRequestOutcome.REJECTED,
          "Missing receipt",
          { "X-Idempotency-Status": "REJECTED" },
        );
      }

      paymentUrl = await persistReceipt(receipt);
    } else if (receipt && typeof receipt.arrayBuffer === "function") {
      paymentUrl = await persistReceipt(receipt);
    }

    if (event.maxParticipants) {
      const activeBookingCount = await prisma.booking.count({
        where: {
          eventId,
          status: { in: Array.from(ACTIVE_BOOKING_STATUSES) },
        },
      });

      if (activeBookingCount >= event.maxParticipants) {
        return respondWithLog(
          409,
          { error: "The event is already fully booked." },
          BookingRequestOutcome.REJECTED,
          "Event is fully booked",
          { "X-Idempotency-Status": "REJECTED" },
        );
      }
    }

    const booking = await prisma.booking.create({
      data: {
        userId: user.id,
        eventId,
        totalAmount,
        paymentUrl,
      },
      include: {
        event: true,
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return respondWithLog(
      201,
      booking,
      BookingRequestOutcome.SUCCESS,
      null,
      { "X-Idempotency-Status": "CREATED" },
      booking.id,
    );
  } catch (err) {
    console.error("POST /api/bookings error:", err);
    const message = err?.message || "Unauthorized or failed";
    return respondWithLog(
      500,
      { error: message },
      BookingRequestOutcome.ERROR,
      message,
      { "X-Idempotency-Status": "ERROR" },
    );
  }
}

export async function GET(req) {
  try {
    const user = await getUserFromToken(req);

    const bookings = await prisma.booking.findMany({
      where: { userId: user.id },
      include: { event: true },
    });

    return new Response(JSON.stringify(bookings), { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
}

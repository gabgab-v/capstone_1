import { NextResponse } from "next/server";
import { BookingAccessAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth";
import { ensureBookingColumns } from "@/lib/bookingColumns";

const PUBLIC_BOOKING_STATUSES = new Set(["CONFIRMED", "APPROVED"]);

function extractClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",").map((part) => part.trim()).find(Boolean);
    if (first) {
      return first;
    }
  }
  const realIp = request.headers.get("x-real-ip");
  return realIp ? realIp.trim() : null;
}

function maskEmail(email) {
  if (typeof email !== "string") {
    return null;
  }
  const trimmed = email.trim();
  if (!trimmed || !trimmed.includes("@")) {
    return null;
  }
  const [localPart, domain] = trimmed.split("@");
  if (!localPart || !domain) {
    return null;
  }
  const visibleLocal = localPart.slice(0, 2);
  const maskedLength = Math.max(localPart.length - visibleLocal.length, 3);
  const maskedLocal = `${visibleLocal}${"*".repeat(maskedLength)}`;
  return `${maskedLocal}@${domain}`;
}

function maskName(name) {
  if (typeof name !== "string") {
    return null;
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return null;
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    const first = parts[0];
    if (first.length <= 1) {
      return first.toUpperCase();
    }
    return `${first[0]}${"*".repeat(Math.min(first.length - 1, 3))}`;
  }

  const [first, second] = parts;
  const lastInitial = second ? `${second[0].toUpperCase()}.` : "";
  return `${first} ${lastInitial}`.trim();
}

function buildPublicDisplayName(user) {
  if (!user) {
    return "Confirmed attendee";
  }
  const maskedName = maskName(user.name);
  if (maskedName) {
    return maskedName;
  }
  const maskedEmail = maskEmail(user.email);
  if (maskedEmail) {
    return maskedEmail;
  }
  return "Confirmed attendee";
}

/**
 * Handles GET requests to /api/events/[eventId]/bookings
 * The `eventId` is destructured directly from the params object.
 */
export async function GET(request, { params }) {
  const { eventId } = params;

  try {
    const user = await getUserFromToken(request);
    const currentUserId = user?.id ?? null;
    await ensureBookingColumns();

    if (!eventId) {
      return NextResponse.json({ error: "Event ID is missing" }, { status: 400 });
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const isOrganizer = Boolean(user && event.organizerId === user.id);

    const bookings = await prisma.booking.findMany({
      where: {
        eventId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const isParticipant =
      Boolean(currentUserId) && bookings.some((booking) => booking.userId === currentUserId);
    const canViewPollVotes = isOrganizer || isParticipant;

    const sanitizedBookings = bookings
      .filter((booking) => {
        if (isOrganizer) {
          return true;
        }
        if (booking.userId === currentUserId) {
          return true;
        }
        const normalizedStatus = (booking.status || "").toUpperCase();
        return PUBLIC_BOOKING_STATUSES.has(normalizedStatus);
      })
      .map((booking) => {
        const normalizedStatus = (booking.status || "").toUpperCase();
        const canViewReceipt = isOrganizer || booking.userId === currentUserId;
        const canViewPersonalData =
          canViewReceipt || PUBLIC_BOOKING_STATUSES.has(normalizedStatus);
        const {
          paymentUrl,
          totalAmount,
          userId,
          user: bookingUser,
          cancellationReason,
          rescheduleReason,
          rescheduleRequestedAt,
          rescheduleApprovalStatus,
          rescheduleApprovalAt,
        } = booking;

        const safeUser = canViewPersonalData
          ? bookingUser
          : {
              id: null,
              name: buildPublicDisplayName(bookingUser),
              email: null,
              avatarUrl: null,
            };

        return {
          id: booking.id,
          eventId: booking.eventId,
          createdAt: booking.createdAt,
          status: booking.status,
          userId: canViewPersonalData ? userId : null,
          totalAmount: canViewReceipt ? totalAmount : null,
          paymentUrl: canViewReceipt ? paymentUrl : null,
          cancellationReason: canViewReceipt ? cancellationReason : null,
          rescheduleReason: canViewReceipt ? rescheduleReason : null,
          rescheduleRequestedAt: canViewReceipt ? rescheduleRequestedAt : null,
          rescheduleApprovalStatus: canViewPollVotes ? rescheduleApprovalStatus : null,
          rescheduleApprovalAt: canViewPollVotes ? rescheduleApprovalAt : null,
          user: safeUser,
        };
      });

    if (isOrganizer) {
      const receiptsExposed = sanitizedBookings.filter(
        (entry) => typeof entry.paymentUrl === "string" && entry.paymentUrl.trim().length > 0,
      );

      if (receiptsExposed.length > 0) {
        try {
          await prisma.bookingAccessLog.create({
            data: {
              organizerId: user.id,
              eventId,
              action: BookingAccessAction.VIEW_PAYMENT_RECEIPTS,
              details: `Returned ${receiptsExposed.length} receipt${receiptsExposed.length === 1 ? "" : "s"} to organizer.`,
              ipAddress: extractClientIp(request),
            },
          });
        } catch (logError) {
          console.error("Failed to record booking access log:", logError);
        }
      }
    }

    return NextResponse.json(sanitizedBookings, { status: 200 });
  } catch (err) {
    console.error("Error fetching event bookings:", err);
    return NextResponse.json({ error: "An internal server error occurred" }, { status: 500 });
  }
}

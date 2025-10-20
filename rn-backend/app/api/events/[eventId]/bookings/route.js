import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth";

const PUBLIC_BOOKING_STATUSES = new Set(["CONFIRMED", "APPROVED"]);

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
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

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
        const canViewReceipt = isOrganizer || booking.userId === currentUserId;
        const canViewPersonalData = canViewReceipt;
        const { paymentUrl, totalAmount, userId, user: bookingUser, ...rest } = booking;

        const safeUser = canViewPersonalData
          ? bookingUser
          : {
              id: null,
              name: buildPublicDisplayName(bookingUser),
              email: null,
            };

        return {
          ...rest,
          status: booking.status,
          userId: canViewPersonalData ? userId : null,
          totalAmount: canViewPersonalData ? totalAmount : null,
          paymentUrl: canViewReceipt ? paymentUrl : null,
          user: safeUser,
        };
      });

    return NextResponse.json(sanitizedBookings, { status: 200 });
  } catch (err) {
    console.error("Error fetching event bookings:", err);
    return NextResponse.json({ error: "An internal server error occurred" }, { status: 500 });
  }
}

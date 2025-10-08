import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth";

const PUBLIC_BOOKING_STATUSES = new Set(["CONFIRMED", "APPROVED"]);

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
        return {
          ...booking,
          paymentUrl: canViewReceipt ? booking.paymentUrl : null,
        };
      });

    return NextResponse.json(sanitizedBookings, { status: 200 });
  } catch (err) {
    console.error("Error fetching event bookings:", err);
    return NextResponse.json({ error: "An internal server error occurred" }, { status: 500 });
  }
}

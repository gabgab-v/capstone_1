import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth";

/**
 * Handles GET requests to /api/events/[eventId]/bookings
 * The `eventId` is destructured directly from the params object.
 */
export async function GET(request, { params }) {
  // Correctly destructure eventId from params here
  const { eventId } = params;

  try {
    // Authenticate the user making the request
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
    }

    // The eventId is now correctly available.
    if (!eventId) {
        return NextResponse.json({ error: "Event ID is missing" }, { status: 400 });
    }

    // Find the event to verify the current user is the organizer
    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    // --- Security Check ---
    // Ensure that only the organizer of this event can see its bookings
    if (event.organizerId !== user.id) {
      return NextResponse.json({ error: "Forbidden: You are not the organizer of this event" }, { status: 403 });
    }
    
    // Fetch all bookings for the specified event
    const bookings = await prisma.booking.findMany({
      where: {
        eventId: eventId,
      },
      // Include the details of the user who made each booking
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
        createdAt: 'desc', // Optional: Show the newest bookings first
      }
    });

    return NextResponse.json(bookings, { status: 200 });

  } catch (err) {
    console.error("Error fetching event bookings:", err);
    return NextResponse.json({ error: "An internal server error occurred" }, { status: 500 });
  }
}


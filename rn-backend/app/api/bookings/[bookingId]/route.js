import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth";

// This function handles PUT requests to /api/bookings/[bookingId]
export async function PUT(req, { params }) {
  try {
    // 1. Authenticate the user (must be an organizer)
    const organizer = await getUserFromToken(req);
    if (!organizer || organizer.role !== "ORGANIZER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Get the bookingId from the URL and the new status from the request body
    const { bookingId } = params;
    const { status } = await req.json();

    // Validate the new status
    if (status !== "APPROVED" && status !== "REJECTED") {
      return NextResponse.json({ error: "Invalid status provided" }, { status: 400 });
    }

    // 3. Find the original booking and its associated event
    const bookingToUpdate = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { event: true }, // Include the event to check its organizer
    });

    if (!bookingToUpdate) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    // 4. --- Security Check ---
    // Ensure the user updating the booking is the organizer of the event
    if (bookingToUpdate.event.organizerId !== organizer.id) {
      return NextResponse.json({ error: "Forbidden: You are not the organizer of this event" }, { status: 403 });
    }

    // 5. Update the booking's status in the database
    const updatedBooking = await prisma.booking.update({
      where: { id: bookingId },
      data: { status: status },
      include: { user: true }, // Return the user details in the response
    });

    return NextResponse.json(updatedBooking, { status: 200 });
  } catch (err) {
    console.error("Failed to update booking:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
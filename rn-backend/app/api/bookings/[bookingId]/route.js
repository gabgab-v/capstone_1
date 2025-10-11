import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth";

const ORGANIZER_ALLOWED_STATUSES = new Set(["APPROVED", "REJECTED", "CONFIRMED", "PENDING"]);
const ATTENDEE_ALLOWED_STATUSES = new Set(["CONFIRMED", "CANCELLED"]);

// This function handles PUT requests to /api/bookings/[bookingId]
export async function PUT(req, { params }) {
  try {
    // 1. Authenticate the user performing the update
    const actor = await getUserFromToken(req);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Get the bookingId from the URL and the new status from the request body
    const { bookingId } = params;
    const { status } = await req.json();
    const normalizedStatus = typeof status === "string" ? status.toUpperCase() : "";

    if (!normalizedStatus) {
      return NextResponse.json({ error: "Booking status is required." }, { status: 400 });
    }

    // 3. Find the original booking and its associated event
    const bookingToUpdate = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { event: true }, // Include the event to check its organizer
    });

    if (!bookingToUpdate) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const isOrganizer =
      actor.role === "ORGANIZER" && bookingToUpdate.event.organizerId === actor.id;
    const isBookingOwner = actor.id === bookingToUpdate.userId;
    const currentStatus =
      typeof bookingToUpdate.status === "string"
        ? bookingToUpdate.status.toUpperCase()
        : "PENDING";

    const allowedStatuses = new Set();
    if (isOrganizer) {
      ORGANIZER_ALLOWED_STATUSES.forEach((value) => allowedStatuses.add(value));
    }
    if (isBookingOwner) {
      ATTENDEE_ALLOWED_STATUSES.forEach((value) => allowedStatuses.add(value));
    }

    if (allowedStatuses.size === 0) {
      return NextResponse.json(
        { error: "Forbidden: You are not allowed to update this booking." },
        { status: 403 }
      );
    }

    if (!allowedStatuses.has(normalizedStatus)) {
      return NextResponse.json({ error: "Invalid status provided" }, { status: 400 });
    }

    if (
      isBookingOwner &&
      normalizedStatus === "CANCELLED" &&
      (currentStatus === "APPROVED" || currentStatus === "CONFIRMED")
    ) {
      return NextResponse.json(
        { error: "Approved bookings can no longer be cancelled." },
        { status: 409 },
      );
    }

    // 5. Update the booking's status in the database
    const updatedBooking = await prisma.booking.update({
      where: { id: bookingId },
      data: { status: normalizedStatus },
      include: {
        user: { select: { id: true, name: true, email: true } },
        event: { select: { id: true, title: true, organizerId: true } },
      },
    });

    return NextResponse.json(updatedBooking, { status: 200 });
  } catch (err) {
    console.error("Failed to update booking:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

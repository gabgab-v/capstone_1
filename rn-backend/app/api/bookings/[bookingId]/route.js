import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth";
import { isChatEligibleStatus, syncEventGroupConversation } from "@/lib/conversations";
import { buildCancellationOutcome } from "@/lib/cancellationPolicy";

const ORGANIZER_ALLOWED_STATUSES = new Set(["APPROVED", "REJECTED", "CONFIRMED", "PENDING"]);
const ATTENDEE_ALLOWED_STATUSES = new Set(["CANCELLED"]);

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
      return NextResponse.json(
        {
          error:
            isBookingOwner && normalizedStatus !== "CANCELLED"
              ? "Only organizers can approve bookings. You may cancel your booking instead."
              : "Invalid status provided",
        },
        { status: 400 },
      );
    }

    if (isBookingOwner && normalizedStatus === "CANCELLED" && currentStatus === "CANCELLED") {
      return NextResponse.json(
        { error: "This booking has already been cancelled." },
        { status: 409 },
      );
    }

    const cancellationData = {};
    if (isBookingOwner && normalizedStatus === "CANCELLED") {
      const cancelledAt = new Date();
      const cancellationOutcome = buildCancellationOutcome({
        startsAt: bookingToUpdate.event?.startsAt,
        cancelledAt,
        totalAmount: bookingToUpdate.totalAmount,
      });

      cancellationData.cancelledAt = cancelledAt;
      cancellationData.refundAmount = cancellationOutcome.refundAmount;
      cancellationData.refundPercentage = cancellationOutcome.refundPercentage;
      cancellationData.refundPolicyCode = cancellationOutcome.policyCode;
      cancellationData.refundPolicyLabel = cancellationOutcome.policyLabel;
    }

    // 5. Update the booking's status in the database
    const updatedBooking = await prisma.booking.update({
      where: { id: bookingId },
      data: { status: normalizedStatus, ...cancellationData },
      include: {
        user: { select: { id: true, name: true, email: true } },
        event: { select: { id: true, title: true, organizerId: true } },
      },
    });

    const shouldSyncConversation =
      isChatEligibleStatus(normalizedStatus) || isChatEligibleStatus(currentStatus);

    if (shouldSyncConversation) {
      try {
        await syncEventGroupConversation(updatedBooking.event.id);
      } catch (syncError) {
        console.error("Failed to sync event group conversation:", syncError);
      }
    }

    return NextResponse.json(updatedBooking, { status: 200 });
  } catch (err) {
    console.error("Failed to update booking:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

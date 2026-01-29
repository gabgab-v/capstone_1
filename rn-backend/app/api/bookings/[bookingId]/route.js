import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth";
import { isChatEligibleStatus, syncEventGroupConversation } from "@/lib/conversations";
import { buildCancellationOutcome } from "@/lib/cancellationPolicy";
import { ensureBookingColumns } from "@/lib/bookingColumns";
import { resolveReschedulePollStatus } from "@/lib/reschedulePoll";

const ORGANIZER_ALLOWED_STATUSES = new Set(["APPROVED", "REJECTED", "CONFIRMED", "PENDING"]);
const ATTENDEE_ALLOWED_STATUSES = new Set(["CANCELLED", "RESCHEDULE_REQUESTED"]);
const MAX_REASON_LENGTH = 500;
const RESCHEDULE_APPROVAL_STATUSES = new Set(["APPROVED", "REJECTED"]);
const RESCHEDULE_APPROVAL_PENDING = "PENDING";

// This function handles PUT requests to /api/bookings/[bookingId]
export async function PUT(req, { params }) {
  try {
    // 1. Authenticate the user performing the update
    const actor = await getUserFromToken(req);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureBookingColumns();

    // 2. Get the bookingId from the URL and the new status from the request body
    const { bookingId } = params;
    const { status, reason, rescheduleApprovalStatus } = await req.json();
    const normalizedStatus = typeof status === "string" ? status.toUpperCase() : "";
    const normalizedReason =
      typeof reason === "string" && reason.trim().length
        ? reason.trim().slice(0, MAX_REASON_LENGTH)
        : null;
    const normalizedApprovalStatus =
      typeof rescheduleApprovalStatus === "string"
        ? rescheduleApprovalStatus.trim().toUpperCase()
        : null;
    const hasStatusUpdate = Boolean(normalizedStatus);
    const hasApprovalUpdate = Boolean(normalizedApprovalStatus);

    if (!hasStatusUpdate && !hasApprovalUpdate) {
      return NextResponse.json(
        { error: "Provide a booking status or a reschedule approval response." },
        { status: 400 },
      );
    }

    if (hasStatusUpdate && hasApprovalUpdate) {
      return NextResponse.json(
        { error: "Reschedule approval cannot be submitted with a status change." },
        { status: 400 },
      );
    }

    // 3. Find the original booking and its associated event
    const bookingToUpdate = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            organizerId: true,
            rescheduledAt: true,
            reschedulePollOpensAt: true,
            reschedulePollClosesAt: true,
            reschedulePollStatus: true,
          },
        },
      }, // Include the event to check its organizer
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

    if (hasStatusUpdate) {
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

      if (isBookingOwner && normalizedStatus === "RESCHEDULE_REQUESTED") {
        if (currentStatus === "CANCELLED") {
          return NextResponse.json(
            { error: "Cancelled bookings cannot be rescheduled." },
            { status: 409 },
          );
        }
        const previousDecision =
          typeof bookingToUpdate.rescheduleApprovalStatus === "string"
            ? bookingToUpdate.rescheduleApprovalStatus.toUpperCase()
            : null;
        if (currentStatus === "RESCHEDULE_REQUESTED" && previousDecision !== "REJECTED") {
          return NextResponse.json(
            { error: "Reschedule has already been requested for this booking." },
            { status: 409 },
          );
        }
      }
    }

    if (hasApprovalUpdate) {
      if (!RESCHEDULE_APPROVAL_STATUSES.has(normalizedApprovalStatus)) {
        return NextResponse.json(
          { error: "Invalid reschedule approval response." },
          { status: 400 },
        );
      }

      const isPollVote = Boolean(bookingToUpdate.event?.rescheduledAt);

      if (isPollVote) {
        if (!isBookingOwner) {
          return NextResponse.json(
            { error: "Only the booking owner can approve a rescheduled event." },
            { status: 403 },
          );
        }

        if (["CANCELLED", "DECLINED", "REJECTED"].includes(currentStatus)) {
          return NextResponse.json(
            { error: "Cancelled or rejected bookings cannot approve a reschedule." },
            { status: 409 },
          );
        }

        const pollStatus =
          typeof bookingToUpdate.event?.reschedulePollStatus === "string"
            ? bookingToUpdate.event.reschedulePollStatus.toUpperCase()
            : "PENDING";
        if (pollStatus !== "PENDING") {
          return NextResponse.json(
            { error: "Reschedule poll is already finalized." },
            { status: 409 },
          );
        }

        const pollOpensAt = bookingToUpdate.event?.reschedulePollOpensAt ?? null;
        const pollClosesAt = bookingToUpdate.event?.reschedulePollClosesAt ?? null;
        if (!pollOpensAt || !pollClosesAt) {
          return NextResponse.json(
            { error: "Reschedule poll window is not available for this event." },
            { status: 409 },
          );
        }

        const now = new Date();
        const opensAt = new Date(pollOpensAt);
        const closesAt = new Date(pollClosesAt);
        if (Number.isNaN(opensAt.valueOf()) || Number.isNaN(closesAt.valueOf())) {
          return NextResponse.json(
            { error: "Reschedule poll schedule is invalid." },
            { status: 400 },
          );
        }
        if (now < opensAt) {
          return NextResponse.json(
            { error: "Reschedule poll has not opened yet." },
            { status: 409 },
          );
        }
        if (now >= closesAt) {
          return NextResponse.json(
            { error: "Reschedule poll has closed." },
            { status: 409 },
          );
        }
      } else {
        if (!isOrganizer) {
          return NextResponse.json(
            { error: "Only the organizer can review reschedule requests." },
            { status: 403 },
          );
        }
        if (currentStatus !== "RESCHEDULE_REQUESTED") {
          return NextResponse.json(
            { error: "No reschedule request is awaiting review." },
            { status: 409 },
          );
        }
      }
    }

    const cancellationData = {};
    const rescheduleData = {};
    const approvalData = {};
    if (hasStatusUpdate && isBookingOwner && normalizedStatus === "CANCELLED") {
      const cancelledAt = new Date();
      const cancellationOutcome = buildCancellationOutcome({
        startsAt: bookingToUpdate.event?.startsAt,
        cancelledAt,
        totalAmount: bookingToUpdate.totalAmount,
      });

      cancellationData.cancelledAt = cancelledAt;
      cancellationData.cancellationReason = normalizedReason;
      cancellationData.refundAmount = cancellationOutcome.refundAmount;
      cancellationData.refundPercentage = cancellationOutcome.refundPercentage;
      cancellationData.refundPolicyCode = cancellationOutcome.policyCode;
      cancellationData.refundPolicyLabel = cancellationOutcome.policyLabel;
      cancellationData.rescheduleRequestedAt = null;
      cancellationData.rescheduleReason = null;
      cancellationData.rescheduleApprovalStatus = null;
      cancellationData.rescheduleApprovalAt = null;
    }

    if (hasStatusUpdate && isBookingOwner && normalizedStatus === "RESCHEDULE_REQUESTED") {
      rescheduleData.rescheduleRequestedAt = new Date();
      rescheduleData.rescheduleReason = normalizedReason;
      rescheduleData.rescheduleApprovalStatus = RESCHEDULE_APPROVAL_PENDING;
      rescheduleData.rescheduleApprovalAt = null;
    }

    if (hasApprovalUpdate) {
      approvalData.rescheduleApprovalStatus = normalizedApprovalStatus;
      approvalData.rescheduleApprovalAt = new Date();
    }

    // 5. Update the booking's status in the database
    const shouldEvaluatePoll = hasApprovalUpdate || hasStatusUpdate;
    const updatedBooking = await prisma.$transaction(async (tx) => {
      const savedBooking = await tx.booking.update({
        where: { id: bookingId },
        data: {
          ...(hasStatusUpdate ? { status: normalizedStatus } : {}),
          ...cancellationData,
          ...rescheduleData,
          ...approvalData,
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          event: true,
        },
      });

      if (shouldEvaluatePoll && savedBooking?.event?.id) {
        try {
          const nextPollStatus = await resolveReschedulePollStatus(tx, savedBooking.event);
          if (nextPollStatus && savedBooking.event) {
            savedBooking.event.reschedulePollStatus = nextPollStatus;
          }
        } catch (pollError) {
          console.error("Failed to resolve reschedule poll:", pollError);
        }
      }

      return savedBooking;
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

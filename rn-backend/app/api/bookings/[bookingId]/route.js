import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth";

const ORGANIZER_ALLOWED_STATUSES = new Set(["APPROVED", "REJECTED", "CONFIRMED", "PENDING"]);
const ATTENDEE_ALLOWED_STATUSES = new Set(["CANCELLED"]);
const CHAT_ELIGIBLE_STATUSES = new Set(["APPROVED", "CONFIRMED"]);

function isChatEligibleStatus(status) {
  if (!status || typeof status !== "string") {
    return false;
  }
  return CHAT_ELIGIBLE_STATUSES.has(status.toUpperCase());
}

async function syncEventGroupConversation(eventId) {
  if (!eventId) {
    return;
  }

  const eventWithBookings = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      organizerId: true,
      bookings: {
        select: {
          userId: true,
          status: true,
        },
      },
    },
  });

  if (!eventWithBookings) {
    return;
  }

  const desiredUserIds = new Set([eventWithBookings.organizerId]);
  for (const booking of eventWithBookings.bookings) {
    if (isChatEligibleStatus(booking.status)) {
      desiredUserIds.add(booking.userId);
    }
  }

  if (desiredUserIds.size < 2) {
    // No approved attendees yet; defer creating the conversation until the first approval.
    const existingConversation = await prisma.conversation.findUnique({
      where: { eventId },
      select: { id: true },
    });

    if (existingConversation) {
      // Keep the conversation but ensure only the organizer remains as a participant.
      await prisma.conversationParticipant.deleteMany({
        where: {
          conversationId: existingConversation.id,
          userId: {
            not: eventWithBookings.organizerId,
          },
        },
      });
    }
    return;
  }

  const conversation = await prisma.conversation.findUnique({
    where: { eventId },
    include: {
      participants: {
        select: {
          userId: true,
        },
      },
    },
  });

  const targetUserIds = Array.from(desiredUserIds);
  const now = new Date();

  if (!conversation) {
    await prisma.conversation.create({
      data: {
        event: {
          connect: {
            id: eventId,
          },
        },
        participants: {
          create: targetUserIds.map((userId) => ({
            userId,
            lastReadAt: now,
          })),
        },
      },
    });
    return;
  }

  const existingUserIds = new Set(conversation.participants.map((participant) => participant.userId));
  const toAdd = targetUserIds.filter((userId) => !existingUserIds.has(userId));
  const toRemove = conversation.participants
    .map((participant) => participant.userId)
    .filter((userId) => !desiredUserIds.has(userId));

  if (toAdd.length === 0 && toRemove.length === 0) {
    return;
  }

  const operations = [];

  if (toAdd.length > 0) {
    operations.push(
      prisma.conversationParticipant.createMany({
        data: toAdd.map((userId) => ({
          conversationId: conversation.id,
          userId,
          lastReadAt: now,
        })),
        skipDuplicates: true,
      }),
    );
  }

  if (toRemove.length > 0) {
    operations.push(
      prisma.conversationParticipant.deleteMany({
        where: {
          conversationId: conversation.id,
          userId: {
            in: toRemove,
          },
        },
      }),
    );
  }

  if (operations.length > 0) {
    await prisma.$transaction(operations);
  }
}

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

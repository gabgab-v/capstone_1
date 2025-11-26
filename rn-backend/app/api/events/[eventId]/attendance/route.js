import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromToken } from '@/lib/auth';

const APPROVED_BOOKING_STATUSES = new Set(['APPROVED', 'CONFIRMED']);
const RESPONSE_STATUSES = new Set(['GOING', 'NOT_GOING', 'UNSURE', 'PENDING']);

async function ensureAttendanceColumns() {
  try {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "attendanceStatus" TEXT DEFAULT \'PENDING\';',
    );
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "attendanceRespondedAt" TIMESTAMP(3);',
    );
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "announceSentAt" TIMESTAMP(3);',
    );
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "attendanceCheckSentAt" TIMESTAMP(3);',
    );
  } catch (error) {
    console.error('ensureAttendanceColumns error:', error);
  }
}

function normalizeBookingStatus(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  return normalized || null;
}

function normalizeAttendanceStatus(value) {
  if (!value) {
    return 'PENDING';
  }
  const normalized = String(value).trim().toUpperCase();
  if (RESPONSE_STATUSES.has(normalized)) {
    return normalized;
  }
  return 'PENDING';
}

function buildPollWindow(startsAt) {
  if (!startsAt) {
    return { opensAt: null, closesAt: null, isOpen: false, locked: false };
  }
  const startDate = new Date(startsAt);
  if (Number.isNaN(startDate.valueOf())) {
    return { opensAt: null, closesAt: null, isOpen: false, locked: false };
  }
  const opensAt = new Date(startDate);
  opensAt.setHours(0, 0, 0, 0);
  const closesAt = startDate;
  const now = new Date();
  return {
    opensAt: opensAt.toISOString(),
    closesAt: closesAt.toISOString(),
    isOpen: now >= opensAt && now < closesAt,
    locked: now >= closesAt,
  };
}

function summarizeResponses(bookings) {
  const summary = { total: bookings.length, going: 0, notGoing: 0, unsure: 0, pending: 0 };
  bookings.forEach((booking) => {
    const status = normalizeAttendanceStatus(booking.attendanceStatus);
    if (status === 'GOING') {
      summary.going += 1;
    } else if (status === 'NOT_GOING') {
      summary.notGoing += 1;
    } else if (status === 'UNSURE') {
      summary.unsure += 1;
    } else {
      summary.pending += 1;
    }
  });
  return summary;
}

async function loadAttendanceContext(eventId, viewerId) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      startsAt: true,
      announceAt: true,
      announceSentAt: true,
      attendanceCheckSentAt: true,
      organizerId: true,
      bookings: {
        select: {
          id: true,
          status: true,
          attendanceStatus: true,
          attendanceRespondedAt: true,
          userId: true,
          user: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
        },
      },
    },
  });

  if (!event) {
    return { status: 404, error: 'Event not found.' };
  }

  const pollWindow = buildPollWindow(event.startsAt);
  const bookings = Array.isArray(event.bookings) ? event.bookings : [];
  const viewerBooking = bookings.find((booking) => booking.userId === viewerId) ?? null;
  const viewerBookingStatus = viewerBooking ? normalizeBookingStatus(viewerBooking.status) : null;
  const isOrganizer = Boolean(viewerId && event.organizerId === viewerId);
  const viewerEligible =
    isOrganizer ||
    (viewerBooking && viewerBookingStatus && APPROVED_BOOKING_STATUSES.has(viewerBookingStatus));

  return {
    status: 200,
    event,
    pollWindow,
    bookings,
    viewerBooking,
    viewerBookingStatus,
    isOrganizer,
    viewerEligible,
  };
}

function buildPayload(context) {
  const eligibleBookings = context.bookings.filter((booking) =>
    APPROVED_BOOKING_STATUSES.has(normalizeBookingStatus(booking.status)),
  );
  const summary = summarizeResponses(eligibleBookings);
  const viewerAttendance = context.viewerBooking
    ? normalizeAttendanceStatus(context.viewerBooking.attendanceStatus)
    : null;

  return {
    event: {
      id: context.event.id,
      title: context.event.title,
      startsAt: context.event.startsAt,
      announceAt: context.event.announceAt,
      announceSentAt: context.event.announceSentAt,
      attendanceCheckSentAt: context.event.attendanceCheckSentAt,
    },
    pollWindow: context.pollWindow,
    viewerEligible: context.viewerEligible,
    canRespond:
      Boolean(context.viewerBooking) && context.viewerEligible && context.pollWindow.isOpen && !context.pollWindow.locked,
    viewer: context.viewerBooking
      ? {
          bookingId: context.viewerBooking.id,
          bookingStatus: context.viewerBooking.status,
          attendanceStatus: viewerAttendance,
          respondedAt: context.viewerBooking.attendanceRespondedAt,
        }
      : null,
    summary: {
      ...summary,
      responded: summary.total - summary.pending,
    },
    responses: context.isOrganizer
      ? eligibleBookings.map((booking) => ({
          bookingId: booking.id,
          userId: booking.userId,
          user: booking.user,
          bookingStatus: booking.status,
          attendanceStatus: normalizeAttendanceStatus(booking.attendanceStatus),
          respondedAt: booking.attendanceRespondedAt,
        }))
      : undefined,
  };
}

export async function GET(request, { params }) {
  try {
    const authUser = await getUserFromToken(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureAttendanceColumns();

    const eventId = params?.eventId;
    if (!eventId) {
      return NextResponse.json({ error: 'Event id is required.' }, { status: 400 });
    }

    const context = await loadAttendanceContext(eventId, authUser.id);
    if (context.error) {
      return NextResponse.json({ error: context.error }, { status: context.status ?? 500 });
    }

    if (!context.viewerEligible) {
      return NextResponse.json(
        { error: 'Only the organizer and approved attendees can view attendance responses.' },
        { status: 403 },
      );
    }

    return NextResponse.json(buildPayload(context));
  } catch (error) {
    console.error(`GET /api/events/${params?.eventId}/attendance failed:`, error);
    return NextResponse.json({ error: 'Failed to load attendance poll.' }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const authUser = await getUserFromToken(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureAttendanceColumns();

    const eventId = params?.eventId;
    if (!eventId) {
      return NextResponse.json({ error: 'Event id is required.' }, { status: 400 });
    }

    const payload = await request.json();
    const requestedStatus = normalizeAttendanceStatus(payload?.status);

    if (!RESPONSE_STATUSES.has(requestedStatus)) {
      return NextResponse.json({ error: 'Invalid attendance choice.' }, { status: 400 });
    }

    const context = await loadAttendanceContext(eventId, authUser.id);
    if (context.error) {
      return NextResponse.json({ error: context.error }, { status: context.status ?? 500 });
    }

    if (!context.viewerEligible || !context.viewerBooking) {
      return NextResponse.json(
        { error: 'Only approved attendees can submit attendance for this event.' },
        { status: 403 },
      );
    }

    if (context.pollWindow.locked) {
      return NextResponse.json(
        { error: 'Attendance check closed once the event started.' },
        { status: 409 },
      );
    }

    if (!context.pollWindow.isOpen) {
      return NextResponse.json(
        { error: 'Attendance check opens on the day of the event.' },
        { status: 409 },
      );
    }

    await prisma.booking.update({
      where: { id: context.viewerBooking.id },
      data: {
        attendanceStatus: requestedStatus,
        attendanceRespondedAt: new Date(),
      },
    });

    const refreshed = await loadAttendanceContext(eventId, authUser.id);
    if (refreshed.error) {
      return NextResponse.json({ error: refreshed.error }, { status: refreshed.status ?? 500 });
    }

    return NextResponse.json(buildPayload(refreshed));
  } catch (error) {
    console.error(`POST /api/events/${params?.eventId}/attendance failed:`, error);
    return NextResponse.json({ error: 'Failed to save attendance.' }, { status: 500 });
  }
}

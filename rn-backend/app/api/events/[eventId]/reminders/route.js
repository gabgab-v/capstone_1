import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromToken } from '@/lib/auth';
import { sendEventReminder } from '@/lib/reminders';

function mapErrorStatus(code) {
  switch (code) {
    case 'ALREADY_SENT':
      return 409;
    case 'NO_CONVERSATION':
    case 'INACTIVE_EVENT':
      return 409;
    case 'NOT_FOUND':
      return 404;
    case 'MISSING_EVENT':
      return 400;
    default:
      return 400;
  }
}

export async function POST(request, { params }) {
  try {
    const authUser = await getUserFromToken(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const eventId = params?.eventId;
    if (!eventId) {
      return NextResponse.json({ error: 'Event id is required.' }, { status: 400 });
    }

    const body = (await request.json()) ?? {};
    const type = body?.type || 'start';
    const force = Boolean(body?.force);

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { organizerId: true, status: true },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
    }

    const normalizedStatus =
      typeof event.status === 'string' ? event.status.trim().toUpperCase() : 'PUBLISHED';

    if (normalizedStatus === 'CANCELLED' || normalizedStatus === 'COMPLETED') {
      return NextResponse.json({ error: 'Reminders are disabled for inactive events.' }, { status: 409 });
    }

    const isOrganizer = authUser.id === event.organizerId || authUser.role === 'ADMIN';
    if (!isOrganizer) {
      return NextResponse.json(
        { error: 'Only the organizer can trigger reminders for this event.' },
        { status: 403 },
      );
    }

    const result = await sendEventReminder({
      eventId,
      type,
      actorId: authUser.id,
      force,
    });

    if (!result.ok) {
      const status = mapErrorStatus(result.code);
      return NextResponse.json({ error: result.message, code: result.code }, { status });
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error(`POST /api/events/${params?.eventId}/reminders failed:`, error);
    return NextResponse.json({ error: 'Failed to send reminder.' }, { status: 500 });
  }
}

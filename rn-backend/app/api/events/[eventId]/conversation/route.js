import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromToken } from '@/lib/auth';
import {
  appendUnreadCounts,
  buildConversationPayload,
  eventSelect,
  isChatEligibleStatus,
  messageInclude,
  participantUserSelect,
  syncEventGroupConversation,
} from '@/lib/conversations';

export async function GET(request, { params }) {
  try {
    const authUser = await getUserFromToken(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const eventId = params?.eventId;
    if (!eventId) {
      return NextResponse.json({ error: 'Missing event id.' }, { status: 400 });
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        title: true,
        organizerId: true,
        bookings: {
          select: {
            userId: true,
            status: true,
          },
        },
      },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
    }

    const viewerIsOrganizer = authUser.id === event.organizerId;
    const viewerBooking = event.bookings.find((booking) => booking.userId === authUser.id);
    const viewerStatus = viewerBooking?.status ? String(viewerBooking.status).toUpperCase() : null;
    const viewerEligible = viewerIsOrganizer || isChatEligibleStatus(viewerStatus);

    if (!viewerEligible) {
      return NextResponse.json(
        { error: 'Only organizers and approved attendees can access this chat.' },
        { status: 403 },
      );
    }

    await syncEventGroupConversation(event.id);

    const conversation = await prisma.conversation.findUnique({
      where: { eventId: event.id },
      include: {
        event: {
          select: eventSelect,
        },
        participants: {
          include: {
            user: {
              select: participantUserSelect,
            },
          },
        },
        messages: {
          take: 1,
          orderBy: {
            createdAt: 'desc',
          },
          include: messageInclude,
        },
      },
    });

    if (!conversation) {
      return NextResponse.json(
        {
          error: 'Event chat becomes available once another attendee is approved.',
        },
        { status: 409 },
      );
    }

    const includesViewer = conversation.participants.some(
      (participant) => participant.userId === authUser.id,
    );

    if (!includesViewer) {
      return NextResponse.json(
        { error: 'You are not a participant of this event chat.' },
        { status: 403 },
      );
    }

    const [payload] = await appendUnreadCounts([conversation], authUser.id);
    return NextResponse.json(payload);
  } catch (error) {
    console.error(`GET /api/events/${params?.eventId}/conversation error:`, error);
    return NextResponse.json({ error: 'Failed to load event chat.' }, { status: 500 });
  }
}

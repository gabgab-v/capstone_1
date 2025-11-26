import { prisma } from './prisma';
import { syncEventGroupConversation } from './conversations';

const REMINDER_TYPES = new Set(['start', 'attendance']);
const INACTIVE_EVENT_STATUSES = new Set(['CANCELLED', 'COMPLETED']);

async function ensureReminderColumns() {
  try {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "announceSentAt" TIMESTAMP(3);',
    );
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "attendanceCheckSentAt" TIMESTAMP(3);',
    );
  } catch (error) {
    console.error('ensureReminderColumns error:', error);
  }
}

function normalizeReminderType(value) {
  if (typeof value !== 'string') {
    return 'start';
  }
  const normalized = value.trim().toLowerCase();
  if (REMINDER_TYPES.has(normalized)) {
    return normalized;
  }
  return 'start';
}

function formatDateTime(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return null;
  }
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function buildStartReminderMessage(event) {
  const startLabel = formatDateTime(event?.startsAt) || 'soon';
  const title = typeof event?.title === 'string' && event.title.trim().length ? event.title.trim() : 'this event';
  return `Reminder: "${title}" starts ${startLabel}. Review the details, pack essentials, and reply here with any last questions.`;
}

function buildAttendanceReminderMessage(event) {
  const startLabel = formatDateTime(event?.startsAt) || 'soon';
  const title = typeof event?.title === 'string' && event.title.trim().length ? event.title.trim() : 'this event';
  return `Attendance check for "${title}" (starts ${startLabel}): open the event page and submit your attendance so the organizer can finalize headcount.`;
}

export async function sendEventReminder({ eventId, type = 'start', actorId, force = false } = {}) {
  if (!eventId) {
    return { ok: false, code: 'MISSING_EVENT', message: 'Event id is required.' };
  }

  await ensureReminderColumns();

  const reminderType = normalizeReminderType(type);
  const targetField = reminderType === 'attendance' ? 'attendanceCheckSentAt' : 'announceSentAt';

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
      status: true,
    },
  });

  if (!event) {
    return { ok: false, code: 'NOT_FOUND', message: 'Event not found.' };
  }

  const normalizedStatus =
    typeof event.status === 'string' ? event.status.trim().toUpperCase() : 'PUBLISHED';
  if (INACTIVE_EVENT_STATUSES.has(normalizedStatus)) {
    return { ok: false, code: 'INACTIVE_EVENT', message: 'Cannot send reminders for inactive events.' };
  }

  if (event[targetField] && !force) {
    return {
      ok: false,
      code: 'ALREADY_SENT',
      message: 'Reminder already sent for this event.',
      sentAt: event[targetField],
    };
  }

  await syncEventGroupConversation(event.id);

  const conversation = await prisma.conversation.findUnique({
    where: { eventId: event.id },
    select: { id: true },
  });

  if (!conversation) {
    return {
      ok: false,
      code: 'NO_CONVERSATION',
      message: 'Event chat is not available yet. Reminders will send once attendees are confirmed.',
    };
  }

  const now = new Date();
  const senderId = actorId || event.organizerId;
  const messageBody =
    reminderType === 'attendance'
      ? buildAttendanceReminderMessage(event)
      : buildStartReminderMessage(event);

  await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId,
        body: messageBody,
      },
    }),
    prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: now },
    }),
    prisma.conversationParticipant.updateMany({
      where: {
        conversationId: conversation.id,
        userId: senderId,
      },
      data: {
        lastReadAt: now,
      },
    }),
    prisma.event.update({
      where: { id: event.id },
      data: {
        [targetField]: now,
      },
    }),
  ]);

  return {
    ok: true,
    code: 'SENT',
    reminderType,
    eventId: event.id,
    sentAt: now,
    messageBody,
  };
}

export function describeReminderField(type) {
  const normalized = normalizeReminderType(type);
  return normalized === 'attendance' ? 'attendanceCheckSentAt' : 'announceSentAt';
}

const path = require('path');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const prisma = new PrismaClient();
const INACTIVE_STATUSES = ['CANCELLED', 'COMPLETED', 'DRAFT'];

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

async function getReminderHelper() {
  const module = await import('../lib/reminders.js');
  return module.sendEventReminder;
}

async function findStartReminders(now) {
  return prisma.event.findMany({
    where: {
      announceAt: { lte: now },
      announceSentAt: null,
      announceAt: { not: null },
      status: { notIn: INACTIVE_STATUSES },
    },
    select: { id: true, title: true },
  });
}

async function findAttendanceReminders(dayStart, dayEnd) {
  return prisma.event.findMany({
    where: {
      startsAt: {
        gte: dayStart,
        lt: dayEnd,
      },
      attendanceCheckSentAt: null,
      status: { notIn: INACTIVE_STATUSES },
    },
    select: { id: true, title: true },
  });
}

async function main() {
  await ensureReminderColumns();
  const sendEventReminder = await getReminderHelper();
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const startEvents = await findStartReminders(now);
  const attendanceEvents = await findAttendanceReminders(dayStart, dayEnd);

  console.log(`Dispatching reminders for ${startEvents.length} start prompts and ${attendanceEvents.length} attendance checks...`);

  for (const event of startEvents) {
    try {
      const result = await sendEventReminder({ eventId: event.id, type: 'start', force: false });
      if (result.ok) {
        console.log(`Sent start reminder to chat for event ${event.title || event.id}`);
      } else {
        console.warn(
          `Skipped start reminder for event ${event.title || event.id}: ${result.message || result.code}`,
        );
      }
    } catch (error) {
      console.error(`Failed to send start reminder for event ${event.title || event.id}:`, error);
    }
  }

  for (const event of attendanceEvents) {
    try {
      const result = await sendEventReminder({ eventId: event.id, type: 'attendance', force: false });
      if (result.ok) {
        console.log(`Sent attendance reminder to chat for event ${event.title || event.id}`);
      } else {
        console.warn(
          `Skipped attendance reminder for event ${event.title || event.id}: ${result.message || result.code}`,
        );
      }
    } catch (error) {
      console.error(`Failed to send attendance reminder for event ${event.title || event.id}:`, error);
    }
  }

  console.log('Reminder dispatch complete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

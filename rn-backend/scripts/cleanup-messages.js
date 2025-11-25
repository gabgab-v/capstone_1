const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: '.env' });

const prisma = new PrismaClient();

const DAY_MS = 24 * 60 * 60 * 1000;
const NORMAL_CHAT_RETENTION_DAYS = 365;
const EVENT_CHAT_RETENTION_DAYS = 7;

async function deleteOldDirectMessages() {
  const cutoff = new Date(Date.now() - NORMAL_CHAT_RETENTION_DAYS * DAY_MS);
  const result = await prisma.message.deleteMany({
    where: {
      conversation: {
        eventId: null,
      },
      createdAt: {
        lt: cutoff,
      },
    },
  });

  console.log(`Deleted ${result.count} direct/1:1 messages older than ${cutoff.toISOString()}`);
}

async function deleteExpiredEventChats() {
  const cutoff = new Date(Date.now() - EVENT_CHAT_RETENTION_DAYS * DAY_MS);

  const conversations = await prisma.conversation.findMany({
    where: {
      event: {
        completedAt: {
          not: null,
          lt: cutoff,
        },
      },
    },
    select: {
      id: true,
      event: {
        select: {
          id: true,
          title: true,
          completedAt: true,
        },
      },
    },
  });

  if (!conversations.length) {
    console.log('No event chats require deletion.');
    return;
  }

  for (const conversation of conversations) {
    await prisma.conversation.delete({ where: { id: conversation.id } });
    const eventLabel = conversation.event?.title || conversation.event?.id || 'unknown event';
    console.log(
      `Deleted event chat ${conversation.id} for ${eventLabel} (completed at ${conversation.event?.completedAt})`,
    );
  }
}

async function main() {
  console.log('Starting message retention cleanup...');
  await deleteOldDirectMessages();
  await deleteExpiredEventChats();
  console.log('Cleanup complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

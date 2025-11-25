const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: '.env' });

const prisma = new PrismaClient();

const INACTIVITY_MONTHS = 12;
const INACTIVITY_REASON = 'INACTIVITY_12_MONTHS';
const REQUIRED_TERMS_VERSION = process.env.CURRENT_TERMS_VERSION || 'latest';

function buildChecklist(existing = {}) {
  const base =
    existing &&
    typeof existing === 'object' &&
    !Array.isArray(existing)
      ? existing
      : {};

  return {
    verifyEmail: base.verifyEmail ?? true,
    verifyPhone: base.verifyPhone ?? true,
    resetPassword: base.resetPassword ?? true,
    acceptTermsVersion: base.acceptTermsVersion ?? REQUIRED_TERMS_VERSION,
  };
}

async function main() {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - INACTIVITY_MONTHS);

  console.log(`Checking for users inactive since ${cutoff.toISOString()}...`);

  const users = await prisma.user.findMany({
    where: {
      deactivatedAt: null,
      OR: [
        { lastActiveAt: { lt: cutoff } },
        {
          AND: [{ lastActiveAt: null }, { createdAt: { lt: cutoff } }],
        },
      ],
    },
  });

  if (!users.length) {
    console.log('No accounts require deactivation.');
    return;
  }

  console.log(`Temporarily deactivating ${users.length} inactive account(s)...`);

  for (const user of users) {
    const checklist = buildChecklist(user.reactivationChecklist);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        deactivatedAt: new Date(),
        deactivationReason: INACTIVITY_REASON,
        reactivationChecklist: checklist,
      },
    });

    console.log(`- Marked ${user.email} as inactive`);
  }

  console.log('Done.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

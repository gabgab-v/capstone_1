const { PrismaClient } = require('@prisma/client');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config();

const prisma = new PrismaClient();
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function ensureSeedUser({ email, password, name, role }) {
  const now = new Date();
  let supabaseUser = await findSupabaseUserByEmail(email);

  if (supabaseUser) {
    console.log(`Found existing Supabase user: ${email}. Updating password and confirming email...`);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(supabaseUser.id, {
      password,
      email_confirm: true,
    });
    if (error) throw error;
  } else {
    console.log(`Creating Supabase user: ${email} (auto-confirmed)...`);
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // confirm immediately so login works without email flow
    });
    if (error) throw error;
    supabaseUser = data.user;
  }

  // Sync Prisma profile with confirmed email timestamp.
  const updateData = {
    supabaseUserId: supabaseUser.id,
    role,
    name,
    emailVerifiedAt: supabaseUser.email_confirmed_at
      ? new Date(supabaseUser.email_confirmed_at)
      : now,
  };
  const createData = {
    id: supabaseUser.id,
    supabaseUserId: supabaseUser.id,
    email,
    name,
    role,
    emailVerifiedAt: now,
  };

  if (role === 'ORGANIZER') {
    updateData.organizerRequestPending = false;
    createData.organizerRequestPending = false;
    updateData.organizerTrustScore = 100;
    updateData.organizerTrustTier = 'VERIFIED_ORGANIZER';
    createData.organizerTrustScore = 100;
    createData.organizerTrustTier = 'VERIFIED_ORGANIZER';
  }

  const userRecord = await prisma.user.upsert({
    where: { email },
    update: updateData,
    create: createData,
  });

  console.log(`Seeded user ${email} with role ${role}.`);
  return userRecord;
}

async function ensureOrganizer({ email, password, name, organizationName, reviewerId }) {
  const user = await ensureSeedUser({ email, password, name, role: 'ORGANIZER' });
  const now = new Date();

  await prisma.organizerApplication.upsert({
    where: { userId: user.id },
    update: {
      legalName: name,
      organizationName,
      status: 'APPROVED',
      reviewerId: reviewerId ?? null,
      reviewNotes: null,
      reviewedAt: now,
    },
    create: {
      userId: user.id,
      legalName: name,
      organizationName,
      status: 'APPROVED',
      reviewerId: reviewerId ?? null,
      reviewNotes: null,
      reviewedAt: now,
      documentUrls: [],
    },
  });

  await prisma.identityVerification.upsert({
    where: { userId: user.id },
    update: {
      status: 'VERIFIED',
      score: 100,
      livenessPassed: true,
      processedAt: now,
    },
    create: {
      userId: user.id,
      status: 'VERIFIED',
      score: 100,
      livenessPassed: true,
      processedAt: now,
      documentUrls: [],
      selfieUrl: null,
    },
  });

  await prisma.businessVerification.upsert({
    where: { userId: user.id },
    update: {
      businessName: organizationName,
      status: 'VERIFIED',
      score: 40,
      documentUrls: [],
      processedAt: now,
    },
    create: {
      userId: user.id,
      businessName: organizationName,
      status: 'VERIFIED',
      score: 40,
      documentUrls: [],
      processedAt: now,
    },
  });

  await prisma.facebookVerification.upsert({
    where: { userId: user.id },
    update: {
      pageName: organizationName,
      pageUrl: null,
      status: 'VERIFIED',
      score: 20,
      engagementScore: 10,
      lastCheckedAt: now,
    },
    create: {
      userId: user.id,
      pageName: organizationName,
      pageUrl: null,
      status: 'VERIFIED',
      score: 20,
      engagementScore: 10,
      lastCheckedAt: now,
    },
  });

  console.log(`Seeded organizer ${organizationName} (${email}).`);
  return user;
}

async function findSupabaseUserByEmail(email) {
  const normalizedEmail = email.toLowerCase();
  let page = 1;
  const perPage = 100;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const match = data.users.find((user) => user.email?.toLowerCase() === normalizedEmail);
    if (match) return match;

    if (data.users.length < perPage) break;
    page += 1;
  }

  return null;
}

async function main() {
  console.log('Starting seed process...');

  const defaultPassword = 'Password1234';

  const adminUser = await ensureSeedUser({
    email: 'admin101@gmail.com',
    password: defaultPassword,
    name: 'Admin User',
    role: 'ADMIN',
  });

  await ensureSeedUser({
    email: 'demo@gmail.com',
    password: defaultPassword,
    name: 'Demo User',
    role: 'USER',
  });

  const organizers = [
    { email: 'anakbukid@gmail.com', name: 'Wenz Delgado', organizationName: 'Anak Bukid' },
    { email: 'itrekkers@gmail.com', name: 'April Aranez', organizationName: 'I Trekkers' },
    { email: 'totskie.adventure@gmail.com', name: 'Royled Erespe', organizationName: 'Totskie Adventure Travel & Tour' },
    { email: 'dtravelsense@gmail.com', name: 'Merry Joy Astillero', organizationName: "D'Travel Sense Tour" },
    { email: 'lakawnipaw@gmail.com', name: 'Ainz Aneeca', organizationName: 'Lakaw ni Paw' },
    { email: 'hidenseak@gmail.com', name: 'Xyril Grace Beltran', organizationName: "Hide 'N' Seak" },
    { email: 'summitseekers@gmail.com', name: 'Kim M. Socorro', organizationName: 'Summit Seekers Adventure' },
    { email: 'dwandersteps@gmail.com', name: 'Dave Joshua Eli', organizationName: "D' Wander Steps" },
    { email: 'sakataerp@gmail.com', name: 'Jayvee Dagandan', organizationName: 'Saka Ta Erp' },
    { email: 'gabaysummit@gmail.com', name: 'Angelo A. Razon', organizationName: 'Gabay Summit' },
  ];

  for (const organizer of organizers) {
    await ensureOrganizer({
      ...organizer,
      password: defaultPassword,
      reviewerId: adminUser?.id ?? null,
    });
  }

  console.log('Seed process finished successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

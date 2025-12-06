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
  await prisma.user.upsert({
    where: { email },
    update: {
      supabaseUserId: supabaseUser.id,
      role,
      name,
      emailVerifiedAt: supabaseUser.email_confirmed_at
        ? new Date(supabaseUser.email_confirmed_at)
        : now,
    },
    create: {
      id: supabaseUser.id,
      supabaseUserId: supabaseUser.id,
      email,
      name,
      role,
      emailVerifiedAt: now,
    },
  });

  console.log(`Seeded user ${email} with role ${role}.`);
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

  const seedUsers = [
    { email: 'admin101@example.com', password: 'Password1234', name: 'Admin User', role: 'ADMIN' },
    { email: 'demo@example.com', password: 'Password1234', name: 'Demo User', role: 'USER' },
  ];

  for (const user of seedUsers) {
    await ensureSeedUser(user);
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

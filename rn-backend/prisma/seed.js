const { PrismaClient } = require('@prisma/client');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config();

const prisma = new PrismaClient();
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
  const adminEmail = 'admin101@example.com';
  const plainPassword = 'Password1234';

  console.log('Starting seed process...');

  let supabaseUser = await findSupabaseUserByEmail(adminEmail);

  if (supabaseUser) {
    console.log(`Admin user already exists in Supabase Auth: ${adminEmail}`);

    console.log('Updating password for existing Supabase admin user...');
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(supabaseUser.id, {
      password: plainPassword,
    });
    if (updateError) throw updateError;
    console.log('Supabase admin password updated successfully.');
  } else {
    console.log(`Creating admin user in Supabase Auth: ${adminEmail}...`);
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password: plainPassword,
      email_confirm: true,
    });
    if (error) throw error;
    supabaseUser = data.user;
    console.log('Supabase admin user created successfully.');
  }

  console.log('Syncing admin profile in local database...');
  const existingUser = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (existingUser) {
    await prisma.user.update({
      where: { email: adminEmail },
      data: {
        supabaseUserId: supabaseUser.id,
        role: 'ADMIN',
        name: existingUser.name || 'Admin User',
      },
    });
    console.log('Existing admin profile updated.');
  } else {
    await prisma.user.create({
      data: {
        id: supabaseUser.id,
        supabaseUserId: supabaseUser.id,
        email: adminEmail,
        name: 'Admin User',
        role: 'ADMIN',
      },
    });
    console.log('Admin profile created in Prisma.');
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

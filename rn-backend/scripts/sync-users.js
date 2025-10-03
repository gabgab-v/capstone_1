// scripts/sync-users.js
const { PrismaClient } = require('@prisma/client');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' }); // Make sure .env variables are loaded

const prisma = new PrismaClient();

// Use your SERVICE_ROLE_KEY for admin actions
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log('Fetching users from local DB that need syncing...');
  const usersToSync = await prisma.user.findMany({
    where: {
      supabaseUserId: null,
    },
  });

  if (usersToSync.length === 0) {
    console.log('✅ No users to sync. All users are up to date.');
    return;
  }

  console.log(`Found ${usersToSync.length} users to sync.`);

  for (const user of usersToSync) {
    console.log(`Syncing user: ${user.email}`);
    
    // Create the user in Supabase.
    // NOTE: You must provide a password. You could generate a random one
    // and then prompt the user to reset their password on their next login.
    const { data: supabaseUser, error } = await supabaseAdmin.auth.admin.createUser({
      email: user.email,
      password: 'some-strong-temporary-password', // Or generate a random one
      email_confirm: true, // Mark email as confirmed since they already exist
    });

    if (error) {
      console.error(`❌ Failed to create Supabase user for ${user.email}:`, error.message);
      continue; // Skip to the next user
    }

    // Update your local user with the new Supabase ID
    await prisma.user.update({
      where: { id: user.id },
      data: {
        supabaseUserId: supabaseUser.user.id,
      },
    });

    console.log(`✅ Successfully synced ${user.email}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
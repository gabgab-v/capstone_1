// rn-backend/prisma/seed.js

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const adminEmail = 'admin@example.com';
  const plainPassword = 'password123'; // Use a more secure password in production

  console.log('Starting seed process...');

  // Hash the password
  const hashedPassword = await bcrypt.hash(plainPassword, 10);
  console.log('Password hashed.');

  // Use `upsert` to create the admin user only if they don't exist.
  // This prevents errors if you run the seed command multiple times.
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {}, // No updates needed if the user already exists
    create: {
      email: adminEmail,
      name: 'Admin User',
      password: hashedPassword,
      role: 'ADMIN', // This is the crucial part
    },
  });

  console.log(`Admin user created/confirmed: ${admin.email}`);
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

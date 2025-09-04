// rn-backend/app/api/admin/users/route.js

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma'; // Use the shared prisma instance

// This route is automatically protected by the middleware.js file.
// Only users with an ADMIN role can access this.
export async function GET() {
  try {
    const users = await prisma.user.findMany({
      // Select only the fields that are safe to send to the client
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });
    return NextResponse.json(users);
  } catch (error) {
    console.error('Failed to fetch users:', error);
    return NextResponse.json(
      { message: 'An internal server error occurred.' },
      { status: 500 }
    );
  }
}




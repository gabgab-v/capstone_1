// rn-backend/app/api/admin/users/route.js

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromToken } from '@/lib/auth'; // ✅ Import the admin auth helper

export async function GET(request) { // ✅ Add request parameter
  try {
    // Step 1: Verify the user is an authenticated admin
    const admin = await getAdminFromToken(request);
    if (!admin) {
      return NextResponse.json({ message: 'Authentication failed or not an admin' }, { status: 403 });
    }

    // Step 2: If authorized, fetch all users
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
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




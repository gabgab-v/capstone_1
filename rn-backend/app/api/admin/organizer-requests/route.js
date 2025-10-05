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

    // Step 2: If authorized, fetch the pending requests
    const requests = await prisma.user.findMany({
      where: {
        organizerRequestPending: true,
        role: 'USER',
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    return NextResponse.json(requests);

  } catch (error) {
    console.error("Failed to fetch organizer requests:", error);
    return NextResponse.json({ message: "An internal server error occurred." }, { status: 500 });
  }
}
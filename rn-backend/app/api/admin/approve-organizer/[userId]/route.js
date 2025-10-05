import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromToken } from '@/lib/auth'; // ✅ Import the admin auth helper

export async function POST(request, { params }) { // ✅ Add request parameter
  try {
    // Step 1: Verify the user is an authenticated admin
    const admin = await getAdminFromToken(request);
    if (!admin) {
      return NextResponse.json({ message: 'Authentication failed or not an admin' }, { status: 403 });
    }

    const { userId } = params;

    if (!userId) {
      return NextResponse.json({ message: "User ID is required" }, { status: 400 });
    }

    // Step 2: If authorized, update the user's role
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        role: 'ORGANIZER',
        organizerRequestPending: false,
      },
    });

    return NextResponse.json({ message: 'User promoted to Organizer.', user: updatedUser });

  } catch (error) {
    console.error("Failed to approve organizer:", error);
    if (error.code === 'P2025') {
      return NextResponse.json({ message: `User with ID ${params.userId} not found.` }, { status: 404 });
    }
    return NextResponse.json({ message: "An internal server error occurred." }, { status: 500 });
  }
}
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { UserRole } from '@prisma/client'; // <-- 1. Import the enum

export async function POST(req, { params }) {
    try {
        const { userId } = params;

        if (!userId) {
            return NextResponse.json({ message: "User ID is required" }, { status: 400 });
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                role: UserRole.ORGANIZER, // <-- 2. Use the enum value here
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
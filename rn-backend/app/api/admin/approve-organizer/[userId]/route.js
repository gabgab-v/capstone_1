import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
// The import for UserRole is not needed here unless you are comparing roles
// import { UserRole } from '@prisma/client';

export async function POST(req, { params }) {
    try {
        const { userId } = params;

        if (!userId) {
            return NextResponse.json({ message: "User ID is required" }, { status: 400 });
        }

        // ----------------- THE FIX IS HERE -----------------
        // REMOVED: The conversion to a number. The userId is a string (UUID).
        // const numericUserId = parseInt(userId, 10); 
        // if (isNaN(numericUserId)) {
        //     return NextResponse.json({ message: "Invalid User ID format" }, { status: 400 });
        // }
        // ---------------------------------------------------

        const updatedUser = await prisma.user.update({
            // Use the userId string directly from params
            where: { id: userId },
            data: {
                // You can directly use the string 'ORGANIZER' as Prisma maps it to the enum
                role: 'ORGANIZER', 
                organizerRequestPending: false,
            },
        });

        return NextResponse.json({ message: 'User promoted to Organizer.', user: updatedUser });

    } catch (error) {
        console.error("Failed to approve organizer:", error);
        // This code specifically catches the error when a user is not found
        if (error.code === 'P2025') {
            return NextResponse.json({ message: `User with ID ${params.userId} not found.` }, { status: 404 });
        }
        return NextResponse.json({ message: "An internal server error occurred." }, { status: 500 });
    }
}

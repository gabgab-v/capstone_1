// This file is for the admin dashboard to fetch all pending organizer requests.
// It is protected by your existing middleware.js.
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        const requests = await prisma.user.findMany({
            where: {
                organizerRequestPending: true,
                role: 'USER', // Only show requests from regular users
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

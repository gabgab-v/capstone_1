import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromToken } from '@/lib/auth'; // Use your existing auth helper

export async function POST(req) {
    try {
        // Use your app's standard way of getting the logged-in user
        const user = await getUserFromToken(req);

        if (!user) {
            return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
        }

        // Update the user's record to show they have a pending request
        await prisma.user.update({
            where: { id: user.id },
            data: { organizerRequestPending: true },
        });

        return NextResponse.json({ message: 'Application submitted successfully!' });

    } catch (error) {
        console.error("Apply organizer error:", error);
        return NextResponse.json({ message: "An internal server error occurred." }, { status: 500 });
    }
}


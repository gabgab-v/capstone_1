import { NextResponse } from 'next/server';
import { getAdminFromToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request) {
  try {
    const admin = await getAdminFromToken(request);
    if (!admin) {
      return NextResponse.json({ message: 'Authentication failed or not an admin' }, { status: 403 });
    }

    const [userCount, eventCount, bookingCount, bookingSumResult] = await Promise.all([
      prisma.user.count(),
      prisma.event.count(),
      prisma.booking.count(),
      prisma.booking.aggregate({
        _sum: { totalAmount: true },
      }),
    ]);

    return NextResponse.json({
      users: userCount,
      events: eventCount,
      bookings: bookingCount,
      revenue: bookingSumResult._sum.totalAmount ?? 0,
    });
  } catch (error) {
    console.error('Failed to fetch dashboard stats:', error);
    return NextResponse.json({ message: 'An internal server error occurred.' }, { status: 500 });
  }
}

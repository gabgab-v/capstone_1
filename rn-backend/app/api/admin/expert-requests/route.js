import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromToken } from '@/lib/auth';

export async function GET(request) {
  try {
    const admin = await getAdminFromToken(request);
    if (!admin) {
      return NextResponse.json({ message: 'Authentication failed or not an admin' }, { status: 403 });
    }

    const applications = await prisma.expertApplication.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            experienceLevel: true,
            experienceLevelLocked: true,
            expertBadgeAwarded: true,
          },
        },
      },
    });

    const requests = applications.map((application) => ({
      id: application.id,
      userId: application.userId,
      summitName: application.summitName,
      summitDate: application.summitDate,
      peakPhotoUrl: application.peakPhotoUrl,
      certificateUrl: application.certificateUrl,
      additionalNotes: application.additionalNotes,
      status: application.status,
      submittedAt: application.createdAt,
      user: application.user
        ? {
            id: application.user.id,
            name: application.user.name,
            email: application.user.email,
            experienceLevel: application.user.experienceLevel,
            experienceLevelLocked: application.user.experienceLevelLocked,
            expertBadgeAwarded: application.user.expertBadgeAwarded,
          }
        : null,
    }));

    return NextResponse.json({ requests });
  } catch (error) {
    console.error('Failed to fetch expert requests:', error);
    return NextResponse.json({ message: 'An internal server error occurred.' }, { status: 500 });
  }
}

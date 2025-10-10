import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromToken } from '@/lib/auth';

export async function GET(request) {
  try {
    const admin = await getAdminFromToken(request);
    if (!admin) {
      return NextResponse.json({ message: 'Authentication failed or not an admin' }, { status: 403 });
    }

    const applications = await prisma.organizerApplication.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            gcashNumber: true,
            createdAt: true,
            organizerRequestPending: true,
          },
        },
      },
    });

    const requests = applications.map((application) => ({
      id: application.id,
      userId: application.userId,
      submittedAt: application.createdAt,
      legalName: application.legalName,
      organizationName: application.organizationName,
      certifications: application.certifications,
      governmentIdNumber: application.governmentIdNumber,
      experienceYears: application.experienceYears,
      bio: application.bio,
      additionalNotes: application.additionalNotes,
      documentUrls: application.documentUrls ?? [],
      status: application.status,
      user: {
        id: application.user.id,
        name: application.user.name,
        email: application.user.email,
        gcashNumber: application.user.gcashNumber,
        organizerRequestPending: application.user.organizerRequestPending,
        joinedAt: application.user.createdAt,
      },
    }));

    return NextResponse.json({ requests });
  } catch (error) {
    console.error('Failed to fetch organizer requests:', error);
    return NextResponse.json({ message: 'An internal server error occurred.' }, { status: 500 });
  }
}

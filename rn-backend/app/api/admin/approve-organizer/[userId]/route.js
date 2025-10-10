import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromToken } from '@/lib/auth';

export async function POST(request, { params }) {
  try {
    const admin = await getAdminFromToken(request);
    if (!admin) {
      return NextResponse.json({ message: 'Authentication failed or not an admin' }, { status: 403 });
    }

    const { userId } = params ?? {};
    if (!userId) {
      return NextResponse.json({ message: 'User ID is required' }, { status: 400 });
    }

    const application = await prisma.organizerApplication.findUnique({
      where: { userId },
    });

    if (!application) {
      return NextResponse.json({ message: `No organizer application found for user ${userId}.` }, { status: 404 });
    }

    if (application.status === 'APPROVED') {
      return NextResponse.json({ message: 'Application already approved.' }, { status: 409 });
    }

    if (application.status === 'REJECTED') {
      return NextResponse.json({ message: 'Application has been rejected and must be resubmitted by the user.' }, { status: 409 });
    }

    const now = new Date();

    const [updatedApplication, updatedUser] = await prisma.$transaction([
      prisma.organizerApplication.update({
        where: { userId },
        data: {
          status: 'APPROVED',
          reviewerId: admin.id,
          reviewNotes: null,
          reviewedAt: now,
        },
      }),
      prisma.user.update({
        where: { id: userId },
        data: {
          role: 'ORGANIZER',
          organizerRequestPending: false,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          organizerRequestPending: true,
        },
      }),
    ]);

    return NextResponse.json({
      message: 'User promoted to Organizer.',
      user: updatedUser,
      application: {
        ...updatedApplication,
        documentUrls: updatedApplication.documentUrls ?? [],
      },
    });
  } catch (error) {
    console.error('Failed to approve organizer:', error);
    if (error.code === 'P2025') {
      return NextResponse.json({ message: `User with ID ${params.userId} not found.` }, { status: 404 });
    }
    return NextResponse.json({ message: 'An internal server error occurred.' }, { status: 500 });
  }
}

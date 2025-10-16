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

    const application = await prisma.expertApplication.findUnique({
      where: { userId },
    });

    if (!application) {
      return NextResponse.json(
        { message: `No expert application found for user ${userId}.` },
        { status: 404 },
      );
    }

    if (application.status === 'APPROVED') {
      return NextResponse.json({ message: 'Application already approved.' }, { status: 409 });
    }

    if (application.status === 'REJECTED') {
      return NextResponse.json(
        { message: 'Application has been rejected and must be resubmitted by the user.' },
        { status: 409 },
      );
    }

    const now = new Date();

    const [updatedApplication, updatedUser] = await prisma.$transaction([
      prisma.expertApplication.update({
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
          experienceLevel: 'Expert',
          experienceLevelLocked: true,
          expertBadgeAwarded: true,
          expertVerifiedAt: now,
        },
        select: {
          id: true,
          email: true,
          name: true,
          experienceLevel: true,
          experienceLevelLocked: true,
          expertBadgeAwarded: true,
          expertVerifiedAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      message: 'User marked as expert. Badge awarded.',
      user: updatedUser,
      application: updatedApplication,
    });
  } catch (error) {
    console.error('Failed to approve expert application:', error);
    if (error.code === 'P2025') {
      return NextResponse.json(
        { message: `User with ID ${params.userId} not found.` },
        { status: 404 },
      );
    }
    return NextResponse.json({ message: 'An internal server error occurred.' }, { status: 500 });
  }
}

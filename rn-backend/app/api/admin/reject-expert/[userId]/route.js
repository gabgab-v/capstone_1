import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromToken } from '@/lib/auth';

function sanitizeNotes(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

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
      return NextResponse.json(
        { message: 'Approved applications cannot be rejected. Ask the user to resubmit.' },
        { status: 409 },
      );
    }

    let body = {};
    try {
      body = await request.json();
    } catch {
      // Body is optional; ignore parse errors and treat as empty.
    }

    const reviewNotes = sanitizeNotes(body?.reviewNotes);
    const now = new Date();

    const [updatedApplication, updatedUser] = await prisma.$transaction([
      prisma.expertApplication.update({
        where: { userId },
        data: {
          status: 'REJECTED',
          reviewerId: admin.id,
          reviewNotes,
          reviewedAt: now,
        },
      }),
      prisma.user.update({
        where: { id: userId },
        data: {
          expertBadgeAwarded: false,
          experienceLevelLocked: false,
          expertVerifiedAt: null,
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
      message: 'Expert application rejected.',
      user: updatedUser,
      application: updatedApplication,
    });
  } catch (error) {
    console.error('Failed to reject expert application:', error);
    if (error.code === 'P2025') {
      return NextResponse.json(
        { message: `User with ID ${params.userId} not found.` },
        { status: 404 },
      );
    }
    return NextResponse.json({ message: 'An internal server error occurred.' }, { status: 500 });
  }
}

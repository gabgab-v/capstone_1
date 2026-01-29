import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromToken } from '@/lib/auth';
import { updateOrganizerTrustScore } from '@/lib/trustScore';

const APPROVED_BUSINESS_SCORE = 40;

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

    const verification = await prisma.businessVerification.findUnique({
      where: { userId },
    });

    if (!verification) {
      return NextResponse.json({ message: `No business verification found for user ${userId}.` }, { status: 404 });
    }

    if (verification.status === 'VERIFIED') {
      return NextResponse.json({ message: 'Business verification already approved.' }, { status: 409 });
    }

    const updated = await prisma.businessVerification.update({
      where: { userId },
      data: {
        status: 'VERIFIED',
        score: APPROVED_BUSINESS_SCORE,
        failureReasons: null,
        processedAt: new Date(),
      },
    });

    const trust = await updateOrganizerTrustScore(userId);

    return NextResponse.json({
      message: 'Business verification approved.',
      verification: {
        ...updated,
        documentUrls: updated.documentUrls ?? [],
      },
      trust,
    });
  } catch (error) {
    console.error('Failed to approve business verification:', error);
    return NextResponse.json({ message: 'An internal server error occurred.' }, { status: 500 });
  }
}

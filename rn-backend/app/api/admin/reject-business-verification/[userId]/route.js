import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromToken } from '@/lib/auth';
import { updateOrganizerTrustScore } from '@/lib/trustScore';

function sanitizeString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
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

    const verification = await prisma.businessVerification.findUnique({
      where: { userId },
    });

    if (!verification) {
      return NextResponse.json({ message: `No business verification found for user ${userId}.` }, { status: 404 });
    }

    let reason = null;
    try {
      const body = await request.json();
      reason = sanitizeString(body?.reason || body?.reviewNotes);
    } catch {
      reason = null;
    }

    const failureReasons = reason ? [reason] : ['BNRS screenshot could not be verified.'];

    const updated = await prisma.businessVerification.update({
      where: { userId },
      data: {
        status: 'NEEDS_RESUBMISSION',
        score: 0,
        failureReasons,
        processedAt: new Date(),
      },
    });

    const trust = await updateOrganizerTrustScore(userId);

    return NextResponse.json({
      message: 'Business verification marked for resubmission.',
      verification: {
        ...updated,
        documentUrls: updated.documentUrls ?? [],
      },
      trust,
    });
  } catch (error) {
    console.error('Failed to reject business verification:', error);
    return NextResponse.json({ message: 'An internal server error occurred.' }, { status: 500 });
  }
}

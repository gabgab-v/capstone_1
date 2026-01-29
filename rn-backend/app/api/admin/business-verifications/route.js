import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromToken } from '@/lib/auth';

export async function GET(request) {
  try {
    const admin = await getAdminFromToken(request);
    if (!admin) {
      return NextResponse.json({ message: 'Authentication failed or not an admin' }, { status: 403 });
    }

    const verifications = await prisma.businessVerification.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            organizerTrustScore: true,
            organizerTrustTier: true,
          },
        },
      },
    });

    const requests = verifications.map((verification) => ({
      id: verification.id,
      userId: verification.userId,
      businessName: verification.businessName,
      status: verification.status,
      submittedAt: verification.createdAt,
      updatedAt: verification.updatedAt,
      documentUrls: verification.documentUrls ?? [],
      user: verification.user
        ? {
            id: verification.user.id,
            name: verification.user.name,
            email: verification.user.email,
            role: verification.user.role,
            organizerTrustScore: verification.user.organizerTrustScore,
            organizerTrustTier: verification.user.organizerTrustTier,
          }
        : null,
    }));

    return NextResponse.json({ requests });
  } catch (error) {
    console.error('Failed to fetch business verifications:', error);
    return NextResponse.json({ message: 'An internal server error occurred.' }, { status: 500 });
  }
}

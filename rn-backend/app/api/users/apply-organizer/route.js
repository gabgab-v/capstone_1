import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromToken } from '@/lib/auth';

function sanitizeString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNullableInt(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.max(0, Math.trunc(parsed));
}

export async function POST(req) {
  try {
    const user = await getUserFromToken(req);

    if (!user) {
      return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
    }

    let payload;
    try {
      payload = await req.json();
    } catch {
      return NextResponse.json({ message: 'Invalid request body.' }, { status: 400 });
    }

    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ message: 'Invalid request payload.' }, { status: 400 });
    }

    const legalName = sanitizeString(payload.legalName);
    const organizationName = sanitizeString(payload.organizationName);
    const certifications = sanitizeString(payload.certifications);
    const governmentIdNumber = sanitizeString(payload.governmentIdNumber);
    const bio = sanitizeString(payload.bio);
    const additionalNotes = sanitizeString(payload.additionalNotes);
    const experienceYears = toNullableInt(payload.experienceYears);

    const rawDocumentUrls = Array.isArray(payload.documentUrls) ? payload.documentUrls : [];
    const documentUrls = rawDocumentUrls
      .map(sanitizeString)
      .filter((value) => typeof value === 'string' && value.length > 0);

    if (!legalName) {
      return NextResponse.json({ message: 'Legal name is required.' }, { status: 400 });
    }

    if (documentUrls.length === 0) {
      return NextResponse.json(
        { message: 'At least one supporting document image is required.' },
        { status: 400 },
      );
    }

    const existingApplication = await prisma.organizerApplication.findUnique({
      where: { userId: user.id },
    });

    if (existingApplication?.status === 'APPROVED') {
      return NextResponse.json(
        { message: 'Your organizer application has already been approved.' },
        { status: 409 },
      );
    }

    const updates = {
      legalName,
      organizationName,
      certifications,
      governmentIdNumber,
      bio,
      additionalNotes,
      experienceYears,
      documentUrls,
      status: 'PENDING',
      reviewerId: null,
      reviewNotes: null,
      reviewedAt: null,
    };

    const transactionResult = await prisma.$transaction(async (tx) => {
      const application = existingApplication
        ? await tx.organizerApplication.update({
            where: { userId: user.id },
            data: updates,
          })
        : await tx.organizerApplication.create({
            data: {
              userId: user.id,
              ...updates,
            },
          });

      const userUpdateData = { organizerRequestPending: true };
      if (!user.name) {
        userUpdateData.name = legalName;
      }

      await tx.user.update({
        where: { id: user.id },
        data: userUpdateData,
      });

      return application;
    });

    return NextResponse.json({
      message: existingApplication ? 'Application updated successfully.' : 'Application submitted successfully!',
      application: {
        ...transactionResult,
        documentUrls: transactionResult.documentUrls ?? [],
      },
    });
  } catch (error) {
    console.error('Apply organizer error:', error);
    return NextResponse.json({ message: 'An internal server error occurred.' }, { status: 500 });
  }
}


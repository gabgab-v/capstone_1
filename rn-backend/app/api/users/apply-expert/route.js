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

function sanitizeUrl(value) {
  const sanitized = sanitizeString(value);
  if (!sanitized) {
    return null;
  }
  try {
    new URL(sanitized);
    return sanitized;
  } catch {
    return null;
  }
}

function parseOptionalDate(value) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

export async function POST(request) {
  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ message: 'Invalid JSON payload.' }, { status: 400 });
    }

    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ message: 'Invalid request body.' }, { status: 400 });
    }

    const summitName = sanitizeString(payload.summitName);
    const summitDate = parseOptionalDate(payload.summitDate);
    const peakPhotoUrl = sanitizeUrl(payload.peakPhotoUrl);
    const certificateUrl = sanitizeUrl(payload.certificateUrl);
    const additionalNotes = sanitizeString(payload.additionalNotes);

    if (!summitName) {
      return NextResponse.json({ message: 'Summit or peak name is required.' }, { status: 400 });
    }

    if (!peakPhotoUrl) {
      return NextResponse.json({ message: 'A valid summit photo URL is required.' }, { status: 400 });
    }

    if (!certificateUrl) {
      return NextResponse.json(
        { message: 'A valid certificate or validation document URL is required.' },
        { status: 400 },
      );
    }

    const existingApplication = await prisma.expertApplication.findUnique({
      where: { userId: user.id },
    });

    if (existingApplication?.status === 'APPROVED') {
      return NextResponse.json(
        { message: 'Your expert verification is already approved.' },
        { status: 409 },
      );
    }

    const updates = {
      summitName,
      summitDate,
      peakPhotoUrl,
      certificateUrl,
      additionalNotes,
      status: 'PENDING',
      reviewerId: null,
      reviewNotes: null,
      reviewedAt: null,
    };

    const application = existingApplication
      ? await prisma.expertApplication.update({
          where: { userId: user.id },
          data: updates,
        })
      : await prisma.expertApplication.create({
          data: {
            userId: user.id,
            ...updates,
          },
        });

    return NextResponse.json({
      message: existingApplication ? 'Application updated successfully.' : 'Application submitted successfully.',
      application,
    });
  } catch (error) {
    console.error('Apply expert error:', error);
    return NextResponse.json({ message: 'An internal server error occurred.' }, { status: 500 });
  }
}

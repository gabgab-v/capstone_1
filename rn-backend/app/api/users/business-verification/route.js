import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromToken } from '@/lib/auth';

function sanitizeString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeDocumentUrls(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => sanitizeString(value))
    .filter((value) => typeof value === 'string' && value.length > 0);
}

function mapVerification(record) {
  if (!record) return null;
  return {
    ...record,
    documentUrls: record.documentUrls ?? [],
    failureReasons: Array.isArray(record.failureReasons)
      ? record.failureReasons
      : record.failureReasons
        ? [String(record.failureReasons)]
        : [],
    validationFindings: record.validationFindings ?? null,
  };
}

export async function GET(request) {
  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
    }

    const verification = await prisma.businessVerification.findUnique({
      where: { userId: user.id },
    });

    return NextResponse.json({ verification: mapVerification(verification) });
  } catch (error) {
    console.error('GET /api/users/business-verification error:', error);
    return NextResponse.json({ message: 'An internal server error occurred.' }, { status: 500 });
  }
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
      return NextResponse.json({ message: 'Invalid JSON body.' }, { status: 400 });
    }

    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ message: 'Invalid request body.' }, { status: 400 });
    }

    const businessName = sanitizeString(payload.businessName);
    const screenshotUrls = normalizeDocumentUrls(payload.screenshotUrls ?? payload.documentUrls);

    if (!screenshotUrls.length) {
      return NextResponse.json(
        { message: 'Capture or upload at least one BNRS screenshot.' },
        { status: 400 },
      );
    }

    const existing = await prisma.businessVerification.findUnique({
      where: { userId: user.id },
    });

    const data = {
      businessName: businessName ?? user.name ?? 'Business verification',
      businessAddress: null,
      tin: null,
      referenceNumber: null,
      documentType: null,
      documentUrls: screenshotUrls,
      issueDate: null,
      expiryDate: null,
      qrData: null,
      extractedFields: null,
      validationFindings: null,
      score: 0,
      status: 'PENDING',
      failureReasons: null,
      processedAt: null,
    };

    const record = existing
      ? await prisma.businessVerification.update({
          where: { userId: user.id },
          data,
        })
      : await prisma.businessVerification.create({
          data: {
            userId: user.id,
            ...data,
          },
        });

    return NextResponse.json({
      message: existing ? 'BNRS screenshot updated for review.' : 'BNRS screenshot submitted for review.',
      verification: mapVerification(record),
    });
  } catch (error) {
    console.error('POST /api/users/business-verification error:', error);
    return NextResponse.json({ message: 'An internal server error occurred.' }, { status: 500 });
  }
}

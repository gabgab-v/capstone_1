import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromToken } from '@/lib/auth';
import { updateOrganizerTrustScore } from '@/lib/trustScore';

const TIN_PATTERN = /^\d{3}-\d{3}-\d{3}-\d{3}$/;

function sanitizeString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
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

function evaluateVerification({
  businessName,
  tin,
  referenceNumber,
  businessAddress,
  documentType,
  documentUrls,
  issueDate,
  expiryDate,
}) {
  const checks = [];
  const failureReasons = [];
  const scoreBreakdown = {};
  let score = 0;

  const hasDocument = documentUrls.length > 0;
  const tinValid = tin ? TIN_PATTERN.test(tin) : false;
  const hasBusinessName = Boolean(businessName);
  const hasReference = Boolean(referenceNumber);
  const hasAddress = Boolean(businessAddress);
  const hasDocType = Boolean(documentType);

  const now = new Date();
  const expiryValid = expiryDate ? expiryDate.getTime() >= now.getTime() : true;
  const issueValid = issueDate ? issueDate.getTime() <= now.getTime() + 24 * 60 * 60 * 1000 : true;

  if (hasDocument) {
    score += 8;
    scoreBreakdown.documentProvided = 8;
  } else {
    failureReasons.push('Upload at least one DTI/permit document.');
  }

  if (tinValid) {
    score += 10;
    scoreBreakdown.tinFormat = 10;
  } else {
    failureReasons.push('TIN must match ###-###-###-###.');
  }

  if (hasBusinessName) {
    score += 8;
    scoreBreakdown.businessName = 8;
  } else {
    failureReasons.push('Business name is required.');
  }

  if (hasReference) {
    score += 6;
    scoreBreakdown.referenceNumber = 6;
  } else {
    scoreBreakdown.referenceNumber = 0;
  }

  if (hasAddress) {
    score += 4;
    scoreBreakdown.address = 4;
  }

  if (hasDocType) {
    score += 2;
    scoreBreakdown.documentType = 2;
  }

  if (issueDate && issueValid) {
    score += 2;
    scoreBreakdown.issueDate = 2;
  } else if (issueDate && !issueValid) {
    failureReasons.push('Issue date cannot be in the future.');
    scoreBreakdown.issueDate = 0;
  }

  if (expiryDate && expiryValid) {
    score += 2;
    scoreBreakdown.expiryDate = 2;
  } else if (expiryDate && !expiryValid) {
    failureReasons.push('Document appears expired.');
    scoreBreakdown.expiryDate = 0;
  }

  score = Math.min(40, score);

  checks.push(
    { key: 'documentProvided', passed: hasDocument, detail: hasDocument ? 'Document uploaded' : 'Document required' },
    { key: 'tinFormat', passed: tinValid, detail: 'TIN matches ###-###-###-###' },
    { key: 'businessName', passed: hasBusinessName, detail: 'Business name present' },
    { key: 'referenceNumber', passed: hasReference, detail: hasReference ? 'Reference provided' : 'Missing reference number' },
    { key: 'address', passed: hasAddress, detail: hasAddress ? 'Address provided' : 'Address missing (optional)' },
    { key: 'documentType', passed: hasDocType, detail: hasDocType ? 'Document type selected' : 'Document type missing (optional)' },
    {
      key: 'issueDate',
      passed: issueValid,
      detail: issueDate ? (issueValid ? 'Issue date valid' : 'Issue date is in the future') : 'Issue date not provided',
    },
    {
      key: 'expiryDate',
      passed: expiryValid,
      detail: expiryDate
        ? expiryValid
          ? 'Not expired'
          : 'Document expired'
        : 'Expiry date not provided',
    },
  );

  let status = 'PROCESSING';
  if (score >= 32 && failureReasons.length === 0) {
    status = 'VERIFIED';
  } else if (score >= 16) {
    status = 'PARTIAL';
  } else {
    status = 'REJECTED';
  }

  if (failureReasons.length && status === 'PARTIAL') {
    status = 'NEEDS_RESUBMISSION';
  }

  const validationFindings = {
    checks,
    scoreBreakdown,
    computedAt: new Date().toISOString(),
  };

  return { status, score, validationFindings, failureReasons };
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
    const businessAddress = sanitizeString(payload.businessAddress);
    const tin = sanitizeString(payload.tin);
    const referenceNumber = sanitizeString(payload.referenceNumber);
    const documentType = sanitizeString(payload.documentType);
    const issueDate = parseOptionalDate(payload.issueDate);
    const expiryDate = parseOptionalDate(payload.expiryDate);
    const documentUrls = normalizeDocumentUrls(payload.documentUrls);

    if (!businessName) {
      return NextResponse.json({ message: 'Business name is required.' }, { status: 400 });
    }

    if (!documentUrls.length) {
      return NextResponse.json(
        { message: 'Upload at least one DTI certificate or business permit image.' },
        { status: 400 },
      );
    }

    const evaluation = evaluateVerification({
      businessName,
      tin,
      referenceNumber,
      businessAddress,
      documentType,
      documentUrls,
      issueDate,
      expiryDate,
    });

    const existing = await prisma.businessVerification.findUnique({
      where: { userId: user.id },
    });

    const data = {
      businessName,
      businessAddress,
      tin,
      referenceNumber,
      documentType,
      documentUrls,
      issueDate,
      expiryDate,
      qrData: payload.qrData ?? null,
      extractedFields: payload.extractedFields ?? null,
      validationFindings: evaluation.validationFindings,
      score: evaluation.score,
      status: evaluation.status,
      failureReasons: evaluation.failureReasons,
      processedAt: new Date(),
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

    const trust = await updateOrganizerTrustScore(user.id);

    return NextResponse.json({
      message: existing ? 'Business verification updated.' : 'Business verification submitted.',
      verification: mapVerification(record),
      trust,
    });
  } catch (error) {
    console.error('POST /api/users/business-verification error:', error);
    return NextResponse.json({ message: 'An internal server error occurred.' }, { status: 500 });
  }
}

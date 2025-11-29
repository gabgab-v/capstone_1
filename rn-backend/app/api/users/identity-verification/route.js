import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromToken } from '@/lib/auth';

const DEFAULT_FACE_MATCH_THRESHOLD = 0.85;

function sanitizeString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeDocumentUrls(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => sanitizeString(value))
    .filter((value) => typeof value === 'string' && value.length > 0);
}

function resolveThreshold() {
  const envValue = Number(process.env.FACE_MATCH_THRESHOLD);
  if (Number.isFinite(envValue) && envValue > 0 && envValue <= 1) {
    return envValue;
  }
  return DEFAULT_FACE_MATCH_THRESHOLD;
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

function evaluateIdentity(payload) {
  const threshold = resolveThreshold();
  const rawFaceScore = Number(payload.faceMatchScore);
  const faceMatchScore = Number.isFinite(rawFaceScore)
    ? Math.max(0, Math.min(rawFaceScore, 1))
    : 0;
  const livenessPassed = Boolean(payload.livenessPassed);
  const hasIdData = payload.idData && typeof payload.idData === 'object';
  const hasName =
    hasIdData &&
    Boolean(
      sanitizeString(
        payload.idData.fullName ??
          `${payload.idData.firstName ?? ''} ${payload.idData.lastName ?? ''}`,
      ),
    );
  const hasIdNumber = hasIdData && Boolean(sanitizeString(payload.idData.idNumber ?? payload.idData.number));
  const hasDob =
    hasIdData && Boolean(sanitizeString(payload.idData.dob ?? payload.idData.dateOfBirth));

  const checks = [];
  const failureReasons = [];

  checks.push({
    key: 'faceMatch',
    passed: faceMatchScore >= threshold,
    detail: `Face match ${faceMatchScore.toFixed(2)} vs threshold ${threshold}`,
  });
  checks.push({
    key: 'liveness',
    passed: livenessPassed,
    detail: livenessPassed ? 'Liveness passed' : 'Liveness failed',
  });

  if (!hasName) {
    failureReasons.push('ID name could not be read.');
  }
  if (!hasIdNumber) {
    failureReasons.push('ID number was missing from the scan.');
  }
  if (!hasDob) {
    failureReasons.push('Birthdate was missing from the scan.');
  }

  const score = Math.round(faceMatchScore * 30);

  let status = 'PROCESSING';
  if (livenessPassed && faceMatchScore >= threshold) {
    status = 'VERIFIED';
  } else {
    status = 'FAILED';
  }

  if (failureReasons.length && status === 'VERIFIED') {
    status = 'NEEDS_RESUBMISSION';
  }

  const validationFindings = {
    computedAt: new Date().toISOString(),
    threshold,
    faceMatchScore,
    livenessPassed,
    checks,
  };

  return { status, score, failureReasons, validationFindings, faceMatchScore, livenessPassed };
}

export async function GET(request) {
  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
    }

    const verification = await prisma.identityVerification.findUnique({
      where: { userId: user.id },
    });

    return NextResponse.json({ verification: mapVerification(verification) });
  } catch (error) {
    console.error('GET /api/users/identity-verification error:', error);
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

    const documentUrls = normalizeDocumentUrls(payload.documentUrls);
    const selfieUrl = sanitizeString(payload.selfieUrl);
    const extractedFields = payload.idData && typeof payload.idData === 'object' ? payload.idData : null;

    const evaluation = evaluateIdentity({
      ...payload,
      documentUrls,
      idData: extractedFields,
    });

    const data = {
      status: evaluation.status,
      score: evaluation.score,
      faceMatchScore: evaluation.faceMatchScore,
      livenessPassed: evaluation.livenessPassed,
      extractedFields,
      validationFindings: evaluation.validationFindings,
      failureReasons: evaluation.failureReasons,
      documentUrls,
      selfieUrl,
      processedAt: new Date(),
    };

    const record = await prisma.identityVerification.upsert({
      where: { userId: user.id },
      update: data,
      create: { userId: user.id, ...data },
    });

    return NextResponse.json({
      message: 'Identity verification saved.',
      verification: mapVerification(record),
    });
  } catch (error) {
    console.error('POST /api/users/identity-verification error:', error);
    return NextResponse.json({ message: 'An internal server error occurred.' }, { status: 500 });
  }
}

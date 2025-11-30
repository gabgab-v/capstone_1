import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromToken } from '@/lib/auth';
import { updateOrganizerTrustScore } from '@/lib/trustScore';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { spawn } from 'child_process';

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

async function writeTempBase64(base64String, label = 'image') {
  if (!base64String || typeof base64String !== 'string') {
    return null;
  }
  const buffer = Buffer.from(base64String, 'base64');
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ekyc-'));
  const filePath = path.join(tempDir, `${label}-${crypto.randomUUID()}.jpg`);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

async function runDeepface(idPath, selfiePath) {
  if (!idPath || !selfiePath) {
    return { score: null, ocr: null };
  }

  const scriptPath = path.join(process.cwd(), 'python', 'verify_identity.py');
  const hasScript = await fs
    .access(scriptPath)
    .then(() => true)
    .catch(() => false);
  if (!hasScript) {
    return { score: null, ocr: null };
  }

  return new Promise((resolve) => {
    const proc = spawn('python3', [scriptPath, '--id', idPath, '--selfie', selfiePath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('close', () => {
      try {
        const parsed = JSON.parse(stdout);
        resolve({ score: parsed?.face_match_score ?? null, ocr: parsed?.ocr ?? null, raw: parsed });
      } catch (err) {
        console.error('DeepFace parsing error:', err, stderr);
        resolve({ score: null, ocr: null, error: stderr || err?.message });
      }
    });
  });
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
    const idImageBase64 = sanitizeString(payload.idImageBase64);
    const selfieImageBase64 = sanitizeString(payload.selfieImageBase64);
    const extractedFields = payload.idData && typeof payload.idData === 'object' ? payload.idData : null;

    let faceMatchScore = payload.faceMatchScore ?? null;
    let livenessPassed = payload.livenessPassed ?? null;
    let deepfaceError = null;

    // If no score provided but images exist, attempt DeepFace (ArcFace) via Python helper
    if ((faceMatchScore === null || faceMatchScore === undefined) && (idImageBase64 || selfieImageBase64)) {
      try {
        const idPath = await writeTempBase64(idImageBase64, 'id');
        const selfiePath = await writeTempBase64(selfieImageBase64, 'selfie');
        const deepfaceResult = await runDeepface(idPath, selfiePath);
        if (Number.isFinite(deepfaceResult.score)) {
          faceMatchScore = Math.max(0, Math.min(1, Number(deepfaceResult.score)));
        }
        if (deepfaceResult.error) {
          deepfaceError = deepfaceResult.error;
        }
      } catch (err) {
        console.error('DeepFace invocation failed:', err);
        deepfaceError = err?.message || 'DeepFace failed';
      }
    }

    const evaluation = evaluateIdentity({
      ...payload,
      faceMatchScore,
      livenessPassed,
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
      deepfaceError,
    };

    const record = await prisma.identityVerification.upsert({
      where: { userId: user.id },
      update: data,
      create: { userId: user.id, ...data },
    });

    const trust = await updateOrganizerTrustScore(user.id);

    return NextResponse.json({
      message: 'Identity verification saved.',
      verification: mapVerification(record),
      trust,
    });
  } catch (error) {
    console.error('POST /api/users/identity-verification error:', error);
    return NextResponse.json({ message: 'An internal server error occurred.' }, { status: 500 });
  }
}

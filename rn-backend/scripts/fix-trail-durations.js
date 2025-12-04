/* eslint-disable no-console */
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineDistanceMeters(a, b) {
  const R = 6371000;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

function computeDistance(points) {
  if (!points || points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    if (!prev || !curr) continue;
    const segment = haversineDistanceMeters(prev, curr);
    if (Number.isFinite(segment)) {
      total += segment;
    }
  }
  return total;
}

function backfillTimestamps(points, durationMs) {
  if (!points || points.length === 0) return [];
  const hasAny = points.some((p) => p.at);
  if (hasAny) return points;

  const interval = durationMs / Math.max(1, points.length - 1);
  const start = Date.now() - durationMs;
  return points.map((p, idx) => ({
    ...p,
    at: new Date(start + idx * interval).toISOString(),
  }));
}

async function main() {
  const targets = ['lakeholon', 'lake holon', 'mount dinor', 'mt dinor', 'mount loay', 'mt loay', 'mount loay trail'];
  const rows = await prisma.trail.findMany({
    where: {
      OR: [
        { label: { contains: 'loay', mode: 'insensitive' } },
        { label: { contains: 'dinor', mode: 'insensitive' } },
        { label: { contains: 'holon', mode: 'insensitive' } },
      ],
    },
  });

  if (!rows.length) {
    console.log('No matching trails found for backfill.');
    return;
  }

  for (const trail of rows) {
    const samples = Array.isArray(trail.samples) ? trail.samples : [];
    const distance = trail.totalDistanceMeters || computeDistance(samples);
    const hasDuration = trail.endedAt && trail.startedAt && new Date(trail.endedAt) > new Date(trail.startedAt);
    const hasTimes = samples.some((p) => p?.at);

    if (hasDuration && hasTimes) {
      console.log(`Skipping "${trail.label}" (already has duration).`);
      continue;
    }

    const estimatedDurationMs = Math.max(10 * 60 * 1000, (distance / 0.556) * 1000); // 2 km/h heuristic
    const startedAt = trail.startedAt ? new Date(trail.startedAt) : new Date(Date.now() - estimatedDurationMs);
    const endedAt = new Date(startedAt.getTime() + estimatedDurationMs);
    const patchedSamples = hasTimes ? samples : backfillTimestamps(samples, estimatedDurationMs);

    await prisma.trail.update({
      where: { id: trail.id },
      data: {
        totalDistanceMeters: distance,
        startedAt,
        endedAt,
        samples: patchedSamples,
      },
    });

    console.log(
      `Updated "${trail.label}" -> duration ${(estimatedDurationMs / 3600000).toFixed(
        2,
      )} hrs, distance ${(distance / 1000).toFixed(2)} km`,
    );
  }
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

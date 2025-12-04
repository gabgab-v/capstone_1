/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const process = require('process');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

const GPX_DIR = path.join(__dirname, '..', 'gpx-imports');

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineDistanceMeters(a, b) {
  const R = 6371000; // mean Earth radius in meters
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

function parseGpx(content) {
  const nameMatch = content.match(/<name><!\[CDATA\[(.*?)\]\]><\/name>|<name>([^<]+)<\/name>/i);
  const label = nameMatch ? (nameMatch[1] || nameMatch[2]).trim() : null;

  const points = [];
  const trkptRegex = /<trkpt[^>]*?lat="([^"]+)"[^>]*?lon="([^"]+)"[^>]*?>([\s\S]*?)<\/trkpt>/gi;
  let match;

  while ((match = trkptRegex.exec(content)) !== null) {
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const inner = match[3] || '';
    const eleMatch = inner.match(/<ele>([^<]+)<\/ele>/i);
    const timeMatch = inner.match(/<time>([^<]+)<\/time>/i);

    points.push({
      lat,
      lng,
      ele: eleMatch ? Number(eleMatch[1]) : null,
      at: timeMatch ? new Date(timeMatch[1]).toISOString() : null,
    });
  }

  return { label, points };
}

function applySyntheticTimestamps(points) {
  const hasAnyTimestamps = points.some((p) => p.at);
  if (hasAnyTimestamps) {
    return points;
  }

  // Assume a conservative hiking speed of 2 km/h (~0.556 m/s)
  const totalDistance = computeDistance(points);
  const durationMs = Math.max(10 * 60 * 1000, (totalDistance / 0.556) * 1000);
  const interval = durationMs / Math.max(1, points.length - 1);
  const start = Date.now() - durationMs;

  return points.map((p, idx) => ({
    ...p,
    at: new Date(start + idx * interval).toISOString(),
  }));
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

async function ensureOwner(email) {
  if (!email) {
    throw new Error('Provide an owner email via GPX_OWNER_EMAIL env or --email argument.');
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error(`No user found with email ${email}. Create the account first (e.g., admin101@example.com).`);
  }
  return user;
}

async function importFile(filePath, ownerId) {
  const content = fs.readFileSync(filePath, 'utf8');
  const { label: rawLabel, points: rawPoints } = parseGpx(content);
  const points = applySyntheticTimestamps(rawPoints);

  if (!points.length) {
    console.warn(`Skipping ${path.basename(filePath)}: no track points found.`);
    return null;
  }

  const label = rawLabel || path.basename(filePath, path.extname(filePath));
  const startedAt = points.find((p) => p.at)?.at ? new Date(points.find((p) => p.at).at) : new Date();
  const endedAt = [...points].reverse().find((p) => p.at)?.at
    ? new Date([...points].reverse().find((p) => p.at).at)
    : startedAt;
  const totalDistanceMeters = computeDistance(points);

  const existing = await prisma.trail.findFirst({
    where: { userId: ownerId, label },
  });
  if (existing) {
    console.log(`Trail "${label}" already exists for user; skipping.`);
    return existing;
  }

  const trail = await prisma.trail.create({
    data: {
      userId: ownerId,
      label,
      startedAt,
      endedAt,
      totalDistanceMeters,
      geoJson: {
        type: 'LineString',
        coordinates: points.map((p) => [p.lng, p.lat]),
      },
      samples: points.map((p) => ({
        lat: p.lat,
        lng: p.lng,
        at: p.at,
        elevation: p.ele,
      })),
    },
  });

  console.log(`Imported "${label}" (${points.length} points, ${(totalDistanceMeters / 1000).toFixed(2)} km).`);
  return trail;
}

async function main() {
  const emailArg = process.argv.find((arg) => arg.startsWith('--email='))?.split('=')[1];
  const ownerEmail = emailArg || process.env.GPX_OWNER_EMAIL;
  const owner = await ensureOwner(ownerEmail);

  if (!fs.existsSync(GPX_DIR)) {
    fs.mkdirSync(GPX_DIR, { recursive: true });
    console.log(`Created GPX folder at ${GPX_DIR}. Add .gpx files and rerun this script.`);
    return;
  }

  const files = fs.readdirSync(GPX_DIR).filter((file) => file.toLowerCase().endsWith('.gpx'));
  if (files.length === 0) {
    console.log(`No .gpx files found in ${GPX_DIR}. Add files and rerun.`);
    return;
  }

  for (const file of files) {
    const fullPath = path.join(GPX_DIR, file);
    await importFile(fullPath, owner.id);
  }
}

main()
  .catch((err) => {
    console.error('GPX import failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

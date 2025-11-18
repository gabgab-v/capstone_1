import { post } from '../lib/api';

function normalizeLabel(trail) {
  if (!trail) {
    return null;
  }
  const raw = typeof trail.label === 'string' ? trail.label.trim() : '';
  return raw.length ? raw : null;
}

export function formatTrailDistance(distanceMeters) {
  const value = Number(distanceMeters);
  if (!Number.isFinite(value) || value <= 0) {
    return '0.00 km';
  }
  return `${(value / 1000).toFixed(2)} km`;
}

export function computeTrailDurationMs(startedAt, endedAt) {
  if (!startedAt) {
    return 0;
  }
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 0;
  }
  return end - start;
}

export function formatTrailDuration(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return '00:00:00';
  }

  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, '0');
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

export function formatTrailAverageSpeed(distanceMeters, durationMs) {
  const distanceValue = Number(distanceMeters);
  if (!Number.isFinite(distanceValue) || !Number.isFinite(durationMs) || durationMs <= 0) {
    return '0.0 km/h';
  }
  const hours = durationMs / 3600000;
  if (hours <= 0) {
    return '0.0 km/h';
  }
  const speed = distanceValue / 1000 / hours;
  return `${speed.toFixed(1)} km/h`;
}

export function buildTrailShareMessage(trail, { includeAppMention = true } = {}) {
  const label = normalizeLabel(trail);
  const labelPart = label ? `"${label}"` : 'a new trail';
  const durationMs = computeTrailDurationMs(trail?.startedAt, trail?.endedAt);
  const distanceLabel = formatTrailDistance(trail?.totalDistanceMeters);
  const durationLabel = formatTrailDuration(durationMs);
  const speedLabel = formatTrailAverageSpeed(trail?.totalDistanceMeters, durationMs);

  const intro = `I just recorded ${labelPart}`;
  const stats = `${distanceLabel} in ${durationLabel} (${speedLabel}).`;
  const suffix = includeAppMention ? ' Recorded with the Pabukid Trail Recorder.' : '';
  return `${intro} - ${stats}${suffix}`.trim();
}

export function buildTrailPostContent(trail) {
  const shareMessage = buildTrailShareMessage(trail, { includeAppMention: true });
  return `${shareMessage} #PabukidTrail`;
}

export async function publishTrailRecordingPost(trail) {
  if (!trail) {
    throw new Error('Trail details are required to share a post.');
  }
  const content = buildTrailPostContent(trail);
  return post('/api/posts', {
    content,
    imageUrls: [],
  });
}

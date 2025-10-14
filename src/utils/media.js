import { BASE_URL } from '../lib/api';

const ABSOLUTE_URL_PATTERN = /^(?:https?:)?\/\//i;

/**
 * Resolves an image URL that may be stored as a relative path returned by the backend.
 * Ensures RN Image receives a fully-qualified URI.
 */
export function resolveImageUrl(rawUrl) {
  if (typeof rawUrl !== 'string') {
    return null;
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('data:')) {
    return trimmed;
  }

  if (ABSOLUTE_URL_PATTERN.test(trimmed)) {
    if (trimmed.startsWith('//')) {
      return `https:${trimmed}`;
    }
    return trimmed;
  }

  const base = BASE_URL.replace(/\/+$/, '');
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${base}${path}`;
}

export function ensureAvatarUri(rawUrl, fallbackSeed = 'user') {
  const resolved = resolveImageUrl(rawUrl);
  if (resolved) {
    return resolved;
  }
  return `https://i.pravatar.cc/150?u=${encodeURIComponent(fallbackSeed)}`;
}

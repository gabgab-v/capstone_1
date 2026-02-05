import * as FileSystem from 'expo-file-system';

const CACHE_FOLDER_NAME = 'offline-cache';
const DOCUMENT_DIRECTORY = FileSystem.documentDirectory || null;
const CACHE_DIRECTORY = DOCUMENT_DIRECTORY ? `${DOCUMENT_DIRECTORY}${CACHE_FOLDER_NAME}/` : null;

const memoryCache = new Map();

function normalizeKey(key) {
  if (typeof key === 'string') {
    return key.trim();
  }
  if (key === null || key === undefined) {
    return '';
  }
  return String(key).trim();
}

function hashKey(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

function sanitizeKey(key) {
  const normalized = normalizeKey(key);
  if (!normalized) {
    return 'cache';
  }
  return normalized.replace(/[^a-z0-9-_]/gi, '_').slice(0, 48) || 'cache';
}

async function ensureCacheDirectory() {
  if (!CACHE_DIRECTORY) {
    return;
  }
  try {
    const info = await FileSystem.getInfoAsync(CACHE_DIRECTORY);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(CACHE_DIRECTORY, { intermediates: true });
    }
  } catch (error) {
    console.warn('Failed to ensure offline cache directory:', error?.message || error);
  }
}

function buildCachePath(key) {
  const safeKey = sanitizeKey(key);
  const hash = hashKey(normalizeKey(key));
  return `${CACHE_DIRECTORY}${safeKey}-${hash}.json`;
}

function readMemoryCache(key, maxAgeMs) {
  const record = memoryCache.get(key);
  if (!record || typeof record !== 'object') {
    return null;
  }
  if (maxAgeMs && record.updatedAt) {
    const timestamp = Date.parse(record.updatedAt);
    if (Number.isFinite(timestamp) && Date.now() - timestamp > maxAgeMs) {
      return null;
    }
  }
  return record;
}

function normalizeRecord(record, maxAgeMs) {
  if (!record || typeof record !== 'object') {
    return null;
  }
  const updatedAt = typeof record.updatedAt === 'string' ? record.updatedAt : null;
  if (maxAgeMs && updatedAt) {
    const timestamp = Date.parse(updatedAt);
    if (Number.isFinite(timestamp) && Date.now() - timestamp > maxAgeMs) {
      return null;
    }
  }
  return record;
}

export async function getCachedValue(key, { maxAgeMs } = {}) {
  const normalizedKey = normalizeKey(key);
  if (!normalizedKey) {
    return null;
  }

  if (!CACHE_DIRECTORY) {
    return readMemoryCache(normalizedKey, maxAgeMs);
  }

  await ensureCacheDirectory();
  const path = buildCachePath(normalizedKey);

  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) {
      return null;
    }
    const contents = await FileSystem.readAsStringAsync(path, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    if (!contents) {
      return null;
    }
    const parsed = JSON.parse(contents);
    return normalizeRecord(parsed, maxAgeMs);
  } catch (error) {
    console.warn('Failed to read offline cache:', error?.message || error);
    return null;
  }
}

export async function setCachedValue(key, data) {
  const normalizedKey = normalizeKey(key);
  if (!normalizedKey) {
    return null;
  }

  const payload = { updatedAt: new Date().toISOString(), data };

  if (!CACHE_DIRECTORY) {
    memoryCache.set(normalizedKey, payload);
    return payload;
  }

  await ensureCacheDirectory();
  const path = buildCachePath(normalizedKey);

  try {
    await FileSystem.writeAsStringAsync(path, JSON.stringify(payload), {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return payload;
  } catch (error) {
    console.warn('Failed to write offline cache:', error?.message || error);
    throw error;
  }
}

export async function clearCachedValue(key) {
  const normalizedKey = normalizeKey(key);
  if (!normalizedKey) {
    return;
  }

  memoryCache.delete(normalizedKey);

  if (!CACHE_DIRECTORY) {
    return;
  }

  const path = buildCachePath(normalizedKey);
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) {
      await FileSystem.deleteAsync(path, { idempotent: true });
    }
  } catch (error) {
    console.warn('Failed to clear offline cache:', error?.message || error);
  }
}

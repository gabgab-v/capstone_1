import * as FileSystem from 'expo-file-system';

const PENDING_STORAGE_FILE = 'pending-trails.json';
const ACTIVE_STORAGE_FILE = 'active-trail.json';

const DOCUMENT_DIRECTORY = FileSystem.documentDirectory || null;

const PENDING_STORAGE_PATH = DOCUMENT_DIRECTORY ? `${DOCUMENT_DIRECTORY}${PENDING_STORAGE_FILE}` : null;
const ACTIVE_STORAGE_PATH = DOCUMENT_DIRECTORY ? `${DOCUMENT_DIRECTORY}${ACTIVE_STORAGE_FILE}` : null;

let pendingMemoryFallback = [];
let activeMemoryFallback = null;

async function ensureStorageFile(path, defaultContents) {
  if (!path) {
    return;
  }
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) {
      await FileSystem.writeAsStringAsync(path, defaultContents, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    }
  } catch (error) {
    console.error('Failed to ensure offline trail storage file:', error);
  }
}

export async function getStoredPendingTrails() {
  if (!PENDING_STORAGE_PATH) {
    return [...pendingMemoryFallback];
  }
  try {
    await ensureStorageFile(PENDING_STORAGE_PATH, '[]');
    const contents = await FileSystem.readAsStringAsync(PENDING_STORAGE_PATH, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const parsed = JSON.parse(contents);
    if (!Array.isArray(parsed)) {
      throw new Error('Invalid pending trail payload');
    }
    return parsed;
  } catch (error) {
    console.error('Failed to read pending trails from storage:', error);
    return [];
  }
}

export async function setStoredPendingTrails(nextList) {
  if (!Array.isArray(nextList)) {
    throw new Error('Pending trails payload must be an array.');
  }
  if (!PENDING_STORAGE_PATH) {
    pendingMemoryFallback = [...nextList];
    return;
  }
  try {
    await ensureStorageFile(PENDING_STORAGE_PATH, '[]');
    await FileSystem.writeAsStringAsync(PENDING_STORAGE_PATH, JSON.stringify(nextList), {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch (error) {
    console.error('Failed to write pending trails to storage:', error);
    throw error;
  }
}

export async function appendPendingTrail(entry) {
  const current = await getStoredPendingTrails();
  current.push(entry);
  await setStoredPendingTrails(current);
  return entry;
}

export async function removePendingTrail(id) {
  if (!id) {
    return [];
  }
  const current = await getStoredPendingTrails();
  const filtered = current.filter((item) => item.id !== id);
  await setStoredPendingTrails(filtered);
  return filtered;
}

export async function getActiveRecordingState() {
  if (!ACTIVE_STORAGE_PATH) {
    return activeMemoryFallback ? { ...activeMemoryFallback } : null;
  }
  try {
    const info = await FileSystem.getInfoAsync(ACTIVE_STORAGE_PATH);
    if (!info.exists) {
      return null;
    }
    const contents = await FileSystem.readAsStringAsync(ACTIVE_STORAGE_PATH, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    if (!contents) {
      return null;
    }
    return JSON.parse(contents);
  } catch (error) {
    console.error('Failed to read active recording state:', error);
    return null;
  }
}

export async function setActiveRecordingState(state) {
  if (!state) {
    return clearActiveRecordingState();
  }
  if (!ACTIVE_STORAGE_PATH) {
    activeMemoryFallback = { ...state };
    return;
  }
  try {
    await FileSystem.writeAsStringAsync(ACTIVE_STORAGE_PATH, JSON.stringify(state), {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch (error) {
    console.error('Failed to persist active recording state:', error);
    throw error;
  }
}

export async function clearActiveRecordingState() {
  if (!ACTIVE_STORAGE_PATH) {
    activeMemoryFallback = null;
    return;
  }
  try {
    const info = await FileSystem.getInfoAsync(ACTIVE_STORAGE_PATH);
    if (info.exists) {
      await FileSystem.deleteAsync(ACTIVE_STORAGE_PATH, { idempotent: true });
    }
  } catch (error) {
    console.error('Failed to clear active recording state:', error);
  }
  activeMemoryFallback = null;
}

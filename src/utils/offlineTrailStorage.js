import * as FileSystem from 'expo-file-system';

const STORAGE_FILE = 'pending-trails.json';
const STORAGE_PATH = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}${STORAGE_FILE}`
  : null;

let memoryFallback = [];

async function ensureStorageFile() {
  if (!STORAGE_PATH) {
    return;
  }
  try {
    const info = await FileSystem.getInfoAsync(STORAGE_PATH);
    if (!info.exists) {
      await FileSystem.writeAsStringAsync(STORAGE_PATH, '[]', {
        encoding: FileSystem.EncodingType.UTF8,
      });
    }
  } catch (error) {
    console.error('Failed to ensure offline trail storage file:', error);
  }
}

export async function getStoredPendingTrails() {
  if (!STORAGE_PATH) {
    return [...memoryFallback];
  }
  try {
    await ensureStorageFile();
    const contents = await FileSystem.readAsStringAsync(STORAGE_PATH, {
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
  if (!STORAGE_PATH) {
    memoryFallback = [...nextList];
    return;
  }
  try {
    await ensureStorageFile();
    await FileSystem.writeAsStringAsync(STORAGE_PATH, JSON.stringify(nextList), {
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

import * as FileSystem from 'expo-file-system';

const PROFILE_STORAGE_FILE = 'cached-user-profile.json';

const DOCUMENT_DIRECTORY = FileSystem.documentDirectory || null;

const PROFILE_STORAGE_PATH = DOCUMENT_DIRECTORY ? `${DOCUMENT_DIRECTORY}${PROFILE_STORAGE_FILE}` : null;

let profileMemoryFallback = null;

function sanitizeProfile(profile) {
  if (!profile || typeof profile !== 'object') {
    return null;
  }
  return profile;
}

export async function getStoredUserProfile(expectedUserId) {
  const matchesUser = (profile) => {
    if (!profile) {
      return null;
    }
    if (expectedUserId && profile.id !== expectedUserId) {
      return null;
    }
    return profile;
  };

  if (!PROFILE_STORAGE_PATH) {
    return matchesUser(profileMemoryFallback ? { ...profileMemoryFallback } : null);
  }

  try {
    const info = await FileSystem.getInfoAsync(PROFILE_STORAGE_PATH);
    if (!info.exists) {
      return null;
    }
    const contents = await FileSystem.readAsStringAsync(PROFILE_STORAGE_PATH, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    if (!contents) {
      return null;
    }
    const parsed = sanitizeProfile(JSON.parse(contents));
    return matchesUser(parsed);
  } catch (error) {
    console.warn('Failed to read cached user profile:', error?.message || error);
    return null;
  }
}

export async function setStoredUserProfile(profile) {
  const sanitized = sanitizeProfile(profile);
  if (!sanitized) {
    await clearStoredUserProfile();
    return;
  }
  if (!PROFILE_STORAGE_PATH) {
    profileMemoryFallback = { ...sanitized };
    return;
  }
  try {
    await FileSystem.writeAsStringAsync(PROFILE_STORAGE_PATH, JSON.stringify(sanitized), {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch (error) {
    console.warn('Failed to cache user profile:', error?.message || error);
    throw error;
  }
}

export async function clearStoredUserProfile() {
  profileMemoryFallback = null;
  if (!PROFILE_STORAGE_PATH) {
    return;
  }
  try {
    const info = await FileSystem.getInfoAsync(PROFILE_STORAGE_PATH);
    if (info.exists) {
      await FileSystem.deleteAsync(PROFILE_STORAGE_PATH, { idempotent: true });
    }
  } catch (error) {
    console.warn('Failed to clear cached user profile:', error?.message || error);
  }
}

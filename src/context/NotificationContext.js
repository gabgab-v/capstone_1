import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';

const {
  module: Notifications,
  isAvailable: isNotificationsModuleAvailable,
  unavailablePermissionsState,
} = loadNotificationsModule();

const QUEUE_STORAGE_KEY = 'notification-queue';
const LOGOUT_STORAGE_KEY = 'notification-last-logout';
const QUEUE_MAX_ENTRIES = 120;

function resolveIosStatuses() {
  const constants = Notifications?.IosAuthorizationStatus;
  if (!constants) {
    return new Set();
  }
  return new Set([
    constants.AUTHORIZED,
    constants.PROVISIONAL,
    constants.EPHEMERAL,
  ]);
}

function isPermissionGranted(settings) {
  if (!settings || typeof settings !== 'object') {
    return false;
  }

  if (settings.granted === true || settings.status === 'granted') {
    return true;
  }

  const iosStatus = settings?.ios?.status;
  if (typeof iosStatus === 'string') {
    return ['authorized', 'provisional', 'ephemeral'].includes(iosStatus);
  }

  if (typeof iosStatus === 'number') {
    const validStatuses = resolveIosStatuses();
    return validStatuses.has(iosStatus);
  }

  return false;
}

const NotificationContext = createContext({
  notificationsEnabled: false,
  permissions: null,
  isDeviceSupported: false,
  isNativeModuleAvailable: false,
  isPhysicalDevice: false,
  requestPermission: async () => false,
  scheduleNotification: async () => null,
  flushQueuedNotifications: async () => [],
  recordLogout: async () => null,
  setActiveUserId: () => {},
  refreshPermissions: async () => null,
});

export function NotificationProvider({ children }) {
  const [permissions, setPermissions] = useState(
    isNotificationsModuleAvailable ? null : unavailablePermissionsState,
  );
  const [activeUserId, setActiveUserId] = useState(null);
  const isPhysicalDevice = Device.isDevice;
  const isDeviceSupported = isPhysicalDevice && isNotificationsModuleAvailable;
  const hasInitialisedHandler = useRef(false);

  const refreshPermissions = useCallback(async () => {
    if (!isNotificationsModuleAvailable) {
      setPermissions(unavailablePermissionsState);
      return unavailablePermissionsState;
    }

    try {
      const status = await Notifications.getPermissionsAsync();
      setPermissions(status);
      return status;
    } catch (error) {
      console.warn('Failed to get notification permissions:', error);
      return null;
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!isDeviceSupported) {
      return false;
    }

    try {
      const existing = await Notifications.getPermissionsAsync();
      if (isPermissionGranted(existing)) {
        setPermissions(existing);
        return true;
      }

      const requested = await Notifications.requestPermissionsAsync();
      setPermissions(requested);
      return isPermissionGranted(requested);
    } catch (error) {
      console.warn('Notification permission request failed:', error);
      return false;
    }
  }, [isDeviceSupported]);

  const scheduleNotificationInternal = useCallback(
    async ({ title, body, data, tag, trigger } = {}) => {
      if (!isDeviceSupported) {
        return null;
      }

      const permitted = isPermissionGranted(permissions);
      if (!permitted) {
        const granted = await requestPermission();
        if (!granted) {
          return null;
        }
      }

      try {
        return await Notifications.scheduleNotificationAsync({
          content: {
            title,
            body,
            data,
            sound: 'default',
            priority: Notifications.AndroidNotificationPriority?.HIGH ?? undefined,
            channelId: Platform.OS === 'android' ? 'default' : undefined,
            tag,
          },
          trigger: trigger ?? null,
        });
      } catch (error) {
        console.warn('Failed to schedule notification:', error);
        return null;
      }
    },
    [isDeviceSupported, permissions, requestPermission],
  );

  const scheduleNotification = useCallback(
    async ({ skipQueue, ...payload } = {}) => {
      const scheduledId = await scheduleNotificationInternal(payload);
      if (!skipQueue) {
        await enqueueNotificationEntry({
          ...payload,
          scheduledId,
          userId: activeUserId,
        });
      }
      return scheduledId;
    },
    [activeUserId, scheduleNotificationInternal],
  );

  const recordLogout = useCallback(async () => {
    await saveLastLogoutAt(new Date());
  }, []);

  const flushQueuedNotifications = useCallback(
    async ({ userId } = {}) => {
      if (!isDeviceSupported) {
        return [];
      }
      const queue = await loadNotificationQueue();
      if (!queue.length) {
        return [];
      }

      const logoutAt = await loadLastLogoutAt();
      const since = logoutAt ? parseIsoDate(logoutAt) : null;
      const now = new Date();
      const dueNotifications = queue.filter((entry) => {
        if (entry?.deliveredAt) {
          return false;
        }
        if (userId && entry?.userId && entry.userId !== userId) {
          return false;
        }
        const deliverAt = parseIsoDate(entry?.deliverAt);
        if (!deliverAt) {
          return false;
        }
        if (since && deliverAt < since) {
          return false;
        }
        return deliverAt <= now;
      });

      if (!dueNotifications.length) {
        return [];
      }

      await Promise.all(
        dueNotifications.map((entry) =>
          scheduleNotificationInternal({
            title: entry.title,
            body: entry.body,
            data: entry.data,
            tag: entry.tag,
            trigger: null,
          }),
        ),
      );

      const deliveredAt = now.toISOString();
      const updatedQueue = queue.map((entry) => {
        if (!entry?.id) {
          return entry;
        }
        const isDue = dueNotifications.some((candidate) => candidate.id === entry.id);
        return isDue ? { ...entry, deliveredAt } : entry;
      });

      await saveNotificationQueue(updatedQueue);
      return dueNotifications;
    },
    [isDeviceSupported, scheduleNotificationInternal],
  );

  useEffect(() => {
    if (!isDeviceSupported) {
      return;
    }

    refreshPermissions();
  }, [isDeviceSupported, refreshPermissions]);

  useEffect(() => {
    if (!isNotificationsModuleAvailable) {
      return;
    }

    if (hasInitialisedHandler.current) {
      return;
    }
    hasInitialisedHandler.current = true;

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  }, []);

  useEffect(() => {
    if (!isNotificationsModuleAvailable) {
      return;
    }

    if (Platform.OS !== 'android') {
      return;
    }

    Notifications.setNotificationChannelAsync('default', {
      name: 'Important updates',
      importance: Notifications.AndroidImportance?.MAX ?? 5,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility?.PUBLIC ?? 1,
    }).catch((error) => {
      console.warn('Failed to configure Android notification channel:', error);
    });
  }, []);

  const contextValue = useMemo(
    () => ({
      notificationsEnabled: isPermissionGranted(permissions),
      permissions,
      isDeviceSupported,
      isNativeModuleAvailable: isNotificationsModuleAvailable,
      isPhysicalDevice,
      requestPermission,
      scheduleNotification,
      flushQueuedNotifications,
      recordLogout,
      setActiveUserId,
      refreshPermissions,
    }),
    [
      isDeviceSupported,
      isNotificationsModuleAvailable,
      isPhysicalDevice,
      permissions,
      requestPermission,
      scheduleNotification,
      flushQueuedNotifications,
      recordLogout,
      setActiveUserId,
      refreshPermissions,
    ],
  );

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}

function loadNotificationsModule() {
  const unavailablePermissions = Object.freeze({
    granted: false,
    status: 'unavailable',
    canAskAgain: false,
  });

  try {
    const module = require('expo-notifications');
    return {
      module,
      isAvailable: true,
      unavailablePermissionsState: unavailablePermissions,
    };
  } catch (error) {
    if (typeof __DEV__ === 'boolean' && __DEV__) {
      console.warn(
        'expo-notifications native module is unavailable; push notifications are disabled for this build.',
        error,
      );
    }

    return {
      module: createUnavailableNotificationsModule(unavailablePermissions),
      isAvailable: false,
      unavailablePermissionsState: unavailablePermissions,
    };
  }
}

function createUnavailableNotificationsModule(fallbackPermissions) {
  const resolvePermissions = async () => fallbackPermissions;

  return {
    getPermissionsAsync: resolvePermissions,
    requestPermissionsAsync: resolvePermissions,
    scheduleNotificationAsync: async () => null,
    setNotificationHandler: () => {},
    setNotificationChannelAsync: async () => {},
    AndroidNotificationPriority: {},
    AndroidImportance: {},
    AndroidNotificationVisibility: {},
  };
}

function parseIsoDate(value) {
  if (!value) {
    return null;
  }
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function resolveTriggerDate(trigger) {
  if (!trigger) {
    return null;
  }
  if (trigger instanceof Date) {
    return trigger;
  }
  if (typeof trigger === 'string' || typeof trigger === 'number') {
    return parseIsoDate(trigger);
  }
  if (typeof trigger === 'object' && trigger?.date) {
    return resolveTriggerDate(trigger.date);
  }
  return null;
}

function createQueueId() {
  return `queue-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function loadNotificationQueue() {
  try {
    const stored = await SecureStore.getItemAsync(QUEUE_STORAGE_KEY);
    if (!stored) {
      return [];
    }
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Failed to load notification queue:', error);
    return [];
  }
}

async function saveNotificationQueue(queue) {
  try {
    await SecureStore.setItemAsync(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.warn('Failed to save notification queue:', error);
  }
}

async function loadLastLogoutAt() {
  try {
    return await SecureStore.getItemAsync(LOGOUT_STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to load last logout timestamp:', error);
    return null;
  }
}

async function saveLastLogoutAt(date) {
  const value = parseIsoDate(date);
  if (!value) {
    return;
  }
  try {
    await SecureStore.setItemAsync(LOGOUT_STORAGE_KEY, value.toISOString());
  } catch (error) {
    console.warn('Failed to save last logout timestamp:', error);
  }
}

async function enqueueNotificationEntry({ title, body, data, tag, trigger, scheduledId, userId }) {
  const now = new Date();
  const deliverAt = resolveTriggerDate(trigger) ?? now;
  const entry = {
    id: scheduledId || createQueueId(),
    userId: userId ?? null,
    title: title ?? '',
    body: body ?? '',
    data: data ?? null,
    tag: tag ?? null,
    createdAt: now.toISOString(),
    deliverAt: deliverAt.toISOString(),
    deliveredAt: null,
  };

  const queue = await loadNotificationQueue();
  const nextQueue = [...queue, entry];
  const trimmedQueue =
    nextQueue.length > QUEUE_MAX_ENTRIES
      ? nextQueue.slice(nextQueue.length - QUEUE_MAX_ENTRIES)
      : nextQueue;
  await saveNotificationQueue(trimmedQueue);
}

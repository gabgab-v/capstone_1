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
import * as Notifications from 'expo-notifications';

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
  requestPermission: async () => false,
  scheduleNotification: async () => null,
  refreshPermissions: async () => null,
});

export function NotificationProvider({ children }) {
  const [permissions, setPermissions] = useState(null);
  const isDeviceSupported = Device.isDevice;
  const hasInitialisedHandler = useRef(false);

  const refreshPermissions = useCallback(async () => {
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

  const scheduleNotification = useCallback(
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

  useEffect(() => {
    if (!isDeviceSupported) {
      return;
    }

    refreshPermissions();
  }, [isDeviceSupported, refreshPermissions]);

  useEffect(() => {
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
      requestPermission,
      scheduleNotification,
      refreshPermissions,
    }),
    [isDeviceSupported, permissions, requestPermission, scheduleNotification, refreshPermissions],
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

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  ScrollView,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { useTheme } from '../../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ensureAvatarUri } from '../../utils/media';
import ScreenHeader from '../../components/ScreenHeader';

function statusMeta(status) {
  switch (status) {
    case 'APPROVED':
      return { label: 'Approved', textClass: 'text-green-600' };
    case 'REJECTED':
      return { label: 'Rejected', textClass: 'text-red-600' };
    default:
      return { label: 'Pending Review', textClass: 'text-amber-600' };
  }
}

export default function SettingsPage({ navigation }) {
  const { user, isLoading, logout } = useAuth();
  const {
    notificationsEnabled,
    requestPermission,
    isDeviceSupported,
    refreshPermissions,
    isNativeModuleAvailable,
    isPhysicalDevice,
  } = useNotifications();
  const [isRequestingPush, setIsRequestingPush] = useState(false);
  const [emailUpdates, setEmailUpdates] = useState(true);
  const [smsAlerts, setSmsAlerts] = useState(false);
  const [locationServices, setLocationServices] = useState(true);
  const [shareActivityStatus, setShareActivityStatus] = useState(true);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const { themePreference, setThemePreference } = useTheme();
  const insets = useSafeAreaInsets();
  const contentContainerStyle = useMemo(
    () => ({
      paddingHorizontal: 24,
      paddingBottom: Math.max(32, insets.bottom + 24),
      paddingTop: 24,
    }),
    [insets.bottom],
  );

  const avatarUri = useMemo(() => {
    const seed = user?.id ?? user?.email ?? 'settings';
    return ensureAvatarUri(user?.avatarUrl, seed);
  }, [user?.avatarUrl, user?.email, user?.id]);

  const appVersion = useMemo(() => {
    try {
      return (
        Constants?.expoConfig?.version ??
        Constants?.manifest?.version ??
        Constants?.nativeAppVersion ??
        'N/A'
      );
    } catch (error) {
      console.warn('Unable to determine app version:', error);
      return 'N/A';
    }
  }, []);

  const pushStatusMessage = useMemo(() => {
    if (!isPhysicalDevice) {
      return 'Notifications require running TrailMate on a physical device.';
    }
    if (!isNativeModuleAvailable) {
      return 'Push notifications are not available in this build of TrailMate.';
    }
    return notificationsEnabled
      ? 'Enabled on this device.'
      : 'Turn on notifications to get booking confirmations and event reminders.';
  }, [isNativeModuleAvailable, isPhysicalDevice, notificationsEnabled]);

  const handleLogout = useCallback(async () => {
    await logout();
  }, [logout]);

  const confirmLogout = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: handleLogout },
    ]);
  };

  const handleOpenLink = async (url) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Unable to open link', 'Please try again later.');
      }
    } catch (error) {
      console.error('Failed to open link:', error);
      Alert.alert('Unable to open link', 'Please try again later.');
    }
  };

  const handleSupportEmail = () => {
    handleOpenLink('mailto:support@trailmate.app');
  };

  const handleHelpCenter = () => {
    handleOpenLink('https://trailmate.app/help');
  };

  const handleRateApp = () => {
    handleOpenLink('https://trailmate.app/rate');
  };

  const openLegalDocument = useCallback(
    (documentKey) => {
      navigation.navigate('LegalDocument', { documentKey });
    },
    [navigation],
  );

  const handleTogglePushNotifications = useCallback(
    async (value) => {
      if (isRequestingPush) {
        return;
      }

      if (!isDeviceSupported) {
        Alert.alert(
          'Notifications unavailable',
          !isPhysicalDevice
            ? 'Enable notifications on a physical device to receive real-time updates.'
            : 'This build is missing push notification support. Install the latest TrailMate build with push enabled to receive alerts.',
        );
        return;
      }

      if (value) {
        setIsRequestingPush(true);
        try {
          const granted = await requestPermission();
          await refreshPermissions();
          if (granted) {
            Alert.alert(
              'Notifications enabled',
              'You will receive alerts for bookings, event updates, and other important activity.',
            );
          } else {
            Alert.alert(
              'Permission needed',
              'Enable notifications from your device settings to stay up to date.',
            );
          }
        } catch (error) {
          console.error('Failed to enable notifications:', error);
          Alert.alert('Error', 'Unable to update notification settings right now.');
        } finally {
          setIsRequestingPush(false);
        }
        return;
      }

      const actions = [{ text: 'Cancel', style: 'cancel' }];
      if (typeof Linking.openSettings === 'function') {
        actions.push({
          text: 'Open settings',
          onPress: () => {
            Linking.openSettings();
          },
        });
      }

      Alert.alert(
        'Manage notifications',
        'Use your device settings to turn notifications off or customise alerts.',
        actions,
      );
      await refreshPermissions();
    },
    [
      isRequestingPush,
      isDeviceSupported,
      isPhysicalDevice,
      requestPermission,
      refreshPermissions,
    ],
  );

  const handleSavePreferences = () => {
    Alert.alert('Preferences saved', 'Your settings will be synced the next time you sign in.');
  };

  const renderProfileCard = () => (
    <View className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
      <View className="flex-row items-center">
        <Image source={{ uri: avatarUri }} className="h-14 w-14 rounded-full" />
        <View className="ml-4 flex-1">
          <Text className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {user?.name ?? user?.email ?? 'Explorer'}
          </Text>
          {user?.email ? (
            <Text className="mt-1 text-sm text-slate-500 dark:text-slate-400">{user.email}</Text>
          ) : null}
        </View>
        <TouchableOpacity
          className="rounded-full border border-blue-600 px-4 py-2"
          onPress={() => navigation.navigate('Profile', { userId: 'me' })}
        >
          <Text className="text-sm font-semibold text-blue-600">View profile</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        className="mt-4 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3"
        onPress={() => navigation.navigate('ProfileCreation')}
      >
        <Text className="text-base font-semibold text-slate-800 dark:text-slate-100">Complete your profile</Text>
        <Text className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Update personal details so organizers can tailor better experiences.
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderOrganizerSection = () => {
    if (isLoading && !user) {
      return (
        <View className="mt-6">
          <ActivityIndicator size="small" color="#0f172a" />
        </View>
      );
    }

    if (!user) {
      return null;
    }

    const application = user.organizerApplication ?? null;

    if (user.role === 'ORGANIZER') {
      return (
        <View className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
          <Text className="text-lg font-semibold text-emerald-700">Organizer tools unlocked</Text>
          <Text className="text-sm text-emerald-700 mt-2">
            You can now create and manage events for the community.
          </Text>
        </View>
      );
    }

    if (application) {
      const status = statusMeta(application.status);
      return (
        <View className="mt-6 rounded-3xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-5">
          <Text className="text-base font-semibold text-slate-800 mb-1 dark:text-slate-100">Organizer application</Text>
          <Text className={`text-sm font-semibold ${status.textClass}`}>{status.label}</Text>
          {application.documentUrls?.length ? (
            <Text className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {application.documentUrls.length} document
              {application.documentUrls.length > 1 ? 's' : ''} uploaded
            </Text>
          ) : null}
          {application.reviewNotes ? (
            <Text className="text-sm text-amber-700 mt-2">Notes: {application.reviewNotes}</Text>
          ) : null}
          <TouchableOpacity
            className="bg-blue-600 px-5 py-3 rounded-xl mt-4"
            onPress={() => navigation.navigate('ApplyOrganizer')}
          >
            <Text className="text-white font-semibold text-center">
              {application.status === 'REJECTED' ? 'Resubmit application' : 'View application'}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (user.role === 'USER') {
      return (
        <View className="mt-6 rounded-3xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-5">
          <Text className="text-base font-semibold text-slate-800 dark:text-slate-100">Become an organizer</Text>
          <Text className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Submit your credentials and IDs so the admin team can review and approve you to host
            events.
          </Text>
          <TouchableOpacity
            className="bg-blue-600 px-5 py-3 rounded-xl mt-4"
            onPress={() => navigation.navigate('ApplyOrganizer')}
          >
            <Text className="text-white font-semibold text-center">Apply to be an organizer</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (user.organizerRequestPending) {
      return (
        <Text className="mt-6 text-center text-slate-500 dark:text-slate-400">
          Your organizer application is currently pending review.
        </Text>
      );
    }

    return null;
  };

  const renderExpertSection = () => {
    if (isLoading && !user) {
      return null;
    }

    if (!user) {
      return null;
    }

    const application = user.expertApplication ?? null;

    if (user.expertBadgeAwarded || user.experienceLevelLocked) {
      return (
        <View className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-400/30 dark:bg-amber-900/20">
          <Text className="text-lg font-semibold text-amber-700 dark:text-amber-200">Expert badge unlocked</Text>
          <Text className="mt-2 text-sm text-amber-700 dark:text-amber-200">
            Admins verified your summit experience. Your profile now permanently shows the expert badge.
          </Text>
          <TouchableOpacity
            className="mt-4 rounded-xl border border-amber-500 px-4 py-2"
            onPress={() => navigation.navigate('Profile', { userId: user?.id ?? 'me' })}
          >
            <Text className="text-center text-sm font-semibold text-amber-700 dark:text-amber-200">
              View profile badge
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (application) {
      const status = statusMeta(application.status);
      return (
        <View className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-950">
          <Text className="text-base font-semibold text-slate-800 dark:text-slate-100">Expert verification</Text>
          <Text className={`mt-1 text-sm font-semibold ${status.textClass}`}>{status.label}</Text>
          <Text className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Summit: {application.summitName || 'Not provided'}
          </Text>
          {application.reviewNotes ? (
            <Text className="mt-2 text-sm text-amber-700 dark:text-amber-400">Notes: {application.reviewNotes}</Text>
          ) : null}
          <TouchableOpacity
            className="mt-4 rounded-xl bg-blue-600 px-5 py-3"
            onPress={() => navigation.navigate('ApplyExpert')}
          >
            <Text className="text-center font-semibold text-white">
              {application.status === 'REJECTED' ? 'Resubmit verification' : 'View submission'}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-950">
        <Text className="text-base font-semibold text-slate-800 dark:text-slate-100">Verify as an expert</Text>
        <Text className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Upload a summit photo and certificate to request the expert badge. Admins review every submission.
        </Text>
        <TouchableOpacity
          className="mt-4 rounded-xl bg-blue-600 px-5 py-3"
          onPress={() => navigation.navigate('ApplyExpert')}
        >
          <Text className="text-center font-semibold text-white">Apply for expert badge</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderNotificationsSection = () => (
    <View className="mt-6 rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
      <Text className="text-sm font-semibold uppercase text-slate-500 dark:text-slate-400">Notifications</Text>
      <View className="mt-4">
        <View className="py-3">
          <Text className="text-base font-medium text-slate-900 dark:text-slate-100">Push notifications</Text>
          <Text className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Stay informed about new events and booking updates.
          </Text>
          <Text className="mt-1 text-xs text-slate-400 dark:text-slate-500">{pushStatusMessage}</Text>
          <View className="mt-2 flex-row items-center justify-end">
            {isRequestingPush ? (
              <ActivityIndicator size="small" color="#2563eb" style={{ marginRight: 8 }} />
            ) : null}
            <Switch
              value={notificationsEnabled}
              onValueChange={handleTogglePushNotifications}
              trackColor={{ false: '#d6d3d1', true: '#2563eb' }}
              thumbColor={notificationsEnabled ? '#1d4ed8' : '#f4f3f4'}
              ios_backgroundColor="#d6d3d1"
              disabled={!isDeviceSupported || isRequestingPush}
            />
          </View>
        </View>
        <View className="h-px bg-slate-100 dark:bg-slate-900" />
        <View className="py-3">
          <Text className="text-base font-medium text-slate-900 dark:text-slate-100">Email updates</Text>
          <Text className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Receive curated trail tips and trip reminders to your inbox.
          </Text>
          <View className="mt-2 flex-row justify-end">
            <Switch
              value={emailUpdates}
              onValueChange={setEmailUpdates}
              trackColor={{ false: '#d6d3d1', true: '#2563eb' }}
              thumbColor={emailUpdates ? '#1d4ed8' : '#f4f3f4'}
              ios_backgroundColor="#d6d3d1"
            />
          </View>
        </View>
        <View className="h-px bg-slate-100 dark:bg-slate-900" />
        <View className="py-3">
          <Text className="text-base font-medium text-slate-900 dark:text-slate-100">SMS alerts</Text>
          <Text className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Get last-minute updates and critical safety notices by text.
          </Text>
          <View className="mt-2 flex-row justify-end">
            <Switch
              value={smsAlerts}
              onValueChange={setSmsAlerts}
              trackColor={{ false: '#d6d3d1', true: '#2563eb' }}
              thumbColor={smsAlerts ? '#1d4ed8' : '#f4f3f4'}
              ios_backgroundColor="#d6d3d1"
            />
          </View>
        </View>
      </View>
    </View>
  );

  const renderPrivacySection = () => (
    <View className="mt-6 rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
      <Text className="text-sm font-semibold uppercase text-slate-500 dark:text-slate-400">Privacy & Safety</Text>
      <View className="mt-4">
        <View className="py-3">
          <Text className="text-base font-medium text-slate-900 dark:text-slate-100">Share activity status</Text>
          <Text className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Let friends know when you are actively exploring trails.
          </Text>
          <View className="mt-2 flex-row justify-end">
            <Switch
              value={shareActivityStatus}
              onValueChange={setShareActivityStatus}
              trackColor={{ false: '#d6d3d1', true: '#16a34a' }}
              thumbColor={shareActivityStatus ? '#15803d' : '#f4f3f4'}
              ios_backgroundColor="#d6d3d1"
            />
          </View>
        </View>
        <View className="h-px bg-slate-100 dark:bg-slate-900" />
        <View className="py-3">
          <Text className="text-base font-medium text-slate-900 dark:text-slate-100">Location services</Text>
          <Text className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Allow TrailMate to use your location for navigation and safety alerts.
          </Text>
          <View className="mt-2 flex-row justify-end">
            <Switch
              value={locationServices}
              onValueChange={setLocationServices}
              trackColor={{ false: '#d6d3d1', true: '#16a34a' }}
              thumbColor={locationServices ? '#15803d' : '#f4f3f4'}
              ios_backgroundColor="#d6d3d1"
            />
          </View>
        </View>
        <View className="h-px bg-slate-100 dark:bg-slate-900" />
        <View className="py-3">
          <Text className="text-base font-medium text-slate-900 dark:text-slate-100">Two-factor authentication</Text>
          <Text className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Add an extra layer of security when signing in on new devices.
          </Text>
          <View className="mt-2 flex-row justify-end">
            <Switch
              value={twoFactorEnabled}
              onValueChange={setTwoFactorEnabled}
              trackColor={{ false: '#d6d3d1', true: '#16a34a' }}
              thumbColor={twoFactorEnabled ? '#15803d' : '#f4f3f4'}
              ios_backgroundColor="#d6d3d1"
            />
          </View>
        </View>
      </View>
    </View>
  );

  const renderAppearanceSection = () => {
    const themeOptions = [
      {
        key: 'system',
        title: 'System default',
        description: 'Automatically match your device setting.',
      },
      {
        key: 'light',
        title: 'Light',
        description: 'Always use a bright interface.',
      },
      {
        key: 'dark',
        title: 'Dark',
        description: 'Always use a dim interface.',
      },
    ];

    return (
      <View className="mt-6 rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
        <Text className="text-sm font-semibold uppercase text-slate-500 dark:text-slate-400">App Preferences</Text>
        <View className="mt-4">
          <Text className="text-base font-medium text-slate-900 dark:text-slate-100">Theme</Text>
          <Text className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Choose how Pabukid adapts between light, dark, and system modes.
          </Text>
          {themeOptions.map((option) => {
            const isSelected = themePreference === option.key;
            return (
              <TouchableOpacity
                key={option.key}
                className={`mt-3 flex-row items-center justify-between rounded-2xl border px-4 py-3 ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50 dark:border-blue-400/70 dark:bg-blue-950/30'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
                onPress={() => {
                  if (option.key !== themePreference) {
                    setThemePreference(option.key);
                  }
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
              >
                <View className="flex-1 pr-4">
                  <Text className="text-base font-semibold text-slate-900 dark:text-slate-100">{option.title}</Text>
                  <Text className="mt-1 text-sm text-slate-500 dark:text-slate-400">{option.description}</Text>
                </View>
                <View
                  className={`h-5 w-5 rounded-full border-2 ${
                    isSelected ? 'border-blue-600 bg-blue-600' : 'border-slate-300 dark:border-slate-600'
                  }`}
                />
              </TouchableOpacity>
            );
          })}
          <View className="h-px bg-slate-100 dark:bg-slate-900 mt-4" />
          <TouchableOpacity className="py-3" onPress={() => navigation.navigate('PreferencesSetup')}>
            <Text className="text-base font-medium text-slate-900 dark:text-slate-100">Trail preferences</Text>
            <Text className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Update preferred difficulty, duration, distance, elevation, and terrain types.
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderSupportSection = () => (
    <View className="mt-6 rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
      <Text className="text-sm font-semibold uppercase text-slate-500 dark:text-slate-400">Support</Text>
      <View className="mt-4">
        <TouchableOpacity className="py-3" onPress={handleHelpCenter}>
          <Text className="text-base font-medium text-slate-900 dark:text-slate-100">Help center</Text>
          <Text className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Browse FAQs and troubleshooting tips.
          </Text>
        </TouchableOpacity>
        <View className="h-px bg-slate-100 dark:bg-slate-900" />
        <TouchableOpacity className="py-3" onPress={handleSupportEmail}>
          <Text className="text-base font-medium text-slate-900 dark:text-slate-100">Contact support</Text>
          <Text className="mt-1 text-sm text-slate-500 dark:text-slate-400">Email our team for personalized help.</Text>
        </TouchableOpacity>
        <View className="h-px bg-slate-100 dark:bg-slate-900" />
        <TouchableOpacity className="py-3" onPress={handleRateApp}>
          <Text className="text-base font-medium text-slate-900 dark:text-slate-100">Rate TrailMate</Text>
          <Text className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Tell others about your experience on the stores.
          </Text>
        </TouchableOpacity>
        <View className="h-px bg-slate-100 dark:bg-slate-900" />
        <TouchableOpacity className="py-3" onPress={() => openLegalDocument('terms')}>
          <Text className="text-base font-medium text-slate-900 dark:text-slate-100">Terms of use</Text>
          <Text className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Review participation rules for adventures, chat, and bookings.
          </Text>
        </TouchableOpacity>
        <View className="h-px bg-slate-100 dark:bg-slate-900" />
        <TouchableOpacity className="py-3" onPress={() => openLegalDocument('privacy')}>
          <Text className="text-base font-medium text-slate-900 dark:text-slate-100">Privacy notice</Text>
          <Text className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Learn how we handle profile, booking, and trail data.
          </Text>
        </TouchableOpacity>
        <View className="h-px bg-slate-100 dark:bg-slate-900" />
        <TouchableOpacity className="py-3" onPress={() => openLegalDocument('eula')}>
          <Text className="text-base font-medium text-slate-900 dark:text-slate-100">
            End user license agreement
          </Text>
          <Text className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Understand the license and acceptable use for the mobile app.
          </Text>
        </TouchableOpacity>
      </View>
      <Text className="mt-6 text-xs uppercase text-slate-400 dark:text-slate-500">App version {appVersion}</Text>
    </View>
  );

  if (isLoading && !user) {
    return (
      <View className="flex-1 bg-white dark:bg-slate-900">
        <ScreenHeader navigation={navigation} title="Settings" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      </View>
    );
  }

  const renderHeader = () => (
    <ScreenHeader
      navigation={navigation}
      title="Settings"
      subtitle="Manage your profile, preferences, and notifications"
    />
  );

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      {renderHeader()}
      <ScrollView
        className="flex-1"
        contentContainerStyle={contentContainerStyle}
        showsVerticalScrollIndicator={false}
      >
        {renderProfileCard()}

        {renderOrganizerSection()}

        {renderExpertSection()}

        {renderNotificationsSection()}

        {renderPrivacySection()}

        {renderAppearanceSection()}

        {renderSupportSection()}

        <TouchableOpacity
          className="mt-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-4"
          onPress={handleSavePreferences}
        >
          <Text className="text-center text-base font-semibold text-slate-900 dark:text-slate-100">
            Save preferences
          </Text>
          <Text className="mt-1 text-center text-sm text-slate-500 dark:text-slate-400">
            Changes apply across all of your devices.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="mt-6 rounded-xl bg-red-600 px-6 py-3"
          onPress={confirmLogout}
          activeOpacity={0.85}
        >
          <Text className="text-center text-base font-semibold text-white">Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

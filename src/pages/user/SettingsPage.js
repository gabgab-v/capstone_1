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
  const [pushNotifications, setPushNotifications] = useState(true);
  const [emailUpdates, setEmailUpdates] = useState(true);
  const [smsAlerts, setSmsAlerts] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [locationServices, setLocationServices] = useState(true);
  const [shareActivityStatus, setShareActivityStatus] = useState(true);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

  const avatarUri = useMemo(() => {
    if (user?.avatarUrl) {
      return user.avatarUrl;
    }
    const seed = user?.id ?? user?.email ?? 'settings';
    return `https://i.pravatar.cc/150?u=${encodeURIComponent(seed)}`;
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

  const handleSavePreferences = () => {
    Alert.alert('Preferences saved', 'Your settings will be synced the next time you sign in.');
  };

  const renderProfileCard = () => (
    <View className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <View className="flex-row items-center">
        <Image source={{ uri: avatarUri }} className="h-14 w-14 rounded-full" />
        <View className="ml-4 flex-1">
          <Text className="text-lg font-semibold text-slate-900">
            {user?.name ?? user?.email ?? 'Explorer'}
          </Text>
          {user?.email ? (
            <Text className="mt-1 text-sm text-slate-500">{user.email}</Text>
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
        className="mt-4 rounded-xl border border-slate-200 px-4 py-3"
        onPress={() => navigation.navigate('ProfileCreation')}
      >
        <Text className="text-base font-semibold text-slate-800">Complete your profile</Text>
        <Text className="mt-1 text-sm text-slate-500">
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
        <View className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <Text className="text-base font-semibold text-slate-800 mb-1">Organizer application</Text>
          <Text className={`text-sm font-semibold ${status.textClass}`}>{status.label}</Text>
          {application.documentUrls?.length ? (
            <Text className="mt-2 text-sm text-slate-600">
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
        <View className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <Text className="text-base font-semibold text-slate-800">Become an organizer</Text>
          <Text className="mt-2 text-sm text-slate-600">
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
        <Text className="mt-6 text-center text-slate-500">
          Your organizer application is currently pending review.
        </Text>
      );
    }

    return null;
  };

  const renderNotificationsSection = () => (
    <View className="mt-6 rounded-3xl border border-slate-200 bg-white p-5">
      <Text className="text-sm font-semibold uppercase text-slate-500">Notifications</Text>
      <View className="mt-4">
        <View className="py-3">
          <Text className="text-base font-medium text-slate-900">Push notifications</Text>
          <Text className="mt-1 text-sm text-slate-500">
            Stay informed about new events and booking updates.
          </Text>
          <View className="mt-2 flex-row justify-end">
            <Switch
              value={pushNotifications}
              onValueChange={setPushNotifications}
              trackColor={{ false: '#d6d3d1', true: '#2563eb' }}
              thumbColor={pushNotifications ? '#1d4ed8' : '#f4f3f4'}
              ios_backgroundColor="#d6d3d1"
            />
          </View>
        </View>
        <View className="h-px bg-slate-100" />
        <View className="py-3">
          <Text className="text-base font-medium text-slate-900">Email updates</Text>
          <Text className="mt-1 text-sm text-slate-500">
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
        <View className="h-px bg-slate-100" />
        <View className="py-3">
          <Text className="text-base font-medium text-slate-900">SMS alerts</Text>
          <Text className="mt-1 text-sm text-slate-500">
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
    <View className="mt-6 rounded-3xl border border-slate-200 bg-white p-5">
      <Text className="text-sm font-semibold uppercase text-slate-500">Privacy & Safety</Text>
      <View className="mt-4">
        <View className="py-3">
          <Text className="text-base font-medium text-slate-900">Share activity status</Text>
          <Text className="mt-1 text-sm text-slate-500">
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
        <View className="h-px bg-slate-100" />
        <View className="py-3">
          <Text className="text-base font-medium text-slate-900">Location services</Text>
          <Text className="mt-1 text-sm text-slate-500">
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
        <View className="h-px bg-slate-100" />
        <View className="py-3">
          <Text className="text-base font-medium text-slate-900">Two-factor authentication</Text>
          <Text className="mt-1 text-sm text-slate-500">
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

  const renderAppearanceSection = () => (
    <View className="mt-6 rounded-3xl border border-slate-200 bg-white p-5">
      <Text className="text-sm font-semibold uppercase text-slate-500">App Preferences</Text>
      <View className="mt-4">
        <View className="py-3">
          <Text className="text-base font-medium text-slate-900">Dark mode</Text>
          <Text className="mt-1 text-sm text-slate-500">
            Switch between light and dark themes to match your environment.
          </Text>
          <View className="mt-2 flex-row justify-end">
            <Switch
              value={darkMode}
              onValueChange={setDarkMode}
              trackColor={{ false: '#d6d3d1', true: '#2563eb' }}
              thumbColor={darkMode ? '#1d4ed8' : '#f4f3f4'}
              ios_backgroundColor="#d6d3d1"
            />
          </View>
        </View>
        <View className="h-px bg-slate-100" />
        <TouchableOpacity className="py-3" onPress={() => navigation.navigate('PreferencesSetup')}>
          <Text className="text-base font-medium text-slate-900">Trail preferences</Text>
          <Text className="mt-1 text-sm text-slate-500">
            Update preferred difficulty, duration, and terrain types.
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderSupportSection = () => (
    <View className="mt-6 rounded-3xl border border-slate-200 bg-white p-5">
      <Text className="text-sm font-semibold uppercase text-slate-500">Support</Text>
      <View className="mt-4">
        <TouchableOpacity className="py-3" onPress={handleHelpCenter}>
          <Text className="text-base font-medium text-slate-900">Help center</Text>
          <Text className="mt-1 text-sm text-slate-500">
            Browse FAQs and troubleshooting tips.
          </Text>
        </TouchableOpacity>
        <View className="h-px bg-slate-100" />
        <TouchableOpacity className="py-3" onPress={handleSupportEmail}>
          <Text className="text-base font-medium text-slate-900">Contact support</Text>
          <Text className="mt-1 text-sm text-slate-500">Email our team for personalized help.</Text>
        </TouchableOpacity>
        <View className="h-px bg-slate-100" />
        <TouchableOpacity className="py-3" onPress={handleRateApp}>
          <Text className="text-base font-medium text-slate-900">Rate TrailMate</Text>
          <Text className="mt-1 text-sm text-slate-500">
            Tell others about your experience on the stores.
          </Text>
        </TouchableOpacity>
        <View className="h-px bg-slate-100" />
        <TouchableOpacity className="py-3" onPress={() => handleOpenLink('https://trailmate.app/terms')}>
          <Text className="text-base font-medium text-slate-900">Terms of service</Text>
        </TouchableOpacity>
        <View className="h-px bg-slate-100" />
        <TouchableOpacity className="py-3" onPress={() => handleOpenLink('https://trailmate.app/privacy')}>
          <Text className="text-base font-medium text-slate-900">Privacy policy</Text>
        </TouchableOpacity>
      </View>
      <Text className="mt-6 text-xs uppercase text-slate-400">App version {appVersion}</Text>
    </View>
  );

  if (isLoading && !user) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32, paddingTop: 32 }}
      showsVerticalScrollIndicator={false}
    >
      <Text className="text-3xl font-bold text-slate-900">Settings</Text>

      {renderProfileCard()}

      {renderOrganizerSection()}

      {renderNotificationsSection()}

      {renderPrivacySection()}

      {renderAppearanceSection()}

      {renderSupportSection()}

      <TouchableOpacity
        className="mt-6 rounded-xl border border-slate-200 bg-white px-4 py-4"
        onPress={handleSavePreferences}
      >
        <Text className="text-center text-base font-semibold text-slate-900">
          Save preferences
        </Text>
        <Text className="mt-1 text-center text-sm text-slate-500">
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
  );
}

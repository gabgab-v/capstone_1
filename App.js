import 'react-native-gesture-handler';
import './global.css';
import React, { useEffect, useMemo, useRef } from 'react';
import 'react-native-url-polyfill/auto';
import { ActivityIndicator, View } from 'react-native';

import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { NotificationProvider, useNotifications } from './src/context/NotificationContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { TrailSyncProvider } from './src/context/TrailSyncContext';

// Import all your page components
import LoginPage from './src/pages/LoginPage';
import SignupPage from './src/pages/SignupPage';
import MainTabNavigator from './src/navigation/MainTabNavigator';
import ProfilePage from './src/pages/ProfilePage';
import ProfileCreationPage from './src/pages/ProfileCreationPage';
import PreferencesSetupPage from './src/pages/preferences/PreferencesSetupPage';
import BookingPage from './src/pages/booking/BookingPage';
import ReceiptPage from './src/pages/booking/ReceiptPage';
import EventDetailsPage from './src/pages/event/EventDetailsPage';
import EventBookingsPage from './src/pages/event/EventBookingsPage';
import CreateEventPage from './src/pages/CreateEventPage';
import SettingsPage from './src/pages/user/SettingsPage';
import ApplyOrganizerPage from './src/pages/user/ApplyOrganizerPage';
import ApplyExpertPage from './src/pages/user/ApplyExpertPage';
import BusinessVerificationPage from './src/pages/user/BusinessVerificationPage';
import IdentityVerificationPage from './src/pages/user/IdentityVerificationPage';
import ChatConversationPage from './src/pages/chat/ChatConversationPage';
import LegalDocumentPage from './src/pages/legal/LegalDocumentPage';
import ConnectionsListPage from './src/pages/connections/ConnectionsListPage';
import AccountSearchPage from './src/pages/search/AccountSearchPage';

const Stack = createNativeStackNavigator();

function NotificationQueueBridge() {
  const { user } = useAuth();
  const {
    flushQueuedNotifications,
    recordLogout,
    setActiveUserId,
    notificationsEnabled,
    registerPushToken,
    unregisterPushToken,
    syncPendingNotifications,
  } = useNotifications();
  const previousUserIdRef = useRef(null);
  const lastPushUserIdRef = useRef(null);
  const lastPushEnabledRef = useRef(false);
  const lastInboxUserIdRef = useRef(null);
  const lastInboxEnabledRef = useRef(false);

  useEffect(() => {
    const currentUserId = user?.id ?? null;
    setActiveUserId(currentUserId);

    if (previousUserIdRef.current && !currentUserId) {
      recordLogout();
      unregisterPushToken();
    }

    if (currentUserId && previousUserIdRef.current !== currentUserId) {
      flushQueuedNotifications({ userId: currentUserId });
    }

    if (currentUserId && notificationsEnabled) {
      const shouldRegister =
        lastPushUserIdRef.current !== currentUserId || !lastPushEnabledRef.current;
      if (shouldRegister) {
        registerPushToken();
        lastPushUserIdRef.current = currentUserId;
        lastPushEnabledRef.current = true;
      }

      const shouldSyncInbox =
        lastInboxUserIdRef.current !== currentUserId || !lastInboxEnabledRef.current;
      if (shouldSyncInbox) {
        syncPendingNotifications();
        lastInboxUserIdRef.current = currentUserId;
        lastInboxEnabledRef.current = true;
      }
    } else if (!notificationsEnabled) {
      lastPushEnabledRef.current = false;
      lastInboxEnabledRef.current = false;
    }

    previousUserIdRef.current = currentUserId;
  }, [
    user?.id,
    notificationsEnabled,
    flushQueuedNotifications,
    recordLogout,
    registerPushToken,
    unregisterPushToken,
    syncPendingNotifications,
    setActiveUserId,
  ]);

  return null;
}

function AppNavigator() {
  const { user, isLoading } = useAuth();
  const { colors } = useTheme();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const isAuthenticated = Boolean(user);
  const preferencesIncomplete = Boolean(user && user.preferencesComplete === false);
  const navigatorKey = !isAuthenticated ? 'auth' : preferencesIncomplete ? 'onboarding' : 'main';
  const initialRouteName = !isAuthenticated
    ? 'Login'
    : preferencesIncomplete
    ? 'PreferencesSetup'
    : 'MainTabs';

  return (
    <Stack.Navigator
      key={navigatorKey}
      screenOptions={{ headerShown: false }}
      initialRouteName={initialRouteName}
    >
      {isAuthenticated ? (
        <>
          <Stack.Screen name="PreferencesSetup" component={PreferencesSetupPage} />
          <Stack.Screen name="MainTabs" component={MainTabNavigator} />
          <Stack.Screen name="Profile" component={ProfilePage} />
          <Stack.Screen name="UserProfile" component={ProfilePage} />
          <Stack.Screen name="ProfileCreation" component={ProfileCreationPage} />
          <Stack.Screen name="BookingPage" component={BookingPage} />
          <Stack.Screen name="ReceiptPage" component={ReceiptPage} />
          <Stack.Screen name="EventDetails" component={EventDetailsPage} />
          <Stack.Screen name="EventBookings" component={EventBookingsPage} />
          <Stack.Screen name="EditEvent" component={CreateEventPage} />
          <Stack.Screen name="Settings" component={SettingsPage} />
          <Stack.Screen name="BusinessVerification" component={BusinessVerificationPage} />
          <Stack.Screen name="IdentityVerification" component={IdentityVerificationPage} />
          <Stack.Screen name="ApplyOrganizer" component={ApplyOrganizerPage} />
          <Stack.Screen name="ApplyExpert" component={ApplyExpertPage} />
          <Stack.Screen name="ChatConversation" component={ChatConversationPage} />
          <Stack.Screen name="ConnectionsList" component={ConnectionsListPage} />
          <Stack.Screen name="AccountSearch" component={AccountSearchPage} />
        </>
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginPage} />
          <Stack.Screen name="Signup" component={SignupPage} />
        </>
      )}
      <Stack.Screen name="LegalDocument" component={LegalDocumentPage} />
    </Stack.Navigator>
  );
}

function ThemedNavigation() {
  const { isDarkMode, colors } = useTheme();

  const navigationTheme = useMemo(() => {
    const base = isDarkMode ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.accent,
        background: colors.background,
        card: colors.surface,
        text: colors.textPrimary,
        border: colors.border,
        notification: colors.accent,
      },
    };
  }, [colors, isDarkMode]);

  return (
    <NavigationContainer theme={navigationTheme}>
      <AppNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <NotificationProvider>
          <AuthProvider>
            <TrailSyncProvider>
              <NotificationQueueBridge />
              <ThemedNavigation />
            </TrailSyncProvider>
          </AuthProvider>
        </NotificationProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

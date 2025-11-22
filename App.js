import 'react-native-gesture-handler';
import './global.css';
import './src/setupErrorTracking';
import React, { useMemo } from 'react';
import 'react-native-url-polyfill/auto';
import { ActivityIndicator, View } from 'react-native';

import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { NotificationProvider } from './src/context/NotificationContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { TrailSyncProvider } from './src/context/TrailSyncContext';
import AppErrorBoundary from './src/components/AppErrorBoundary';
import StartupDiagnosticsGate from './src/components/StartupDiagnosticsGate';
import GlobalErrorToast from './src/components/GlobalErrorToast';

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
import ChatConversationPage from './src/pages/chat/ChatConversationPage';
import LegalDocumentPage from './src/pages/legal/LegalDocumentPage';
import ConnectionsListPage from './src/pages/connections/ConnectionsListPage';
import TrailRecorderPage from './src/pages/TrailRecorderPage';

const Stack = createNativeStackNavigator();

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
  const preferencesIncomplete = Boolean(user && !user.preferencesComplete);
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
          <Stack.Screen name="ApplyOrganizer" component={ApplyOrganizerPage} />
          <Stack.Screen name="ApplyExpert" component={ApplyExpertPage} />
          <Stack.Screen name="ChatConversation" component={ChatConversationPage} />
          <Stack.Screen name="ConnectionsList" component={ConnectionsListPage} />
        </>
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginPage} />
          <Stack.Screen name="Signup" component={SignupPage} />
          <Stack.Screen
            name="OfflineRecorder"
            component={TrailRecorderPage}
            initialParams={{ guestMode: true }}
          />
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

function AppShell() {
  const { user } = useAuth();
  const resetKey = user?.id ? `user-${user.id}` : 'guest';
  return (
    <AppErrorBoundary resetKey={resetKey}>
      <StartupDiagnosticsGate>
        <TrailSyncProvider>
          <ThemedNavigation />
        </TrailSyncProvider>
        <GlobalErrorToast />
      </StartupDiagnosticsGate>
    </AppErrorBoundary>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <NotificationProvider>
          <AuthProvider>
            <AppShell />
          </AuthProvider>
        </NotificationProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

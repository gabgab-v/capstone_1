import 'react-native-gesture-handler';
import './global.css';
import React, { useMemo, useState } from 'react';
import 'react-native-url-polyfill/auto';
import { ActivityIndicator, View, Text, TouchableOpacity, StyleSheet } from 'react-native';

import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { NotificationProvider } from './src/context/NotificationContext';
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
import ChatConversationPage from './src/pages/chat/ChatConversationPage';
import LegalDocumentPage from './src/pages/legal/LegalDocumentPage';
import ConnectionsListPage from './src/pages/connections/ConnectionsListPage';

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.handleRetry = this.handleRetry.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('App crashed:', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  handleRetry() {
    this.setState({ error: null }, () => {
      if (typeof this.props.onReset === 'function') {
        this.props.onReset();
      }
    });
  }

  render() {
    if (this.state.error) {
      const message =
        this.state.error?.message || 'Something went wrong while loading the app.';
      return <AppErrorFallback message={message} onRetry={this.handleRetry} />;
    }

    return this.props.children;
  }
}

function AppErrorFallback({ message, onRetry }) {
  const { colors } = useTheme();

  return (
    <SafeAreaView style={[errorStyles.container, { backgroundColor: colors.background }]}>
      <Text style={[errorStyles.title, { color: colors.textPrimary }]}>Something went wrong</Text>
      <Text style={[errorStyles.message, { color: colors.textMuted }]}>{message}</Text>
      <TouchableOpacity
        onPress={onRetry}
        activeOpacity={0.85}
        style={[errorStyles.button, { backgroundColor: colors.accent }]}
      >
        <Text style={errorStyles.buttonLabel}>Restart app</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const errorStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 999,
  },
  buttonLabel: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 16,
  },
});

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
  const [appResetKey, setAppResetKey] = useState(0);

  const handleAppReset = () => {
    setAppResetKey((current) => current + 1);
  };

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <NotificationProvider>
          <AuthProvider key={appResetKey}>
            <AppErrorBoundary resetKey={appResetKey} onReset={handleAppReset}>
              <TrailSyncProvider key={appResetKey}>
                <ThemedNavigation />
              </TrailSyncProvider>
            </AppErrorBoundary>
          </AuthProvider>
        </NotificationProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

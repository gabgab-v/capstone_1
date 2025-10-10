import 'react-native-gesture-handler';
import './global.css'; // Tailwind
import React from 'react';
import 'react-native-url-polyfill/auto';
import { ActivityIndicator, View } from 'react-native';

import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// ✅ The context provider and hook are the source of truth
import { AuthProvider, useAuth } from './src/context/AuthContext';

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
import SettingsPage from './src/pages/user/SettingsPage';
import ApplyOrganizerPage from './src/pages/user/ApplyOrganizerPage';

const Stack = createNativeStackNavigator();

// This component decides which screens to show based on auth state
function AppNavigator() {
  const { user, isLoading } = useAuth();

  // Show a loading spinner while the session is being restored
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#2E7D32" />
      </View>
    );
  }

  const preferencesIncomplete = Boolean(user && !user.preferencesComplete);

  if (user && preferencesIncomplete) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="PreferencesSetup" component={PreferencesSetupPage} />
        <Stack.Screen name="ProfileCreation" component={ProfileCreationPage} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {user ? (
        // --- User is Logged In ---
        // These screens are available only after authentication.
        <>
          <Stack.Screen name="MainTabs" component={MainTabNavigator} />
          <Stack.Screen name="Profile" component={ProfilePage} />
          <Stack.Screen name="UserProfile" component={ProfilePage} />
          <Stack.Screen name="ProfileCreation" component={ProfileCreationPage} />
          <Stack.Screen name="PreferencesSetup" component={PreferencesSetupPage} />
          <Stack.Screen name="BookingPage" component={BookingPage} />
          <Stack.Screen name="ReceiptPage" component={ReceiptPage} />
          <Stack.Screen name="EventDetails" component={EventDetailsPage} />
          <Stack.Screen name="EventBookings" component={EventBookingsPage} />
          <Stack.Screen name="Settings" component={SettingsPage} />
          <Stack.Screen name="ApplyOrganizer" component={ApplyOrganizerPage} />
        </>
      ) : (
        // --- No User ---
        // These screens are for authentication.
        <>
          <Stack.Screen name="Login" component={LoginPage} />
          <Stack.Screen name="Signup" component={SignupPage} />
        </>
      )}
    </Stack.Navigator>
  );
}

// This is the root component that wraps the entire app
export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <AppNavigator />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

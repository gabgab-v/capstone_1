import 'react-native-gesture-handler';
import './global.css'; // Tailwind
import React, { useState, useEffect, useRef } from 'react';


import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LoginPage from './src/pages/LoginPage';
import SignupPage from './src/pages/SignupPage';
import MainTabNavigator from './src/navigation/MainTabNavigator'; // ⬅️ add this
import ProfilePage from './src/pages/ProfilePage';
import ProfileCreationPage from './src/pages/ProfileCreationPage';
import PreferencesSetupPage from './src/pages/preferences/PreferencesSetupPage';
import BookingPage from './src/pages/booking/BookingPage';
import ReceiptPage from './src/pages/booking/ReceiptPage';
import EventDetailsPage from './src/pages/event/EventDetailsPage';
import EventBookingsPage from './src/pages/event/EventBookingsPage';

import SettingsPage from './src/pages/user/SettingsPage';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>

          {/* Auth pages */}
          <Stack.Screen name="Login" component={LoginPage} />
          <Stack.Screen name="Signup" component={SignupPage} />

          <Stack.Screen name="Profile" component={ProfilePage} />
          <Stack.Screen name="ProfileCreation" component={ProfileCreationPage} />
          <Stack.Screen name="PreferencesSetup" component={PreferencesSetupPage} />
          <Stack.Screen name="BookingPage" component={BookingPage} />
          <Stack.Screen name="ReceiptPage" component={ReceiptPage} />
          <Stack.Screen name="EventDetails" component={EventDetailsPage} />
          <Stack.Screen name="EventBookings" component={EventBookingsPage} />
          

          {/* Main app after login */}
          <Stack.Screen name="MainTabs" component={MainTabNavigator} />

          {/* Main app after login */}
          <Stack.Screen name="Settings" component={SettingsPage} />

        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
      
  );
}

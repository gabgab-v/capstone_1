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
          

          {/* Main app after login */}
          <Stack.Screen name="MainTabs" component={MainTabNavigator} />

          {/* Main app after login */}

        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
      
  );
}

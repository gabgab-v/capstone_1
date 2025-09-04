import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { post, get } from '../lib/api';          // make sure the relative path is correct

export default function LoginPage({ navigation }) {
  const [email, setEmail]   = useState('');
  const [password, setPass] = useState('');

  async function handleLogin() {
    if (!email || !password) {
      alert('Please enter email and password');
      return;
    }

    try {
      const responseData = await post('/api/auth/login', { email, password });
      const { token, user } = responseData;

      if (!token || !user) {
        throw new Error('Invalid response from server. Please try again.');
      }

      // --- THIS IS THE NEW CHECK ---
      // If the user is an admin, block them from logging into the mobile app.
      if (user.role === 'ADMIN') {
        throw new Error('Admin accounts must use the web dashboard.');
      }
      // --- END OF NEW CHECK ---

      await SecureStore.setItemAsync('jwt', token);

      // This part remains the same
      if (!user.profileComplete) {
        navigation.replace('ProfileCreation', { userId: user.id });
      } else if (!user.preferencesComplete) {
        navigation.replace('PreferencesSetup', { userId: user.id });
      } else {
        navigation.replace('MainTabs');
      }
    } catch (e) {
      alert(`Login Failed: ${e.message}`);
      console.error(e);
    }
  }


  return (
    <View className="flex-1 bg-white px-6 pt-16">
      {/* Header */}
      <View className="flex-row items-center justify-center mb-10">
        <Image
          source={require('../../assets/favicon.png')}
          className="w-8 h-8 mr-2"
        />
        <Text className="text-green-700 text-2xl font-bold">Pabukid</Text>
      </View>

      {/* Login Form */}
      <Text className="text-2xl font-bold text-center text-gray-800 mb-6">
        Welcome Back
      </Text>

      <TextInput
        className="border border-gray-300 rounded-xl p-4 mb-4"
        placeholder="Email"
        placeholderTextColor="#888"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <TextInput
        className="border border-gray-300 rounded-xl p-4 mb-6"
        placeholder="Password"
        placeholderTextColor="#888"
        secureTextEntry
        value={password}
        onChangeText={setPass}
      />

      <TouchableOpacity
        className="bg-green-700 rounded-xl py-4 mb-4"
        onPress={handleLogin}
      >
        <Text className="text-center text-white font-semibold text-base">
          Sign In
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
        <Text className="text-center text-green-700 font-medium">
          Don't have an account? <Text className="underline">Create one</Text>
        </Text>
      </TouchableOpacity>
    </View>
  );
}

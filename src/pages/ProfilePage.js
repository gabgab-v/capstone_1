// apps/mobile/src/pages/ProfilePage.js
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { get } from '../lib/api';      // ⬅️ your api helper

export default function ProfilePage({ navigation }) {
  const [user, setUser]   = useState(null);
  const [loading, setLoading] = useState(true);

  /* Load user info once on mount */
  useEffect(() => {
    (async () => {
      try {
        const token = await SecureStore.getItemAsync('jwt');
        if (!token) throw new Error('No token');
        const me = await get('/api/users/me', token);
        setUser(me);
      } catch (e) {
        console.warn(e.message);
        navigation.replace('Login');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* Logout */
  async function handleLogout() {
    await SecureStore.deleteItemAsync('jwt');
    navigation.replace('Login');
  }

  /* Loading state */
  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!user) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <Text className="text-red-600">Failed to load profile.</Text>
      </View>
    );
  }

  /* Main UI */
  return (
    <View className="flex-1 justify-center items-center bg-white px-6">
      <Text className="text-2xl font-bold mb-6">Your Profile</Text>

      <View className="w-full mb-4">
        <Text className="text-gray-500">Full name</Text>
        <Text className="text-lg font-medium">{user.name}</Text>
      </View>

      <View className="w-full mb-4">
        <Text className="text-gray-500">Email</Text>
        <Text className="text-lg font-medium">{user.email}</Text>
      </View>

      <View className="w-full mb-8">
        <Text className="text-gray-500">Birthdate</Text>
        <Text className="text-lg font-medium">{user.birthdate}</Text>
      </View>

      <TouchableOpacity
        className="bg-red-600 px-6 py-3 rounded-xl"
        onPress={handleLogout}
      >
        <Text className="text-white font-semibold text-base">Logout</Text>
      </TouchableOpacity>
    </View>
  );
}

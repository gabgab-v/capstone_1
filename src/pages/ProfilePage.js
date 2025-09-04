// apps/mobile/src/pages/ProfilePage.js
import React, { useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { get } from '../lib/api';
import { Ionicons } from '@expo/vector-icons';

export default function ProfilePage({ navigation }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <ScrollView className="flex-1 bg-white">
      {/* Top Header */}
      <View className="flex-row justify-between items-center px-4 pt-4">
        <Text className="text-lg font-semibold">Hiker</Text>
        <View className="flex-row space-x-4">
          <Ionicons name="notifications-outline" size={24} color="green" />
          <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
            <Ionicons name="settings-outline" size={24} color="green" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Avatar + Stats */}
      <View className="items-center mt-4">
        <Image
          source={{ uri: user.avatarUrl || 'https://via.placeholder.com/100' }}
          className="w-24 h-24 rounded-full border-2 border-gray-300"
        />
        <Text className="text-xl font-bold mt-2">{user.name}</Text>
        <Text className="text-gray-400">Bio</Text>

        {/* Followers / Following */}
        <View className="flex-row mt-3 space-x-8">
          <View className="items-center">
            <Text className="text-lg font-bold">256</Text>
            <Text className="text-gray-500">Following</Text>
          </View>
          <View className="items-center">
            <Text className="text-lg font-bold">534</Text>
            <Text className="text-gray-500">Followers</Text>
          </View>
        </View>
      </View>

      {/* Tabs */}
      <View className="flex-row justify-center mt-4">
        <TouchableOpacity className="px-4 py-2 border-b-2 border-green-600">
          <Text className="font-semibold">Posts</Text>
        </TouchableOpacity>
        <TouchableOpacity className="px-4 py-2">
          <Text className="font-semibold text-gray-400">Records</Text>
        </TouchableOpacity>
      </View>

      {/* Post Example */}
      <View className="mt-4 px-4">
        <View className="flex-row items-center">
          <Image
            source={{ uri: user.avatarUrl || 'https://via.placeholder.com/40' }}
            className="w-10 h-10 rounded-full"
          />
          <View className="ml-2">
            <Text className="font-semibold">{user.name}</Text>
            <Text className="text-xs text-gray-400">May 10, 2025</Text>
          </View>
        </View>

        <Text className="mt-3">
          Touching the sky at 2,954 meters. {"\n"}
          Mt. Apo, you were worth every step.
        </Text>

        {/* Stats */}
        <View className="flex-row justify-between mt-3 px-2">
          <View className="items-center">
            <Text className="font-bold">34.6 km</Text>
            <Text className="text-gray-500 text-xs">Distance</Text>
          </View>
          <View className="items-center">
            <Text className="font-bold">20 hrs</Text>
            <Text className="text-gray-500 text-xs">Time</Text>
          </View>
          <View className="items-center">
            <Text className="font-bold">72,000</Text>
            <Text className="text-gray-500 text-xs">Steps</Text>
          </View>
          <View className="items-center">
            <Text className="font-bold">2,000m</Text>
            <Text className="text-gray-500 text-xs">Elevation</Text>
          </View>
        </View>

        {/* Image */}
        <Image
          source={{ uri: 'https://via.placeholder.com/400x200.png?text=Hiking+Map' }}
          className="w-full h-48 mt-3 rounded-xl"
        />

        {/* Actions */}
        <View className="flex-row justify-between mt-3 px-2">
          <View className="flex-row items-center space-x-1">
            <Ionicons name="heart-outline" size={20} color="green" />
            <Text>1.2k</Text>
          </View>
          <View className="flex-row items-center space-x-1">
            <Ionicons name="chatbubble-outline" size={20} color="green" />
            <Text>127</Text>
          </View>
          <View className="flex-row items-center space-x-1">
            <Ionicons name="share-outline" size={20} color="green" />
            <Text>27</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

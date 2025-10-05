import React from 'react';
import { View, Text, Image, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext'; // ✅ Import the useAuth hook

export default function ProfilePage({ navigation }) {
  // ✅ Get the user and loading state directly from the global context
  const { user, isLoading } = useAuth();

  // The loading state is now handled by the context
  if (isLoading) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#2E7D32" />
      </View>
    );
  }

  // If there's no user after loading, something is wrong (should be handled by App.js)
  if (!user) {
    // This is a fallback, as App.js should prevent this page from rendering if not logged in
    navigation.replace('Login');
    return null;
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
      
      {/* ... The rest of your JSX remains the same ... */}

    </ScrollView>
  );
}
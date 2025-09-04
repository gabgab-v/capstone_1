// apps/mobile/src/pages/SettingsPage.js
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export default function SettingsPage({ navigation }) {
  async function handleLogout() {
    await SecureStore.deleteItemAsync('jwt');
    navigation.replace('Login');
  }

  return (
    <View className="flex-1 bg-white px-6 py-8">
      <Text className="text-2xl font-bold mb-6">Settings</Text>

      {/* Add other settings options here */}

      <TouchableOpacity
        className="bg-red-600 px-6 py-3 rounded-xl mt-4"
        onPress={handleLogout}
      >
        <Text className="text-white font-semibold text-center">Logout</Text>
      </TouchableOpacity>
    </View>
  );
}

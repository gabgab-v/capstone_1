import React from 'react';
import { View, Text, Image, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { useTheme } from '../context/ThemeContext';

export default function AppHeader({ onSearchPress, onMenuPress }) {
  const { colors } = useTheme();

  return (
    <View className="flex-row items-center justify-between border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
      <View className="flex-row items-center">
        <Image
          source={require('../../assets/Pabukid-Logo.png')}
          className="mr-2 h-8 w-8"
        />
        <Text className="text-2xl font-bold text-green-600">Pabukid</Text>
      </View>
      <View className="flex-row items-center space-x-4">
        <TouchableOpacity
          onPress={onSearchPress}
          disabled={!onSearchPress}
          accessibilityRole="button"
          accessibilityLabel="Search profiles"
        >
          <Feather name="search" size={24} color={colors.icon} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onMenuPress}
          disabled={!onMenuPress}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
        >
          <Feather name="menu" size={24} color={colors.icon} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

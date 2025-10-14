import React from 'react';
import { View, Text, Image, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { useTheme } from '../context/ThemeContext';
import { ensureAvatarUri } from '../utils/media';

function getAvatarUri(user) {
  const identifier = user?.id ?? user?.email ?? 'guest';
  return ensureAvatarUri(user?.avatarUrl, identifier);
}

export default function CreatePost({ onPostPress, user }) {
  const { colors } = useTheme();

  return (
    <View className="border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
      <View className="flex-row items-center">
        <Image source={{ uri: getAvatarUri(user) }} className="h-10 w-10 rounded-full" />
        <TouchableOpacity onPress={onPostPress} className="mx-4 flex-1">
          <View className="rounded-full border border-gray-300 dark:border-slate-600 py-2 px-4">
            <Text className="text-gray-500 dark:text-slate-400">Share your adventure</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={onPostPress} className="mr-2">
          <Feather name="plus-square" size={26} color={colors.icon} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onPostPress}>
          <Feather name="image" size={26} color={colors.icon} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

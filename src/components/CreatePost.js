import React from 'react';
import { View, Text, Image, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';

function getAvatarUri(user) {
  if (user?.avatarUrl) {
    return user.avatarUrl;
  }
  const identifier = user?.id ?? 'guest';
  return `https://i.pravatar.cc/150?u=${encodeURIComponent(identifier)}`;
}

export default function CreatePost({ onPostPress, user }) {
  return (
    <View className="border-b border-gray-200 bg-white p-4">
      <View className="flex-row items-center">
        <Image source={{ uri: getAvatarUri(user) }} className="h-10 w-10 rounded-full" />
        <TouchableOpacity onPress={onPostPress} className="mx-4 flex-1">
          <View className="rounded-full border border-gray-300 py-2 px-4">
            <Text className="text-gray-500">Share your adventure</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={onPostPress} className="mr-2">
          <Feather name="plus-square" size={26} color="gray" />
        </TouchableOpacity>
        <TouchableOpacity onPress={onPostPress}>
          <Feather name="image" size={26} color="gray" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

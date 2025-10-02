import React from 'react';
import { View, Text, Image, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';

export default function CreatePost({ onPostPress, user }) {
  return (
    <View className="bg-white p-4 border-b border-gray-200">
      <View className="flex-row items-center">
        <Image
          // ✅ Use the actual user's avatar
          // ⚠️ Adjust 'avatarUrl' to whatever field your API returns for the user's image
          source={{ uri: user?.avatarUrl || 'https://i.pravatar.cc/150' }} 
          className="w-10 h-10 rounded-full"
        />
        <TouchableOpacity onPress={onPostPress} className="flex-1 mx-4">
          <View className="border border-gray-300 rounded-full py-2 px-4">
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
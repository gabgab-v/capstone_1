import React from 'react';
import { View, Text, Image, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';

export default function AppHeader() {
  return (
    <View className="flex-row items-center justify-between p-4 bg-white border-b border-gray-200">
      <View className="flex-row items-center">
        {/* Replace with your actual logo image */}
        <Image
          source={require('../../assets/icon.png')} // Make sure you have an icon in your assets
          className="w-8 h-8 mr-2"
        />
        <Text className="text-2xl font-bold text-green-600">Pabukid</Text>
      </View>
      <View className="flex-row items-center space-x-4">
        <TouchableOpacity>
          <Feather name="search" size={24} color="black" />
        </TouchableOpacity>
        <TouchableOpacity>
          <Feather name="menu" size={24} color="black" />
        </TouchableOpacity>
      </View>
    </View>
  );
}
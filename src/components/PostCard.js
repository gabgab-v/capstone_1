import React from 'react';
import { View, Text, Image, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';

// A small component for the action buttons (Like, Comment, Share)
const ActionButton = ({ iconName, count, color = 'gray' }) => (
  <TouchableOpacity className="flex-row items-center space-x-2">
    <Feather name={iconName} size={20} color={color} />
    <Text className="text-sm text-gray-600">{count}</Text>
  </TouchableOpacity>
);

// Component to render the photo grid based on the number of photos
const PhotoGrid = ({ photos }) => {
  if (!photos || photos.length === 0) {
    return null;
  }

  // Layout for 1 photo
  if (photos.length === 1) {
    return (
      <Image
        source={{ uri: photos[0] }}
        className="w-full h-64 mt-2 rounded-lg"
        resizeMode="cover"
      />
    );
  }

  // Layout for 2 photos
  if (photos.length === 2) {
    return (
      <View className="flex-row mt-2 space-x-1 h-48">
        <Image source={{ uri: photos[0] }} className="flex-1 h-full rounded-l-lg" resizeMode="cover" />
        <Image source={{ uri: photos[1] }} className="flex-1 h-full rounded-r-lg" resizeMode="cover" />
      </View>
    );
  }

  // Layout for 3+ photos (as in your design)
  return (
    <View className="flex-row mt-2 space-x-1 h-64">
      <Image
        source={{ uri: photos[0] }}
        className="flex-2 h-full rounded-l-lg"
        resizeMode="cover"
      />
      <View className="flex-1 space-y-1 h-full">
        <Image
          source={{ uri: photos[1] }}
          className="flex-1 w-full rounded-tr-lg"
          resizeMode="cover"
        />
        <Image
          source={{ uri: photos[2] }}
          className="flex-1 w-full rounded-br-lg"
          resizeMode="cover"
        />
      </View>
    </View>
  );
};


export default function PostCard({ post }) {
  return (
    <View className="bg-white mt-2 p-4">
      {/* Post Header */}
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center">
          <Image source={{ uri: post.avatar }} className="w-10 h-10 rounded-full" />
          <View className="ml-3">
            <Text className="font-bold">{post.name}</Text>
            <Text className="text-xs text-gray-500">{post.date}</Text>
          </View>
        </View>
        <TouchableOpacity>
          <Feather name="more-horizontal" size={24} color="gray" />
        </TouchableOpacity>
      </View>

      {/* Caption */}
      <Text className="my-2">{post.caption}</Text>

      {/* Photos */}
      <PhotoGrid photos={post.photos} />

      {/* Action Bar */}
      <View className="flex-row justify-around mt-4 pt-2 border-t border-gray-100">
        <ActionButton iconName="heart" count={post.likes} color="#4ade80" />
        <ActionButton iconName="message-circle" count={post.comments} />
        <ActionButton iconName="upload" count={post.shares} />
      </View>
    </View>
  );
}
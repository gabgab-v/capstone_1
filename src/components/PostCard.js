import React from 'react';
import { View, Text, Image, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';

const ActionButton = ({ iconName, label, color = 'gray' }) => (
  <TouchableOpacity className="flex-row items-center space-x-2">
    <Feather name={iconName} size={20} color={color} />
    <Text className="text-sm text-gray-600">{label}</Text>
  </TouchableOpacity>
);

const PhotoGrid = ({ photos }) => {
  if (!photos || photos.length === 0) {
    return null;
  }

  if (photos.length === 1) {
    return (
      <Image
        source={{ uri: photos[0] }}
        className="mt-2 h-64 w-full rounded-lg"
        resizeMode="cover"
      />
    );
  }

  if (photos.length === 2) {
    return (
      <View className="mt-2 h-48 flex-row space-x-1">
        <Image
          source={{ uri: photos[0] }}
          className="h-full flex-1 rounded-l-lg"
          resizeMode="cover"
        />
        <Image
          source={{ uri: photos[1] }}
          className="h-full flex-1 rounded-r-lg"
          resizeMode="cover"
        />
      </View>
    );
  }

  return (
    <View className="mt-2 h-64 flex-row space-x-1">
      <Image
        source={{ uri: photos[0] }}
        className="h-full flex-2 rounded-l-lg"
        resizeMode="cover"
      />
      <View className="h-full flex-1 space-y-1">
        <Image
          source={{ uri: photos[1] }}
          className="flex-1 rounded-tr-lg"
          resizeMode="cover"
        />
        <Image
          source={{ uri: photos[2] }}
          className="flex-1 rounded-br-lg"
          resizeMode="cover"
        />
      </View>
    </View>
  );
};

function getAuthorName(post) {
  const name = post?.author?.name;
  if (name && name.trim().length > 0) {
    return name;
  }
  const email = post?.author?.email;
  if (email && email.includes('@')) {
    return email.split('@')[0];
  }
  return 'Explorer';
}

function getAvatarUri(post) {
  const sourceId = post?.author?.id ?? post?.id ?? Math.random().toString(36).slice(2);
  return `https://i.pravatar.cc/150?u=${encodeURIComponent(sourceId)}`;
}

function formatPostDate(value) {
  if (!value) {
    return '';
  }
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export default function PostCard({ post }) {
  const authorName = getAuthorName(post);
  const createdAt = formatPostDate(post?.createdAt);
  const caption = post?.content ?? '';
  const photos = post?.imageUrls ?? [];

  return (
    <View className="mt-2 bg-white p-4">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center">
          <Image source={{ uri: getAvatarUri(post) }} className="h-10 w-10 rounded-full" />
          <View className="ml-3">
            <Text className="font-bold">{authorName}</Text>
            {createdAt ? <Text className="text-xs text-gray-500">{createdAt}</Text> : null}
          </View>
        </View>
        <TouchableOpacity>
          <Feather name="more-horizontal" size={24} color="gray" />
        </TouchableOpacity>
      </View>

      {caption ? <Text className="my-2">{caption}</Text> : null}

      <PhotoGrid photos={photos} />

      <View className="mt-4 flex-row justify-around border-t border-gray-100 pt-2">
        <ActionButton iconName="heart" label="Like" color="#4ade80" />
        <ActionButton iconName="message-circle" label="Comment" />
        <ActionButton iconName="upload" label="Share" />
      </View>
    </View>
  );
}

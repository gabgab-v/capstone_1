import React from "react";
import { View, Text, Image, TouchableOpacity } from "react-native";
import Icon from "react-native-vector-icons/Feather";

export default function PostCard({ post }) {
  return (
    <View className="bg-white pt-3">
      {/* ‑‑‑ User row ‑‑‑ */}
      <View className="flex-row items-center px-3">
        <Image
          source={{ uri: post.avatar }}
          className="w-8 h-8 rounded-full mr-2 border border-green-700"
        />
        <View className="flex-1">
          <Text className="font-semibold text-sm">{post.name}</Text>
          <Text className="text-[10px] text-gray-500">{post.date}</Text>
        </View>
        <Icon name="more-horizontal" size={20} color="#4B5563" />
      </View>

      {/* ‑‑‑ Caption ‑‑‑ */}
      <Text className="px-3 mt-1 text-sm">{post.caption}</Text>

      {/* ‑‑‑ 2x2 Image grid ‑‑‑ */}
      <View className="flex-row flex-wrap mt-2">
        {post.photos.slice(0, 4).map((uri, idx) => (
          <View key={idx} className="w-1/2 h-40 p-[1px]">
            <Image
              source={{ uri }}
              className="w-full h-full"
              resizeMode="cover"
            />
            {idx === 3 && post.photos.length > 4 && (
              <View className="absolute inset-0 bg-black/40 items-center justify-center">
                <Text className="text-white font-bold text-xl">
                  +{post.photos.length - 3}
                </Text>
              </View>
            )}
          </View>
        ))}
      </View>

      {/* ‑‑‑ Action bar ‑‑‑ */}
      <View className="flex-row justify-between px-4 py-3">
        <Action icon="heart" value={post.likes} />
        <Action icon="message-circle" value={post.comments} />
        <Action icon="share" value={post.shares} />
      </View>

      <View className="h-[1px] bg-gray-200 mx-3" />
    </View>
  );
}

function Action({ icon, value }) {
  return (
    <View className="flex-row items-center space-x-1">
      <Icon name={icon} size={18} color="#4B5563" />
      <Text className="text-xs">{value}</Text>
    </View>
  );
}

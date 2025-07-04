import React from "react";
import { View, Text, Image, TouchableOpacity } from "react-native";
import Icon from "react-native-vector-icons/Feather";

export default function AppHeader() {
  return (
    <View className="flex-row items-center justify-between px-3 py-2 bg-white">
      <View className="flex-row items-center">
        <Image
          source={require("../../assets/favicon.png")}
          className="w-8 h-8 mr-2"
        />
        <Text className="text-green-700 font-extrabold text-xl">Pabukid</Text>
      </View>

      <View className="flex-row space-x-4">
        <TouchableOpacity>
          <Icon name="search" size={22} color="#2E7D32" />
        </TouchableOpacity>
        <TouchableOpacity>
          <Icon name="menu" size={22} color="#2E7D32" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

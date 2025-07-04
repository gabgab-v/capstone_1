import React from "react";
import { FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AppHeader from "../components/AppHeader";
import PostCard from "../components/PostCard";



/* Demo data – replace with API later */
const DATA = [
  {
    id: 1,
    name: "Lisa Delacruz",
    avatar: "https://i.pravatar.cc/150?img=47",
    date: "May 23, 2025",
    caption: "Mount Apo is one of the most popular hiking destination in Mindanao!!",
    photos: [
      "https://picsum.photos/seed/apo1/640/640",
      "https://picsum.photos/seed/apo2/640/640",
      "https://picsum.photos/seed/apo3/640/640",
      "https://picsum.photos/seed/apo4/640/640",
      "https://picsum.photos/seed/apo5/640/640",
    ],
    likes: "1.2k",
    comments: 127,
    shares: 27,
  },
  /* …more posts */
];

export default function HomePage() {
  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-gray-100">
      <AppHeader />

      <FlatList
        data={DATA}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => <PostCard post={item} />}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

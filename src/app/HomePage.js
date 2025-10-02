import React, { useState } from "react";
import { FlatList, View, Modal, Text, TextInput, Image, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AppHeader from "../components/AppHeader";
import PostCard from "../components/PostCard";
import CreatePost from "../components/CreatePost";
import * as ImagePicker from 'expo-image-picker';
import { AntDesign } from '@expo/vector-icons';

/* Initial Demo data */
const INITIAL_DATA = [
  {
    id: "2",
    name: "Gabriel Rival",
    avatar: "https://i.pravatar.cc/150?img=32",
    date: "May 10, 2025",
    caption: "Just conquered the Boulder Face of Mt. Apo. Unreal views and pure grit!",
    photos: [
      "https://picsum.photos/seed/grival1/640/640",
      "https://picsum.photos/seed/grival2/640/640",
      "https://picsum.photos/seed/grival3/640/640",
    ],
    likes: "2.1k",
    comments: 150,
    shares: 45,
  },
  {
    id: "1",
    name: "Jekey Parantar",
    avatar: "https://i.pravatar.cc/150?img=47",
    date: "May 10, 2025",
    caption: "Mount Apo is one of the most popular hiking destination in Mindanao!!",
    photos: [
      "https://picsum.photos/seed/apo1/640/640",
      "https://picsum.photos/seed/apo2/640/640",
      "https://picsum.photos/seed/apo3/640/640",
    ],
    likes: "1.2k",
    comments: 127,
    shares: 27,
  },
];

// The modal for creating a post now accepts the `user` prop
const CreatePostModal = ({ visible, onClose, onPost, user }) => {
    const [caption, setCaption] = useState('');
    const [images, setImages] = useState([]);

    const pickImage = async () => {
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 1,
            allowsMultipleSelection: true,
        });

        if (!result.canceled) {
            setImages(result.assets.map(asset => asset.uri));
        }
    };

    const handlePost = () => {
        if(caption.trim() === '' && images.length === 0) return;
        
        const newPost = {
            id: Date.now().toString(),
            // ✅ Use the actual user's data here!
            name: user?.name || "Anonymous", 
            avatar: user?.avatarUrl || "https://i.pravatar.cc/150", // ⚠️ Adjust 'avatarUrl' to your API's field name
            date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2025' }),
            caption: caption,
            photos: images,
            likes: "0",
            comments: 0,
            shares: 0,
        };
        onPost(newPost);
        setCaption('');
        setImages([]);
        onClose();
    };

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <SafeAreaView className="flex-1">
                <View className="p-4 flex-row justify-between items-center border-b border-gray-200">
                    <TouchableOpacity onPress={onClose}>
                         <AntDesign name="close" size={24} color="black" />
                    </TouchableOpacity>
                    <Text className="text-lg font-bold">Create Post</Text>
                    <TouchableOpacity 
                        className={`py-1 px-4 rounded-full ${caption.trim() || images.length > 0 ? 'bg-green-500' : 'bg-gray-300'}`}
                        onPress={handlePost}
                        disabled={!caption.trim() && images.length === 0}
                    >
                        <Text className="text-white font-bold">Post</Text>
                    </TouchableOpacity>
                </View>
                <View className="p-4">
                    <TextInput
                        placeholder={`What's on your mind, ${user?.name || ''}?`}
                        value={caption}
                        onChangeText={setCaption}
                        multiline
                        className="text-lg"
                    />
                    <TouchableOpacity onPress={pickImage} className="mt-4 py-2 px-4 bg-gray-200 rounded-lg self-start">
                        <Text>Add Photos</Text>
                    </TouchableOpacity>
                    <ScrollView horizontal className="mt-4">
                        {images.map((uri, index) => (
                            <Image key={index} source={{ uri }} className="w-24 h-24 rounded-lg mr-2" />
                        ))}
                    </ScrollView>
                </View>
            </SafeAreaView>
        </Modal>
    );
};


// The main component now accepts the `user` prop
export default function HomePage({ user }) {
  const [posts, setPosts] = useState(INITIAL_DATA);
  const [isModalVisible, setModalVisible] = useState(false);

  const handleCreatePost = (newPost) => {
    setPosts([newPost, ...posts]);
  };

  return (
    // The SafeAreaView no longer needs edges=["bottom"] because the tab navigator handles it.
    <SafeAreaView edges={["top"]} className="flex-1 bg-gray-100">
      <AppHeader />

      <FlatList
        data={posts}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => <PostCard post={item} />}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={<CreatePost user={user} onPostPress={() => setModalVisible(true)} />}
      />

      <CreatePostModal 
        visible={isModalVisible}
        onClose={() => setModalVisible(false)}
        onPost={handleCreatePost}
        user={user} // Pass user to the modal
      />

      {/* NO BOTTOM NAV COMPONENT HERE ANYMORE */}
    </SafeAreaView>
  );
}
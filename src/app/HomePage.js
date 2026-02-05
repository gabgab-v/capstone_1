import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  Platform,
  View,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { decode } from "base64-arraybuffer";
import { AntDesign, Feather } from "@expo/vector-icons";

import AppHeader from "../components/AppHeader";
import PostCard from "../components/PostCard";
import CreatePost from "../components/CreatePost";
import PostVisibilityPicker from "../components/PostVisibilityPicker";
import { get, post as postRequest } from "../lib/api";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../lib/supabase";
import { POST_VISIBILITY, getPostVisibilityOption } from "../constants/postVisibility";
import { getCachedValue, setCachedValue } from "../utils/offlineCache";

const MAX_IMAGES = 5;
const POSTS_CACHE_KEY = "home-posts";

const CreatePostModal = ({ visible, onClose, onSubmit, user }) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [caption, setCaption] = useState("");
  const [images, setImages] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [visibility, setVisibility] = useState(POST_VISIBILITY.PUBLIC);
  const [pickerVisible, setPickerVisible] = useState(false);
  const selectedVisibility = useMemo(
    () => getPostVisibilityOption(visibility),
    [visibility],
  );

  const canPost = caption.trim().length > 0 || images.length > 0;
  const contentPaddingBottom = Math.max(24, insets.bottom + 16);

  const handleClose = useCallback(() => {
    if (isSubmitting) {
      return;
    }
    setPickerVisible(false);
    onClose();
  }, [isSubmitting, onClose]);

  const pickImage = useCallback(async () => {
    if (images.length >= MAX_IMAGES) {
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Please allow photo library access to share images.");
      return;
    }

    const availableSlots = Math.max(MAX_IMAGES - images.length, 1);


    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, // Correct enum and not an array
      quality: 1,
      allowsMultipleSelection: true,
      selectionLimit: availableSlots,
      base64: true,
    });

    if (result.canceled) {
      return;
    }

    const selectedAssets = result.assets.slice(0, availableSlots);

    try {
      const preparedImages = await Promise.all(
        selectedAssets.map(async (asset) => {
          let base64 = asset.base64 ?? null;

          if (!base64 && FileSystem.readAsStringAsync) {
            try {
              base64 = await FileSystem.readAsStringAsync(asset.uri, {
                encoding: "base64",
              });
            } catch (fsError) {
              if (Platform.OS !== "web") {
                throw fsError;
              }
            }
          }

          if (!base64) {
            throw new Error("Unable to process the selected image.");
          }

          return {
            uri: asset.uri,
            base64,
            mimeType: asset.mimeType ?? "image/jpeg",
          };
        }),
      );

      setImages((prev) => [...prev, ...preparedImages]);
    } catch (error) {
      console.error("Image processing error:", error);
      Alert.alert("Image error", "Failed to process one of the selected images.");
    }
  }, [images.length]);

  const handleRemoveImage = useCallback((index) => {
    setImages((prev) => prev.filter((_, idx) => idx !== index));
  }, []);

  const handlePost = useCallback(async () => {
    if (!canPost || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        caption: caption.trim(),
        images,
        visibility,
      });
      setCaption("");
      setImages([]);
      setPickerVisible(false);
      onClose();
    } catch (error) {
      console.error("Post creation failed:", error);
      Alert.alert("Post failed", error.message ?? "Unable to publish your post.");
    } finally {
      setIsSubmitting(false);
    }
  }, [canPost, caption, images, isSubmitting, onClose, onSubmit]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <SafeAreaView className="flex-1 bg-white dark:bg-slate-950">
        <View className="flex-row items-center justify-between border-b border-gray-200 dark:border-slate-700 p-4">
          <TouchableOpacity onPress={handleClose} disabled={isSubmitting}>
            <AntDesign name="close" size={24} color={colors.icon} />
          </TouchableOpacity>
          <Text className="text-lg font-bold text-slate-900 dark:text-slate-100">Create Post</Text>
          <TouchableOpacity
            className={`rounded-full py-1 px-4 ${
              canPost ? "bg-green-500 dark:bg-green-600" : "bg-gray-300 dark:bg-slate-700"
            }`}
            onPress={handlePost}
            disabled={!canPost || isSubmitting}
          >
            <Text className="font-bold text-white">{isSubmitting ? "Posting..." : "Post"}</Text>
          </TouchableOpacity>
        </View>
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, paddingBottom: contentPaddingBottom }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <TextInput
              placeholder={`What's on your mind, ${user?.name || "explorer"}?`}
              value={caption}
              onChangeText={setCaption}
              multiline
              className="text-lg"
              placeholderTextColor={colors.textMuted}
              style={{ color: colors.textPrimary, minHeight: 140, textAlignVertical: "top" }}
            />
            <TouchableOpacity
              onPress={() => setPickerVisible(true)}
              className="mt-4 flex-row items-center justify-between rounded-2xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-3 py-3"
            >
              <View className="flex-row items-center">
                <View className="mr-3 rounded-full bg-white dark:bg-slate-700 p-2">
                  <Feather name={selectedVisibility.icon} size={18} color={colors.accent} />
                </View>
                <View>
                  <Text className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                    {selectedVisibility.label}
                  </Text>
                  <Text className="text-xs text-gray-500 dark:text-slate-400">
                    {selectedVisibility.description}
                  </Text>
                </View>
              </View>
              <Feather name="chevron-down" size={18} color={colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={pickImage}
              className="mt-4 self-start rounded-lg bg-gray-200 dark:bg-slate-700 py-2 px-4"
              disabled={images.length >= MAX_IMAGES || isSubmitting}
            >
              <Text className="text-slate-900 dark:text-slate-100">{images.length >= MAX_IMAGES ? "Maximum photos added" : "Add photos"}</Text>
            </TouchableOpacity>
            <ScrollView horizontal className="mt-4" showsHorizontalScrollIndicator={false}>
              {images.map((image, index) => (
                <TouchableOpacity
                  key={image.uri}
                  onPress={() => handleRemoveImage(index)}
                  disabled={isSubmitting}
                  className="mr-2"
                >
                  <Image source={{ uri: image.uri }} className="h-24 w-24 rounded-lg" />
                  <Text className="mt-1 text-center text-xs text-gray-500 dark:text-slate-400">
                    Tap to remove
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </ScrollView>
        </KeyboardAvoidingView>
        <PostVisibilityPicker
          visible={pickerVisible}
          value={visibility}
          onSelect={setVisibility}
          onClose={() => setPickerVisible(false)}
        />
      </SafeAreaView>
    </Modal>
  );
};

export default function HomePage({ user, navigation }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isModalVisible, setModalVisible] = useState(false);

  const handleOpenSearch = useCallback(() => {
    if (navigation?.navigate) {
      navigation.navigate('AccountSearch');
    }
  }, [navigation]);

  const fetchPosts = useCallback(async () => {
    try {
      const data = await get("/api/posts");
      const normalized = Array.isArray(data) ? data : [];
      setPosts(normalized);
      await setCachedValue(POSTS_CACHE_KEY, normalized);
    } catch (error) {
      console.error("Failed to load posts:", error);
      const cached = await getCachedValue(POSTS_CACHE_KEY);
      if (cached?.data && Array.isArray(cached.data)) {
        setPosts(cached.data);
      } else {
        Alert.alert("Posts unavailable", "Unable to load the latest posts. Please try again.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const cached = await getCachedValue(POSTS_CACHE_KEY);
      if (!isMounted) {
        return;
      }
      if (cached?.data && Array.isArray(cached.data) && cached.data.length > 0) {
        setPosts(cached.data);
        setLoading(false);
      }
    })();
    fetchPosts();
    return () => {
      isMounted = false;
    };
  }, [fetchPosts]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchPosts();
  }, [fetchPosts]);

  const handleCreatePost = useCallback(
    async ({ caption, images, visibility }) => {
      const trimmedCaption = caption?.trim?.() ?? "";

      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        throw new Error("Your session expired. Please sign in again.");
      }

      const uploadedUrls = [];

      for (let index = 0; index < images.length; index += 1) {
        const image = images[index];
        if (!image?.base64) {
          continue;
        }

        const extension = image.mimeType?.split("/")[1] ?? "jpg";
        const extensionParts = extension.split("+");
        const safeExtension = extensionParts[extensionParts.length - 1] || "jpg";
        const fileName = `posts/${authUser.id}-${Date.now()}-${index}.${safeExtension}`;

        const { data, error } = await supabase.storage
          .from("Capstone")
          .upload(fileName, decode(image.base64), {
            contentType: image.mimeType ?? "image/jpeg",
            upsert: false,
          });

        if (error) {
          console.error("Supabase upload error:", error);
          throw new Error("Failed to upload one of your photos. Please try again.");
        }

        const { data: publicData } = supabase.storage.from("Capstone").getPublicUrl(data.path);
        if (publicData?.publicUrl) {
          uploadedUrls.push(publicData.publicUrl);
        }
      }

      const createdPost = await postRequest("/api/posts", {
        content: trimmedCaption,
        imageUrls: uploadedUrls,
        visibility: visibility ?? POST_VISIBILITY.PUBLIC,
      });

      setPosts((current) => {
        const next = [createdPost, ...current];
        setCachedValue(POSTS_CACHE_KEY, next).catch((cacheError) => {
          console.warn("Failed to cache posts:", cacheError?.message || cacheError);
        });
        return next;
      });
    },
    [],
  );

  const handlePostUpdated = useCallback((updatedPost) => {
    if (!updatedPost?.id) {
      return;
    }
    setPosts((current) => {
      const next = current.map((existing) =>
        existing.id === updatedPost.id ? updatedPost : existing,
      );
      setCachedValue(POSTS_CACHE_KEY, next).catch((cacheError) => {
        console.warn("Failed to cache posts:", cacheError?.message || cacheError);
      });
      return next;
    });
  }, []);

  const handlePostDeleted = useCallback((postId) => {
    if (!postId) {
      return;
    }
    setPosts((current) => {
      const next = current.filter((post) => post.id !== postId);
      setCachedValue(POSTS_CACHE_KEY, next).catch((cacheError) => {
        console.warn("Failed to cache posts:", cacheError?.message || cacheError);
      });
      return next;
    });
  }, []);

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-gray-100 dark:bg-slate-950">
      <AppHeader onSearchPress={handleOpenSearch} />

      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PostCard post={item} onPostUpdated={handlePostUpdated} onPostDeleted={handlePostDeleted} />
        )}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={<CreatePost user={user} onPostPress={() => setModalVisible(true)} />}
        ListEmptyComponent={
          <View className="items-center justify-center py-10">
            {loading ? (
              <ActivityIndicator size="large" color="#2E7D32" />
            ) : (
              <Text className="text-gray-500 dark:text-slate-400">No posts have been shared yet.</Text>
            )}
          </View>
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={posts.length === 0 ? { flexGrow: 1 } : undefined}
      />

      <CreatePostModal
        visible={isModalVisible}
        onClose={() => setModalVisible(false)}
        onSubmit={handleCreatePost}
        user={user}
      />
    </SafeAreaView>
  );
}

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';

import { useAuth } from '../context/AuthContext';
import PostCard from '../components/PostCard';
import { BASE_URL, get, post, patch, postFormData, del as deleteRequest } from '../lib/api';

function getAvatarUri(profile) {
  if (!profile) {
    return 'https://via.placeholder.com/100';
  }

  if (profile.avatarUrl) {
    return profile.avatarUrl;
  }

  const seed = profile.id ?? profile.email ?? 'profile';
  return `https://i.pravatar.cc/150?u=${encodeURIComponent(seed)}`;
}

function StatTile({ label, value, onPress }) {
  return (
    <TouchableOpacity
      disabled={!onPress}
      onPress={onPress}
      className="flex-1 items-center rounded-lg py-2"
    >
      <Text className="text-lg font-bold text-gray-900">{value ?? 0}</Text>
      <Text className="text-xs uppercase text-gray-500">{label}</Text>
    </TouchableOpacity>
  );
}

function InfoRow({ label, value }) {
  return (
    <View className="mb-3">
      <Text className="text-xs font-semibold uppercase text-gray-400">{label}</Text>
      <Text className="mt-1 text-sm text-gray-800">{value ?? 'Not set'}</Text>
    </View>
  );
}

export default function ProfilePage({ navigation, route }) {
  const { user: authUser, isLoading: authLoading, refreshUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [followUpdating, setFollowUpdating] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const profileRef = useRef(null);
  const profileOwnerIdRef = useRef(null);

  const routeUserId = route?.params?.userId;
  const viewedUserId = useMemo(() => {
    if (routeUserId && routeUserId !== 'me') {
      return routeUserId;
    }
    return authUser?.id ?? null;
  }, [authUser?.id, routeUserId]);

  const isOwnProfile = profile ? profile.isSelf ?? authUser?.id === profile.id : authUser?.id === viewedUserId;

  useEffect(() => {
    if (!viewedUserId) {
      profileOwnerIdRef.current = null;
      profileRef.current = null;
      setProfile(null);
      setPosts([]);
      return;
    }

    if (profileOwnerIdRef.current && profileOwnerIdRef.current !== viewedUserId) {
      profileOwnerIdRef.current = null;
      profileRef.current = null;
      setProfile(null);
      setPosts([]);
      setLoading(true);
    }
  }, [viewedUserId]);

  const fetchProfile = useCallback(
    async ({ useRefresh = false } = {}) => {
      if (!viewedUserId) {
        return;
      }

      const existingProfile = profileRef.current;
      const isDifferentUser =
        profileOwnerIdRef.current && profileOwnerIdRef.current !== viewedUserId;

      let shouldHandleLoading = false;
      if (useRefresh) {
        setRefreshing(true);
      } else if (!existingProfile || isDifferentUser) {
        shouldHandleLoading = true;
        setLoading(true);
      }

      try {
        const data = await get(`/api/users/${viewedUserId}?includePosts=true`);
        const formattedProfile = {
          ...data,
          followersCount: data.followersCount ?? 0,
          followingCount: data.followingCount ?? 0,
          postCount: data.postCount ?? (Array.isArray(data.posts) ? data.posts.length : 0),
        };

        profileOwnerIdRef.current = formattedProfile.id;
        profileRef.current = formattedProfile;

        setProfile(formattedProfile);
        setPosts(Array.isArray(data.posts) ? data.posts : []);
      } catch (error) {
        console.error('Failed to load profile:', error);
        Alert.alert('Profile unavailable', error?.message ?? 'Unable to load this profile right now.');
      } finally {
        if (useRefresh) {
          setRefreshing(false);
        }
        if (shouldHandleLoading) {
          setLoading(false);
        }
      }
    },
    [viewedUserId],
  );

  useFocusEffect(
    useCallback(() => {
      fetchProfile({ useRefresh: false });
    }, [fetchProfile]),
  );

  const handleRefresh = useCallback(() => {
    fetchProfile({ useRefresh: true });
  }, [fetchProfile]);

  const handleFollowToggle = useCallback(async () => {
    if (!profile || isOwnProfile || followUpdating) {
      return;
    }

    setFollowUpdating(true);
    try {
      const endpoint = `/api/users/${profile.id}/follow`;
      const result = profile.isFollowing
        ? await deleteRequest(endpoint)
        : await post(endpoint, {});

      setProfile((current) => {
        if (!current) {
          return current;
        }

        const updated = {
          ...current,
          followersCount:
            typeof result?.followersCount === 'number'
              ? result.followersCount
              : current.followersCount,
          followingCount:
            typeof result?.followingCount === 'number'
              ? result.followingCount
              : current.followingCount,
          isFollowing:
            typeof result?.isFollowing === 'boolean' ? result.isFollowing : !current.isFollowing,
        };

        profileRef.current = updated;
        return updated;
      });

      if (typeof result?.viewerFollowingCount === 'number' && refreshUser) {
        refreshUser();
      }
    } catch (error) {
      console.error('Failed to update follow state:', error);
      Alert.alert('Something went wrong', error?.message ?? 'Unable to update follow status.');
    } finally {
      setFollowUpdating(false);
    }
  }, [followUpdating, isOwnProfile, profile, refreshUser]);

  const handleAvatarPress = useCallback(async () => {
    if (!isOwnProfile || avatarUploading) {
      return;
    }

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission?.granted) {
        Alert.alert(
          'Permission needed',
          'We need access to your photos so you can choose a profile picture.',
        );
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (pickerResult.canceled) {
        return;
      }

      const asset = pickerResult.assets?.[0];
      if (!asset?.uri) {
        Alert.alert('Upload canceled', 'No image was selected.');
        return;
      }

      setAvatarUploading(true);

      const fileName =
        asset.fileName ?? asset.uri.split('/').pop() ?? `avatar-${Date.now()}.jpg`;
      const mimeType =
        asset.mimeType ?? (asset.type?.startsWith('image/') ? asset.type : 'image/jpeg');

      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        name: fileName,
        type: mimeType,
      });

      const uploadResponse = await postFormData('/api/upload', formData);
      const uploadedUrl = uploadResponse?.url;
      if (!uploadedUrl) {
        throw new Error('Upload did not return a file URL.');
      }

      const absoluteUrl = uploadedUrl.startsWith('http')
        ? uploadedUrl
        : `${BASE_URL}${uploadedUrl}`;

      await patch('/api/users/me', { avatarUrl: absoluteUrl });

      profileRef.current = profileRef.current
        ? { ...profileRef.current, avatarUrl: absoluteUrl }
        : profileRef.current;
      setProfile((current) => (current ? { ...current, avatarUrl: absoluteUrl } : current));

      if (refreshUser) {
        await refreshUser();
      }

      Alert.alert('Profile updated', 'Your profile picture has been updated.');
    } catch (error) {
      console.error('Failed to update avatar:', error);
      const message =
        error?.body?.error ||
        error?.message ||
        'Unable to update your profile picture right now.';
      Alert.alert('Upload failed', message);
    } finally {
      setAvatarUploading(false);
    }
  }, [avatarUploading, isOwnProfile, refreshUser]);

  if (authLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#2E7D32" />
      </View>
    );
  }

  if (!authUser) {
    navigation.replace('Login');
    return null;
  }

  if (!viewedUserId) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#2E7D32" />
      </View>
    );
  }

  if (loading && !profile) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#2E7D32" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-center text-base text-gray-500">
          We could not find this profile. Please try again later.
        </Text>
      </View>
    );
  }

  const preferenceItems = [
    { label: 'Experience Level', value: profile.experienceLevel },
    { label: 'Preferred Difficulty', value: profile.preferredDifficulty },
    { label: 'Preferred Trail Type', value: profile.preferredTrailType },
    {
      label: 'Preferred Duration (hrs)',
      value: profile.preferredDurationHrs ? `${profile.preferredDurationHrs} hr` : null,
    },
    { label: 'Budget Range', value: profile.budgetRange },
  ].filter((item) => item.value);

  const renderHeader = () => (
    <View className="bg-white pb-6">
      <View className="flex-row items-center justify-between px-4 pt-4">
        {navigation.canGoBack() ? (
          <TouchableOpacity onPress={() => navigation.goBack()} className="rounded-full p-1">
            <Ionicons name="chevron-back" size={22} color="#111827" />
          </TouchableOpacity>
        ) : (
          <Text className="text-lg font-semibold text-gray-900">Hiker</Text>
        )}
        <View className="flex-row items-center space-x-4">
          {isOwnProfile ? (
            <>
              <Ionicons name="notifications-outline" size={24} color="#16a34a" />
              <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
                <Ionicons name="settings-outline" size={24} color="#16a34a" />
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      </View>

      <View className="mt-4 items-center px-4">
        <View className="relative">
          <TouchableOpacity
            onPress={handleAvatarPress}
            disabled={!isOwnProfile || avatarUploading}
            activeOpacity={0.7}
          >
            <Image
              source={{ uri: getAvatarUri(profile) }}
              className="h-24 w-24 rounded-full border-2 border-gray-200"
            />
          </TouchableOpacity>
          {isOwnProfile ? (
            <View className="absolute -bottom-1 -right-1 rounded-full bg-green-600 p-1.5">
              <Ionicons name="camera" size={14} color="#fff" />
            </View>
          ) : null}
          {avatarUploading ? (
            <View className="absolute inset-0 items-center justify-center rounded-full bg-black/40">
              <ActivityIndicator size="small" color="#fff" />
            </View>
          ) : null}
        </View>
        {isOwnProfile ? (
          <Text className="mt-2 text-xs text-gray-500">Tap to update photo</Text>
        ) : null}
        <Text className="mt-3 text-xl font-bold text-gray-900">
          {profile.name ?? profile.email ?? 'Explorer'}
        </Text>
        {profile.bio ? (
          <Text className="mt-1 text-center text-sm text-gray-500">{profile.bio}</Text>
        ) : null}

        <View className="mt-4 flex-row items-center justify-between rounded-2xl bg-gray-50 px-3 py-2">
          <StatTile label="Posts" value={profile.postCount ?? posts.length} />
          <StatTile label="Followers" value={profile.followersCount} />
          <StatTile label="Following" value={profile.followingCount} />
        </View>

        {isOwnProfile ? (
          <TouchableOpacity
            onPress={() => navigation.navigate('Settings')}
            className="mt-4 w-full rounded-full border border-green-600 py-2"
          >
            <Text className="text-center font-semibold text-green-600">Edit Profile</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={handleFollowToggle}
            disabled={followUpdating}
            className={`mt-4 w-full rounded-full py-2 ${
              profile.isFollowing ? 'border border-green-600 bg-white' : 'bg-green-600'
            }`}
          >
            <Text
              className={`text-center font-semibold ${
                profile.isFollowing ? 'text-green-600' : 'text-white'
              }`}
            >
              {followUpdating ? 'Updating…' : profile.isFollowing ? 'Following' : 'Follow'}
            </Text>
          </TouchableOpacity>
        )}

        <View className="mt-6 w-full rounded-2xl border border-gray-100 bg-gray-50 p-4">
          <Text className="text-sm font-semibold text-gray-700">Trail Preferences</Text>
          {preferenceItems.length > 0 ? (
            preferenceItems.map((item) => (
              <InfoRow key={item.label} label={item.label} value={item.value} />
            ))
          ) : (
            <Text className="mt-2 text-sm text-gray-500">No preferences shared yet.</Text>
          )}
        </View>
      </View>

      <View className="mt-6 px-4">
        <Text className="text-base font-semibold text-gray-800">Recent Posts</Text>
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-gray-100">
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <PostCard post={item} />}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          !loading ? (
            <View className="items-center justify-center px-4 py-12">
              <Text className="text-center text-sm text-gray-500">
                {isOwnProfile
                  ? "You haven't shared any posts yet."
                  : 'No posts to show from this user yet.'}
              </Text>
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#2E7D32" />
        }
      />
    </View>
  );
}

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { decode } from 'base64-arraybuffer';

import { useAuth } from '../context/AuthContext';
import PostCard from '../components/PostCard';
import { get, post, patch, del as deleteRequest } from '../lib/api';
import { ensureAvatarUri } from '../utils/media';
import { supabase } from '../lib/supabase';

function getAvatarUri(profile) {
  const seed = profile?.id ?? profile?.email ?? 'profile';
  return ensureAvatarUri(profile?.avatarUrl, seed);
}

function StatTile({ label, value, onPress }) {
  return (
    <TouchableOpacity
      disabled={!onPress}
      onPress={onPress}
      className="flex-1 items-center rounded-lg py-2"
    >
      <Text className="text-lg font-bold text-gray-900 dark:text-slate-100">{value ?? 0}</Text>
      <Text className="text-xs uppercase text-gray-500 dark:text-slate-400">{label}</Text>
    </TouchableOpacity>
  );
}

function InfoRow({ label, value }) {
  return (
    <View className="mb-3">
      <Text className="text-xs font-semibold uppercase text-gray-400 dark:text-slate-500">{label}</Text>
      <Text className="mt-1 text-sm text-gray-800 dark:text-slate-100">{value ?? 'Not set'}</Text>
    </View>
  );
}

function RatingStars({ rating = 0, size = 16, editable = false, onSelect }) {
  return (
    <View className="flex-row items-center">
      {[1, 2, 3, 4, 5].map((value) => {
        const fillLevel = rating - value + 1;
        let iconName = 'star-outline';
        if (fillLevel >= 1) {
          iconName = 'star';
        } else if (fillLevel > 0 && !editable) {
          iconName = 'star-half';
        }
        const color = iconName === 'star' || iconName === 'star-half' ? '#f59e0b' : '#d1d5db';

        return (
          <TouchableOpacity
            key={value}
            onPress={() => {
              if (editable && onSelect) {
                onSelect(value);
              }
            }}
            activeOpacity={editable ? 0.7 : 1}
            disabled={!editable}
            className="pr-1"
          >
            <Ionicons name={iconName} size={size} color={color} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function useDebouncedValue(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handle);
  }, [value, delay]);

  return debouncedValue;
}

class ProfilePageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.handleRetry = this.handleRetry.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('ProfilePage crashed:', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  handleRetry() {
    this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (error) {
      const message =
        error?.message || 'Something went wrong while loading this profile.';
      return (
        <View className="flex-1 items-center justify-center bg-white px-6 dark:bg-slate-900">
          <Ionicons name="alert-circle" size={48} color="#dc2626" />
          <Text className="mt-4 text-center text-base font-semibold text-gray-900 dark:text-slate-100">
            Profile unavailable
          </Text>
          <Text className="mt-2 text-center text-sm text-gray-600 dark:text-slate-300">
            {message}
          </Text>
          <TouchableOpacity
            onPress={this.handleRetry}
            className="mt-4 w-full rounded-full bg-green-600 py-2"
            activeOpacity={0.8}
          >
            <Text className="text-center font-semibold text-white">Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

function ConnectionsModal({
  visible,
  type = 'followers',
  users = [],
  loading = false,
  query = '',
  onQueryChange,
  onClose,
  onSelectUser,
  onRefresh,
  bottomInset = 0,
  onTypeChange,
  totalCount = 0,
}) {
  const title = type === 'following' ? 'Following' : 'Followers';
  const placeholder =
    type === 'following' ? 'Search people you follow' : 'Search followers';
  const emptyTitle =
    type === 'following' ? 'Not following anyone yet' : 'No followers yet';
  const emptyDescription =
    type === 'following'
      ? 'Start following other hikers to see them here.'
      : 'When hikers follow this profile, they will appear here.';

  const connectionOptions = [
    { key: 'followers', label: 'Followers' },
    { key: 'following', label: 'Following' },
  ];
  const filteredCount = users.length;
  const totalLabel =
    type === 'following'
      ? `${totalCount} following`
      : `${totalCount} follower${totalCount === 1 ? '' : 's'}`;
  const filteredLabel =
    filteredCount !== totalCount
      ? `Showing ${filteredCount} result${filteredCount === 1 ? '' : 's'}`
      : null;

  const renderItem = ({ item }) => {
    const displayName = item?.name ?? item?.email ?? 'Explorer';
    const subtitle =
      item?.bio ??
      (item?.role === 'ORGANIZER' ? 'Organizer' : 'Hiker in the community');
    const avatarUri = ensureAvatarUri(item?.avatarUrl, item?.id ?? item?.email ?? 'user');
    return (
      <TouchableOpacity
        onPress={() => onSelectUser?.(item)}
        activeOpacity={0.85}
        className="mb-3 flex-row items-center rounded-2xl bg-gray-50 p-3 dark:bg-slate-800/70"
      >
        <Image
          source={{ uri: avatarUri }}
          className="h-12 w-12 rounded-full bg-gray-200 dark:bg-slate-700"
        />
        <View className="ml-3 flex-1">
          <Text className="text-base font-semibold text-gray-900 dark:text-slate-100">
            {displayName}
          </Text>
          <Text className="mt-1 text-xs text-gray-500 dark:text-slate-400" numberOfLines={2}>
            {subtitle || 'Explorer'}
          </Text>
        </View>
        {item?.role === 'ORGANIZER' ? (
          <View className="rounded-full bg-emerald-100 px-3 py-1 dark:bg-emerald-500/20">
            <Text className="text-[11px] font-semibold uppercase text-emerald-700 dark:text-emerald-200">
              Organizer
            </Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-black/40">
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View
          className="w-full rounded-t-3xl bg-white px-4 pt-4 pb-4 dark:bg-slate-900"
          style={{ maxHeight: '80%', paddingBottom: Math.max(bottomInset, 16) }}
        >
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-lg font-semibold text-gray-900 dark:text-slate-100">
              {title}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              className="rounded-full bg-gray-100 p-2 dark:bg-slate-800"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={18} color="#059669" />
            </TouchableOpacity>
        </View>

        <View className="mb-3 flex-row rounded-full bg-gray-100 p-1 dark:bg-slate-800">
            {connectionOptions.map((option) => {
              const isActive = type === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  onPress={() => onTypeChange?.(option.key)}
                  activeOpacity={0.85}
                  className={`flex-1 items-center rounded-full py-2 ${
                    isActive ? 'bg-white dark:bg-slate-900' : ''
                  }`}
                  style={
                    isActive
                      ? {
                          shadowColor: '#000',
                          shadowOpacity: 0.12,
                          shadowRadius: 6,
                          shadowOffset: { width: 0, height: 2 },
                          elevation: 2,
                        }
                      : null
                  }
                >
                  <Text
                    className={`text-sm font-semibold ${
                      isActive ? 'text-gray-900 dark:text-slate-100' : 'text-gray-500 dark:text-slate-400'
                    }`}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View className="mb-2 flex-row items-center justify-between px-1">
            <Text className="text-xs font-semibold text-gray-600 dark:text-slate-300">
              {totalLabel}
            </Text>
            {filteredLabel ? (
              <Text className="text-[11px] text-gray-400 dark:text-slate-500">{filteredLabel}</Text>
            ) : null}
          </View>

          <View className="mb-3 flex-row items-center rounded-full bg-gray-100 px-3 py-2 dark:bg-slate-800">
            <Ionicons name="search" size={16} color="#6b7280" />
            <TextInput
              className="ml-2 flex-1 text-sm text-gray-900 dark:text-slate-100"
              placeholder={placeholder}
              placeholderTextColor="#94a3b8"
              value={query}
              onChangeText={onQueryChange}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {query ? (
              <TouchableOpacity
                onPress={() => onQueryChange?.('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={16} color="#9ca3af" />
              </TouchableOpacity>
            ) : null}
          </View>

          <View className="flex-1">
            <FlatList
              data={users}
              keyExtractor={(item, index) => (item?.id ? String(item.id) : `connection-${index}`)}
              renderItem={renderItem}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 24 }}
              showsVerticalScrollIndicator={false}
              refreshing={loading}
              onRefresh={onRefresh}
              ListEmptyComponent={
                loading ? (
                  <View className="items-center justify-center py-12">
                    <ActivityIndicator size="small" color="#059669" />
                  </View>
                ) : (
                  <View className="items-center px-4 py-12">
                    <Text className="text-base font-semibold text-gray-900 dark:text-slate-100">
                      {emptyTitle}
                    </Text>
                    <Text className="mt-2 text-center text-sm text-gray-500 dark:text-slate-400">
                      {emptyDescription}
                    </Text>
                  </View>
                )
              }
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function ProfilePage(props) {
  const resetKey =
    props?.route?.params?.userId ??
    props?.route?.key ??
    props?.route?.name ??
    'Profile';

  return (
    <ProfilePageErrorBoundary resetKey={resetKey}>
      <ProfilePageContent {...props} />
    </ProfilePageErrorBoundary>
  );
}

const COMPLETION_IMAGE_PLACEHOLDER =
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=600&q=60';

const COMPLETION_STATUS_BADGES = {
  CONFIRMED: { label: 'Confirmed', background: '#DCFCE7', color: '#166534' },
  APPROVED: { label: 'Approved', background: '#E0F2FE', color: '#1D4ED8' },
};

function formatCompletionDate(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return null;
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function toTitleCase(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  const lower = trimmed.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function buildCompletionMetrics(completion) {
  const metrics = [];
  const distanceKm = Number(completion?.distanceKm);
  if (Number.isFinite(distanceKm) && distanceKm > 0) {
    metrics.push(`${distanceKm.toFixed(1)} km`);
  } else {
    const trailDistanceMeters = Number(completion?.trailDistanceMeters);
    if (Number.isFinite(trailDistanceMeters) && trailDistanceMeters > 0) {
      metrics.push(`${(trailDistanceMeters / 1000).toFixed(1)} km`);
    }
  }
  const durationHrs = Number(completion?.durationHrs);
  if (Number.isFinite(durationHrs) && durationHrs > 0) {
    metrics.push(`${durationHrs.toFixed(1)} hrs`);
  }
  const elevationM = Number(completion?.elevationM);
  if (Number.isFinite(elevationM) && elevationM > 0) {
    metrics.push(`${Math.round(elevationM)} m gain`);
  }
  if (completion?.trailType) {
    metrics.push(completion.trailType);
  } else if (completion?.difficulty) {
    const difficultyLabel = toTitleCase(completion.difficulty);
    if (difficultyLabel) {
      metrics.push(`${difficultyLabel} level`);
    }
  }

  return metrics;
}

function getCompletionBadge(status) {
  const normalized = typeof status === 'string' ? status.trim().toUpperCase() : '';
  if (COMPLETION_STATUS_BADGES[normalized]) {
    return COMPLETION_STATUS_BADGES[normalized];
  }
  if (!normalized) {
    return { label: 'Recorded', background: '#E5E7EB', color: '#374151' };
  }
  return { label: normalized, background: '#E5E7EB', color: '#374151' };
}

function CompletedTrailCard({ completion }) {
  if (!completion) {
    return null;
  }

  const badge = getCompletionBadge(completion.bookingStatus);
  const completionDateLabel = formatCompletionDate(completion.completedAt);
  const organizerName = completion?.organizer?.name ?? completion?.organizer?.email ?? null;
  const locationLabel =
    completion?.locationName ?? 'Location will be shared with confirmed hikers.';
  const metrics = buildCompletionMetrics(completion);
  const imageSource = completion?.imageUrl
    ? { uri: completion.imageUrl }
    : { uri: COMPLETION_IMAGE_PLACEHOLDER };

  return (
    <View className="mt-3 rounded-2xl border border-gray-100 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <View className="flex-row">
        <Image
          source={imageSource}
          resizeMode="cover"
          className="h-20 w-20 rounded-xl bg-gray-200 dark:bg-slate-800"
        />
        <View className="ml-3 flex-1">
          <View className="flex-row items-start justify-between">
            <Text className="flex-1 text-base font-semibold text-gray-900 dark:text-slate-100">
              {completion.title ?? 'Guided adventure'}
            </Text>
            <View
              className="ml-2 rounded-full px-2 py-0.5"
              style={{ backgroundColor: badge.background }}
            >
              <Text
                className="text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: badge.color }}
              >
                {badge.label}
              </Text>
            </View>
          </View>
          <Text className="mt-1 text-xs text-gray-500 dark:text-slate-400">
            {completionDateLabel ? `Completed ${completionDateLabel}` : 'Completion date to follow'}
          </Text>
          {organizerName ? (
            <Text className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
              Hosted by {organizerName}
            </Text>
          ) : null}
        </View>
      </View>
      <View className="mt-3 flex-row items-center">
        <Ionicons name="location-outline" size={14} color="#16a34a" />
        <Text className="ml-2 text-sm text-gray-800 dark:text-slate-200">{locationLabel}</Text>
      </View>
      {metrics.length ? (
        <View className="mt-3 flex-row flex-wrap">
          {metrics.map((metric, index) => (
            <View
              key={`${completion.id ?? completion.bookingId ?? 'metric'}-${metric}-${index}`}
              className="mr-2 mb-2 rounded-full bg-gray-100 px-3 py-1 dark:bg-slate-800"
            >
              <Text className="text-xs font-medium text-gray-700 dark:text-slate-200">
                {metric}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ProfilePageContent({ navigation, route }) {
  const { user: authUser, isLoading: authLoading, refreshUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [followUpdating, setFollowUpdating] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [chatStarting, setChatStarting] = useState(false);
  const [ratingDraft, setRatingDraft] = useState(0);
  const [feedbackDraft, setFeedbackDraft] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [deletingReview, setDeletingReview] = useState(false);
  const [connectionsVisible, setConnectionsVisible] = useState(false);
  const [connectionsType, setConnectionsType] = useState('followers');
  const [connectionsUsers, setConnectionsUsers] = useState([]);
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const [connectionsSearch, setConnectionsSearch] = useState('');
  const [connectionsTotalCount, setConnectionsTotalCount] = useState(0);
  const [connectionsRequestKey, setConnectionsRequestKey] = useState(0);
  const profileRef = useRef(null);
  const profileOwnerIdRef = useRef(null);
  const insets = useSafeAreaInsets();
  const headerTopPadding = useMemo(() => Math.max(insets.top, 16), [insets.top]);
  const listContentInset = useMemo(
    () => ({ paddingBottom: Math.max(32, insets.bottom + 16) }),
    [insets.bottom],
  );
  const scrollIndicatorInsets = useMemo(
    () => ({ top: headerTopPadding, bottom: insets.bottom }),
    [headerTopPadding, insets.bottom],
  );
  const debouncedConnectionsQuery = useDebouncedValue(connectionsSearch, 350);
  const completedEvents = useMemo(
    () => (Array.isArray(profile?.completedEvents) ? profile.completedEvents : []),
    [profile?.completedEvents],
  );
  const organizerOrganizationName = useMemo(() => {
    if (profile?.role !== 'ORGANIZER') {
      return null;
    }
    const value = profile?.organizerApplication?.organizationName;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
    return null;
  }, [profile?.organizerApplication?.organizationName, profile?.role]);
  const ratingSummary = profile?.organizerRating ?? null;
  const averageRatingValueRaw =
    ratingSummary && ratingSummary.averageRating != null
      ? Number(ratingSummary.averageRating)
      : null;
  const averageRatingValue = Number.isFinite(averageRatingValueRaw)
    ? averageRatingValueRaw
    : null;
  const averageRatingLabel =
    averageRatingValue != null ? averageRatingValue.toFixed(1) : null;
  const reviewCount = ratingSummary?.reviewCount ?? 0;
  const organizerReviews = useMemo(
    () => (Array.isArray(ratingSummary?.reviews) ? ratingSummary.reviews : []),
    [ratingSummary?.reviews],
  );
  const hasReviews = organizerReviews.length > 0;
  const viewerReview = ratingSummary?.viewerReview ?? null;

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

  useEffect(() => {
    const viewerReview = profile?.organizerRating?.viewerReview;
    if (viewerReview) {
      setRatingDraft(viewerReview.rating);
      setFeedbackDraft(viewerReview.feedback ?? '');
    } else {
      setRatingDraft(0);
      setFeedbackDraft('');
    }
  }, [profile?.id, profile?.organizerRating?.viewerReview?.id]);

  useEffect(() => {
    if (!connectionsVisible) {
      setConnectionsUsers([]);
      return;
    }
    setConnectionsUsers([]);
    setConnectionsTotalCount(0);
  }, [connectionsVisible, connectionsType]);

  useEffect(() => {
    if (!connectionsVisible || !profile?.id) {
      return;
    }

    let isActive = true;
    setConnectionsLoading(true);

    const queryParam =
      debouncedConnectionsQuery && debouncedConnectionsQuery.trim().length
        ? `&q=${encodeURIComponent(debouncedConnectionsQuery.trim())}`
        : '';

    const kindParam = connectionsType === 'following' ? 'following' : 'followers';

    const fetchConnections = async () => {
      try {
        const data = await get(
          `/api/users/${profile.id}/connections?kind=${kindParam}${queryParam}`,
        );
        if (!isActive) {
          return;
        }
        setConnectionsUsers(Array.isArray(data?.users) ? data.users : []);
        if (typeof data?.totalCount === 'number') {
          setConnectionsTotalCount(Math.max(0, data.totalCount));
        } else if (typeof data?.count === 'number') {
          setConnectionsTotalCount(Math.max(0, data.count));
        } else {
          setConnectionsTotalCount(0);
        }
      } catch (error) {
        if (!isActive) {
          return;
        }
        console.error('Failed to load connections:', error);
        Alert.alert(
          'Unable to load connections',
          error?.message ?? 'Please try again later.',
        );
      } finally {
        if (isActive) {
          setConnectionsLoading(false);
        }
      }
    };

    fetchConnections();

    return () => {
      isActive = false;
    };
  }, [
    connectionsVisible,
    connectionsType,
    profile?.id,
    debouncedConnectionsQuery,
    connectionsRequestKey,
  ]);

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
        const data = await get(
          `/api/users/${viewedUserId}?includePosts=true&includeCompletedEvents=true`,
        );
        const formattedProfile = {
          ...data,
          followersCount: data.followersCount ?? 0,
          followingCount: data.followingCount ?? 0,
          postCount: data.postCount ?? (Array.isArray(data.posts) ? data.posts.length : 0),
          completedEvents: Array.isArray(data.completedEvents) ? data.completedEvents : [],
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

  const handleMessagePress = useCallback(async () => {
    if (!profile?.id || isOwnProfile || chatStarting) {
      return;
    }

    setChatStarting(true);
    try {
      const conversation = await post('/api/chats', { userId: profile.id });
      const peersPayload =
        conversation?.peers && conversation.peers.length
          ? conversation.peers
          : [
              {
                id: profile.id,
                name: profile.name,
                email: profile.email,
                avatarUrl: profile.avatarUrl ?? null,
              },
            ];

      navigation.navigate('ChatConversation', {
        conversationId: conversation.id,
        peers: peersPayload,
        initialConversation: conversation,
      });
    } catch (error) {
      console.error('Failed to open chat:', error);
      const message =
        error?.body?.error || error?.message || 'Unable to start a chat with this user right now.';
      Alert.alert('Chat unavailable', message);
    } finally {
      setChatStarting(false);
    }
  }, [chatStarting, isOwnProfile, navigation, profile]);

  const handleOpenConnections = useCallback(
    (type) => {
      if (!profile?.id) {
        return;
      }
      const normalized = type === 'following' ? 'following' : 'followers';
      setConnectionsType(normalized);
      setConnectionsSearch('');
      setConnectionsVisible(true);
    },
    [profile?.id],
  );

  const handleCloseConnections = useCallback(() => {
    setConnectionsVisible(false);
    setConnectionsSearch('');
    setConnectionsLoading(false);
    setConnectionsUsers([]);
    setConnectionsTotalCount(0);
  }, []);

  const handleConnectionsTypeChange = useCallback((nextType) => {
    setConnectionsType((current) => {
      const normalized = nextType === 'following' ? 'following' : 'followers';
      return current === normalized ? current : normalized;
    });
  }, []);

  const handleConnectionsRefresh = useCallback(() => {
    if (!connectionsVisible) {
      return;
    }
    setConnectionsRequestKey((key) => key + 1);
  }, [connectionsVisible]);

  const handleConnectionsUserPress = useCallback(
    (user) => {
      if (!user?.id) {
        return;
      }
      setConnectionsVisible(false);
      setConnectionsSearch('');
      if (user.id === profile?.id) {
        return;
      }
      navigation.push('Profile', { userId: user.id });
    },
    [navigation, profile?.id],
  );

  const handleRatingSelect = useCallback(
    (value) => {
      if (!profile?.viewerCanReview) {
        return;
      }
      setRatingDraft(value);
    },
    [profile?.viewerCanReview],
  );

  const handleSubmitReview = useCallback(async () => {
    if (!profile?.viewerCanReview || submittingReview) {
      return;
    }

    if (!ratingDraft) {
      Alert.alert('Rating required', 'Please select a star rating before submitting.');
      return;
    }

    setSubmittingReview(true);
    try {
      const payload = {
        rating: ratingDraft,
        ...(feedbackDraft.trim().length > 0 ? { feedback: feedbackDraft.trim() } : {}),
      };

      const result = await post(`/api/users/${profile.id}/ratings`, payload);

      if (result?.organizerRating) {
        setProfile((current) => {
          if (!current) {
            return current;
          }
          const updated = {
            ...current,
            organizerRating: result.organizerRating,
          };
          profileRef.current = updated;
          return updated;
        });
      }

      if (result?.review) {
        setRatingDraft(result.review.rating);
        setFeedbackDraft(result.review.feedback ?? '');
      }

      Alert.alert('Thank you!', 'Your review has been submitted.');
    } catch (error) {
      console.error('Failed to submit review:', error);
      const message =
        error?.body?.error || error?.message || 'Unable to save your review right now.';
      Alert.alert('Submit failed', message);
    } finally {
      setSubmittingReview(false);
    }
  }, [feedbackDraft, profile?.id, profile?.viewerCanReview, ratingDraft, submittingReview]);

  const performDeleteReview = useCallback(async () => {
    if (!profile?.viewerCanReview) {
      return;
    }

    setDeletingReview(true);
    try {
      const result = await deleteRequest(`/api/users/${profile.id}/ratings`);
      if (result?.organizerRating) {
        setProfile((current) => {
          if (!current) {
            return current;
          }
          const updated = {
            ...current,
            organizerRating: result.organizerRating,
          };
          profileRef.current = updated;
          return updated;
        });
      }

      setRatingDraft(0);
      setFeedbackDraft('');
      Alert.alert('Review removed', 'Your review has been deleted.');
    } catch (error) {
      console.error('Failed to remove review:', error);
      const message =
        error?.body?.error || error?.message || 'Unable to remove your review right now.';
      Alert.alert('Remove failed', message);
    } finally {
      setDeletingReview(false);
    }
  }, [deleteRequest, profile?.id, profile?.viewerCanReview]);

  const handleDeleteReview = useCallback(() => {
    if (!profile?.organizerRating?.viewerReview || deletingReview) {
      return;
    }

    Alert.alert(
      'Remove your review?',
      'This will delete your rating and feedback for this organizer.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void performDeleteReview();
          },
        },
      ],
    );
  }, [deletingReview, performDeleteReview, profile?.organizerRating?.viewerReview]);

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
        base64: true,
      });

      if (pickerResult.canceled) {
        return;
      }

      const asset = pickerResult.assets?.[0];
      if (!asset?.uri) {
        Alert.alert('Upload canceled', 'No image was selected.');
        return;
      }

      if (!asset.base64) {
        Alert.alert('Upload failed', 'Could not read the selected image. Please try again.');
        return;
      }

      setAvatarUploading(true);

      const extensionParts = (asset.mimeType ?? 'image/jpeg').split('/');
      const rawExtension = extensionParts[extensionParts.length - 1] ?? 'jpeg';
      const normalizedExtension = rawExtension.split('+').pop() || 'jpeg';
      const userId = profileRef.current?.id ?? authUser?.id ?? 'user';
      const filePath = `avatars/${userId}-${Date.now()}.${normalizedExtension}`;

      const { error: uploadError } = await supabase.storage
        .from('Capstone')
        .upload(filePath, decode(asset.base64), {
          contentType: asset.mimeType ?? 'image/jpeg',
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: publicData } = supabase.storage.from('Capstone').getPublicUrl(filePath);
      const uploadedUrl = publicData?.publicUrl;

      if (!uploadedUrl) {
        throw new Error('Upload did not return a public URL.');
      }

      const storedAvatarUrl = uploadedUrl;

      await patch('/api/users/me', { avatarUrl: storedAvatarUrl });

      profileRef.current = profileRef.current
        ? { ...profileRef.current, avatarUrl: storedAvatarUrl }
        : profileRef.current;
      setProfile((current) => (current ? { ...current, avatarUrl: storedAvatarUrl } : current));

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
  }, [authUser?.id, avatarUploading, isOwnProfile, refreshUser]);

  if (authLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-slate-900">
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
      <View className="flex-1 items-center justify-center bg-white dark:bg-slate-900">
        <ActivityIndicator size="large" color="#2E7D32" />
      </View>
    );
  }

  if (loading && !profile) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-slate-900">
        <ActivityIndicator size="large" color="#2E7D32" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6 dark:bg-slate-900">
        <Text className="text-center text-base text-gray-500 dark:text-slate-400">
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
    <View
      className="bg-white pb-6 dark:bg-slate-900"
      style={{ paddingTop: headerTopPadding }}
    >
      <View className="flex-row items-center justify-between px-4 pt-2">
        {navigation.canGoBack() ? (
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            className="rounded-full p-1"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={22} color="#111827" />
          </TouchableOpacity>
        ) : (
          <Text className="text-lg font-semibold text-gray-900 dark:text-slate-100">Hiker</Text>
        )}
        <View className="flex-row items-center space-x-3">
          {isOwnProfile ? (
            <>
              <Ionicons name="notifications-outline" size={24} color="#16a34a" />
              <TouchableOpacity
                onPress={() => navigation.navigate('Settings')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
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
              className="h-24 w-24 rounded-full border-2 border-gray-200 dark:border-slate-700"
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
          <Text className="mt-2 text-xs text-gray-500 dark:text-slate-400">Tap to update photo</Text>
        ) : null}
        <Text className="mt-3 text-xl font-bold text-gray-900 dark:text-slate-100">
          {profile.name ?? profile.email ?? 'Explorer'}
        </Text>
        {(profile.expertBadgeAwarded || profile.experienceLevelLocked) ? (
          <View className="mt-2 flex-row items-center rounded-full bg-amber-100 px-3 py-1 dark:bg-amber-500/20">
            <Ionicons name="ribbon" size={16} color="#b45309" />
            <Text className="ml-2 text-xs font-semibold text-amber-800 dark:text-amber-200">
              Expert Verified
            </Text>
          </View>
        ) : null}
        {profile.bio ? (
          <Text className="mt-1 text-center text-sm text-gray-500 dark:text-slate-400">{profile.bio}</Text>
        ) : null}

        {profile.role === 'ORGANIZER' ? (
          <View className="mt-4 w-full rounded-2xl border border-emerald-100 bg-emerald-50 p-3 dark:border-emerald-500/40 dark:bg-emerald-900/30">
            <Text className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-200">
              Organization / Company
            </Text>
            <View className="mt-2 flex-row items-center">
              <Ionicons name="business-outline" size={18} color="#047857" />
              <Text className="ml-2 text-base font-semibold text-emerald-900 dark:text-emerald-50">
                {organizerOrganizationName ?? 'Independent organizer'}
              </Text>
            </View>
            {!organizerOrganizationName ? (
              <Text className="mt-1 text-xs text-emerald-700 dark:text-emerald-100/80">
                Organizer did not provide a company name in the application.
              </Text>
            ) : null}
          </View>
        ) : null}

        <View className="mt-4 flex-row items-center justify-between rounded-2xl bg-gray-50 px-3 py-2 dark:bg-slate-900">
          <StatTile label="Posts" value={profile.postCount ?? posts.length} />
          <StatTile
            label="Followers"
            value={profile.followersCount}
            onPress={() => handleOpenConnections('followers')}
          />
          <StatTile
            label="Following"
            value={profile.followingCount}
            onPress={() => handleOpenConnections('following')}
          />
        </View>

        {isOwnProfile ? (
          <TouchableOpacity
            onPress={() => navigation.navigate('Settings')}
            className="mt-4 w-full rounded-full border border-green-600 py-2"
          >
            <Text className="text-center font-semibold text-green-600">Edit Profile</Text>
          </TouchableOpacity>
        ) : (
          <View className="mt-4 w-full flex-row space-x-3">
            <TouchableOpacity
              onPress={handleFollowToggle}
              disabled={followUpdating}
              className={`flex-1 rounded-full py-2 ${
                profile.isFollowing ? 'border border-green-600 bg-white' : 'bg-green-600'
              }`}
              style={followUpdating ? { opacity: 0.7 } : null}
            >
              <Text
                className={`text-center font-semibold ${
                  profile.isFollowing ? 'text-green-600' : 'text-white'
                }`}
              >
                {followUpdating ? 'Updating...' : profile.isFollowing ? 'Following' : 'Follow'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleMessagePress}
              disabled={chatStarting}
              className="flex-1 rounded-full border border-green-600 bg-white py-2 dark:bg-slate-900"
              style={chatStarting ? { opacity: 0.7 } : null}
            >
              <Text className="text-center font-semibold text-green-600">
                {chatStarting ? 'Opening...' : 'Message'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {profile.role === 'ORGANIZER' ? (
          <View className="mt-6 w-full rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:bg-slate-900 dark:border-slate-700">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">Organizer Rating</Text>
                <View className="mt-1 flex-row items-center space-x-2">
                  <RatingStars rating={averageRatingValue ?? 0} size={18} />
                  <Text className="text-base font-semibold text-gray-800 dark:text-slate-100">
                    {averageRatingLabel ?? '—'}
                  </Text>
                </View>
                <Text className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                  {reviewCount > 0
                    ? `${reviewCount} review${reviewCount === 1 ? '' : 's'}`
                    : 'No reviews yet'}
                </Text>
              </View>
            </View>

            {profile.viewerCanReview ? (
              <View className="mt-4 rounded-xl bg-white p-3 dark:bg-slate-900">
                <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">Leave a review</Text>
                <View className="mt-3 flex-row items-center">
                  <RatingStars
                    rating={ratingDraft}
                    size={24}
                    editable
                    onSelect={handleRatingSelect}
                  />
                  <Text className="ml-3 text-sm text-gray-600 dark:text-slate-300">
                    {ratingDraft
                      ? `${ratingDraft} star${ratingDraft > 1 ? 's' : ''}`
                      : 'Tap to rate'}
                  </Text>
                </View>
                <TextInput
                  value={feedbackDraft}
                  onChangeText={setFeedbackDraft}
                  placeholder="Share your experience..."
                  multiline
                  editable={!submittingReview}
                  textAlignVertical="top"
                  className="mt-3 min-h-[80px] rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100"
                />
                <View className="mt-3 flex-row space-x-3">
                  <TouchableOpacity
                    onPress={handleSubmitReview}
                    disabled={submittingReview}
                    className="flex-1 rounded-full bg-green-600 py-2"
                    style={submittingReview ? { opacity: 0.7 } : null}
                  >
                    <Text className="text-center font-semibold text-white">
                      {submittingReview
                        ? 'Submitting...'
                        : viewerReview
                          ? 'Update Review'
                          : 'Submit Review'}
                    </Text>
                  </TouchableOpacity>
                  {viewerReview ? (
                    <TouchableOpacity
                      onPress={handleDeleteReview}
                      disabled={deletingReview}
                      className="flex-1 rounded-full border border-red-500 bg-white py-2 dark:bg-slate-900"
                      style={deletingReview ? { opacity: 0.7 } : null}
                    >
                      <Text className="text-center font-semibold text-red-600">
                        {deletingReview ? 'Removing...' : 'Remove'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            ) : null}

            <View className="mt-4 rounded-xl bg-white p-3 dark:bg-slate-900">
              <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">Recent Feedback</Text>
              {hasReviews ? (
                organizerReviews.map((review, index) => {
                  if (!review) {
                    return null;
                  }
                  const key = review.id ?? `review-${index}`;
                  const parsedReviewRating = Number(review.rating);
                  const normalizedReviewRating = Number.isFinite(parsedReviewRating)
                    ? parsedReviewRating
                    : 0;
                  return (
                    <View
                      key={key}
                      className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3 dark:bg-slate-900 dark:border-slate-700"
                    >
                      <View className="flex-row items-center justify-between">
                        <Text className="text-sm font-semibold text-gray-800 dark:text-slate-100">
                          {review.reviewer?.name ?? review.reviewer?.email ?? 'Explorer'}
                        </Text>
                        <RatingStars rating={normalizedReviewRating} size={16} />
                      </View>
                      {review.feedback ? (
                        <Text className="mt-2 text-sm text-gray-700 dark:text-slate-300">{review.feedback}</Text>
                      ) : null}
                      <Text className="mt-2 text-xs text-gray-500 dark:text-slate-400">
                        {review.createdAt
                          ? new Date(review.createdAt).toLocaleDateString()
                          : ''}
                      </Text>
                    </View>
                  );
                })
              ) : (
                <Text className="mt-3 text-sm text-gray-500 dark:text-slate-400">
                  {profile.viewerCanReview
                    ? 'Be the first to leave a review for this organizer.'
                    : 'No reviews yet.'}
                </Text>
              )}
            </View>
          </View>
        ) : null}

        <View className="mt-6 w-full rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:bg-slate-900 dark:border-slate-700">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">Completed Trails</Text>
            {completedEvents.length ? (
              <Text className="text-xs text-gray-500 dark:text-slate-400">
                {completedEvents.length === 1 ? '1 event' : `${completedEvents.length} events`}
              </Text>
            ) : null}
          </View>
          {completedEvents.length ? (
            completedEvents.map((completion, index) => {
              if (!completion) {
                return null;
              }
              const completionKey =
                completion.bookingId ?? completion.id ?? `completion-${index}`;
              return (
                <CompletedTrailCard
                  key={completionKey}
                  completion={completion}
                />
              );
            })
          ) : (
            <Text className="mt-3 text-sm text-gray-500 dark:text-slate-400">
              Organizer-marked completions will appear here once this hiker finishes an event.
            </Text>
          )}
        </View>

        <View className="mt-6 w-full rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:bg-slate-900 dark:border-slate-700">
          <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">Trail Preferences</Text>
          {preferenceItems.length > 0 ? (
            preferenceItems.map((item) => (
              <InfoRow key={item.label} label={item.label} value={item.value} />
            ))
          ) : (
            <Text className="mt-2 text-sm text-gray-500 dark:text-slate-400">No preferences shared yet.</Text>
          )}
        </View>
      </View>

      <View className="mt-6 px-4">
        <Text className="text-base font-semibold text-gray-800 dark:text-slate-100">Recent Posts</Text>
      </View>
    </View>
  );

  return (
    <>
      <KeyboardAvoidingView
        className="flex-1 bg-gray-100 dark:bg-slate-950"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? headerTopPadding : 24}
      >
        <FlatList
          data={posts}
          keyExtractor={(item, index) =>
            item?.id ? String(item.id) : `post-${index}`
          }
          renderItem={({ item }) => <PostCard post={item} />}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={
            !loading ? (
              <View className="items-center justify-center px-4 py-12">
                <Text className="text-center text-sm text-gray-500 dark:text-slate-400">
                  {isOwnProfile
                    ? "You haven't shared any posts yet."
                    : 'No posts to show from this user yet.'}
                </Text>
              </View>
            ) : null
          }
          contentContainerStyle={listContentInset}
          scrollIndicatorInsets={scrollIndicatorInsets}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#2E7D32" />
          }
        />
      </KeyboardAvoidingView>
      <ConnectionsModal
        visible={connectionsVisible}
        type={connectionsType}
        users={connectionsUsers}
        loading={connectionsLoading}
        query={connectionsSearch}
        onQueryChange={setConnectionsSearch}
        onClose={handleCloseConnections}
        onSelectUser={handleConnectionsUserPress}
        onRefresh={handleConnectionsRefresh}
        bottomInset={insets.bottom}
        onTypeChange={handleConnectionsTypeChange}
        totalCount={connectionsTotalCount}
      />
    </>
  );
}

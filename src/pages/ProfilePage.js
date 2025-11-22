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
  ScrollView,
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
import RecordedTrailSummary from '../components/RecordedTrailSummary';
import TrailRecordingCard from '../components/TrailRecordingCard';
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
  const [trailPreview, setTrailPreview] = useState(null);
  const [editingTrail, setEditingTrail] = useState(null);
  const [trailLabelDraft, setTrailLabelDraft] = useState('');
  const [savingTrailLabel, setSavingTrailLabel] = useState(false);
  const [sharingTrail, setSharingTrail] = useState(null);
  const [organizerOptions, setOrganizerOptions] = useState([]);
  const [organizerOptionsLoading, setOrganizerOptionsLoading] = useState(false);
  const [organizerOptionsError, setOrganizerOptionsError] = useState(null);
  const [organizerOptionsLoaded, setOrganizerOptionsLoaded] = useState(false);
  const [selectedOrganizerIds, setSelectedOrganizerIds] = useState(() => new Set());
  const [shareSubmitting, setShareSubmitting] = useState(false);
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
  const completedEvents = useMemo(
    () => (Array.isArray(profile?.completedEvents) ? profile.completedEvents : []),
    [profile?.completedEvents],
  );
  const trailRecordings = useMemo(
    () => (Array.isArray(profile?.trailRecordings) ? profile.trailRecordings : []),
    [profile?.trailRecordings],
  );
  const filteredTrailRecordings = useMemo(() => {
    if (!trailSearchQuery.trim()) {
      return trailRecordings;
    }
    const query = trailSearchQuery.trim().toLowerCase();
    return trailRecordings.filter((trail) => {
      const candidates = [
        trail?.label,
        trail?.startedAt ? new Date(trail.startedAt).toLocaleDateString() : null,
        trail?.startedAt ? new Date(trail.startedAt).toLocaleString() : null,
      ]
        .filter(Boolean)
        .map((value) => value.toLowerCase());
      const distanceLabel = trail?.totalDistanceMeters
        ? `${(trail.totalDistanceMeters / 1000).toFixed(2)} km`
        : null;
      if (distanceLabel) {
        candidates.push(distanceLabel.toLowerCase());
      }
      return candidates.some((candidate) => candidate.includes(query));
    });
  }, [trailRecordings, trailSearchQuery]);
  const organizerFollowerOptions = useMemo(
    () =>
      organizerOptions.filter((option) =>
        Array.isArray(option.connectionTypes)
          ? option.connectionTypes.includes('followers')
          : false,
      ),
    [organizerOptions],
  );
  const organizerFollowingOptions = useMemo(
    () =>
      organizerOptions.filter((option) =>
        Array.isArray(option.connectionTypes)
          ? option.connectionTypes.includes('following')
          : false,
      ),
    [organizerOptions],
  );
  const handleStartRenameTrail = useCallback((trail) => {
    if (!trail) {
      return;
    }
    setEditingTrail(trail);
    setTrailLabelDraft(trail.label ?? '');
  }, []);

  const handleDismissRenameTrail = useCallback(() => {
    setEditingTrail(null);
    setTrailLabelDraft('');
  }, []);

  const handleSaveTrailLabel = useCallback(async () => {
    if (!editingTrail) {
      return;
    }
    const trimmed = trailLabelDraft.trim();
    const payload = { label: trimmed.length > 0 ? trimmed : null };
    setSavingTrailLabel(true);
    try {
      const updated = await patch(`/api/trails/${editingTrail.id}`, payload);
      setProfile((current) => {
        if (!current) {
          return current;
        }
        const nextRecordings = Array.isArray(current.trailRecordings)
          ? current.trailRecordings.map((trail) =>
              trail.id === editingTrail.id
                ? { ...trail, label: updated?.label ?? payload.label }
                : trail,
            )
          : current.trailRecordings;
        return { ...current, trailRecordings: nextRecordings };
      });
      setEditingTrail(null);
      setTrailLabelDraft('');
      Alert.alert('Trail updated', 'Your recording name was saved.');
    } catch (error) {
      console.error('Failed to rename trail:', error);
      const message =
        error?.body?.error || error?.message || 'Unable to update this trail right now.';
      Alert.alert('Rename failed', message);
    } finally {
      setSavingTrailLabel(false);
    }
  }, [editingTrail, trailLabelDraft]);

  const loadOrganizerConnections = useCallback(async () => {
    setOrganizerOptionsLoading(true);
    setOrganizerOptionsError(null);
    try {
      const [followersResponse, followingResponse] = await Promise.all([
        get('/api/users/me/connections?kind=followers&limit=200'),
        get('/api/users/me/connections?kind=following&limit=200'),
      ]);
      const map = new Map();

      const ingest = (response, connectionType) => {
        if (!response || !Array.isArray(response.users)) {
          return;
        }
        response.users.forEach((user) => {
          if (!user || user.role !== 'ORGANIZER') {
            return;
          }
          const existing =
            map.get(user.id) ||
            {
              id: user.id,
              name: user.name ?? user.email ?? 'Organizer',
              email: user.email ?? null,
              connectionTypes: new Set(),
            };
          existing.name = user.name ?? existing.name;
          existing.email = user.email ?? existing.email;
          existing.connectionTypes.add(connectionType);
          map.set(user.id, existing);
        });
      };

      ingest(followersResponse, 'followers');
      ingest(followingResponse, 'following');

      const normalized = Array.from(map.values()).map((record) => ({
        id: record.id,
        name: record.name,
        email: record.email,
        connectionTypes: Array.from(record.connectionTypes),
      }));

      normalized.sort((a, b) => {
        const aName = (a.name ?? '').toLowerCase();
        const bName = (b.name ?? '').toLowerCase();
        if (aName < bName) return -1;
        if (aName > bName) return 1;
        return 0;
      });

      setOrganizerOptions(normalized);
      setOrganizerOptionsLoaded(true);
    } catch (error) {
      console.error('Failed to load organizer connections:', error);
      setOrganizerOptionsError(
        error?.body?.error ||
          error?.message ||
          'Unable to load organizer connections right now.',
      );
    } finally {
      setOrganizerOptionsLoading(false);
    }
  }, []);

  const handleOpenShareModal = useCallback(
    (trail) => {
      if (!trail) {
        return;
      }
      setSharingTrail(trail);
      setSelectedOrganizerIds(new Set());
      if (!organizerOptionsLoaded && !organizerOptionsLoading) {
        loadOrganizerConnections();
      }
    },
    [loadOrganizerConnections, organizerOptionsLoaded, organizerOptionsLoading],
  );

  const handleCloseShareModal = useCallback(() => {
    setSharingTrail(null);
    setSelectedOrganizerIds(new Set());
  }, []);

  const handleToggleOrganizerSelection = useCallback((userId) => {
    if (!userId) {
      return;
    }
    setSelectedOrganizerIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }, []);

  const handleSelectOrganizerFollowers = useCallback(() => {
    setSelectedOrganizerIds(new Set(organizerFollowerOptions.map((option) => option.id)));
  }, [organizerFollowerOptions]);

  const handleSelectOrganizerFollowing = useCallback(() => {
    setSelectedOrganizerIds(new Set(organizerFollowingOptions.map((option) => option.id)));
  }, [organizerFollowingOptions]);

  const handleSelectAllOrganizers = useCallback(() => {
    setSelectedOrganizerIds(new Set(organizerOptions.map((option) => option.id)));
  }, [organizerOptions]);

  const handleClearOrganizerSelection = useCallback(() => {
    setSelectedOrganizerIds(new Set());
  }, []);

  const shareSelectionCount = selectedOrganizerIds.size;

  const handleShareTrailWithOrganizers = useCallback(async () => {
    if (!sharingTrail || shareSelectionCount === 0) {
      return;
    }
    setShareSubmitting(true);
    try {
      const payload = { recipientUserIds: Array.from(selectedOrganizerIds) };
      const response = await post(`/api/trails/${sharingTrail.id}/share`, payload);
      const sharedCount = Number(response?.sharedCount ?? 0);
      const skipped = Number(response?.skipped ?? 0);
      let message;
      if (sharedCount > 0) {
        message = `Shared with ${sharedCount} organizer${sharedCount === 1 ? '' : 's'}.`;
        if (skipped > 0) {
          message += ` ${skipped === 1 ? 'One organizer' : `${skipped} organizers`} already had this trail.`;
        }
      } else {
        message =
          response?.message ||
          (skipped > 0
            ? 'Those organizers already have this trail.'
            : 'No organizers were updated.');
      }
      Alert.alert('Trail shared', message);
      handleCloseShareModal();
    } catch (error) {
      console.error('Failed to share trail:', error);
      const message =
        error?.body?.error || error?.message || 'Unable to share this trail right now.';
      Alert.alert('Share failed', message);
    } finally {
      setShareSubmitting(false);
    }
  }, [handleCloseShareModal, post, selectedOrganizerIds, shareSelectionCount, sharingTrail]);

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
          `/api/users/${viewedUserId}?includePosts=true&includeCompletedEvents=true&includeTrailRecordings=true`,
        );
        const formattedProfile = {
          ...data,
          followersCount: data.followersCount ?? 0,
          followingCount: data.followingCount ?? 0,
          postCount: data.postCount ?? (Array.isArray(data.posts) ? data.posts.length : 0),
          completedEvents: Array.isArray(data.completedEvents) ? data.completedEvents : [],
          trailRecordings: Array.isArray(data.trailRecordings) ? data.trailRecordings : [],
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
      navigation.navigate('ConnectionsList', {
        userId: profile.id,
        initialType: normalized,
        profileName: profile.name ?? profile.email ?? 'Profile',
      });
    },
    [navigation, profile?.email, profile?.id, profile?.name],
  );

  const handleTrailRecordingPress = useCallback((trail) => {
    if (!trail) {
      return;
    }
    setTrailPreview(trail);
  }, []);

  const handleCloseTrailPreview = useCallback(() => {
    setTrailPreview(null);
  }, []);

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
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">Trail Recordings</Text>
            {trailRecordings.length ? (
              <Text className="text-xs text-gray-500 dark:text-slate-400">
                {trailRecordings.length === 1 ? '1 recording' : `${trailRecordings.length} recordings`}
              </Text>
            ) : null}
          </View>
          {trailRecordings.length ? (
            <>
              <View
                className={`mt-3 flex-row items-center rounded-full border px-3 ${
                  trailSearchFocused ? 'border-emerald-500' : 'border-gray-200 dark:border-slate-700'
                } bg-white dark:bg-slate-800`}
              >
                <Ionicons name="search" size={16} color="#6b7280" />
                <TextInput
                  placeholder="Search trail name or date"
                  placeholderTextColor="#94a3b8"
                  value={trailSearchQuery}
                  onChangeText={setTrailSearchQuery}
                  onFocus={() => setTrailSearchFocused(true)}
                  onBlur={() => setTrailSearchFocused(false)}
                  className="ml-2 flex-1 py-2 text-sm text-gray-900 dark:text-slate-100"
                />
                {trailSearchQuery.length ? (
                  <TouchableOpacity onPress={() => setTrailSearchQuery('')}>
                    <Ionicons name="close-circle" size={18} color="#94a3b8" />
                  </TouchableOpacity>
                ) : null}
              </View>
              <ScrollView className="mt-4" style={{ maxHeight: 360 }}>
                {filteredTrailRecordings.length ? (
                  filteredTrailRecordings.map((trail) => (
                    <TrailRecordingCard
                      key={trail.id ?? `${trail.startedAt}`}
                      trail={trail}
                      canShare={isOwnProfile}
                      onPress={handleTrailRecordingPress}
                      onRename={isOwnProfile ? handleStartRenameTrail : undefined}
                      onShareWithOrganizers={isOwnProfile ? handleOpenShareModal : undefined}
                    />
                  ))
                ) : (
                  <Text className="mt-3 text-sm text-gray-500 dark:text-slate-400">
                    No recordings match your search.
                  </Text>
                )}
              </ScrollView>
            </>
          ) : (
            <Text className="mt-3 text-sm text-gray-500 dark:text-slate-400">
              {isOwnProfile
                ? 'Record a trail to see it here and share it with your followers.'
                : 'Trail recordings will appear here once this hiker shares them.'}
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
      <Modal visible={!!trailPreview} transparent animationType="slide" onRequestClose={handleCloseTrailPreview}>
        <View className="flex-1 items-center justify-center bg-black/70 p-4">
          {trailPreview ? (
            <RecordedTrailSummary trail={trailPreview} onClose={handleCloseTrailPreview} />
          ) : null}
        </View>
      </Modal>
      <Modal
        visible={!!editingTrail}
        transparent
        animationType="fade"
        onRequestClose={handleDismissRenameTrail}
      >
        <View className="flex-1 items-center justify-center bg-black/60 px-4">
          <View className="w-full rounded-2xl bg-white p-4 dark:bg-slate-900">
            <Text className="text-base font-semibold text-gray-900 dark:text-slate-100">
              Name this trail
            </Text>
            <Text className="mt-1 text-sm text-gray-500 dark:text-slate-400">
              Give your recording a memorable name so organizers know what it covers.
            </Text>
            <TextInput
              value={trailLabelDraft}
              onChangeText={setTrailLabelDraft}
              placeholder="e.g. Mt. Pulag Summit Route"
              className="mt-4 rounded-xl border border-gray-200 px-3 py-2 text-base text-gray-900 dark:border-slate-700 dark:text-slate-100"
            />
            <View className="mt-4 flex-row space-x-3">
              <TouchableOpacity
                onPress={handleDismissRenameTrail}
                className="flex-1 rounded-full border border-gray-300 py-2 dark:border-slate-600"
              >
                <Text className="text-center font-semibold text-gray-700 dark:text-slate-100">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveTrailLabel}
                disabled={savingTrailLabel}
                className={`flex-1 rounded-full py-2 ${
                  savingTrailLabel ? 'bg-emerald-600/70' : 'bg-emerald-600'
                }`}
              >
                <Text className="text-center font-semibold text-white">
                  {savingTrailLabel ? 'Saving...' : 'Save name'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={!!sharingTrail}
        transparent
        animationType="slide"
        onRequestClose={handleCloseShareModal}
      >
        <View className="flex-1 items-center justify-center bg-black/70 px-4">
          <View
            className="w-full rounded-2xl bg-white p-4 dark:bg-slate-900"
            style={{ maxHeight: 640 }}
          >
            <Text className="text-base font-semibold text-gray-900 dark:text-slate-50">
              Share trail with organizers
            </Text>
            <Text className="mt-1 text-sm text-gray-600 dark:text-slate-400">
              {sharingTrail?.label ?? 'Untitled Trail'}
            </Text>
            {organizerOptionsLoading ? (
              <View className="mt-4 flex-row items-center justify-center">
                <ActivityIndicator color="#059669" />
                <Text className="ml-2 text-sm text-gray-600 dark:text-slate-300">
                  Loading organizer connections...
                </Text>
              </View>
            ) : null}
            {organizerOptionsError ? (
              <View className="mt-3 rounded-xl border border-red-300 bg-red-50 p-3 dark:border-red-500/30 dark:bg-red-500/10">
                <Text className="text-sm text-red-700 dark:text-red-200">
                  {organizerOptionsError}
                </Text>
                <TouchableOpacity
                  onPress={loadOrganizerConnections}
                  className="mt-2 rounded-full bg-red-600/90 py-2"
                >
                  <Text className="text-center text-sm font-semibold text-white">Try again</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {!organizerOptionsLoading && !organizerOptionsError ? (
              organizerOptions.length === 0 ? (
                <Text className="mt-4 text-sm text-gray-500 dark:text-slate-400">
                  You are not connected with any organizers yet. Follow organizers or let them
                  follow you to share recordings directly.
                </Text>
              ) : (
                <>
                  <View className="mt-4 space-y-2">
                    <TouchableOpacity
                      onPress={handleSelectAllOrganizers}
                      className="rounded-full border border-emerald-500 px-3 py-2 dark:border-emerald-400"
                    >
                      <Text className="text-center text-sm font-semibold text-emerald-700 dark:text-emerald-200">
                        Select all organizers ({organizerOptions.length})
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleSelectOrganizerFollowers}
                      disabled={organizerFollowerOptions.length === 0}
                      className={`rounded-full border px-3 py-2 ${
                        organizerFollowerOptions.length === 0
                          ? 'border-gray-300 opacity-50 dark:border-slate-700'
                          : 'border-blue-500 dark:border-blue-400'
                      }`}
                    >
                      <Text
                        className={`text-center text-sm font-semibold ${
                          organizerFollowerOptions.length === 0
                            ? 'text-gray-500 dark:text-slate-500'
                            : 'text-blue-600 dark:text-blue-300'
                        }`}
                      >
                        Select organizer followers ({organizerFollowerOptions.length})
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleSelectOrganizerFollowing}
                      disabled={organizerFollowingOptions.length === 0}
                      className={`rounded-full border px-3 py-2 ${
                        organizerFollowingOptions.length === 0
                          ? 'border-gray-300 opacity-50 dark:border-slate-700'
                          : 'border-blue-500 dark:border-blue-400'
                      }`}
                    >
                      <Text
                        className={`text-center text-sm font-semibold ${
                          organizerFollowingOptions.length === 0
                            ? 'text-gray-500 dark:text-slate-500'
                            : 'text-blue-600 dark:text-blue-300'
                        }`}
                      >
                        Select organizers you follow ({organizerFollowingOptions.length})
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleClearOrganizerSelection}
                      className="rounded-full border border-gray-200 px-3 py-2 dark:border-slate-700"
                    >
                      <Text className="text-center text-sm font-semibold text-gray-600 dark:text-slate-300">
                        Clear selection
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView style={{ maxHeight: 320 }} className="mt-4">
                    {organizerOptions.map((option) => {
                      const selected = selectedOrganizerIds.has(option.id);
                      const connectionLabel = Array.isArray(option.connectionTypes)
                        ? option.connectionTypes
                            .map((type) => (type === 'followers' ? 'Follower' : 'Following'))
                            .join(' • ')
                        : null;
                      return (
                        <TouchableOpacity
                          key={option.id}
                          onPress={() => handleToggleOrganizerSelection(option.id)}
                          className="mb-2 flex-row items-center justify-between rounded-xl border border-gray-100 px-3 py-2 dark:border-slate-700"
                        >
                          <View className="flex-1 pr-3">
                            <Text className="text-base font-semibold text-gray-900 dark:text-slate-100">
                              {option.name ?? 'Organizer'}
                            </Text>
                            {option.email ? (
                              <Text className="text-xs text-gray-500 dark:text-slate-400">
                                {option.email}
                              </Text>
                            ) : null}
                            {connectionLabel ? (
                              <Text className="text-[11px] uppercase text-gray-400 dark:text-slate-500">
                                {connectionLabel}
                              </Text>
                            ) : null}
                          </View>
                          <View
                            className={`h-7 w-7 items-center justify-center rounded-full ${
                              selected ? 'bg-emerald-600' : 'bg-gray-200 dark:bg-slate-700'
                            }`}
                          >
                            {selected ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </>
              )
            ) : null}
            <View className="mt-4 flex-row space-x-3">
              <TouchableOpacity
                onPress={handleCloseShareModal}
                className="flex-1 rounded-full border border-gray-300 py-2 dark:border-slate-600"
              >
                <Text className="text-center font-semibold text-gray-700 dark:text-slate-100">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleShareTrailWithOrganizers}
                disabled={shareSelectionCount === 0 || shareSubmitting}
                className={`flex-1 rounded-full py-2 ${
                  shareSelectionCount === 0 || shareSubmitting
                    ? 'bg-emerald-600/60'
                    : 'bg-emerald-600'
                }`}
              >
                <Text className="text-center font-semibold text-white">
                  {shareSubmitting
                    ? 'Sharing...'
                    : shareSelectionCount === 0
                      ? 'Select organizers'
                      : `Share (${shareSelectionCount})`}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
  const [trailSearchQuery, setTrailSearchQuery] = useState('');
  const [trailSearchFocused, setTrailSearchFocused] = useState(false);

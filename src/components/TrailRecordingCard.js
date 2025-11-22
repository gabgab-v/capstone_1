import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Share, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  buildTrailShareMessage,
  computeTrailDurationMs,
  formatTrailAverageSpeed,
  formatTrailDistance,
  formatTrailDuration,
  publishTrailRecordingPost,
} from '../utils/trailSharing';

export default function TrailRecordingCard({
  trail,
  canShare = false,
  onPress,
  onRename,
  onShareWithOrganizers,
}) {
  if (!trail) {
    return null;
  }

  const durationMs = useMemo(
    () => computeTrailDurationMs(trail.startedAt, trail.endedAt),
    [trail.endedAt, trail.startedAt],
  );
  const distanceLabel = useMemo(
    () => formatTrailDistance(trail.totalDistanceMeters),
    [trail.totalDistanceMeters],
  );
  const durationLabel = useMemo(() => formatTrailDuration(durationMs), [durationMs]);
  const speedLabel = useMemo(
    () => formatTrailAverageSpeed(trail.totalDistanceMeters, durationMs),
    [durationMs, trail.totalDistanceMeters],
  );
  const startLabel = useMemo(() => {
    if (!trail.startedAt) {
      return null;
    }
    return new Date(trail.startedAt).toLocaleString();
  }, [trail.startedAt]);

  const [posting, setPosting] = useState(false);

  const handleShareToFeed = useCallback(async () => {
    if (posting) {
      return;
    }
    setPosting(true);
    try {
      await publishTrailRecordingPost(trail);
      Alert.alert('Shared', 'Trail recording posted to your feed.');
    } catch (error) {
      console.error('Failed to share trail recording:', error);
      const message = error?.message ?? 'Unable to share right now. Please try again later.';
      Alert.alert('Share failed', message);
    } finally {
      setPosting(false);
    }
  }, [posting, trail]);

  const handleShareExternally = useCallback(async () => {
    try {
      const message = buildTrailShareMessage(trail);
      await Share.share({ message });
    } catch (error) {
      if (error?.message && error.message.includes('canceled')) {
        return;
      }
      console.error('Failed to open share sheet (recording card):', error);
      Alert.alert('Share unavailable', 'Unable to open the share sheet.');
    }
  }, [trail]);

  const handlePress = useCallback(() => {
    if (onPress) {
      onPress(trail);
    }
  }, [onPress, trail]);

  const handleRenamePress = useCallback(() => {
    if (onRename) {
      onRename(trail);
    }
  }, [onRename, trail]);

  const handleShareWithOrganizersPress = useCallback(() => {
    if (onShareWithOrganizers) {
      onShareWithOrganizers(trail);
    }
  }, [onShareWithOrganizers, trail]);

  const showManageActions = canShare && (onRename || onShareWithOrganizers);

  return (
    <View className="mt-3 rounded-2xl border border-gray-100 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <TouchableOpacity
        activeOpacity={onPress ? 0.85 : 1}
        disabled={!onPress}
        onPress={handlePress}
      >
        <View className="flex-row items-center justify-between">
          <Text className="flex-1 text-base font-semibold text-gray-900 dark:text-slate-100">
            {trail.label ?? 'Untitled Trail'}
          </Text>
          <View className="ml-2 flex-row items-center rounded-full bg-emerald-100 px-2 py-0.5 dark:bg-emerald-500/20">
            <Ionicons name="map-outline" size={14} color="#047857" />
            <Text className="ml-1 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
              {distanceLabel}
            </Text>
          </View>
        </View>
        {startLabel ? (
          <Text className="mt-1 text-xs text-gray-500 dark:text-slate-400">
            Recorded {startLabel}
          </Text>
        ) : null}
        <View className="mt-3 flex-row">
          <View className="flex-1">
            <Text className="text-[11px] font-semibold uppercase text-gray-400 dark:text-slate-500">
              Duration
            </Text>
            <Text className="mt-1 text-sm font-semibold text-gray-900 dark:text-slate-100">
              {durationLabel}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="text-[11px] font-semibold uppercase text-gray-400 dark:text-slate-500">
              Avg Speed
            </Text>
            <Text className="mt-1 text-sm font-semibold text-gray-900 dark:text-slate-100">
              {speedLabel}
            </Text>
          </View>
        </View>
        {onPress ? (
          <View className="mt-3 flex-row items-center">
            <Ionicons name="eye-outline" size={14} color="#2563eb" />
            <Text className="ml-2 text-xs font-semibold text-blue-600 dark:text-blue-300">
              Tap to view the map
            </Text>
          </View>
        ) : null}
      </TouchableOpacity>
      {showManageActions ? (
        <View className="mt-4 flex-row space-x-2">
          {onRename ? (
            <TouchableOpacity
              onPress={handleRenamePress}
              className="flex-1 rounded-full border border-emerald-500 bg-white py-2 dark:border-emerald-400 dark:bg-slate-900"
            >
              <Text className="text-center text-sm font-semibold text-emerald-700 dark:text-emerald-200">
                Name Trail
              </Text>
            </TouchableOpacity>
          ) : null}
          {onShareWithOrganizers ? (
            <TouchableOpacity
              onPress={handleShareWithOrganizersPress}
              className="flex-1 rounded-full bg-emerald-600 py-2 dark:bg-emerald-500/80"
            >
              <Text className="text-center text-sm font-semibold text-white">
                Share w/ organizers
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {canShare ? (
        <View className="mt-4 flex-row space-x-2">
          <TouchableOpacity
            onPress={handleShareToFeed}
            disabled={posting}
            className={`flex-1 rounded-full py-2 ${posting ? 'bg-blue-800/70' : 'bg-blue-600 dark:bg-blue-500/80'}`}
          >
            <Text className="text-center text-sm font-semibold text-white">
              {posting ? 'Posting...' : 'Post to Feed'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleShareExternally}
            className="flex-1 rounded-full border border-blue-500 bg-white py-2 dark:border-blue-400 dark:bg-slate-900"
          >
            <Text className="text-center text-sm font-semibold text-blue-600 dark:text-blue-300">
              Share
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

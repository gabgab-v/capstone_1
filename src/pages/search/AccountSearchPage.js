import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { del, get, post } from '../../lib/api';
import { useTheme } from '../../context/ThemeContext';
import { ensureAvatarUri } from '../../utils/media';

function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

export default function AccountSearchPage({ navigation }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [followUpdatingIds, setFollowUpdatingIds] = useState(() => new Set());

  const debouncedQuery = useDebouncedValue(query, 300);
  const trimmedQuery = debouncedQuery.trim();

  const fetchResults = useCallback(
    async ({ refreshing: isRefreshing = false } = {}) => {
      if (!trimmedQuery) {
        setResults([]);
        setError(null);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (isRefreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const params = new URLSearchParams();
        params.append('q', trimmedQuery);
        params.append('limit', '20');
        const data = await get(`/api/users/search?${params.toString()}`);
        setResults(Array.isArray(data?.users) ? data.users : []);
      } catch (err) {
        console.error('Failed to search users:', err);
        setResults([]);
        setError(err?.body?.error || err?.message || 'Unable to search right now.');
      } finally {
        if (isRefreshing) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [trimmedQuery],
  );

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  const handleRefresh = useCallback(() => {
    if (!trimmedQuery) {
      return;
    }
    fetchResults({ refreshing: true });
  }, [fetchResults, trimmedQuery]);

  const handleSelectUser = useCallback(
    (user) => {
      if (!user?.id) {
        return;
      }
      navigation.push('UserProfile', { userId: user.id });
    },
    [navigation],
  );

  const handleToggleFollow = useCallback(
    async (user) => {
      if (!user?.id || user.isSelf) {
        return;
      }
      if (followUpdatingIds.has(user.id)) {
        return;
      }

      setFollowUpdatingIds((prev) => {
        const next = new Set(prev);
        next.add(user.id);
        return next;
      });

      try {
        const endpoint = `/api/users/${user.id}/follow`;
        const result = user.isViewerFollowing ? await del(endpoint) : await post(endpoint);
        setResults((current) =>
          current.map((item) => {
            if (item.id !== user.id) {
              return item;
            }
            const nextFollowing =
              typeof result?.isFollowing === 'boolean'
                ? result.isFollowing
                : !item.isViewerFollowing;
            return { ...item, isViewerFollowing: nextFollowing };
          }),
        );
      } catch (followError) {
        console.error('Failed to update follow state:', followError);
        Alert.alert(
          'Follow failed',
          followError?.body?.error ||
            followError?.message ||
            'Unable to update follow status right now.',
        );
      } finally {
        setFollowUpdatingIds((prev) => {
          const next = new Set(prev);
          next.delete(user.id);
          return next;
        });
      }
    },
    [followUpdatingIds],
  );

  const listEmpty = useMemo(() => {
    if (!trimmedQuery) {
      return (
        <View style={styles.emptyState}>
          <Icon name="search" size={28} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
            Search for accounts
          </Text>
          <Text style={[styles.emptyMessage, { color: colors.textSecondary }]}>
            Try a name, email, or bio keyword to find hikers and organizers.
          </Text>
        </View>
      );
    }

    if (loading) {
      return (
        <View style={styles.emptyState}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={[styles.emptyMessage, { color: colors.textSecondary }]}>
            Searching...
          </Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
            Unable to search
          </Text>
          <Text style={[styles.emptyMessage, { color: colors.textSecondary }]}>{error}</Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyState}>
        <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No matches</Text>
        <Text style={[styles.emptyMessage, { color: colors.textSecondary }]}>
          No accounts match "{trimmedQuery}".
        </Text>
      </View>
    );
  }, [
    colors.accent,
    colors.textMuted,
    colors.textPrimary,
    colors.textSecondary,
    error,
    loading,
    trimmedQuery,
  ]);

  const renderItem = useCallback(
    ({ item }) => {
      const displayName = item?.name ?? item?.email ?? 'Explorer';
      const subtitle =
        item?.bio ?? (item?.role === 'ORGANIZER' ? 'Organizer' : 'Hiker in the community');
      const avatarUri = ensureAvatarUri(item?.avatarUrl, item?.id ?? item?.email ?? 'user');
      const isUpdating = followUpdatingIds.has(item.id);
      const isFollowing = Boolean(item?.isViewerFollowing);

      return (
        <TouchableOpacity
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
          activeOpacity={0.85}
          onPress={() => handleSelectUser(item)}
        >
          <Image source={{ uri: avatarUri }} style={styles.avatar} />
          <View style={styles.cardBody}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {displayName}
            </Text>
            <Text
              style={[styles.cardSubtitle, { color: colors.textSecondary }]}
              numberOfLines={2}
            >
              {subtitle || 'Explorer'}
            </Text>
          </View>
          {item?.isSelf ? (
            <View style={[styles.selfBadge, { backgroundColor: colors.surfaceMuted }]}>
              <Text style={[styles.selfBadgeText, { color: colors.textSecondary }]}>You</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[
                styles.followButton,
                isFollowing
                  ? { borderColor: colors.accent, borderWidth: 1, backgroundColor: colors.surface }
                  : { backgroundColor: colors.accent },
                isUpdating ? { opacity: 0.7 } : null,
              ]}
              onPress={() => handleToggleFollow(item)}
              disabled={isUpdating}
            >
              <Text
                style={[
                  styles.followButtonText,
                  { color: isFollowing ? colors.accent : '#ffffff' },
                ]}
              >
                {isUpdating ? 'Updating...' : isFollowing ? 'Following' : 'Follow'}
              </Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      );
    },
    [
      colors.accent,
      colors.border,
      colors.surface,
      colors.surfaceMuted,
      colors.textPrimary,
      colors.textSecondary,
      followUpdatingIds,
      handleSelectUser,
      handleToggleFollow,
    ],
  );

  const resultsCountLabel = trimmedQuery
    ? `${results.length} result${results.length === 1 ? '' : 's'}`
    : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="chevron-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Search</Text>
      </View>

      <View
        style={[
          styles.searchRow,
          { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
        ]}
      >
        <Icon name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: colors.inputText }]}
          placeholder="Search hikers or organizers"
          placeholderTextColor={colors.placeholder ?? colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {query ? (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Icon name="x-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {resultsCountLabel ? (
        <Text style={[styles.metaText, { color: colors.textSecondary }]}>
          {resultsCountLabel}
        </Text>
      ) : null}

      <FlatList
        data={results}
        keyExtractor={(item, index) => item?.id ?? `search-${index}`}
        renderItem={renderItem}
        style={styles.list}
        contentContainerStyle={results.length === 0 ? styles.listEmpty : null}
        ListEmptyComponent={listEmpty}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />
        }
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  backButton: {
    marginRight: 8,
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    marginRight: 8,
    fontSize: 15,
  },
  metaText: {
    fontSize: 12,
    fontWeight: '600',
    marginHorizontal: 16,
    marginBottom: 8,
  },
  list: {
    flex: 1,
    paddingHorizontal: 16,
  },
  listEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
    backgroundColor: '#E5E7EB',
  },
  cardBody: {
    flex: 1,
    marginRight: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  cardSubtitle: {
    fontSize: 12,
    marginTop: 4,
  },
  followButton: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  selfBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  selfBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 6,
  },
  emptyMessage: {
    fontSize: 13,
    textAlign: 'center',
  },
});

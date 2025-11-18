import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { get } from '../../lib/api';
import { ensureAvatarUri } from '../../utils/media';
import { useTheme } from '../../context/ThemeContext';

function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

export default function ConnectionsListPage({ navigation, route }) {
  const params = route?.params ?? {};
  const userId = params.userId ?? 'me';
  const initialType = params.initialType === 'following' ? 'following' : 'followers';
  const profileName = params.profileName ?? 'Profile';

  const [type, setType] = useState(initialType);
  const [search, setSearch] = useState('');
  const [connections, setConnections] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const debouncedSearch = useDebouncedValue(search, 350);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const fetchConnections = useCallback(
    async ({ refreshing: isRefreshing = false } = {}) => {
      if (isRefreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const params = new URLSearchParams();
        params.append('kind', type);
        params.append('limit', '200');
        if (debouncedSearch) {
          params.append('q', debouncedSearch);
        }
        const data = await get(`/api/users/${userId}/connections?${params.toString()}`);
        setConnections(Array.isArray(data?.users) ? data.users : []);
        const total =
          typeof data?.totalCount === 'number'
            ? data.totalCount
            : typeof data?.count === 'number'
            ? data.count
            : 0;
        setTotalCount(Math.max(0, total));
      } catch (err) {
        console.error('Failed to load connections:', err);
        setConnections([]);
        setTotalCount(0);
        setError(err?.body?.error || err?.message || 'Unable to load connections right now.');
      } finally {
        if (isRefreshing) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [debouncedSearch, type, userId],
  );

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const title = type === 'following' ? 'Following' : 'Followers';
  const countLabel =
    type === 'following'
      ? `${totalCount} following`
      : `${totalCount} follower${totalCount === 1 ? '' : 's'}`;
  const showingLabel =
    connections.length !== totalCount
      ? `Showing ${connections.length} result${connections.length === 1 ? '' : 's'}`
      : null;

  const emptyMessage =
    type === 'following'
      ? 'Start following other hikers to see them here.'
      : 'When hikers follow this profile, they will appear here.';

  const handleChangeType = useCallback((nextType) => {
    setType((current) => {
      const normalized = nextType === 'following' ? 'following' : 'followers';
      if (normalized === current) {
        return current;
      }
      return normalized;
    });
  }, []);

  const handleRefresh = useCallback(() => {
    fetchConnections({ refreshing: true });
  }, [fetchConnections]);

  const handleSelectUser = useCallback(
    (user) => {
      if (!user?.id) {
        return;
      }
      navigation.push('Profile', { userId: user.id });
    },
    [navigation],
  );

  const renderItem = useCallback(
    ({ item }) => {
      const displayName = item?.name ?? item?.email ?? 'Explorer';
      const subtitle =
        item?.bio ?? (item?.role === 'ORGANIZER' ? 'Organizer' : 'Hiker in the community');
      const avatarUri = ensureAvatarUri(item?.avatarUrl, item?.id ?? item?.email ?? 'user');
      return (
        <TouchableOpacity
          style={[styles.card, { backgroundColor: colors.surface }]}
          activeOpacity={0.85}
          onPress={() => handleSelectUser(item)}
        >
          <Image source={{ uri: avatarUri }} style={styles.avatar} />
          <View style={styles.cardBody}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]} numberOfLines={2}>
              {subtitle || 'Explorer'}
            </Text>
          </View>
          {item?.role === 'ORGANIZER' ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Organizer</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      );
    },
    [colors.surface, colors.textPrimary, colors.textSecondary, handleSelectUser],
  );

  const listEmpty = useMemo(() => {
    if (loading) {
      return (
        <View style={styles.emptyState}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={[styles.emptyMessage, { color: colors.textSecondary }]}>
            Loading connections...
          </Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Unable to load</Text>
          <Text style={[styles.emptyMessage, { color: colors.textSecondary }]}>{error}</Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyState}>
        <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No results</Text>
        <Text style={[styles.emptyMessage, { color: colors.textSecondary }]}>{emptyMessage}</Text>
      </View>
    );
  }, [colors.accent, colors.textPrimary, colors.textSecondary, emptyMessage, error, loading]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="chevron-left" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTextGroup}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{title}</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {profileName}
          </Text>
        </View>
      </View>

      <View style={[styles.tabContainer, { backgroundColor: colors.surfaceMuted ?? '#E5E7EB' }]}>
        {['followers', 'following'].map((option) => {
          const active = type === option;
          return (
            <TouchableOpacity
              key={option}
              style={[
                styles.tabButton,
                active && { backgroundColor: colors.surface, shadowColor: '#000', elevation: 2 },
              ]}
              onPress={() => handleChangeType(option)}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.tabLabel,
                  { color: active ? colors.textPrimary : colors.textSecondary },
                ]}
              >
                {option === 'followers' ? 'Followers' : 'Following'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.metaRow}>
        <Text style={[styles.metaText, { color: colors.textSecondary }]}>{countLabel}</Text>
        {showingLabel ? (
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>{showingLabel}</Text>
        ) : null}
      </View>

      <View style={[styles.searchRow, { backgroundColor: colors.surfaceMuted ?? '#E5E7EB' }]}>
        <Icon name="search" size={16} color={colors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: colors.textPrimary }]}
          placeholder={type === 'following' ? 'Search people you follow' : 'Search followers'}
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Icon name="x-circle" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        data={connections}
        keyExtractor={(item, index) => item?.id ?? `connection-${index}`}
        renderItem={renderItem}
        style={styles.list}
        contentContainerStyle={connections.length === 0 ? styles.listEmpty : null}
        ListEmptyComponent={listEmpty}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />
        }
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
    paddingBottom: 16,
  },
  backButton: {
    marginRight: 12,
    padding: 4,
  },
  headerTextGroup: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    borderRadius: 999,
    padding: 3,
    marginBottom: 12,
  },
  tabButton: {
    flex: 1,
    borderRadius: 999,
    alignItems: 'center',
    paddingVertical: 8,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  metaText: {
    fontSize: 12,
    fontWeight: '600',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    marginRight: 8,
    fontSize: 14,
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
    borderColor: '#E2E8F0',
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
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  cardSubtitle: {
    fontSize: 12,
    marginTop: 4,
  },
  badge: {
    backgroundColor: '#D1FAE5',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#047857',
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  emptyMessage: {
    fontSize: 13,
    textAlign: 'center',
  },
});

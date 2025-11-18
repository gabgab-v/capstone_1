import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';

import { get } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { ensureAvatarUri } from '../../utils/media';

function getPeerInitials(peer) {
  if (!peer) {
    return '?';
  }
  const source = peer.name || peer.email || '';
  const parts = source.trim().split(/\s+/).slice(0, 2);
  if (parts.length === 0) {
    return '?';
  }
  return parts
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
    .slice(0, 2);
}

function getPeerAvatarUri(peer) {
  if (!peer) {
    return null;
  }
  const seed = peer.id ?? peer.email ?? 'chat';
  return ensureAvatarUri(peer.avatarUrl, seed);
}

function formatTimestamp(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString();
}

function ConversationItem({ conversation, currentUserId, onPress }) {
  const isEventChat = Boolean(conversation?.event?.id);
  const primaryPeer = conversation?.peers?.[0] ?? null;
  const title = isEventChat
    ? conversation?.event?.title || 'Event chat'
    : primaryPeer?.name || primaryPeer?.email || 'Conversation';
  const lastMessage = conversation?.lastMessage ?? null;
  const previewPrefix = lastMessage?.sender?.id === currentUserId ? 'You: ' : '';
  const previewBody = lastMessage?.body || 'No messages yet.';
  const preview = `${previewPrefix}${previewBody}`.trim();
  const timestamp = formatTimestamp(lastMessage?.createdAt || conversation?.updatedAt);
  const unreadCount = conversation?.unreadCount ?? 0;
  const avatarUri = isEventChat ? null : getPeerAvatarUri(primaryPeer);

  return (
    <TouchableOpacity style={styles.itemContainer} onPress={onPress} activeOpacity={0.85}>
      <View
        style={[
          styles.avatar,
          avatarUri ? styles.avatarWithImage : null,
          isEventChat ? styles.avatarEvent : null,
        ]}
      >
        {isEventChat ? (
          <Icon name="users" size={20} color="#065f46" />
        ) : avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
        ) : (
          <Text style={styles.avatarText}>{getPeerInitials(primaryPeer)}</Text>
        )}
      </View>
      <View style={styles.itemContent}>
        <View style={styles.itemHeader}>
          <Text style={styles.itemTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.itemTimestamp}>{timestamp}</Text>
        </View>
        {isEventChat ? (
          <View style={styles.eventBadge}>
            <Text style={styles.eventBadgeText}>Event chat</Text>
          </View>
        ) : null}
        <View style={styles.itemFooter}>
          <Text
            style={[styles.itemPreview, unreadCount > 0 ? styles.itemPreviewUnread : null]}
            numberOfLines={1}
          >
            {preview}
          </Text>
          {unreadCount > 0 ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>
                {unreadCount > 99 ? '99+' : unreadCount.toString()}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function ChatListPage({ navigation }) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const pollingRef = useRef(null);

  const loadConversations = useCallback(
    async ({ silent = false, refreshing: isRefreshing = false } = {}) => {
      if (isRefreshing) {
        setRefreshing(true);
      } else if (!silent) {
        setLoading(true);
      }

      try {
        const data = await get('/api/chats');
        setConversations(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Failed to load conversations:', error);
        if (!silent) {
          const message =
            error?.body?.error || error?.message || 'Unable to load messages right now.';
          Alert.alert('Messages unavailable', message);
        }
      } finally {
        if (isRefreshing) {
          setRefreshing(false);
        } else if (!silent) {
          setLoading(false);
        }
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      loadConversations();
      pollingRef.current = setInterval(() => {
        loadConversations({ silent: true });
      }, 10000);

      return () => {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      };
    }, [loadConversations]),
  );

  const handleRefresh = useCallback(() => {
    loadConversations({ refreshing: true });
  }, [loadConversations]);

  const renderConversation = useCallback(
    ({ item }) => (
      <ConversationItem
        conversation={item}
        currentUserId={user?.id}
        onPress={() =>
          navigation.navigate('ChatConversation', {
            conversationId: item.id,
            peers: item.peers ?? [],
            initialConversation: item,
          })
        }
      />
    ),
    [navigation, user?.id],
  );

  const emptyState = useMemo(() => {
    if (loading) {
      return null;
    }
    return (
      <View style={styles.emptyContainer}>
        <Icon name="message-circle" size={48} color="#9CA3AF" />
        <Text style={styles.emptyTitle}>Start a conversation</Text>
        <Text style={styles.emptySubtitle}>Find hikers from events or profiles and send a message.</Text>
      </View>
    );
  }, [loading]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
        <Text style={styles.headerSubtitle}>Chat with your fellow hikers</Text>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#2E7D32" />
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={renderConversation}
          contentContainerStyle={conversations.length === 0 ? styles.listEmptyContent : styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#2E7D32" />
          }
          ListEmptyComponent={emptyState}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#6B7280',
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  listEmptyContent: {
    paddingHorizontal: 16,
    paddingVertical: 48,
    flexGrow: 1,
    justifyContent: 'center',
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarEvent: {
    backgroundColor: '#E0F2FE',
  },
  avatarWithImage: {
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#166534',
  },
  itemContent: {
    flex: 1,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eventBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#DBEAFE',
    marginBottom: 4,
  },
  eventBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1D4ED8',
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginRight: 8,
  },
  itemTimestamp: {
    fontSize: 12,
    color: '#6B7280',
  },
  itemFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  itemPreview: {
    flex: 1,
    fontSize: 13,
    color: '#6B7280',
  },
  itemPreviewUnread: {
    color: '#111827',
    fontWeight: '600',
  },
  unreadBadge: {
    marginLeft: 8,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  emptySubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});

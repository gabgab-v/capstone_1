import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';

import { get, post } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

function formatTimestamp(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function MessageBubble({ message, isSelf }) {
  const bubbleStyles = [
    styles.messageBubble,
    isSelf ? styles.messageBubbleSelf : styles.messageBubblePeer,
  ];
  const textStyles = [
    styles.messageText,
    isSelf ? styles.messageTextSelf : styles.messageTextPeer,
  ];

  return (
    <View style={[styles.messageRow, isSelf ? styles.messageRowSelf : styles.messageRowPeer]}>
      <View style={bubbleStyles}>
        <Text style={textStyles}>{message.body}</Text>
        <Text style={[styles.messageMeta, isSelf ? styles.messageMetaSelf : styles.messageMetaPeer]}>
          {formatTimestamp(message.createdAt)}
        </Text>
      </View>
    </View>
  );
}

export default function ChatConversationPage({ route, navigation }) {
  const { user } = useAuth();
  const conversationId = route?.params?.conversationId;
  const providedPeers = route?.params?.peers ?? [];
  const initialConversation = route?.params?.initialConversation ?? null;

  const peers = useMemo(() => {
    if (providedPeers.length > 0) {
      return providedPeers;
    }
    if (initialConversation?.peers?.length) {
      return initialConversation.peers;
    }
    return [];
  }, [initialConversation, providedPeers]);

  const primaryPeer = peers[0] ?? null;
  const headerTitle = primaryPeer?.name || primaryPeer?.email || 'Chat';
  const headerSubtitle =
    primaryPeer?.email && primaryPeer?.name && primaryPeer.email !== primaryPeer.name
      ? primaryPeer.email
      : null;

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [fetchingMore, setFetchingMore] = useState(false);

  const listRef = useRef(null);
  const pollingRef = useRef(null);
  const initialScrollDone = useRef(false);

  const loadMessages = useCallback(
    async ({ cursor, append = false, silent = false } = {}) => {
      if (!conversationId) {
        return;
      }

      if (append) {
        setFetchingMore(true);
      } else if (!silent) {
        setLoading(true);
      }

      try {
        const params = new URLSearchParams();
        if (cursor) {
          params.append('cursor', cursor);
        }
        if (!append) {
          params.append('markRead', 'true');
        }
        const query = params.toString() ? `?${params.toString()}` : '';

        const response = await get(`/api/chats/${conversationId}/messages${query}`);
        const fetchedMessages = Array.isArray(response?.messages) ? response.messages : [];
        const cursorToken = response?.nextCursor ?? null;

        setNextCursor(cursorToken);
        setMessages((previous) => (append ? [...fetchedMessages, ...previous] : fetchedMessages));

        if (!append && !silent) {
          initialScrollDone.current = false;
        }
      } catch (error) {
        console.error(`Failed to load messages for conversation ${conversationId}:`, error);
        if (!silent) {
          const message =
            error?.body?.error ||
            error?.message ||
            'Unable to load this conversation right now.';
          Alert.alert('Conversation unavailable', message);
        }
      } finally {
        if (append) {
          setFetchingMore(false);
        } else if (!silent) {
          setLoading(false);
        }
      }
    },
    [conversationId],
  );

  useFocusEffect(
    useCallback(() => {
      loadMessages();

      pollingRef.current = setInterval(() => {
        loadMessages({ silent: true });
      }, 5000);

      return () => {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      };
    }, [loadMessages]),
  );

  useEffect(() => {
    if (!loading && messages.length > 0 && !initialScrollDone.current) {
      const timeout = setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: false });
        initialScrollDone.current = true;
      }, 100);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [loading, messages.length]);

  const handleLoadOlder = useCallback(() => {
    if (nextCursor && !fetchingMore) {
      loadMessages({ cursor: nextCursor, append: true, silent: true });
    }
  }, [fetchingMore, loadMessages, nextCursor]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || !conversationId) {
      return;
    }

    setSending(true);
    try {
      const message = await post(`/api/chats/${conversationId}/messages`, { body: trimmed });
      setMessages((previous) => [...previous, message]);
      setInput('');
      initialScrollDone.current = false;
      setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 80);
    } catch (error) {
      console.error('Failed to send message:', error);
      const message =
        error?.body?.error || error?.message || 'Unable to send your message right now.';
      Alert.alert('Message not sent', message);
    } finally {
      setSending(false);
    }
  }, [conversationId, input]);

  const renderMessage = useCallback(
    ({ item }) => (
      <MessageBubble message={item} isSelf={item?.sender?.id === user?.id} />
    ),
    [user?.id],
  );

  const listHeader = useMemo(() => {
    if (!nextCursor) {
      return <View style={styles.listTopSpacer} />;
    }
    return (
      <TouchableOpacity
        style={styles.loadMoreButton}
        onPress={handleLoadOlder}
        disabled={fetchingMore}
        activeOpacity={0.7}
      >
        {fetchingMore ? (
          <ActivityIndicator size="small" color="#1F2937" />
        ) : (
          <Text style={styles.loadMoreText}>Load earlier messages</Text>
        )}
      </TouchableOpacity>
    );
  }, [fetchingMore, handleLoadOlder, nextCursor]);

  const canSend = input.trim().length > 0 && !sending;

  if (!conversationId) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>Conversation not found.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityLabel="Back"
        >
          <Icon name="chevron-left" size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {headerTitle}
          </Text>
          {headerSubtitle ? (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {headerSubtitle}
            </Text>
          ) : null}
        </View>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#2E7D32" />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={[styles.listContent, messages.length === 0 ? styles.listEmpty : null]}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Icon name="message-circle" size={48} color="#9CA3AF" />
              <Text style={styles.emptyStateTitle}>Say hello</Text>
              <Text style={styles.emptyStateSubtitle}>Be the first to send a message in this conversation.</Text>
            </View>
          }
        />
      )}

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder="Type a message"
          value={input}
          onChangeText={setInput}
          editable={!sending}
          returnKeyType="send"
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity
          style={[styles.sendButton, !canSend ? styles.sendButtonDisabled : null]}
          onPress={handleSend}
          disabled={!canSend}
          accessibilityLabel="Send message"
        >
          {sending ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Icon name="send" size={18} color="#ffffff" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 8,
    marginRight: 12,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#6B7280',
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    flexGrow: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  listEmpty: {
    justifyContent: 'center',
  },
  listTopSpacer: {
    height: 12,
  },
  loadMoreButton: {
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  loadMoreText: {
    fontSize: 12,
    color: '#1F2937',
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  emptyStateSubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  messageRow: {
    marginBottom: 12,
    flexDirection: 'row',
  },
  messageRowSelf: {
    justifyContent: 'flex-end',
  },
  messageRowPeer: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  messageBubbleSelf: {
    backgroundColor: '#166534',
    borderBottomRightRadius: 4,
  },
  messageBubblePeer: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  messageTextSelf: {
    color: '#FFFFFF',
  },
  messageTextPeer: {
    color: '#111827',
  },
  messageMeta: {
    marginTop: 4,
    fontSize: 11,
  },
  messageMetaSelf: {
    color: '#DCFCE7',
    textAlign: 'right',
  },
  messageMetaPeer: {
    color: '#6B7280',
    textAlign: 'left',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  input: {
    flex: 1,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    fontSize: 15,
  },
  sendButton: {
    marginLeft: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#A7F3D0',
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
    padding: 24,
  },
  fallbackText: {
    fontSize: 16,
    color: '#6B7280',
  },
});

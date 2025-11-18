import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
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

import { del, get, post } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ensureAvatarUri } from '../../utils/media';

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

function getSenderInitials(sender) {
  const name = sender?.name ?? sender?.email ?? '';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
}

function MessageBubble({ message, isSelf, styles, canDelete, onLongPress, isDeleting }) {
  const bubbleStyles = [
    styles.messageBubble,
    isSelf ? styles.messageBubbleSelf : styles.messageBubblePeer,
  ];
  if (isDeleting) {
    bubbleStyles.push(styles.messageBubbleDeleting);
  }
  if (!isSelf) {
    bubbleStyles.push(styles.messageBubblePeerWithAvatar);
  }

  const textStyles = [
    styles.messageText,
    isSelf ? styles.messageTextSelf : styles.messageTextPeer,
  ];

  const senderSeed =
    message?.sender?.id ?? message?.sender?.email ?? message?.sender?.name ?? 'chat';
  const avatarUri = ensureAvatarUri(message?.sender?.avatarUrl, senderSeed);
  const showAvatar = !isSelf;

  return (
    <View style={[styles.messageRow, isSelf ? styles.messageRowSelf : styles.messageRowPeer]}>
      {showAvatar ? (
        <View style={[styles.messageAvatar, avatarUri ? styles.messageAvatarHasImage : null]}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.messageAvatarImage} />
          ) : (
            <Text style={styles.messageAvatarText}>{getSenderInitials(message?.sender)}</Text>
          )}
        </View>
      ) : null}
      <TouchableOpacity
        activeOpacity={canDelete ? 0.7 : 1}
        onLongPress={canDelete ? () => onLongPress?.(message) : undefined}
        delayLongPress={250}
        style={bubbleStyles}
      >
        <Text style={textStyles}>{message.body}</Text>
        <Text style={[styles.messageMeta, isSelf ? styles.messageMetaSelf : styles.messageMetaPeer]}>
          {formatTimestamp(message.createdAt)}
        </Text>
        {isDeleting ? (
          <View style={styles.messageDeletingOverlay}>
            <ActivityIndicator size="small" color="#ffffff" />
          </View>
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

export default function ChatConversationPage({ route, navigation }) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const accentColor = colors?.accent ?? '#2E7D32';
  const iconColor = colors?.textPrimary ?? '#111827';
  const mutedIconColor = colors?.textMuted ?? '#9CA3AF';
  const inverseTextColor = colors?.textInverse ?? '#ffffff';
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
  const primaryPeerId = primaryPeer?.id ?? null;

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState(null);

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

  const deleteMessage = useCallback(
    async (messageId) => {
      if (!conversationId || !messageId) {
        return;
      }
      setDeletingMessageId(messageId);
      try {
        await del(`/api/chats/${conversationId}/messages/${messageId}`);
        setMessages((previous) => previous.filter((message) => message.id !== messageId));
      } catch (error) {
        console.error('Failed to delete message:', error);
        const message =
          error?.body?.error ||
          error?.message ||
          'Unable to delete this message right now.';
        Alert.alert('Delete failed', message);
      } finally {
        setDeletingMessageId(null);
      }
    },
    [conversationId],
  );

  const handleMessageLongPress = useCallback(
    (message) => {
      if (!message?.id || message?.sender?.id !== user?.id) {
        return;
      }
      Alert.alert('Delete message?', 'This will permanently remove the message.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteMessage(message.id),
        },
      ]);
    },
    [deleteMessage, user?.id],
  );

  const renderMessage = useCallback(
    ({ item }) => {
      const isSelf = item?.sender?.id === user?.id;
      return (
        <MessageBubble
          message={item}
          isSelf={isSelf}
          styles={styles}
          canDelete={isSelf}
          onLongPress={handleMessageLongPress}
          isDeleting={deletingMessageId === item?.id}
        />
      );
    },
    [deletingMessageId, handleMessageLongPress, styles, user?.id],
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
          <ActivityIndicator size="small" color={iconColor} />
        ) : (
          <Text style={styles.loadMoreText}>Load earlier messages</Text>
        )}
      </TouchableOpacity>
    );
  }, [fetchingMore, handleLoadOlder, nextCursor]);

  const canSend = input.trim().length > 0 && !sending;
  const canOpenPeerProfile = Boolean(primaryPeerId);

  const handleViewPeerProfile = useCallback(() => {
    if (!primaryPeerId) {
      return;
    }
    navigation.navigate('UserProfile', { userId: primaryPeerId });
  }, [navigation, primaryPeerId]);

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
          <Icon name="chevron-left" size={24} color={iconColor} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.headerInfo, !canOpenPeerProfile ? styles.headerInfoDisabled : null]}
          onPress={handleViewPeerProfile}
          disabled={!canOpenPeerProfile}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Open profile"
        >
          <Text style={styles.headerTitle} numberOfLines={1}>
            {headerTitle}
          </Text>
          {headerSubtitle ? (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {headerSubtitle}
            </Text>
          ) : null}
          {canOpenPeerProfile ? (
            <Text style={styles.headerLink}>View profile</Text>
          ) : null}
        </TouchableOpacity>
        {canOpenPeerProfile ? (
          <TouchableOpacity
            style={styles.profileButton}
            onPress={handleViewPeerProfile}
            activeOpacity={0.85}
            accessibilityLabel="Go to profile"
          >
            <Icon name="user" size={18} color={iconColor} />
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={accentColor} />
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
              <Icon name="message-circle" size={48} color={mutedIconColor} />
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
            <ActivityIndicator size="small" color={inverseTextColor} />
          ) : (
            <Icon name="send" size={18} color={inverseTextColor} />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
function createStyles(theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 12,
      backgroundColor: theme.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    backButton: {
      padding: 8,
      marginRight: 12,
    },
    headerInfo: {
      flex: 1,
    },
    headerInfoDisabled: {
      opacity: 0.6,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.textPrimary,
    },
    headerSubtitle: {
      marginTop: 2,
      fontSize: 12,
      color: theme.textSecondary,
    },
    headerLink: {
      marginTop: 2,
      fontSize: 12,
      color: theme.accent ?? '#2E7D32',
    },
    profileButton: {
      padding: 8,
      marginLeft: 4,
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
      borderColor: theme.border,
      marginBottom: 12,
      backgroundColor: theme.surface,
    },
    loadMoreText: {
      fontSize: 12,
      color: theme.textPrimary,
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
      color: theme.textPrimary,
    },
    emptyStateSubtitle: {
      marginTop: 6,
      fontSize: 13,
      color: theme.textSecondary,
      textAlign: 'center',
      paddingHorizontal: 24,
    },
    messageRow: {
      marginBottom: 12,
      flexDirection: 'row',
      alignItems: 'flex-end',
    },
    messageRowSelf: {
      justifyContent: 'flex-end',
    },
    messageRowPeer: {
      justifyContent: 'flex-start',
    },
    messageAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: theme.accentSurface,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
    },
    messageAvatarHasImage: {
      backgroundColor: theme.surfaceMuted,
      overflow: 'hidden',
    },
    messageAvatarImage: {
      width: '100%',
      height: '100%',
      borderRadius: 18,
    },
    messageAvatarText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.accent,
    },
    messageBubble: {
      maxWidth: '80%',
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 16,
    },
    messageBubbleSelf: {
      backgroundColor: theme.accent,
      borderBottomRightRadius: 4,
    },
    messageBubblePeer: {
      backgroundColor: theme.surface,
      borderBottomLeftRadius: 4,
      borderWidth: 1,
      borderColor: theme.border,
    },
    messageBubblePeerWithAvatar: {
      marginLeft: 4,
    },
    messageBubbleDeleting: {
      opacity: 0.6,
    },
    messageDeletingOverlay: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: 'rgba(0,0,0,0.25)',
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    messageText: {
      fontSize: 15,
      lineHeight: 20,
    },
    messageTextSelf: {
      color: theme.textInverse,
    },
    messageTextPeer: {
      color: theme.textPrimary,
    },
    messageMeta: {
      marginTop: 4,
      fontSize: 11,
    },
    messageMetaSelf: {
      color: theme.accentSurface,
      textAlign: 'right',
    },
    messageMetaPeer: {
      color: theme.textSecondary,
      textAlign: 'left',
    },
    composer: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      backgroundColor: theme.surface,
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
    input: {
      flex: 1,
      height: 44,
      paddingHorizontal: 14,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceMuted,
      fontSize: 15,
      color: theme.textPrimary,
    },
    sendButton: {
      marginLeft: 12,
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendButtonDisabled: {
      backgroundColor: theme.accentSurface,
    },
    fallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surface,
      padding: 24,
    },
    fallbackText: {
      fontSize: 16,
      color: theme.textSecondary,
    },
  });
}

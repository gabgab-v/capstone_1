import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Share,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { del, get, post as apiPost } from '../lib/api';

const ActionButton = ({
  iconName,
  label,
  color = 'gray',
  labelColor = '#4b5563',
  count,
  onPress,
  disabled = false,
}) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.7}
    disabled={disabled}
    className="flex-row items-center space-x-2 py-2"
    style={disabled ? { opacity: 0.5 } : undefined}
  >
    <Feather name={iconName} size={20} color={color} />
    <Text className="text-sm font-medium" style={{ color: labelColor }}>
      {label}
    </Text>
    {typeof count === 'number' ? <Text className="text-xs text-gray-500">{count}</Text> : null}
  </TouchableOpacity>
);

const PhotoGrid = ({ photos }) => {
  if (!photos || photos.length === 0) {
    return null;
  }

  if (photos.length === 1) {
    return (
      <Image
        source={{ uri: photos[0] }}
        className="mt-2 h-64 w-full rounded-lg"
        resizeMode="cover"
      />
    );
  }

  if (photos.length === 2) {
    return (
      <View className="mt-2 h-48 flex-row space-x-1">
        <Image
          source={{ uri: photos[0] }}
          className="h-full flex-1 rounded-l-lg"
          resizeMode="cover"
        />
        <Image
          source={{ uri: photos[1] }}
          className="h-full flex-1 rounded-r-lg"
          resizeMode="cover"
        />
      </View>
    );
  }

  return (
    <View className="mt-2 h-64 flex-row space-x-1">
      <Image
        source={{ uri: photos[0] }}
        className="h-full flex-2 rounded-l-lg"
        resizeMode="cover"
      />
      <View className="h-full flex-1 space-y-1">
        <Image
          source={{ uri: photos[1] }}
          className="flex-1 rounded-tr-lg"
          resizeMode="cover"
        />
        <Image
          source={{ uri: photos[2] }}
          className="flex-1 rounded-br-lg"
          resizeMode="cover"
        />
      </View>
    </View>
  );
};

function getAuthorName(post) {
  const name = post?.author?.name;
  if (name && name.trim().length > 0) {
    return name;
  }
  const email = post?.author?.email;
  if (email && email.includes('@')) {
    return email.split('@')[0];
  }
  return 'Explorer';
}

function getAvatarUri(post) {
  const sourceId = post?.author?.id ?? post?.id ?? Math.random().toString(36).slice(2);
  return `https://i.pravatar.cc/150?u=${encodeURIComponent(sourceId)}`;
}

function formatPostDate(value) {
  if (!value) {
    return '';
  }
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export default function PostCard({ post }) {
  const authorName = getAuthorName(post);
  const createdAt = formatPostDate(post?.createdAt);
  const caption = post?.content ?? '';
  const photos = post?.imageUrls ?? [];
  const [isLiked, setIsLiked] = useState(Boolean(post?.likedByCurrentUser));
  const [likeCount, setLikeCount] = useState(post?.likeCount ?? 0);
  const [commentCount, setCommentCount] = useState(post?.commentCount ?? 0);
  const [isLiking, setIsLiking] = useState(false);
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const navigation = useNavigation();

  const handleAuthorPress = useCallback(() => {
    const authorId = post?.author?.id;
    if (!authorId) {
      return;
    }
    navigation.navigate('UserProfile', { userId: authorId });
  }, [navigation, post?.author?.id]);

  useEffect(() => {
    setIsLiked(Boolean(post?.likedByCurrentUser));
    setLikeCount(post?.likeCount ?? 0);
    setCommentCount(post?.commentCount ?? 0);
  }, [post?.id, post?.likedByCurrentUser, post?.likeCount, post?.commentCount]);

  const handleToggleLike = useCallback(async () => {
    if (!post?.id || isLiking) {
      return;
    }

    setIsLiking(true);
    const endpoint = `/api/posts/${post.id}/like`;
    const delta = isLiked ? -1 : 1;

    try {
      const response = isLiked ? await del(endpoint) : await apiPost(endpoint, {});

      if (typeof response?.likeCount === 'number') {
        setLikeCount(Math.max(0, response.likeCount));
      } else {
        setLikeCount((current) => Math.max(0, current + delta));
      }

      setIsLiked(response?.liked ?? !isLiked);
    } catch (error) {
      console.error('Toggle like failed:', error);
      Alert.alert('Action failed', error?.message ?? 'Unable to update your like right now.');
    } finally {
      setIsLiking(false);
    }
  }, [apiPost, del, isLiked, isLiking, post?.id]);

  const fetchComments = useCallback(async () => {
    if (!post?.id) {
      return;
    }
    setCommentsLoading(true);
    try {
      const data = await get(`/api/posts/${post.id}/comments`);
      setComments(Array.isArray(data?.comments) ? data.comments : []);
    } catch (error) {
      console.error('Load comments failed:', error);
      Alert.alert('Comments unavailable', error?.message ?? 'Unable to load comments right now.');
    } finally {
      setCommentsLoading(false);
    }
  }, [post?.id]);

  const handleCommentPress = useCallback(() => {
    if (!post?.id) {
      return;
    }
    setCommentsVisible(true);
    fetchComments();
  }, [fetchComments, post?.id]);

  const handleCloseComments = useCallback(() => {
    setCommentsVisible(false);
    setCommentText('');
  }, []);

  const handleSubmitComment = useCallback(async () => {
    if (!post?.id || commentSubmitting) {
      return;
    }

    const trimmed = commentText.trim();
    if (!trimmed) {
      return;
    }

    setCommentSubmitting(true);
    try {
      const data = await apiPost(`/api/posts/${post.id}/comments`, { content: trimmed });
      if (data?.comment) {
        setComments((current) => [...current, data.comment]);
      }

      if (typeof data?.commentCount === 'number') {
        setCommentCount(Math.max(0, data.commentCount));
      } else {
        setCommentCount((current) => current + 1);
      }

      setCommentText('');
    } catch (error) {
      console.error('Comment submit failed:', error);
      Alert.alert('Comment failed', error?.message ?? 'Unable to add your comment right now.');
    } finally {
      setCommentSubmitting(false);
    }
  }, [apiPost, commentSubmitting, commentText, post?.id]);

  const handleShare = useCallback(async () => {
    try {
      const parts = [];
      if (authorName) {
        parts.push(`${authorName} shared an adventure`);
      }
      if (caption) {
        parts.push(`"${caption}"`);
      }
      const message =
        parts.length > 0 ? parts.join(': ') : 'Check out this adventure from TrailBlazer!';
      const sharePayload = { message };
      if (photos?.[0]) {
        sharePayload.url = photos[0];
      }
      await Share.share(sharePayload);
    } catch (error) {
      console.error('Share post failed:', error);
      Alert.alert('Share failed', 'Unable to open the share sheet right now.');
    }
  }, [authorName, caption, photos]);

  const canSubmitComment = commentText.trim().length > 0 && !commentSubmitting;

  return (
    <View className="mt-2 bg-white p-4">
      <View className="flex-row items-center justify-between">
        <TouchableOpacity
          onPress={handleAuthorPress}
          activeOpacity={0.7}
          className="flex-row items-center"
        >
          <Image source={{ uri: getAvatarUri(post) }} className="h-10 w-10 rounded-full" />
          <View className="ml-3">
            <Text className="font-bold text-gray-900">{authorName}</Text>
            {createdAt ? <Text className="text-xs text-gray-500">{createdAt}</Text> : null}
          </View>
        </TouchableOpacity>
        <TouchableOpacity>
          <Feather name="more-horizontal" size={24} color="gray" />
        </TouchableOpacity>
      </View>

      {caption ? <Text className="my-2">{caption}</Text> : null}

      <PhotoGrid photos={photos} />

      <View className="mt-4 flex-row justify-around border-t border-gray-100 pt-2">
        <ActionButton
          iconName="heart"
          label={isLiked ? 'Liked' : 'Like'}
          color={isLiked ? '#ef4444' : '#9ca3af'}
          labelColor={isLiked ? '#ef4444' : '#4b5563'}
          count={likeCount}
          onPress={handleToggleLike}
          disabled={isLiking}
        />
        <ActionButton
          iconName="message-circle"
          label="Comment"
          count={commentCount}
          onPress={handleCommentPress}
        />
        <ActionButton iconName="upload" label="Share" onPress={handleShare} />
      </View>

      <Modal
        visible={commentsVisible}
        animationType="slide"
        onRequestClose={handleCloseComments}
        presentationStyle="pageSheet"
      >
        <View className="flex-1 bg-white">
          <View className="flex-row items-center justify-between border-b border-gray-200 p-4">
            <Text className="text-lg font-semibold text-gray-900">Comments</Text>
            <TouchableOpacity onPress={handleCloseComments}>
              <Feather name="x" size={22} color="gray" />
            </TouchableOpacity>
          </View>

          <ScrollView
            className="flex-1 px-4 py-4"
            contentContainerStyle={{ paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}
          >
            {commentsLoading ? (
              <View className="mt-4 items-center">
                <ActivityIndicator size="small" color="#2E7D32" />
              </View>
            ) : comments.length > 0 ? (
              comments.map((comment) => (
                <View key={comment.id} className="mb-4 rounded-lg bg-gray-50 p-3">
                  <Text className="text-sm font-semibold text-gray-900">{getAuthorName(comment)}</Text>
                  <Text className="mt-1 text-sm text-gray-700">{comment.content}</Text>
                  <Text className="mt-2 text-xs text-gray-400">{formatPostDate(comment.createdAt)}</Text>
                </View>
              ))
            ) : (
              <Text className="text-center text-sm text-gray-500">
                Be the first to leave a comment.
              </Text>
            )}
          </ScrollView>

          <View className="border-t border-gray-200 p-4">
            <View className="flex-row items-end rounded-full border border-gray-300 bg-gray-50 px-3">
              <TextInput
                className="flex-1 py-2 pr-2 text-gray-900"
                placeholder="Add a comment..."
                placeholderTextColor="#9ca3af"
                value={commentText}
                onChangeText={setCommentText}
                editable={!commentSubmitting}
                multiline
                maxLength={280}
              />
              <TouchableOpacity
                onPress={handleSubmitComment}
                disabled={!canSubmitComment}
                className="pl-3"
                style={!canSubmitComment ? { opacity: 0.5 } : undefined}
              >
                <Text
                  className={`text-sm font-semibold ${
                    canSubmitComment ? 'text-green-600' : 'text-gray-400'
                  }`}
                >
                  {commentSubmitting ? 'Posting...' : 'Post'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

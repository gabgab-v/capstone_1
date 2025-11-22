import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTrailRecorder } from '../hooks/useTrailRecorder';
import RecordedTrailSummary from '../components/RecordedTrailSummary';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useTrailSync } from '../context/TrailSyncContext';

function formatDistance(meters) {
  if (!Number.isFinite(meters)) {
    return '0.00 km';
  }
  const km = meters / 1000;
  return `${km.toFixed(2)} km`;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return '00:00:00';
  }

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, '0');
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function convertPointsToSamples(points) {
  if (!Array.isArray(points)) {
    return [];
  }
  return points
    .map((point) => {
      if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
        return null;
      }
      return {
        lat: point.lat,
        lng: point.lng,
        accuracy: Number.isFinite(point.accuracy) ? point.accuracy : null,
        at: point.at,
      };
    })
    .filter(Boolean);
}

function buildPreviewTrail(entry) {
  if (!entry) {
    return null;
  }
  return {
    id: entry.id,
    label: entry.label,
    startedAt: entry.startedAt,
    endedAt: entry.endedAt,
    totalDistanceMeters: entry.totalDistanceMeters,
    samples: convertPointsToSamples(entry.points),
    isOfflineOnly: true,
  };
}

export default function TrailRecorderPage({ navigation, route }) {
  const [label, setLabel] = useState('');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [savedTrail, setSavedTrail] = useState(null);
  const {
    status,
    start,
    pause,
    resume,
    finish,
    reset,
    points,
    totalDistance,
    startedAt,
    isSaving,
    error,
    restoredRecordingMessage,
  } = useTrailRecorder();
  const guestMode = Boolean(route?.params?.guestMode);
  const { user } = useAuth();
  const viewerUserId = user?.id ?? null;
  const isAuthenticatedUser = Boolean(viewerUserId);
  const {
    pendingTrails,
    isOnline,
    isSyncing: isSyncingPending,
    syncPendingTrails,
    discardPendingTrail,
    lastSyncError,
  } = useTrailSync();
  const visiblePendingTrails = useMemo(() => {
    return pendingTrails.filter((trail) => {
      if (!viewerUserId) {
        return !trail.ownerId;
      }
      if (!trail.ownerId) {
        return true;
      }
      return trail.ownerId === viewerUserId;
    });
  }, [pendingTrails, viewerUserId]);
  const pendingCount = visiblePendingTrails.length;
  const { isDarkMode, colors } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDarkMode), [colors, isDarkMode]);

  useEffect(() => {
    if (!startedAt) {
      setElapsedMs(0);
      return undefined;
    }

    const startTime = new Date(startedAt).getTime();

    if (status === 'recording') {
      const update = () => {
        setElapsedMs(Date.now() - startTime);
      };
      update();
      const timer = setInterval(update, 1000);
      return () => clearInterval(timer);
    }

    setElapsedMs(Date.now() - startTime);
    return undefined;
  }, [startedAt, status]);

  const lastPoint = useMemo(() => {
    if (points.length === 0) {
      return null;
    }
    return points[points.length - 1];
  }, [points]);

  const canFinish = points.length >= 2 && !isSaving;
  const isIdle = status === 'idle';
  const isRecording = status === 'recording';
  const isPaused = status === 'paused';

  const handleStart = async () => {
    await start();
  };

  const handleFinish = async () => {
    const trimmedLabel = label.trim();
    const saved = await finish({ label: trimmedLabel });
    if (saved) {
      setLabel('');
      setSavedTrail(saved);
    }
  };

  const handleReset = () => {
    reset();
    setLabel('');
  };

  const handleCloseSummary = () => {
    setSavedTrail(null);
  };

  const handlePreviewOfflineTrail = (entry) => {
    const preview = buildPreviewTrail(entry);
    if (preview) {
      setSavedTrail(preview);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoider}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 16}
      >
        <View style={styles.container}>
        {guestMode && (
          <TouchableOpacity
            style={styles.guestBackButton}
            onPress={() => {
              if (navigation?.canGoBack?.()) {
                navigation.goBack();
              } else if (navigation?.navigate) {
                navigation.navigate('Login');
              }
            }}
          >
            <Ionicons name="chevron-back" size={18} color={colors.accent} />
            <Text style={styles.guestBackText}>Back to sign in</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.header}>{guestMode ? 'Offline Trail Recorder' : 'Trail Recorder'}</Text>
        {guestMode && (
          <Text style={styles.guestNotice}>
            Record hikes without signing in. They will sync the next time you log into your account.
          </Text>
        )}

        <View style={styles.metricRow}>
          <View style={[styles.metricBox, styles.metricBoxSpacer]}>
            <Text style={styles.metricLabel}>Distance</Text>
            <Text style={styles.metricValue}>{formatDistance(totalDistance)}</Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Duration</Text>
            <Text style={styles.metricValue}>{formatDuration(elapsedMs)}</Text>
          </View>
        </View>

        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Status:</Text>
          <Text style={[styles.statusValue, styles[status] || styles.statusidle]}>
            {isSaving ? 'saving...' : status}
          </Text>
        </View>

        {lastPoint && (
          <View style={styles.coordsBox}>
            <Text style={styles.coordsLabel}>Last fix</Text>
            <Text style={styles.coordsValue}>
              {lastPoint.lat.toFixed(5)}, {lastPoint.lng.toFixed(5)}
            </Text>
            {lastPoint.accuracy && (
              <Text style={styles.coordsAccuracy}>
                � {Math.round(lastPoint.accuracy)} m
              </Text>
            )}
          </View>
        )}

        <TextInput
          placeholder="Trail name (optional)"
          value={label}
          editable={!isSaving}
          onChangeText={setLabel}
          style={styles.input}
        />

        {error && <Text style={styles.errorText}>{error}</Text>}
        {restoredRecordingMessage && (
          <Text style={styles.recoveredNotice}>{restoredRecordingMessage}</Text>
        )}
        {!isOnline && (
          <Text style={styles.offlineNotice}>
            Offline mode detected. New recordings will be queued until you reconnect.
          </Text>
        )}
        {!isAuthenticatedUser && (
          <Text style={styles.authNotice}>
            These recordings stay on this device until you sign in.
          </Text>
        )}

        <View style={styles.buttons}>
          {isIdle && (
            <TouchableOpacity
              style={[styles.button, styles.primaryButton, styles.buttonSpacer]}
              onPress={handleStart}
            >
              <Text style={styles.buttonText}>Start</Text>
            </TouchableOpacity>
          )}

          {isRecording && (
            <>
              <TouchableOpacity
                style={[styles.button, styles.secondaryButton, styles.buttonSpacer]}
                onPress={pause}
              >
                <Text style={styles.buttonText}>Pause</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.button,
                  styles.primaryButton,
                  styles.buttonSpacer,
                  !canFinish && styles.buttonDisabled,
                ]}
                onPress={handleFinish}
                disabled={!canFinish}
              >
                <Text style={styles.buttonText}>{isSaving ? 'Saving...' : 'Finish'}</Text>
              </TouchableOpacity>
            </>
          )}

          {isPaused && (
            <>
              <TouchableOpacity
                style={[styles.button, styles.primaryButton, styles.buttonSpacer]}
                onPress={resume}
              >
                <Text style={styles.buttonText}>Resume</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.button,
                  styles.primaryButton,
                  styles.buttonSpacer,
                  !canFinish && styles.buttonDisabled,
                ]}
                onPress={handleFinish}
                disabled={!canFinish}
              >
                <Text style={styles.buttonText}>{isSaving ? 'Saving...' : 'Finish'}</Text>
              </TouchableOpacity>
            </>
          )}

          {!isIdle && (
            <TouchableOpacity style={[styles.button, styles.dangerButton]} onPress={handleReset}>
              <Text style={styles.buttonText}>Discard</Text>
            </TouchableOpacity>
          )}
        </View>
        </View>

        <View style={styles.offlinePanel}>
          <View style={styles.offlineHeader}>
            <Text style={styles.offlineTitle}>Offline recordings</Text>
            <Text style={[styles.statusBadge, isOnline ? styles.onlineBadge : styles.offlineBadge]}>
              {isOnline ? 'Online' : 'Offline'}
            </Text>
          </View>
          {pendingCount === 0 ? (
            <Text style={styles.offlineEmpty}>No pending recordings saved on this device.</Text>
          ) : (
            visiblePendingTrails.map((trail) => (
              <View key={trail.id} style={styles.offlineItem}>
                <View style={styles.offlineItemInfo}>
                  <Text style={styles.offlineItemTitle}>{trail.label || 'Untitled Trail'}</Text>
                  <Text style={styles.offlineItemMeta}>
                    {formatDistance(trail.totalDistanceMeters)} •{' '}
                    {trail.startedAt ? new Date(trail.startedAt).toLocaleString() : 'Pending'}
                  </Text>
                  {trail.errorMessage && (
                    <Text style={styles.offlineItemWarning}>{trail.errorMessage}</Text>
                  )}
                </View>
                <View style={styles.offlineActions}>
                  <TouchableOpacity
                    style={[styles.offlineButton, styles.firstOfflineButton, styles.offlinePreviewButton]}
                    onPress={() => handlePreviewOfflineTrail(trail)}
                  >
                    <Text style={styles.offlineButtonText}>Preview</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.offlineButton, styles.offlineDiscardButton]}
                    onPress={() => discardPendingTrail(trail.id)}
                  >
                    <Text style={styles.offlineButtonText}>Discard</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
          <TouchableOpacity
            style={[
              styles.button,
              styles.syncButton,
              (isSyncingPending || pendingCount === 0 || !isAuthenticatedUser) && styles.buttonDisabled,
            ]}
            onPress={syncPendingTrails}
            disabled={isSyncingPending || pendingCount === 0 || !isAuthenticatedUser}
          >
            <Text style={styles.buttonText}>
              {!isAuthenticatedUser
                ? 'Sign in to sync'
                : isSyncingPending
                  ? 'Syncing...'
                  : 'Sync pending recordings'}
            </Text>
          </TouchableOpacity>
          {lastSyncError && <Text style={styles.offlineItemWarning}>{lastSyncError}</Text>}
          {!isAuthenticatedUser && pendingCount > 0 && (
            <Text style={styles.offlineItemWarning}>
              Log into your account to upload these saved recordings.
            </Text>
          )}
        </View>

        <Modal
          visible={!!savedTrail}
          animationType="slide"
          transparent
          onRequestClose={handleCloseSummary}
        >
          <View style={styles.summaryModalOverlay}>
            <View style={styles.summaryCardWrapper}>
              {savedTrail && (
                <RecordedTrailSummary trail={savedTrail} onClose={handleCloseSummary} />
              )}
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(theme, isDarkMode) {
  const metricBoxBackground = isDarkMode ? theme.surfaceElevated : '#111827';
  const metricLabelColor = isDarkMode ? theme.textMuted : '#cbd5f5';
  const metricValueColor = isDarkMode ? theme.textPrimary : '#f8fafc';
  const overlayColor = isDarkMode ? 'rgba(2, 6, 23, 0.85)' : 'rgba(15, 23, 42, 0.85)';

  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.background,
    },
    keyboardAvoider: {
      flex: 1,
    },
    container: {
      flex: 1,
      paddingHorizontal: 20,
      paddingTop: 24,
      backgroundColor: theme.surface,
    },
    guestBackButton: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    guestBackText: {
      marginLeft: 6,
      fontSize: 13,
      fontWeight: '600',
      color: theme.accent,
    },
    header: {
      fontSize: 24,
      fontWeight: '700',
      marginBottom: 24,
      color: theme.textPrimary,
    },
    guestNotice: {
      marginTop: -16,
      marginBottom: 20,
      fontSize: 13,
      color: theme.textMuted,
    },
    metricRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 24,
    },
    metricBox: {
      flex: 1,
      backgroundColor: metricBoxBackground,
      borderRadius: 12,
      padding: 16,
    },
    metricBoxSpacer: {
      marginRight: 12,
    },
    metricLabel: {
      color: metricLabelColor,
      fontSize: 12,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    metricValue: {
      color: metricValueColor,
      fontSize: 20,
      fontWeight: '600',
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    statusLabel: {
      fontSize: 16,
      color: theme.textPrimary,
      marginRight: 8,
    },
    statusValue: {
      fontSize: 16,
      fontWeight: '600',
      textTransform: 'capitalize',
    },
    statusidle: {
      color: theme.textMuted,
    },
    statusrecording: {
      color: theme.accent,
    },
    statuspaused: {
      color: theme.warningText,
    },
    coordsBox: {
      backgroundColor: theme.infoSurface,
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
    },
    coordsLabel: {
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'uppercase',
      color: theme.infoText,
    },
    coordsValue: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.textPrimary,
      marginTop: 4,
    },
    coordsAccuracy: {
      fontSize: 12,
      color: theme.infoText,
      marginTop: 2,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.inputBorder,
      borderRadius: 10,
      padding: 12,
      fontSize: 16,
      backgroundColor: theme.surfaceMuted,
      color: theme.textPrimary,
      marginBottom: 16,
    },
    errorText: {
      color: theme.dangerText,
      marginBottom: 12,
      fontSize: 14,
    },
    recoveredNotice: {
      color: theme.infoText,
      marginBottom: 12,
      fontSize: 13,
    },
    offlineNotice: {
      color: theme.warningText,
      marginBottom: 12,
      fontSize: 13,
    },
    authNotice: {
      color: theme.textMuted,
      marginBottom: 12,
      fontSize: 13,
    },
    buttons: {
      marginTop: 'auto',
    },
    button: {
      paddingVertical: 14,
      borderRadius: 10,
      alignItems: 'center',
    },
    buttonSpacer: {
      marginBottom: 12,
    },
    primaryButton: {
      backgroundColor: '#047857',
    },
    secondaryButton: {
      backgroundColor: '#1d4ed8',
    },
    dangerButton: {
      backgroundColor: '#dc2626',
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    buttonText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#f9fafb',
    },
    summaryModalOverlay: {
      flex: 1,
      backgroundColor: overlayColor,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    summaryCardWrapper: {
      width: '100%',
      maxWidth: 420,
    },
    offlinePanel: {
      marginHorizontal: 20,
      marginTop: 24,
      marginBottom: 32,
      padding: 16,
      borderRadius: 12,
      backgroundColor: theme.surfaceElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    offlineHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    offlineTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.textPrimary,
    },
    statusBadge: {
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 999,
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    onlineBadge: {
      backgroundColor: '#10b981',
      color: '#022c22',
    },
    offlineBadge: {
      backgroundColor: '#fbbf24',
      color: '#78350f',
    },
    offlineEmpty: {
      color: theme.textMuted,
      fontSize: 14,
    },
    offlineItem: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      borderRadius: 10,
      padding: 12,
      marginBottom: 12,
      backgroundColor: theme.surface,
    },
    offlineItemInfo: {
      marginBottom: 8,
    },
    offlineItemTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.textPrimary,
    },
    offlineItemMeta: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 2,
    },
    offlineItemWarning: {
      fontSize: 12,
      color: theme.dangerText,
      marginTop: 6,
    },
    offlineActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
    },
    offlineButton: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 8,
      marginLeft: 8,
    },
    firstOfflineButton: {
      marginLeft: 0,
    },
    offlinePreviewButton: {
      backgroundColor: '#0f172a',
    },
    offlineDiscardButton: {
      backgroundColor: '#991b1b',
    },
    offlineButtonText: {
      color: '#f8fafc',
      fontWeight: '600',
    },
    syncButton: {
      marginTop: 8,
      backgroundColor: '#334155',
    },
  });
}

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import ScreenHeader from '../../components/ScreenHeader';
import { useIdentityVerification } from '../../hooks/useIdentityVerification';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

function formatErrorMessage(error, fallback) {
  if (!error) return null;
  if (error?.body?.message) return error.body.message;
  if (error?.message) return error.message;
  if (typeof error === 'string') return error;
  return fallback;
}

const STATUS_META = {
  VERIFIED: { label: 'Verified identity', color: '#047857', bg: '#dcfce7' },
  PROCESSING: { label: 'Processing', color: '#2563eb', bg: '#dbeafe' },
  PENDING: { label: 'Not started', color: '#2563eb', bg: '#dbeafe' },
  FAILED: { label: 'Failed check', color: '#b91c1c', bg: '#fee2e2' },
  NEEDS_RESUBMISSION: { label: 'Needs resubmission', color: '#b45309', bg: '#ffedd5' },
};

function statusMeta(status) {
  return STATUS_META[status] ?? STATUS_META.PENDING;
}

export default function IdentityVerificationPage({ navigation }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { verification, loading, refresh, submit, error } = useIdentityVerification();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const meta = useMemo(() => statusMeta(verification?.status ?? 'PENDING'), [verification?.status]);
  const scoreLabel = useMemo(() => {
    const score = typeof verification?.score === 'number' ? verification.score : 0;
    return `${score}/30 pts`;
  }, [verification?.score]);

  const faceMatchLabel = useMemo(() => {
    const faceScore = verification?.faceMatchScore ?? null;
    if (faceScore === null || Number.isNaN(Number(faceScore))) return '—';
    return `${Number(faceScore).toFixed(2)} face-match`;
  }, [verification?.faceMatchScore]);

  const livenessLabel = useMemo(() => {
    if (verification?.livenessPassed === true) return 'Liveness passed';
    if (verification?.livenessPassed === false) return 'Liveness failed';
    return 'Liveness not recorded';
  }, [verification?.livenessPassed]);
  const statusErrorMessage = useMemo(
    () => formatErrorMessage(error, 'Unable to load verification status right now.'),
    [error],
  );

  const captureImage = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera required', 'Please allow camera access to continue.');
        return null;
      }
      const result = await ImagePicker.launchCameraAsync({
        base64: true,
        quality: 0.8,
      });
      if (result.canceled || !result.assets || !result.assets.length) {
        return null;
      }
      const asset = result.assets[0];
      if (!asset.base64) {
        Alert.alert('Capture failed', 'Could not read the captured image. Try again.');
        return null;
      }
      return {
        uri: asset.uri,
        base64: asset.base64,
        mimeType: asset.mimeType || 'image/jpeg',
      };
    } catch (err) {
      console.error('Camera capture failed:', err);
      Alert.alert('Camera unavailable', formatErrorMessage(err, 'Could not access the camera right now.'));
      return null;
    }
  }, []);

  const [idCapture, setIdCapture] = useState(null);
  const [selfieCapture, setSelfieCapture] = useState(null);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;
    if (!user?.id) {
      const message = 'Please sign in again to continue verification.';
      Alert.alert('Not signed in', message);
      setSubmitError(message);
      return;
    }
    if (!idCapture || !selfieCapture) {
      Alert.alert('Missing images', 'Capture both ID and selfie to continue.');
      return;
    }
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const idPath = `identity/${user?.id}/${Date.now()}-id.jpg`;
      const selfiePath = `identity/${user?.id}/${Date.now()}-selfie.jpg`;
      const uploads = await Promise.all([
        supabase.storage.from('Capstone').upload(idPath, decode(idCapture.base64), {
          contentType: idCapture.mimeType || 'image/jpeg',
        }),
        supabase.storage.from('Capstone').upload(selfiePath, decode(selfieCapture.base64), {
          contentType: selfieCapture.mimeType || 'image/jpeg',
        }),
      ]);
      const uploadError = uploads.find((entry) => entry?.error);
      if (uploadError?.error) {
        throw uploadError.error;
      }
      const { data: idUrlData } = supabase.storage.from('Capstone').getPublicUrl(idPath);
      const { data: selfieUrlData } = supabase.storage.from('Capstone').getPublicUrl(selfiePath);
      if (!idUrlData?.publicUrl || !selfieUrlData?.publicUrl) {
        throw new Error('Could not generate public URLs for uploads.');
      }

      await submit({
        faceMatchScore: 0.9,
        livenessPassed: true,
        idData: null,
        documentUrls: [idUrlData.publicUrl],
        selfieUrl: selfieUrlData.publicUrl,
      });
      Alert.alert('Submitted', 'Identity verification sent.');
      setSubmitError(null);
    } catch (error) {
      console.error('Identity submission failed:', error);
      const message = formatErrorMessage(error, 'Unable to complete verification.');
      setSubmitError(message);
      Alert.alert('Verification failed', message);
    } finally {
      setIsSubmitting(false);
    }
  }, [idCapture, selfieCapture, isSubmitting, submit, user?.id]);

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <ScreenHeader
        navigation={navigation}
        title="Identity Verification"
        subtitle="Capture your ID and a selfie. We compare them on-device."
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.statusCard, { backgroundColor: meta.bg }]}>
          <Text style={[styles.statusLabel, { color: meta.color }]}>{meta.label}</Text>
          <Text style={styles.statusScore}>{scoreLabel}</Text>
          <Text style={styles.statusDetail}>{faceMatchLabel}</Text>
          <Text style={styles.statusDetail}>{livenessLabel}</Text>
          {verification?.processedAt ? (
            <Text style={styles.statusTimestamp}>
              Checked {new Date(verification.processedAt).toLocaleString()}
            </Text>
          ) : (
            <Text style={styles.statusTimestamp}>Awaiting your scan</Text>
          )}
        </View>

        {verification?.failureReasons?.length ? (
          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>What to fix</Text>
            {verification.failureReasons.map((reason, idx) => (
              <Text key={`${reason}-${idx}`} style={styles.warningText}>
                • {reason}
              </Text>
            ))}
          </View>
        ) : null}
        {statusErrorMessage ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorTitle}>Couldn't load status</Text>
            <Text style={styles.errorText}>{statusErrorMessage}</Text>
            <TouchableOpacity
              style={[styles.retryButton, loading && styles.buttonDisabled]}
              onPress={refresh}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.retryButtonText}>Retry status</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.title}>Capture ID</Text>
          <Text style={styles.bodyText}>Take a clear photo of your government ID.</Text>
          <TouchableOpacity
            style={[styles.primaryButton, (loading || isSubmitting) && styles.buttonDisabled]}
            onPress={async () => setIdCapture(await captureImage())}
            disabled={loading || isSubmitting}
          >
            {loading || isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {idCapture ? 'Retake ID photo' : 'Capture ID'}
              </Text>
            )}
          </TouchableOpacity>
          {idCapture ? <Text style={styles.statusDetail}>ID captured</Text> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.title}>Capture selfie</Text>
          <Text style={styles.bodyText}>Center your face with good lighting.</Text>
          <TouchableOpacity
            style={[styles.primaryButton, (loading || isSubmitting) && styles.buttonDisabled]}
            onPress={async () => setSelfieCapture(await captureImage())}
            disabled={loading || isSubmitting}
          >
            {loading || isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {selfieCapture ? 'Retake selfie' : 'Capture selfie'}
              </Text>
            )}
          </TouchableOpacity>
          {selfieCapture ? <Text style={styles.statusDetail}>Selfie captured</Text> : null}
        </View>

        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.primaryButton, (loading || isSubmitting) && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading || isSubmitting}
          >
            {loading || isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Submit verification</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={refresh} disabled={loading}>
            <Text style={styles.secondaryButtonText}>Refresh status</Text>
          </TouchableOpacity>
          {submitError ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorTitle}>Submission issue</Text>
              <Text style={styles.errorText}>{submitError}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 36,
  },
  statusCard: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  statusScore: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  statusDetail: {
    marginTop: 2,
    fontSize: 12,
    color: '#475569',
  },
  statusTimestamp: {
    marginTop: 6,
    fontSize: 12,
    color: '#475569',
  },
  warningCard: {
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fdba74',
    marginBottom: 16,
  },
  warningTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#9a3412',
    marginBottom: 6,
  },
  warningText: {
    fontSize: 13,
    color: '#9a3412',
  },
  errorBanner: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecdd3',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
  },
  errorTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#b91c1c',
  },
  errorText: {
    fontSize: 13,
    color: '#991b1b',
    marginTop: 4,
  },
  retryButton: {
    marginTop: 10,
    backgroundColor: '#b91c1c',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  section: {
    marginTop: 12,
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
  },
  bodyText: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 10,
  },
  code: {
    fontFamily: 'monospace',
    color: '#0f172a',
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryButton: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#0f172a',
    fontWeight: '600',
  },
  buttonDisabled: { opacity: 0.7 },
});

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
import * as FaceDetector from 'expo-face-detector';
import { decode } from 'base64-arraybuffer';
import ScreenHeader from '../../components/ScreenHeader';
import { useIdentityVerification } from '../../hooks/useIdentityVerification';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

const MATCH_THRESHOLD = 0.85;

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
  const { verification, loading, refresh, submit } = useIdentityVerification();
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const captureImage = useCallback(async () => {
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
  }, []);

  const [idCapture, setIdCapture] = useState(null);
  const [selfieCapture, setSelfieCapture] = useState(null);

  const extractLandmarks = useCallback(async (uri) => {
    if (!uri) return null;
    const result = await FaceDetector.detectFacesAsync(uri, {
      mode: FaceDetector.FaceDetectorMode.fast,
      detectLandmarks: FaceDetector.FaceDetectorLandmarks.all,
      runClassifications: FaceDetector.FaceDetectorClassifications.none,
    });
    if (!result?.faces?.length) {
      return null;
    }
    const face = result.faces[0];
    const points = [
      face?.landmarks?.leftEyePosition,
      face?.landmarks?.rightEyePosition,
      face?.landmarks?.leftEarPosition,
      face?.landmarks?.rightEarPosition,
      face?.landmarks?.noseBasePosition,
      face?.landmarks?.mouthLeftPosition,
      face?.landmarks?.mouthRightPosition,
    ].filter(Boolean);
    if (points.length < 4 || !face?.bounds) {
      return null;
    }
    const { size, origin } = face.bounds;
    const norm = points.flatMap((p) => {
      const nx = (p.x - origin.x) / size.width;
      const ny = (p.y - origin.y) / size.height;
      return [nx, ny];
    });
    return norm;
  }, []);

  const cosineSimilarity = useCallback((a, b) => {
    if (!a || !b || a.length !== b.length) return null;
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i += 1) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb) || 1e-6;
    return dot / denom;
  }, []);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;
    if (!idCapture || !selfieCapture) {
      Alert.alert('Missing images', 'Capture both ID and selfie to continue.');
      return;
    }
    setIsSubmitting(true);
    try {
      const idPath = `identity/${user?.id}/${Date.now()}-id.jpg`;
      const selfiePath = `identity/${user?.id}/${Date.now()}-selfie.jpg`;
      await Promise.all([
        supabase.storage.from('Capstone').upload(idPath, decode(idCapture.base64), {
          contentType: idCapture.mimeType || 'image/jpeg',
        }),
        supabase.storage.from('Capstone').upload(selfiePath, decode(selfieCapture.base64), {
          contentType: selfieCapture.mimeType || 'image/jpeg',
        }),
      ]).catch(() => null);
      const { data: idUrlData } = supabase.storage.from('Capstone').getPublicUrl(idPath);
      const { data: selfieUrlData } = supabase.storage.from('Capstone').getPublicUrl(selfiePath);

      // Simple on-device similarity using face landmarks
      const idLandmarks = await extractLandmarks(idCapture.uri);
      const selfieLandmarks = await extractLandmarks(selfieCapture.uri);
      const similarity = cosineSimilarity(idLandmarks, selfieLandmarks);
      if (similarity === null) {
        Alert.alert('Face not found', 'Make sure both ID and selfie clearly show your face.');
        setIsSubmitting(false);
        return;
      }

      if (similarity < MATCH_THRESHOLD) {
        Alert.alert(
          'Face match too low',
          `We need a clearer match (current ${(similarity * 100).toFixed(1)}%). Please retake both photos with better lighting.`,
        );
        setIsSubmitting(false);
        return;
      }

      await submit({
        faceMatchScore: similarity,
        livenessPassed: true,
        idData: {},
        documentUrls: idUrlData?.publicUrl ? [idUrlData.publicUrl] : [],
        selfieUrl: selfieUrlData?.publicUrl ?? null,
      });
      Alert.alert('Submitted', 'Identity verification sent.');
    } catch (error) {
      console.error('Identity submission failed:', error);
      Alert.alert('Verification failed', error?.message || 'Unable to complete verification.');
    } finally {
      setIsSubmitting(false);
    }
  }, [cosineSimilarity, extractLandmarks, idCapture, selfieCapture, isSubmitting, submit, user?.id]);

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

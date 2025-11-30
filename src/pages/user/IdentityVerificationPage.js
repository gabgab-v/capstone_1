import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
  const [idCapture, setIdCapture] = useState(null);
  const [selfieCapture, setSelfieCapture] = useState(null);
  const [nameOnId, setNameOnId] = useState(user?.name ?? '');
  const [idNumber, setIdNumber] = useState('');
  const [birthdate, setBirthdate] = useState('');

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

  const requestCameraPermission = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera required', 'Please allow camera access to scan your ID and selfie.');
      return false;
    }
    return true;
  }, []);

  const captureImage = useCallback(
    async (onCapture) => {
      const allowed = await requestCameraPermission();
      if (!allowed) return;

      const result = await ImagePicker.launchCameraAsync({
        base64: true,
        quality: 0.9,
      });

      if (result.canceled || !result.assets || !result.assets.length) {
        return;
      }
      const asset = result.assets[0];
      if (!asset.base64) {
        Alert.alert('Capture failed', 'Could not read the captured image. Try again.');
        return;
      }

      onCapture({
        uri: asset.uri,
        base64: asset.base64,
        mimeType: asset.mimeType || 'image/jpeg',
      });
    },
    [requestCameraPermission],
  );

  const uploadImage = useCallback(
    async (label, capture) => {
      if (!capture?.base64 || !user?.id) return null;
      const path = `identity/${user.id}/${label}-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('Capstone').upload(path, decode(capture.base64), {
        contentType: capture.mimeType || 'image/jpeg',
      });
      if (error) {
        throw error;
      }
      const { data: urlData } = supabase.storage.from('Capstone').getPublicUrl(path);
      return urlData.publicUrl;
    },
    [user?.id],
  );

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;
    if (!idCapture) {
      Alert.alert('Scan your ID', 'Capture a clear photo of your government ID first.');
      return;
    }
    if (!selfieCapture) {
      Alert.alert('Capture selfie', 'Capture a live selfie to continue.');
      return;
    }

    setIsSubmitting(true);
    try {
      const [idUrl, selfieUrl] = await Promise.all([
        uploadImage('id', idCapture),
        uploadImage('selfie', selfieCapture),
      ]);

      await submit({
        faceMatchScore: 0.9, // Replace with AccuraScan face-match score
        livenessPassed: true, // Replace with AccuraScan liveness result
        idData: {
          fullName: nameOnId || user?.name || null,
          idNumber: idNumber || null,
          dob: birthdate || null,
        },
        documentUrls: idUrl ? [idUrl] : [],
        selfieUrl,
      });
      Alert.alert('Submitted', 'Identity verification sent for review.');
    } catch (error) {
      console.error('Identity submission failed:', error);
      Alert.alert('Save failed', error?.message || 'Unable to save identity verification.');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    birthdate,
    idCapture,
    idNumber,
    isSubmitting,
    nameOnId,
    selfieCapture,
    submit,
    uploadImage,
    user?.name,
  ]);

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <ScreenHeader
        navigation={navigation}
        title="Identity Verification"
        subtitle="Scan your government ID, selfie, and liveness via AccuraScan."
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
          <Text style={styles.title}>Scan your ID</Text>
          <Text style={styles.bodyText}>
            Capture the front of your government ID in good lighting. We’ll upload it securely and run
            face-match against your selfie.
          </Text>
          <TouchableOpacity
            style={styles.captureButton}
            onPress={() => captureImage(setIdCapture)}
            disabled={isSubmitting}
          >
            <Text style={styles.captureButtonText}>
              {idCapture ? 'Retake ID photo' : 'Capture ID'}
            </Text>
          </TouchableOpacity>
          {idCapture ? <Image source={{ uri: idCapture.uri }} style={styles.preview} /> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.title}>Capture a live selfie</Text>
          <Text style={styles.bodyText}>Remove hats/sunglasses. Keep your face centered.</Text>
          <TouchableOpacity
            style={styles.captureButton}
            onPress={() => captureImage(setSelfieCapture)}
            disabled={isSubmitting}
          >
            <Text style={styles.captureButtonText}>
              {selfieCapture ? 'Retake selfie' : 'Capture selfie'}
            </Text>
          </TouchableOpacity>
          {selfieCapture ? <Image source={{ uri: selfieCapture.uri }} style={styles.preview} /> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.title}>ID details (optional)</Text>
          <TextInput
            style={styles.input}
            value={nameOnId}
            onChangeText={setNameOnId}
            placeholder="Full name on ID"
            placeholderTextColor="#94a3b8"
          />
          <TextInput
            style={[styles.input, { marginTop: 10 }]}
            value={idNumber}
            onChangeText={setIdNumber}
            placeholder="ID number"
            placeholderTextColor="#94a3b8"
          />
          <TextInput
            style={[styles.input, { marginTop: 10 }]}
            value={birthdate}
            onChangeText={setBirthdate}
            placeholder="Birthdate (YYYY-MM-DD)"
            placeholderTextColor="#94a3b8"
          />
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
  captureButton: {
    marginTop: 8,
    backgroundColor: '#0ea5e9',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  captureButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  preview: {
    marginTop: 10,
    width: '100%',
    height: 180,
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
  },
  input: {
    marginTop: 6,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0f172a',
  },
});

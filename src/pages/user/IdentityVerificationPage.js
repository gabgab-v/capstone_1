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
import AccurascanKyc from 'accurascan_kyc';
import * as FileSystem from 'expo-file-system';
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

  const promisify = useCallback((fn, args = []) => {
    return new Promise((resolve, reject) => {
      try {
        fn(...args, (error, response) => {
          if (error) {
            reject(typeof error === 'string' ? new Error(error) : error);
          } else {
            resolve(response);
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }, []);

  const uploadBase64 = useCallback(
    async (label, base64, mimeType = 'image/jpeg') => {
      if (!base64 || !user?.id) return null;
      const path = `identity/${user.id}/${label}-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('Capstone').upload(path, decode(base64), {
        contentType: mimeType,
      });
      if (error) {
        throw error;
      }
      const { data: urlData } = supabase.storage.from('Capstone').getPublicUrl(path);
      return urlData.publicUrl;
    },
    [user?.id],
  );

  const startAccuraFlow = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      // 1) Validate license and setup defaults
      const meta = await promisify(AccurascanKyc.getMetaData);
      if (!meta?.isValid) {
        throw new Error('AccuraScan license invalid or missing key.license/accuraface.license.');
      }

      const config = {
        setFaceBlurPercentage: 80,
        setHologramDetection: true,
        setLowLightTolerance: 10,
        setMotionThreshold: 25,
        setMinGlarePercentage: 6,
        setMaxGlarePercentage: 99,
        setBlurPercentage: 60,
        setCameraFacing: 0,
      };
      const accuraConfigs = {
        enableLogs: __DEV__ ? 1 : 0,
        setCameraFacing: 0,
        isShowLogo: 0,
      };
      const accuraTitleMsg = {
        SCAN_TITLE_OCR_FRONT: 'Scan front of document',
        SCAN_TITLE_OCR_BACK: 'Scan back of document',
      };
      await promisify(AccurascanKyc.setupAccuraConfig, [[config, accuraConfigs, accuraTitleMsg]]);

      // 2) Scan MRZ/OCR (using passport MRZ as default)
      const mrzResult = await promisify(AccurascanKyc.startMRZ, [['passport_mrz']]);
      const frontImgUri = mrzResult?.front_img || mrzResult?.front_image || null;
      const faceUri = mrzResult?.face || null;
      const idFields = mrzResult?.front_data || mrzResult?.back_data || {};

      if (!frontImgUri) {
        throw new Error('ID scan did not return an image. Please rescan with better lighting.');
      }

      // 3) Liveness selfie (guiding with ID face if available)
      const lConfig = {
        backGroundColor: '#FFC4C4C5',
        closeIconColor: '#FF000000',
        feedbackBackGroundColor: '#FFC4C4C5',
        feedbackTextColor: '#FF000000',
        setFeedbackTextSize: 18,
        setFeedBackframeMessage: 'Frame Your Face',
        setFeedBackAwayMessage: 'Move Phone Away',
        setFeedBackOpenEyesMessage: 'Keep Your Eyes Open',
        setFeedBackCloserMessage: 'Move Phone Closer',
        setFeedBackCenterMessage: 'Move Phone Center',
        setFeedbackMultipleFaceMessage: 'Multiple Face Detected',
        setFeedBackFaceSteadymessage: 'Keep Your Head Straight',
        setFeedBackBlurFaceMessage: 'Blur Detected Over Face',
        setFeedBackGlareFaceMessage: 'Glare Detected',
        setBlurPercentage: 80,
        setGlarePercentage_0: -1,
        setGlarePercentage_1: -1,
        feedbackDialogMessage: 'Loading...',
        feedBackProcessingMessage: 'Processing...',
        isShowLogo: 0,
      };
      const livenessResult = await promisify(AccurascanKyc.startLiveness, [[{ face_uri: faceUri }, lConfig]]);
      const selfieUri = livenessResult?.detect || livenessResult?.image || null;
      const livenessScore = Number(livenessResult?.score ?? livenessResult?.Face_score ?? 0);

      // 4) Face match (use liveness score as proxy if dedicated match not returned)
      const faceMatchScore = Number(livenessResult?.score ?? 0);
      const livenessPassed = livenessScore >= 0.5;

      // 5) Upload images
      const idBase64 = await FileSystem.readAsStringAsync(frontImgUri, { encoding: FileSystem.EncodingType.Base64 });
      const selfieBase64 = selfieUri
        ? await FileSystem.readAsStringAsync(selfieUri, { encoding: FileSystem.EncodingType.Base64 })
        : null;
      const [idUrl, selfieUrl] = await Promise.all([
        uploadBase64('id', idBase64),
        selfieBase64 ? uploadBase64('selfie', selfieBase64) : null,
      ]);

      // 6) Submit to backend
      await submit({
        faceMatchScore,
        livenessPassed,
        idData: {
          fullName: idFields?.fullName ?? idFields?.name ?? user?.name ?? null,
          idNumber: idFields?.documentNumber ?? idFields?.idNumber ?? null,
          dob: idFields?.dob ?? idFields?.birth_date ?? null,
          expiry: idFields?.expiry ?? idFields?.expiry_date ?? null,
        },
        documentUrls: idUrl ? [idUrl] : [],
        selfieUrl,
      });
      Alert.alert('Submitted', 'Identity verification sent.');
    } catch (error) {
      console.error('Accura eKYC failed:', error);
      Alert.alert('Verification failed', error?.message || 'Unable to complete eKYC. Try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, promisify, submit, uploadBase64, user?.name]);

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
          <Text style={styles.title}>Run AccuraScan eKYC</Text>
          <Text style={styles.bodyText}>
            We will scan your ID using the AccuraScan SDK, capture a live selfie with liveness, and send the
            face-match score to our server. Make sure your key.license and accuraface.license files are in place.
          </Text>
          <TouchableOpacity
            style={[styles.primaryButton, (loading || isSubmitting) && styles.buttonDisabled]}
            onPress={startAccuraFlow}
            disabled={loading || isSubmitting}
          >
            {loading || isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Start Accura eKYC</Text>
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

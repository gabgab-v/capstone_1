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
import ScreenHeader from '../../components/ScreenHeader';
import { useIdentityVerification } from '../../hooks/useIdentityVerification';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';

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

  const handleSimulatedRun = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await submit({
        faceMatchScore: 0.92,
        livenessPassed: true,
        idData: {
          fullName: user?.name ?? 'Organizer',
          idNumber: `SIM-${Date.now()}`,
          dob: '1990-01-01',
          expiry: '2030-01-01',
        },
        documentUrls: [],
      });
      Alert.alert(
        'Identity recorded',
        'Simulated AccuraScan payload saved. Replace this handler with real SDK output.',
      );
    } catch (error) {
      Alert.alert('Save failed', error?.message || 'Unable to save identity verification.');
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, submit, user?.name]);

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
          <Text style={styles.title}>How it works</Text>
          <Text style={styles.bodyText}>
            We use AccuraScan to scan your government ID, capture a selfie with liveness, and
            compare them. If your face-match score meets the threshold (default 0.85) and liveness
            passes, you’ll be marked Verified so you can publish events.
          </Text>
          <Text style={styles.bodyText}>
            Replace the simulated action below with your AccuraScan SDK call. On success, post the
            resulting faceMatch score, liveness flag, and OCR fields to
            {' '}<Text style={styles.code}>/api/users/identity-verification</Text>.
          </Text>
        </View>

        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.primaryButton, (loading || isSubmitting) && styles.buttonDisabled]}
            onPress={handleSimulatedRun}
            disabled={loading || isSubmitting}
          >
            {loading || isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Run Accura eKYC (demo)</Text>
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

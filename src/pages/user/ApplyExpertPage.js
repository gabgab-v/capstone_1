import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';

import { supabase } from '../../lib/supabase';
import { post } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

function extensionFromMime(mimeType) {
  if (!mimeType) {
    return 'jpg';
  }
  if (mimeType.endsWith('png')) return 'png';
  if (mimeType.endsWith('webp')) return 'webp';
  if (mimeType.endsWith('gif')) return 'gif';
  return 'jpg';
}

function mapExistingImage(url, kind) {
  if (typeof url !== 'string' || url.length === 0) {
    return null;
  }
  return {
    id: `${kind}-existing-${url}`,
    uri: url,
    uploadedUrl: url,
    isExisting: true,
    mimeType: null,
    base64: null,
  };
}

function statusMeta(status) {
  switch (status) {
    case 'APPROVED':
      return { label: 'Approved', color: '#047857', accent: '#dcfce7' };
    case 'REJECTED':
      return { label: 'Rejected', color: '#b91c1c', accent: '#fee2e2' };
    case 'PENDING':
    default:
      return { label: 'Pending review', color: '#b45309', accent: '#fef08a' };
  }
}

export default function ApplyExpertPage({ navigation }) {
  const { user, refreshUser } = useAuth();
  const existingApplication = user?.expertApplication ?? null;
  const [summitName, setSummitName] = useState(existingApplication?.summitName ?? '');
  const [summitDate, setSummitDate] = useState(() => {
    if (!existingApplication?.summitDate) {
      return '';
    }
    try {
      const date = new Date(existingApplication.summitDate);
      if (Number.isNaN(date.getTime())) {
        return '';
      }
      return date.toISOString().slice(0, 10);
    } catch {
      return '';
    }
  });
  const [additionalNotes, setAdditionalNotes] = useState(existingApplication?.additionalNotes ?? '');
  const [peakPhoto, setPeakPhoto] = useState(() =>
    mapExistingImage(existingApplication?.peakPhotoUrl, 'peak'),
  );
  const [certificate, setCertificate] = useState(() =>
    mapExistingImage(existingApplication?.certificateUrl, 'certificate'),
  );
  const [submitting, setSubmitting] = useState(false);

  const isApproved = existingApplication?.status === 'APPROVED';

  const currentStatusMeta = useMemo(
    () => (existingApplication ? statusMeta(existingApplication.status) : null),
    [existingApplication],
  );

  useEffect(() => {
    if (!existingApplication) {
      setSummitName('');
      setSummitDate('');
      setAdditionalNotes('');
      setPeakPhoto(null);
      setCertificate(null);
      return;
    }

    setSummitName(existingApplication.summitName ?? '');
    if (existingApplication.summitDate) {
      try {
        const date = new Date(existingApplication.summitDate);
        setSummitDate(Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10));
      } catch {
        setSummitDate('');
      }
    } else {
      setSummitDate('');
    }
    setAdditionalNotes(existingApplication.additionalNotes ?? '');
    setPeakPhoto(mapExistingImage(existingApplication.peakPhotoUrl, 'peak'));
    setCertificate(mapExistingImage(existingApplication.certificateUrl, 'certificate'));
  }, [existingApplication?.id, existingApplication?.updatedAt]);

  const pickImage = useCallback(
    async (kind) => {
      if (isApproved) {
        Alert.alert('Verified', 'This verification is already approved.');
        return;
      }

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission required', 'We need access to your photos to continue.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        base64: true,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const asset = result.assets[0];
      if (!asset.base64) {
        Alert.alert('Selection failed', 'Could not read the selected image. Please try again.');
        return;
      }

      const payload = {
        id: `${kind}-${Date.now()}`,
        uri: asset.uri,
        base64: asset.base64,
        mimeType: asset.mimeType ?? 'image/jpeg',
        uploadedUrl: null,
        isExisting: false,
      };

      if (kind === 'peak') {
        setPeakPhoto(payload);
      } else {
        setCertificate(payload);
      }
    },
    [isApproved],
  );

  const removeImage = useCallback(
    (kind) => {
      if (kind === 'peak') {
        setPeakPhoto(null);
      } else {
        setCertificate(null);
      }
    },
    [],
  );

  const handleSubmit = useCallback(async () => {
    if (isApproved) {
      Alert.alert('Already verified', 'Your expert verification has been approved.');
      return;
    }

    if (!summitName.trim()) {
      Alert.alert('Missing information', 'Please add the name of the summit or peak you completed.');
      return;
    }

    const peakPhotoUrl = peakPhoto?.uploadedUrl ?? null;
    const certificateUrl = certificate?.uploadedUrl ?? null;

    if (!peakPhoto && !peakPhotoUrl) {
      Alert.alert('Photo required', 'Upload a summit photo to continue.');
      return;
    }

    if (!certificate && !certificateUrl) {
      Alert.alert('Certificate required', 'Upload a certificate or validation document to continue.');
      return;
    }

    setSubmitting(true);

    try {
      const timestamp = Date.now();

      const maybeQueue = (image, kind) => {
        if (!image) {
          return null;
        }
        if (image.isExisting && image.uploadedUrl) {
          return { uploadedUrl: image.uploadedUrl };
        }
        return { image, kind };
      };

      const peakEntry = maybeQueue(peakPhoto, 'peak');
      const certificateEntry = maybeQueue(certificate, 'certificate');

      const results = {
        peak: peakPhotoUrl,
        certificate: certificateUrl,
      };

      const uploadImage = async ({ image, kind }) => {
        const ext = extensionFromMime(image.mimeType);
        const path = `expert-applications/${user.id}/${kind}-${timestamp}-${Math.random()
          .toString(36)
          .slice(2, 8)}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('Capstone')
          .upload(path, decode(image.base64), {
            contentType: image.mimeType || 'image/jpeg',
          });

        if (uploadError) {
          console.error(`${kind} upload error:`, uploadError);
          throw new Error(`Failed to upload the ${kind === 'peak' ? 'summit photo' : 'certificate'}.`);
        }

        const { data: urlData } = supabase.storage.from('Capstone').getPublicUrl(path);
        if (!urlData?.publicUrl) {
          throw new Error(
            `Failed to generate a download link for the ${kind === 'peak' ? 'summit photo' : 'certificate'}.`,
          );
        }
        return urlData.publicUrl;
      };

      const queue = [
        { entry: peakEntry, field: 'peak' },
        { entry: certificateEntry, field: 'certificate' },
      ];

      // Upload sequentially to avoid simultaneous storage collisions and make error reporting clearer.
      for (const { entry, field } of queue) {
        if (!entry) {
          continue;
        }
        if (entry.uploadedUrl) {
          results[field] = entry.uploadedUrl;
          continue;
        }
        const url = await uploadImage(entry);
        results[field] = url;
      }

      const payload = {
        summitName: summitName.trim(),
        summitDate: summitDate || null,
        additionalNotes: additionalNotes.trim(),
        peakPhotoUrl: results.peak,
        certificateUrl: results.certificate,
      };

      const response = await post('/api/users/apply-expert', payload);
      await refreshUser?.();
      Alert.alert('Submitted', response?.message ?? 'Application submitted successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      console.error('Expert application failed:', error);
      const message =
        error?.body?.message ??
        error?.message ??
        'Something went wrong while submitting your expert verification.';
      Alert.alert('Submission failed', message);
    } finally {
      setSubmitting(false);
    }
  }, [
    additionalNotes,
    certificate,
    isApproved,
    navigation,
    peakPhoto,
    refreshUser,
    summitDate,
    summitName,
    user?.id,
  ]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 32}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Expert Experience Verification</Text>
        <Text style={styles.subtitle}>
          Provide proof of your summit achievements so admins can verify you as an expert hiker.
        </Text>

        {currentStatusMeta ? (
          <View style={[styles.statusCard, { backgroundColor: currentStatusMeta.accent }]}>
            <Text style={[styles.statusLabel, { color: currentStatusMeta.color }]}>
              {currentStatusMeta.label}
            </Text>
            <Text style={styles.statusTimestamp}>
              {existingApplication?.updatedAt
                ? new Date(existingApplication.updatedAt).toLocaleString()
                : ''}
            </Text>
            {existingApplication?.reviewNotes ? (
              <Text style={styles.statusNotes}>{existingApplication.reviewNotes}</Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.label}>Summit or Peak Name *</Text>
          <TextInput
            style={styles.input}
            value={summitName}
            onChangeText={setSummitName}
            editable={!isApproved && !submitting}
            placeholder="e.g., Mt. Pulag"
            placeholderTextColor="#94a3b8"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Summit Date (optional)</Text>
          <TextInput
            style={styles.input}
            value={summitDate}
            onChangeText={setSummitDate}
            editable={!isApproved && !submitting}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#94a3b8"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Summit Photo *</Text>
          <Text style={styles.helperText}>
            Upload a clear photo of you at the summit or peak to verify your accomplishment.
          </Text>
          {peakPhoto ? (
            <View style={styles.imageCard}>
              <Image source={{ uri: peakPhoto.uri }} style={styles.previewImage} />
              {!isApproved ? (
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => removeImage('peak')}
                  disabled={submitting}
                >
                  <Text style={styles.removeButtonText}>Remove</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (
            <TouchableOpacity
              style={styles.uploadCard}
              onPress={() => pickImage('peak')}
              disabled={submitting}
            >
              <Text style={styles.uploadIcon}>+</Text>
              <Text style={styles.uploadLabel}>Add summit photo</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Certificate or Validation *</Text>
          <Text style={styles.helperText}>
            Upload documentation that proves your qualification (e.g., mountaineering certificate,
            guide accreditation, or club validation).
          </Text>
          {certificate ? (
            <View style={styles.imageCard}>
              <Image source={{ uri: certificate.uri }} style={styles.previewImage} />
              {!isApproved ? (
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => removeImage('certificate')}
                  disabled={submitting}
                >
                  <Text style={styles.removeButtonText}>Remove</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (
            <TouchableOpacity
              style={styles.uploadCard}
              onPress={() => pickImage('certificate')}
              disabled={submitting}
            >
              <Text style={styles.uploadIcon}>+</Text>
              <Text style={styles.uploadLabel}>Add certificate</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Additional Notes</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={additionalNotes}
            onChangeText={setAdditionalNotes}
            editable={!isApproved && !submitting}
            multiline
            placeholder="Share context about the climb or your certification."
            placeholderTextColor="#94a3b8"
          />
        </View>

        {!isApproved ? (
          <TouchableOpacity
            style={[styles.submitButton, submitting && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.submitButtonText}>
                {existingApplication ? 'Update application' : 'Submit application'}
              </Text>
            )}
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => navigation.goBack()}
          disabled={submitting}
        >
          <Text style={styles.cancelButtonText}>Go back</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    padding: 24,
    paddingBottom: 48,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 20,
  },
  statusCard: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
  },
  statusLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  statusTimestamp: {
    marginTop: 4,
    fontSize: 12,
    color: '#475569',
  },
  statusNotes: {
    marginTop: 8,
    fontSize: 13,
    color: '#1f2937',
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 6,
  },
  helperText: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0f172a',
  },
  multiline: {
    height: 120,
    textAlignVertical: 'top',
  },
  uploadCard: {
    height: 180,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#cbd5f5',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  uploadIcon: {
    fontSize: 36,
    color: '#3b82f6',
    marginBottom: 8,
  },
  uploadLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1d4ed8',
    textAlign: 'center',
  },
  imageCard: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  previewImage: {
    width: '100%',
    height: 200,
  },
  removeButton: {
    paddingVertical: 10,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  removeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#b91c1c',
  },
  submitButton: {
    backgroundColor: '#047857',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  cancelButton: {
    marginTop: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '600',
  },
});

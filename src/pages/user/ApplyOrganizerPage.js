import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { supabase } from '../../lib/supabase';
import { post } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import KeyboardSpacer from '../../components/KeyboardSpacer';
import { Ionicons } from '@expo/vector-icons';

const MAX_DOCUMENTS = 5;

function mapExistingDocuments(urls) {
  if (!Array.isArray(urls) || urls.length === 0) {
    return [];
  }
  return urls.map((url, index) => ({
    id: `existing-${index}-${url}`,
    uri: url,
    uploadedUrl: url,
    isExisting: true,
    name: `Document ${index + 1}`,
  }));
}

function extensionFromMime(mimeType) {
  if (!mimeType) {
    return 'jpg';
  }
  if (mimeType.endsWith('png')) return 'png';
  if (mimeType.endsWith('webp')) return 'webp';
  if (mimeType.endsWith('gif')) return 'gif';
  return 'jpg';
}

export default function ApplyOrganizerPage({ navigation }) {
  const { user, refreshUser } = useAuth();
  const existingApplication = user?.organizerApplication ?? null;

  const [legalName, setLegalName] = useState(existingApplication?.legalName ?? user?.name ?? '');
  const [organizationName, setOrganizationName] = useState(existingApplication?.organizationName ?? '');
  const [experienceYears, setExperienceYears] = useState(
    typeof existingApplication?.experienceYears === 'number'
      ? String(existingApplication.experienceYears)
      : '',
  );
  const [certifications, setCertifications] = useState(existingApplication?.certifications ?? '');
  const [governmentIdNumber, setGovernmentIdNumber] = useState(
    existingApplication?.governmentIdNumber ?? '',
  );
  const [bio, setBio] = useState(existingApplication?.bio ?? '');
  const [additionalNotes, setAdditionalNotes] = useState(existingApplication?.additionalNotes ?? '');
  const [documents, setDocuments] = useState(() =>
    mapExistingDocuments(existingApplication?.documentUrls ?? []),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const statusMeta = useMemo(() => {
    if (!existingApplication) {
      return null;
    }
    switch (existingApplication.status) {
      case 'APPROVED':
        return { label: 'Approved', color: '#047857', accent: '#bbf7d0' };
      case 'REJECTED':
        return { label: 'Rejected', color: '#dc2626', accent: '#fecaca' };
      default:
        return { label: 'Pending Review', color: '#d97706', accent: '#fde68a' };
    }
  }, [existingApplication]);

  useEffect(() => {
    if (!existingApplication) {
      return;
    }
    setLegalName(existingApplication.legalName ?? user?.name ?? '');
    setOrganizationName(existingApplication.organizationName ?? '');
    setExperienceYears(
      typeof existingApplication.experienceYears === 'number'
        ? String(existingApplication.experienceYears)
        : '',
    );
    setCertifications(existingApplication.certifications ?? '');
    setGovernmentIdNumber(existingApplication.governmentIdNumber ?? '');
    setBio(existingApplication.bio ?? '');
    setAdditionalNotes(existingApplication.additionalNotes ?? '');
    setDocuments(mapExistingDocuments(existingApplication.documentUrls ?? []));
  }, [existingApplication?.id]);

  const pickDocument = useCallback(async () => {
    if (documents.length >= MAX_DOCUMENTS) {
      Alert.alert('Limit reached', `You can upload up to ${MAX_DOCUMENTS} documents.`);
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'We need access to your photos to continue.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      base64: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return;
    }

    const asset = result.assets[0];
    if (!asset.base64) {
      Alert.alert('Selection failed', 'Could not read the selected image. Please try another file.');
      return;
    }

    setDocuments((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}-${Math.random()}`,
        uri: asset.uri,
        base64: asset.base64,
        mimeType: asset.mimeType || 'image/jpeg',
        isExisting: false,
        name:
          asset.fileName ||
          asset.uri?.split('/').pop()?.split('?')[0] ||
          `document-${prev.length + 1}.${extensionFromMime(asset.mimeType)}`,
      },
    ]);
  }, [documents.length]);

  const removeDocument = useCallback((id) => {
    setDocuments((prev) => prev.filter((doc) => doc.id !== id));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) {
      return;
    }

    if (!legalName.trim()) {
      Alert.alert('Missing information', 'Please provide your legal name.');
      return;
    }

    if (documents.length === 0) {
      Alert.alert('Missing documents', 'Upload at least one supporting document or ID.');
      return;
    }

    setIsSubmitting(true);

    try {
      const existingUrls = [];
      const uploadQueue = [];

      documents.forEach((doc) => {
        if (doc.isExisting && doc.uploadedUrl) {
          existingUrls.push(doc.uploadedUrl);
        } else if (doc.base64) {
          uploadQueue.push(doc);
        }
      });

      const uploadedUrls = [];
      const timestamp = Date.now();

      for (let index = 0; index < uploadQueue.length; index += 1) {
        const doc = uploadQueue[index];
        const ext = extensionFromMime(doc.mimeType);
        const path = `organizer-applications/${user.id}/${timestamp}-${index}-${Math.random()
          .toString(36)
          .slice(2, 8)}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('Capstone')
          .upload(path, decode(doc.base64), {
            contentType: doc.mimeType || 'image/jpeg',
          });

        if (uploadError) {
          console.error('Document upload error:', uploadError);
          throw new Error('Failed to upload one of the supporting documents.');
        }

        const { data: urlData } = supabase.storage.from('Capstone').getPublicUrl(path);
        uploadedUrls.push(urlData.publicUrl);
      }

      const payload = {
        legalName: legalName.trim(),
        organizationName: organizationName.trim(),
        experienceYears: experienceYears.trim(),
        certifications: certifications.trim(),
        governmentIdNumber: governmentIdNumber.trim(),
        bio: bio.trim(),
        additionalNotes: additionalNotes.trim(),
        documentUrls: [...existingUrls, ...uploadedUrls],
      };

      const response = await post('/api/users/apply-organizer', payload);

      await refreshUser();
      Alert.alert('Success', response?.message ?? 'Application submitted successfully.', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error) {
      console.error('Organizer application failed:', error);
      const message =
        error?.body?.message ||
        error?.message ||
        'Something went wrong while submitting your application.';
      Alert.alert('Submission failed', message);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    additionalNotes,
    bio,
    certifications,
    documents,
    experienceYears,
    governmentIdNumber,
    isSubmitting,
    legalName,
    navigation,
    organizationName,
    refreshUser,
    user?.id,
  ]);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Organizer Application</Text>
        <Text style={styles.subtitle}>
          Share proof of your credentials and identity so admins can verify you as a legitimate
          organizer.
        </Text>

        {statusMeta ? (
          <View style={[styles.statusCard, { backgroundColor: statusMeta.accent }]}>
            <Text style={[styles.statusLabel, { color: statusMeta.color }]}>{statusMeta.label}</Text>
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
          <Text style={styles.label}>Legal Name *</Text>
          <TextInput
            style={styles.input}
            value={legalName}
            onChangeText={setLegalName}
            placeholder="Enter your full legal name"
            placeholderTextColor="#94a3b8"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Organization or Affiliation</Text>
          <TextInput
            style={styles.input}
            value={organizationName}
            onChangeText={setOrganizationName}
            placeholder="Company, group, or hiking club (optional)"
            placeholderTextColor="#94a3b8"
          />
        </View>

        <View style={styles.dtiCard}>
          <View style={styles.dtiIconWrapper}>
            <Ionicons name="business-outline" size={22} color="#1d4ed8" />
          </View>
          <View style={styles.dtiContent}>
            <Text style={styles.dtiTitle}>Check your DTI registration</Text>
            <Text style={styles.dtiDescription}>
              Use the official DTI Business Name Search to confirm your business or organization
              details before submitting your application.
            </Text>
            <TouchableOpacity
              style={styles.dtiButton}
              onPress={() => navigation.navigate('DtiBusinessSearch')}
            >
              <Text style={styles.dtiButtonText}>Open DTI search</Text>
              <Ionicons name="arrow-forward" size={16} color="#1d4ed8" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.sectionRow}>
          <View style={styles.rowItem}>
            <Text style={styles.label}>Years of Experience</Text>
            <TextInput
              style={styles.input}
              value={experienceYears}
              onChangeText={(text) => {
                // Only allow numbers
                const sanitized = text.replace(/[^0-9]/g, '');
                setExperienceYears(sanitized);
              }}
              keyboardType="number-pad"
              placeholder="e.g. 4"
              placeholderTextColor="#94a3b8"
            />
          </View>
          <View style={styles.rowItem}>
            <Text style={styles.label}>Government ID Number</Text>
            <TextInput
              style={styles.input}
              value={governmentIdNumber}
              onChangeText={setGovernmentIdNumber}
              placeholder="Enter an ID number"
              placeholderTextColor="#94a3b8"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Certifications & Trainings</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            multiline
            value={certifications}
            onChangeText={setCertifications}
            placeholder="List relevant certifications or trainings"
            placeholderTextColor="#94a3b8"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Organizer Bio</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            multiline
            value={bio}
            onChangeText={setBio}
            placeholder="Tell admins about your experience leading events"
            placeholderTextColor="#94a3b8"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Additional Notes</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            multiline
            value={additionalNotes}
            onChangeText={setAdditionalNotes}
            placeholder="Share anything else admins should know"
            placeholderTextColor="#94a3b8"
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.label}>Supporting Documents *</Text>
            <Text style={styles.helper}>{documents.length}/{MAX_DOCUMENTS}</Text>
          </View>
          <Text style={styles.helperText}>
            Upload government IDs, certifications, or permits that show you are a legitimate
            organizer.
          </Text>

          <View style={styles.documentsGrid}>
            {documents.map((doc) => (
              <View key={doc.id} style={styles.documentCard}>
                <Image source={{ uri: doc.uri }} style={styles.documentImage} />
                <Text style={styles.documentName} numberOfLines={1}>
                  {doc.name}
                </Text>
                <TouchableOpacity
                  onPress={() => removeDocument(doc.id)}
                  style={styles.removeButton}
                  disabled={isSubmitting}
                >
                  <Text style={styles.removeButtonText}>Remove</Text>
                </TouchableOpacity>
              </View>
            ))}
            {documents.length < MAX_DOCUMENTS ? (
              <TouchableOpacity
                style={styles.addCard}
                onPress={pickDocument}
                disabled={isSubmitting}
              >
                <Text style={styles.addCardIcon}>+</Text>
                <Text style={styles.addCardLabel}>Add Document</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.submitButton, isSubmitting && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.submitButtonText}>
              {existingApplication ? 'Update Application' : 'Submit Application'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => navigation.goBack()}
          disabled={isSubmitting}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <KeyboardSpacer extraHeight={24} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 20,
  },
  statusCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  statusTimestamp: {
    fontSize: 12,
    color: '#475569',
  },
  statusNotes: {
    marginTop: 8,
    fontSize: 13,
    color: '#1f2937',
  },
  section: {
    marginBottom: 18,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  rowItem: {
    width: '48%',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 6,
  },
  helper: {
    fontSize: 13,
    color: '#64748b',
  },
  helperText: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 12,
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
  documentsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  dtiCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#e0f2fe',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    padding: 16,
    marginBottom: 20,
  },
  dtiIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#bfdbfe',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  dtiContent: {
    flex: 1,
  },
  dtiTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  dtiDescription: {
    marginTop: 6,
    fontSize: 13,
    color: '#1e293b',
    lineHeight: 18,
  },
  dtiButton: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  dtiButtonText: {
    marginRight: 6,
    fontSize: 13,
    fontWeight: '600',
    color: '#1d4ed8',
  },
  documentCard: {
    width: '47%',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    marginBottom: 12,
  },
  documentImage: {
    width: '100%',
    height: 120,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#e2e8f0',
  },
  documentName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 6,
  },
  removeButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#fee2e2',
  },
  removeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#b91c1c',
  },
  addCard: {
    width: '47%',
    height: 180,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#cbd5f5',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    padding: 16,
    marginBottom: 12,
  },
  addCardIcon: {
    fontSize: 36,
    color: '#3b82f6',
    marginBottom: 8,
  },
  addCardLabel: {
    fontSize: 13,
    color: '#1d4ed8',
    fontWeight: '600',
    textAlign: 'center',
  },
  submitButton: {
    backgroundColor: '#047857',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
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
    marginTop: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '600',
  },
});

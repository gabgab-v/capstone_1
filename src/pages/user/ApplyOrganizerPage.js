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
import { useIdentityVerification } from '../../hooks/useIdentityVerification';
import { useFacebookVerification } from '../../hooks/useFacebookVerification';

const MAX_DOCUMENTS = 5;

function identityStatusMeta(status) {
  switch (status) {
    case 'VERIFIED':
      return { label: 'ID verified', color: '#047857', accent: '#dcfce7', helper: 'Ready for organizer publishing.' };
    case 'NEEDS_RESUBMISSION':
      return { label: 'Needs resubmission', color: '#b45309', accent: '#ffedd5', helper: 'Run AccuraScan again to fix failed checks.' };
    case 'FAILED':
      return { label: 'Identity failed', color: '#dc2626', accent: '#fee2e2', helper: 'Face match or liveness failed.' };
    case 'PROCESSING':
    case 'PENDING':
    default:
      return { label: 'Not verified yet', color: '#2563eb', accent: '#dbeafe', helper: 'Complete eKYC to continue.' };
  }
}

function facebookStatusMeta(status) {
  switch (status) {
    case 'VERIFIED':
      return { label: 'Mostly hiking page', color: '#047857', accent: '#dcfce7', helper: '>=80% of posts mention hiking.' };
    case 'PARTIAL':
      return { label: 'Partially hiking', color: '#b45309', accent: '#ffedd5', helper: '40–79% of posts mention hiking.' };
    case 'FAILED':
      return { label: 'Low relevance', color: '#dc2626', accent: '#fee2e2', helper: '<40% of posts mention hiking.' };
    case 'PROCESSING':
    case 'PENDING':
    default:
      return { label: 'Not analyzed', color: '#2563eb', accent: '#dbeafe', helper: 'Link your page to analyze hiking content.' };
  }
}

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

function formatErrorMessage(error, fallback) {
  if (!error) {
    return null;
  }
  if (error?.body?.message) {
    return error.body.message;
  }
  if (error?.message) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return fallback;
}

export default function ApplyOrganizerPage({ navigation }) {
  const { user, refreshUser } = useAuth();
  const existingApplication = user?.organizerApplication ?? null;
  const {
    verification: identityVerification,
    loading: identityLoading,
    error: identityError,
    refresh: refreshIdentity,
  } = useIdentityVerification();
  const {
    verification: fbVerification,
    loading: fbLoading,
    error: fbError,
    refresh: refreshFacebook,
    analyze: analyzeFacebook,
  } = useFacebookVerification();

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
  const [fbPageId, setFbPageId] = useState(user?.facebookVerification?.pageId ?? '');
  const [fbPageUrl, setFbPageUrl] = useState(user?.facebookVerification?.pageUrl ?? '');
  const [fbToken, setFbToken] = useState('');

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

  useEffect(() => {
    setFbPageId(fbVerification?.pageId ?? user?.facebookVerification?.pageId ?? '');
    setFbPageUrl(fbVerification?.pageUrl ?? user?.facebookVerification?.pageUrl ?? '');
  }, [fbVerification?.pageId, fbVerification?.pageUrl, user?.facebookVerification?.pageId, user?.facebookVerification?.pageUrl]);

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

  const identityMeta = useMemo(() => identityStatusMeta(identityVerification?.status ?? 'PENDING'), [identityVerification?.status]);
  const fbMeta = useMemo(() => facebookStatusMeta(fbVerification?.status ?? 'PENDING'), [fbVerification?.status]);
  const identityErrorMessage = useMemo(
    () => formatErrorMessage(identityError, 'Unable to load identity verification status right now.'),
    [identityError],
  );
  const fbErrorMessage = useMemo(
    () => formatErrorMessage(fbError, 'Unable to load Facebook verification status right now.'),
    [fbError],
  );
  const identityScore = typeof identityVerification?.score === 'number' ? identityVerification.score : 0;
  const fbScore = typeof fbVerification?.score === 'number' ? fbVerification.score : 0;
  const hikingRatio = typeof fbVerification?.hikingRatio === 'number' ? `${Math.round(fbVerification.hikingRatio * 100)}%` : '—';

  const handleAnalyzeFacebook = useCallback(async () => {
    const pageId = (fbPageId ?? '').trim();
    const pageUrl = (fbPageUrl ?? '').trim();
    const pageAccessToken = (fbToken ?? '').trim();

    if (!pageId && !pageUrl) {
      Alert.alert('Missing page details', 'Enter your Facebook Page ID or URL to run the analysis.');
      return;
    }

    try {
      await analyzeFacebook({
        pageId: pageId || undefined,
        pageUrl: pageUrl || undefined,
        pageAccessToken: pageAccessToken || undefined,
      });
      Alert.alert('Analyzed', 'Facebook page analyzed for hiking content.');
    } catch (error) {
      const message = error?.body?.message || error?.message || 'Analysis failed.';
      Alert.alert('Failed', message);
    }
  }, [analyzeFacebook, fbPageId, fbPageUrl, fbToken]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 32}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Organizer Application</Text>
        <Text style={styles.subtitle}>
          Share proof of your credentials and identity so admins can verify you as a legitimate
          organizer.
        </Text>

        <View style={[styles.verificationCard, { backgroundColor: identityMeta.accent }]}>
          <View style={styles.verificationHeader}>
            <Text style={[styles.statusLabel, { color: identityMeta.color }]}>{identityMeta.label}</Text>
            <Text style={[styles.statusPill, { color: identityMeta.color }]}>{identityScore}/30 pts</Text>
          </View>
          <Text style={styles.statusHelper}>{identityMeta.helper}</Text>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('IdentityVerification')}
            disabled={identityLoading}
          >
            {identityLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.actionButtonText}>Run eKYC (AccuraScan)</Text>
            )}
          </TouchableOpacity>
          {identityErrorMessage ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorTitle}>Couldn't load identity status</Text>
              <Text style={styles.errorText}>{identityErrorMessage}</Text>
              <TouchableOpacity
                style={[styles.retryButton, identityLoading && styles.buttonDisabled]}
                onPress={refreshIdentity}
                disabled={identityLoading}
              >
                {identityLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.retryButtonText}>Retry status</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        <View style={[styles.verificationCard, { backgroundColor: fbMeta.accent }]}>
          <View style={styles.verificationHeader}>
            <Text style={[styles.statusLabel, { color: fbMeta.color }]}>{fbMeta.label}</Text>
            <Text style={[styles.statusPill, { color: fbMeta.color }]}>{fbScore}/20 pts</Text>
          </View>
          <Text style={styles.statusHelper}>{fbMeta.helper}</Text>
          <Text style={styles.statusHelper}>Hiking posts: {hikingRatio}</Text>
          <View style={styles.fbInputRow}>
            <View style={styles.fbInputCol}>
              <Text style={styles.fbLabel}>Facebook Page ID</Text>
              <TextInput
                style={styles.input}
                value={fbPageId}
                onChangeText={setFbPageId}
                placeholder="Page ID"
                placeholderTextColor="#94a3b8"
              />
            </View>
            <View style={styles.fbInputCol}>
              <Text style={styles.fbLabel}>Page URL</Text>
              <TextInput
                style={styles.input}
                value={fbPageUrl}
                onChangeText={setFbPageUrl}
                placeholder="https://facebook.com/yourpage"
                placeholderTextColor="#94a3b8"
              />
            </View>
          </View>
          <Text style={styles.fbLabel}>Page access token (optional)</Text>
          <TextInput
            style={styles.input}
            value={fbToken}
            onChangeText={setFbToken}
            placeholder="Provide if you want us to fetch posts automatically"
            placeholderTextColor="#94a3b8"
          />
          <TouchableOpacity
            style={[styles.actionButton, { marginTop: 10 }]}
            onPress={handleAnalyzeFacebook}
            disabled={fbLoading}
          >
            {fbLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.actionButtonText}>Link & analyze page</Text>
            )}
          </TouchableOpacity>
          {fbErrorMessage ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorTitle}>Couldn't load Facebook status</Text>
              <Text style={styles.errorText}>{fbErrorMessage}</Text>
              <TouchableOpacity
                style={[styles.retryButton, fbLoading && styles.buttonDisabled]}
                onPress={refreshFacebook}
                disabled={fbLoading}
              >
                {fbLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.retryButtonText}>Retry status</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        <View style={[styles.verificationCard, { backgroundColor: '#e0f2fe' }]}>
          <Text style={[styles.statusLabel, { color: '#0369a1' }]}>Business verification</Text>
          <Text style={styles.statusHelper}>
            Upload your DTI/permit for automated checks and to boost your trust score.
          </Text>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('BusinessVerification')}
          >
            <Text style={styles.actionButtonText}>Start business verification</Text>
          </TouchableOpacity>
        </View>

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
      </ScrollView>
    </KeyboardAvoidingView>
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
  errorBanner: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecdd3',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
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
  verificationCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  verificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  statusPill: {
    fontSize: 13,
    fontWeight: '700',
  },
  statusHelper: {
    fontSize: 13,
    color: '#334155',
    marginBottom: 8,
  },
  actionButton: {
    marginTop: 6,
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  fbInputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  fbInputCol: {
    width: '48%',
  },
  fbLabel: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '600',
    marginTop: 6,
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

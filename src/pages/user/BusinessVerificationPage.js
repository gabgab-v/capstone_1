import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
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
import { WebView } from 'react-native-webview';
import ScreenHeader from '../../components/ScreenHeader';
import { supabase } from '../../lib/supabase';
import { post } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const MAX_DOCUMENTS = 3;
const TIN_PATTERN = /^\d{3}-\d{3}-\d{3}-\d{3}$/;
const BNRS_URL = 'https://bnrs.dti.gov.ph/search';

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
  if (!error) return null;
  if (error?.body?.message) return error.body.message;
  if (error?.message) return error.message;
  if (typeof error === 'string') return error;
  return fallback;
}

function formatDateInput(value) {
  if (!value) return '';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
  } catch {
    return '';
  }
}

function statusMeta(status) {
  switch (status) {
    case 'VERIFIED':
      return { label: 'Verified Business', color: '#047857', accent: '#dcfce7' };
    case 'PARTIAL':
      return { label: 'Partially Verified', color: '#d97706', accent: '#fef3c7' };
    case 'NEEDS_RESUBMISSION':
      return { label: 'Needs Resubmission', color: '#b45309', accent: '#ffedd5' };
    case 'REJECTED':
      return { label: 'Rejected', color: '#dc2626', accent: '#fee2e2' };
    case 'PROCESSING':
    case 'PENDING':
    default:
      return { label: 'Processing', color: '#2563eb', accent: '#dbeafe' };
  }
}

function CheckRow({ label, passed, detail }) {
  return (
    <View style={styles.checkRow}>
      <Text style={[styles.checkIcon, { color: passed ? '#15803d' : '#dc2626' }]}>
        {passed ? '✓' : '⚠'}
      </Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.checkLabel}>{label}</Text>
        {detail ? <Text style={styles.checkDetail}>{detail}</Text> : null}
      </View>
    </View>
  );
}

export default function BusinessVerificationPage({ navigation }) {
  const { user, refreshUser } = useAuth();
  const existingVerification = user?.businessVerification ?? null;

  const [businessName, setBusinessName] = useState(existingVerification?.businessName ?? user?.name ?? '');
  const [businessAddress, setBusinessAddress] = useState(existingVerification?.businessAddress ?? '');
  const [tin, setTin] = useState(existingVerification?.tin ?? '');
  const [referenceNumber, setReferenceNumber] = useState(existingVerification?.referenceNumber ?? '');
  const [documentType, setDocumentType] = useState(existingVerification?.documentType ?? 'DTI_CERTIFICATE');
  const [issueDate, setIssueDate] = useState(formatDateInput(existingVerification?.issueDate));
  const [expiryDate, setExpiryDate] = useState(formatDateInput(existingVerification?.expiryDate));
  const [documents, setDocuments] = useState(() =>
    mapExistingDocuments(existingVerification?.documentUrls ?? []),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [bnrsError, setBnrsError] = useState(false);
  const [bnrsReloadKey, setBnrsReloadKey] = useState(0);

  useEffect(() => {
    if (!existingVerification) return;
    setBusinessName(existingVerification.businessName ?? user?.name ?? '');
    setBusinessAddress(existingVerification.businessAddress ?? '');
    setTin(existingVerification.tin ?? '');
    setReferenceNumber(existingVerification.referenceNumber ?? '');
    setDocumentType(existingVerification.documentType ?? 'DTI_CERTIFICATE');
    setIssueDate(formatDateInput(existingVerification.issueDate));
    setExpiryDate(formatDateInput(existingVerification.expiryDate));
    setDocuments(mapExistingDocuments(existingVerification.documentUrls ?? []));
  }, [existingVerification?.id, existingVerification?.updatedAt]);

  const scoreLabel = useMemo(() => {
    if (!existingVerification) return '0 / 40 pts';
    const value = typeof existingVerification.score === 'number' ? existingVerification.score : 0;
    return `${value} / 40 pts`;
  }, [existingVerification]);

  const pickDocument = useCallback(async () => {
    try {
      if (documents.length >= MAX_DOCUMENTS) {
        Alert.alert('Limit reached', `You can upload up to ${MAX_DOCUMENTS} files.`);
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

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      if (!asset.base64) {
        Alert.alert('Selection failed', 'Could not read the selected image. Please try another file.');
        return;
      }

      setSubmitError(null);
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
            `business-doc-${prev.length + 1}.${extensionFromMime(asset.mimeType)}`,
        },
      ]);
    } catch (err) {
      console.error('Document picker failed:', err);
      const message = formatErrorMessage(err, 'Could not pick a file right now.');
      setSubmitError(message);
      Alert.alert('File picker error', message);
    }
  }, [documents.length]);

  const removeDocument = useCallback((id) => {
    setDocuments((prev) => prev.filter((doc) => doc.id !== id));
  }, []);

  const handleOpenBnrs = useCallback(async () => {
    try {
      const supported = await Linking.canOpenURL(BNRS_URL);
      if (supported) {
        await Linking.openURL(BNRS_URL);
      } else {
        Alert.alert('Unable to open link', 'Please open the BNRS site in your browser.');
      }
    } catch (err) {
      console.error('Failed to open BNRS link:', err);
      Alert.alert('Unable to open link', 'Please try again later.');
    }
  }, []);

  const handleRetryBnrs = useCallback(() => {
    setBnrsError(false);
    setBnrsReloadKey((prev) => prev + 1);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;
    if (!user?.id) {
      const message = 'Please sign in again to continue business verification.';
      Alert.alert('Not signed in', message);
      setSubmitError(message);
      return;
    }

    const trimmedName = businessName.trim();
    if (!trimmedName) {
      Alert.alert('Missing info', 'Business name is required.');
      return;
    }

    if (documents.length === 0) {
      Alert.alert('Missing document', 'Upload at least one DTI certificate or permit.');
      return;
    }

    if (tin && !TIN_PATTERN.test(tin.trim())) {
      Alert.alert('Check TIN', 'TIN should look like 123-456-789-000.');
      return;
    }

    setSubmitError(null);
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
        const path = `business-verification/${user.id}/${timestamp}-${index}-${Math.random()
          .toString(36)
          .slice(2, 8)}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('Capstone')
          .upload(path, decode(doc.base64), {
            contentType: doc.mimeType || 'image/jpeg',
          });

        if (uploadError) {
          console.error('Document upload error:', uploadError);
          throw new Error('Failed to upload one of the business documents.');
        }

        const { data: urlData } = supabase.storage.from('Capstone').getPublicUrl(path);
        if (!urlData?.publicUrl) {
          throw new Error('Could not generate a public URL for an uploaded document.');
        }
        uploadedUrls.push(urlData.publicUrl);
      }

      const payload = {
        businessName: trimmedName,
        businessAddress: businessAddress.trim(),
        tin: tin.trim(),
        referenceNumber: referenceNumber.trim(),
        documentType: (documentType || '').trim() || 'DTI_CERTIFICATE',
        issueDate: issueDate?.trim() || null,
        expiryDate: expiryDate?.trim() || null,
        documentUrls: [...existingUrls, ...uploadedUrls],
      };

      const response = await post('/api/users/business-verification', payload);
      await refreshUser?.();
      setDocuments(mapExistingDocuments(response?.verification?.documentUrls ?? payload.documentUrls));
      Alert.alert('Submitted', response?.message ?? 'Business verification submitted.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
      setSubmitError(null);
    } catch (error) {
      console.error('Business verification failed:', error);
      const message =
        formatErrorMessage(error, 'Something went wrong while submitting verification.');
      setSubmitError(message);
      Alert.alert('Submission failed', message);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    businessAddress,
    businessName,
    documents,
    expiryDate,
    isSubmitting,
    issueDate,
    navigation,
    referenceNumber,
    refreshUser,
    tin,
    documentType,
    user?.id,
  ]);

  const findings = existingVerification?.validationFindings;
  const failureReasons = existingVerification?.failureReasons ?? [];
  const status = existingVerification?.status ?? 'PENDING';
  const statusStyles = statusMeta(status);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 32}
    >
      <ScreenHeader
        navigation={navigation}
        title="Business Verification"
        subtitle="Upload your DTI Business Name Certificate or local permit. We will auto-check format, TIN, and layout, then score you as Verified, Partially Verified, or Rejected (0–40 pts)."
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.statusCard, { backgroundColor: statusStyles.accent }]}>
          <Text style={[styles.statusLabel, { color: statusStyles.color }]}>{statusStyles.label}</Text>
          <Text style={styles.statusScore}>{scoreLabel}</Text>
          <Text style={styles.statusTimestamp}>
            {existingVerification?.processedAt
              ? `Last checked ${new Date(existingVerification.processedAt).toLocaleString()}`
              : 'Pending automatic checks'}
          </Text>
        </View>

        {failureReasons.length ? (
          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>What to fix</Text>
            {failureReasons.map((reason, index) => (
              <Text key={`${reason}-${index}`} style={styles.warningItem}>
                • {reason}
              </Text>
            ))}
          </View>
        ) : null}
        {submitError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorTitle}>Submission issue</Text>
            <Text style={styles.errorText}>{submitError}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.label}>DTI BNRS search</Text>
            <TouchableOpacity style={styles.inlineLinkButton} onPress={handleOpenBnrs}>
              <Text style={styles.inlineLinkText}>Open in browser</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.helperText}>Check business name availability without leaving the app.</Text>
          {bnrsError ? (
            <View style={styles.webErrorCard}>
              <Text style={styles.webErrorTitle}>Unable to load BNRS search.</Text>
              <Text style={styles.webErrorText}>Check your connection or open the site in your browser.</Text>
              <View style={styles.webErrorActions}>
                <TouchableOpacity style={styles.webRetryButton} onPress={handleRetryBnrs}>
                  <Text style={styles.webRetryButtonText}>Retry</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.webOpenButton} onPress={handleOpenBnrs}>
                  <Text style={styles.webOpenButtonText}>Open in browser</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.webViewContainer}>
              <WebView
                key={`bnrs-${bnrsReloadKey}`}
                source={{ uri: BNRS_URL }}
                style={styles.webView}
                startInLoadingState
                renderLoading={() => (
                  <View style={styles.webLoader}>
                    <ActivityIndicator color="#1d4ed8" />
                    <Text style={styles.webLoaderText}>Loading BNRS search...</Text>
                  </View>
                )}
                onError={() => setBnrsError(true)}
                onHttpError={() => setBnrsError(true)}
                setSupportMultipleWindows={false}
                javaScriptEnabled
                domStorageEnabled
                nestedScrollEnabled
                originWhitelist={['*']}
              />
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Business name *</Text>
          <TextInput
            style={styles.input}
            value={businessName}
            onChangeText={setBusinessName}
            placeholder="Exact business name on the certificate"
            placeholderTextColor="#94a3b8"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>TIN</Text>
          <TextInput
            style={styles.input}
            value={tin}
            onChangeText={setTin}
            placeholder="123-456-789-000"
            placeholderTextColor="#94a3b8"
            keyboardType="number-pad"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Reference / Certificate number</Text>
          <TextInput
            style={styles.input}
            value={referenceNumber}
            onChangeText={setReferenceNumber}
            placeholder="Enter the BNRS reference or permit number"
            placeholderTextColor="#94a3b8"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Business address</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            multiline
            value={businessAddress}
            onChangeText={setBusinessAddress}
            placeholder="Street, city/municipality, province"
            placeholderTextColor="#94a3b8"
          />
        </View>

        <View style={styles.sectionRow}>
          <View style={styles.rowItem}>
            <Text style={styles.label}>Document type</Text>
            <TextInput
              style={styles.input}
              value={documentType}
              onChangeText={setDocumentType}
              placeholder="e.g., DTI_CERTIFICATE or LGU_PERMIT"
              placeholderTextColor="#94a3b8"
              autoCapitalize="characters"
            />
          </View>
          <View style={styles.rowItem}>
            <Text style={styles.label}>Issue date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={issueDate}
              onChangeText={setIssueDate}
              placeholder="2024-01-10"
              placeholderTextColor="#94a3b8"
            />
          </View>
        </View>

        <View style={styles.sectionRow}>
          <View style={styles.rowItem}>
            <Text style={styles.label}>Expiry date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={expiryDate}
              onChangeText={setExpiryDate}
              placeholder="2025-01-10"
              placeholderTextColor="#94a3b8"
            />
          </View>
          <View style={styles.rowItem}>
            <Text style={styles.label}>Score goal</Text>
            <Text style={styles.helperText}>32+ pts → Verified</Text>
            <Text style={styles.helperText}>16–31 pts → Partial</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.label}>Upload certificate *</Text>
            <Text style={styles.helper}>{documents.length}/{MAX_DOCUMENTS}</Text>
          </View>
          <Text style={styles.helperText}>
            Upload a clear photo of your DTI Business Name Certificate, BNRS QR, or local business permit.
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
              <TouchableOpacity style={styles.addCard} onPress={pickDocument} disabled={isSubmitting}>
                <Text style={styles.addCardIcon}>+</Text>
                <Text style={styles.addCardLabel}>Add File</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {findings?.checks?.length ? (
          <View style={styles.section}>
            <Text style={styles.label}>Automatic checks</Text>
            <View style={styles.checkList}>
              {findings.checks.map((check) => (
                <CheckRow
                  key={check.key}
                  label={check.detail || check.key}
                  detail={check.detail}
                  passed={Boolean(check.passed)}
                />
              ))}
            </View>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.submitButton, isSubmitting && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.submitButtonText}>
              {existingVerification ? 'Resubmit verification' : 'Submit for verification'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()} disabled={isSubmitting}>
          <Text style={styles.cancelButtonText}>Back to settings</Text>
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
    marginBottom: 16,
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  statusScore: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  statusTimestamp: {
    marginTop: 4,
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
  warningItem: {
    fontSize: 13,
    color: '#9a3412',
  },
  errorBanner: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecdd3',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
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
    fontSize: 12,
    color: '#64748b',
  },
  inlineLinkButton: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  inlineLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1d4ed8',
  },
  webViewContainer: {
    marginTop: 10,
    height: 420,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  webView: {
    flex: 1,
  },
  webLoader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  webLoaderText: {
    marginTop: 8,
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
  },
  webErrorCard: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#fef2f2',
    borderColor: '#fecdd3',
    borderWidth: 1,
  },
  webErrorTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#b91c1c',
  },
  webErrorText: {
    marginTop: 4,
    fontSize: 12,
    color: '#991b1b',
  },
  webErrorActions: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  webRetryButton: {
    backgroundColor: '#1d4ed8',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  webRetryButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  webOpenButton: {
    marginLeft: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  webOpenButtonText: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '600',
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
    height: 100,
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
  checkList: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    padding: 8,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 6,
  },
  checkIcon: {
    fontSize: 16,
    marginRight: 10,
    marginTop: 2,
  },
  checkLabel: {
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '600',
  },
  checkDetail: {
    fontSize: 12,
    color: '#475569',
  },
});

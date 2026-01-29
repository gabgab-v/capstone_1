import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import ViewShot from 'react-native-view-shot';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import ScreenHeader from '../../components/ScreenHeader';
import { supabase } from '../../lib/supabase';
import { post } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const MAX_SCREENSHOTS = 3;
const BNRS_URL = 'https://bnrs.dti.gov.ph/search';

function mapExistingScreenshots(urls) {
  if (!Array.isArray(urls) || urls.length === 0) {
    return [];
  }
  return urls.map((url, index) => ({
    id: `existing-${index}-${url}`,
    uri: url,
    uploadedUrl: url,
    isExisting: true,
    name: `BNRS Screenshot ${index + 1}`,
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
      return { label: 'Pending review', color: '#2563eb', accent: '#dbeafe' };
  }
}

export default function BusinessVerificationPage({ navigation }) {
  const { user, refreshUser } = useAuth();
  const existingVerification = user?.businessVerification ?? null;

  const [screenshots, setScreenshots] = useState(() =>
    mapExistingScreenshots(existingVerification?.documentUrls ?? []),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [bnrsError, setBnrsError] = useState(false);
  const [bnrsReloadKey, setBnrsReloadKey] = useState(0);
  const [isBnrsExpanded, setBnrsExpanded] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const bnrsShotRef = useRef(null);

  useEffect(() => {
    if (!existingVerification) return;
    setScreenshots(mapExistingScreenshots(existingVerification.documentUrls ?? []));
  }, [existingVerification?.id, existingVerification?.updatedAt]);

  const pickScreenshot = useCallback(async () => {
    try {
      if (screenshots.length >= MAX_SCREENSHOTS) {
        Alert.alert('Limit reached', `You can upload up to ${MAX_SCREENSHOTS} screenshots.`);
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
      setScreenshots((prev) => [
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
            `bnrs-screenshot-${prev.length + 1}.${extensionFromMime(asset.mimeType)}`,
        },
      ]);
    } catch (err) {
      console.error('Screenshot picker failed:', err);
      const message = formatErrorMessage(err, 'Could not pick a screenshot right now.');
      setSubmitError(message);
      Alert.alert('Screenshot picker error', message);
    }
  }, [screenshots.length]);

  const captureBnrsScreenshot = useCallback(async () => {
    if (screenshots.length >= MAX_SCREENSHOTS) {
      Alert.alert('Limit reached', `You can upload up to ${MAX_SCREENSHOTS} screenshots.`);
      return;
    }
    if (!bnrsShotRef.current?.capture) {
      Alert.alert('Capture unavailable', 'Open the full view to capture a screenshot.');
      return;
    }
    setIsCapturing(true);
    try {
      const uri = await bnrsShotRef.current.capture();
      if (!uri) {
        throw new Error('Screenshot capture returned empty.');
      }
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      setSubmitError(null);
      setScreenshots((prev) => [
        ...prev,
        {
          id: `capture-${Date.now()}-${Math.random()}`,
          uri,
          base64,
          mimeType: 'image/jpeg',
          isExisting: false,
          name: `BNRS Screenshot ${prev.length + 1}.jpg`,
        },
      ]);
    } catch (err) {
      console.error('BNRS screenshot capture failed:', err);
      const message = formatErrorMessage(err, 'Could not capture the BNRS screenshot.');
      setSubmitError(message);
      Alert.alert('Screenshot failed', message);
    } finally {
      setIsCapturing(false);
    }
  }, [screenshots.length]);

  const removeScreenshot = useCallback((id) => {
    setScreenshots((prev) => prev.filter((shot) => shot.id !== id));
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

  const handleOpenBnrsExpanded = useCallback(() => {
    setBnrsExpanded(true);
  }, []);

  const handleCloseBnrsExpanded = useCallback(() => {
    setBnrsExpanded(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;
    if (!user?.id) {
      const message = 'Please sign in again to continue business verification.';
      Alert.alert('Not signed in', message);
      setSubmitError(message);
      return;
    }

    if (screenshots.length === 0) {
      Alert.alert('Missing screenshot', 'Capture or upload at least one BNRS screenshot.');
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const existingUrls = [];
      const uploadQueue = [];

      screenshots.forEach((shot) => {
        if (shot.isExisting && shot.uploadedUrl) {
          existingUrls.push(shot.uploadedUrl);
        } else if (shot.base64) {
          uploadQueue.push(shot);
        }
      });

      const uploadedUrls = [];
      const timestamp = Date.now();

      for (let index = 0; index < uploadQueue.length; index += 1) {
        const shot = uploadQueue[index];
        const ext = extensionFromMime(shot.mimeType);
        const path = `business-verification/${user.id}/bnrs-${timestamp}-${index}-${Math.random()
          .toString(36)
          .slice(2, 8)}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('Capstone')
          .upload(path, decode(shot.base64), {
            contentType: shot.mimeType || 'image/jpeg',
          });

        if (uploadError) {
          console.error('Screenshot upload error:', uploadError);
          throw new Error('Failed to upload one of the BNRS screenshots.');
        }

        const { data: urlData } = supabase.storage.from('Capstone').getPublicUrl(path);
        if (!urlData?.publicUrl) {
          throw new Error('Could not generate a public URL for an uploaded document.');
        }
        uploadedUrls.push(urlData.publicUrl);
      }

      const screenshotUrls = [...existingUrls, ...uploadedUrls];
      const payload = {
        screenshotUrls,
        documentUrls: screenshotUrls,
      };

      const response = await post('/api/users/business-verification', payload);
      await refreshUser?.();
      setScreenshots(mapExistingScreenshots(response?.verification?.documentUrls ?? screenshotUrls));
      Alert.alert('Submitted', response?.message ?? 'BNRS screenshot submitted for review.', [
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
    isSubmitting,
    navigation,
    refreshUser,
    screenshots,
    user?.id,
  ]);

  const failureReasons = existingVerification?.failureReasons ?? [];
  const status = existingVerification?.status ?? 'PENDING';
  const statusStyles = statusMeta(status);

  const renderBnrsEmbed = ({ expanded }) => {
    if (bnrsError) {
      return (
        <View style={[styles.webErrorCard, expanded && styles.webErrorCardExpanded]}>
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
      );
    }

    const containerStyle = expanded ? styles.webViewExpandedContainer : styles.webViewContainer;
    const webViewStyle = expanded ? styles.webViewExpanded : styles.webView;
    const keySuffix = expanded ? 'expanded' : 'preview';

    const webViewNode = (
      <WebView
        key={`bnrs-${bnrsReloadKey}-${keySuffix}`}
        source={{ uri: BNRS_URL }}
        style={webViewStyle}
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
    );

    return (
      <View style={containerStyle}>
        {expanded ? (
          <ViewShot
            ref={bnrsShotRef}
            style={styles.webViewShot}
            options={{ format: 'jpg', quality: 0.9 }}
          >
            {webViewNode}
          </ViewShot>
        ) : (
          webViewNode
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 32}
    >
      <ScreenHeader
        navigation={navigation}
        title="Business Verification"
        subtitle="Search your business name in the DTI BNRS site, capture a screenshot, and submit it for manual review."
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {existingVerification ? (
          <View style={[styles.statusCard, { backgroundColor: statusStyles.accent }]}>
            <Text style={[styles.statusLabel, { color: statusStyles.color }]}>{statusStyles.label}</Text>
            <Text style={styles.statusScore}>
              {existingVerification?.processedAt ? 'Reviewed by admin' : 'Awaiting admin review'}
            </Text>
            <Text style={styles.statusTimestamp}>
              {existingVerification?.processedAt
                ? `Reviewed ${new Date(existingVerification.processedAt).toLocaleString()}`
                : existingVerification?.createdAt
                ? `Submitted ${new Date(existingVerification.createdAt).toLocaleString()}`
                : 'Submitted for review'}
            </Text>
          </View>
        ) : null}

        {failureReasons.length ? (
          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>Admin feedback</Text>
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
            <View style={styles.sectionHeaderActions}>
              <TouchableOpacity style={styles.inlineLinkButton} onPress={handleOpenBnrsExpanded}>
                <Text style={styles.inlineLinkText}>Full view</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.inlineLinkButton, styles.inlineLinkButtonSpacer]}
                onPress={handleOpenBnrs}
              >
                <Text style={styles.inlineLinkText}>Open in browser</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={styles.helperText}>Check business name availability without leaving the app.</Text>
          {renderBnrsEmbed({ expanded: false })}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.label}>BNRS screenshot *</Text>
            <Text style={styles.helper}>{screenshots.length}/{MAX_SCREENSHOTS}</Text>
          </View>
          <Text style={styles.helperText}>
            Open the full BNRS view, search your business name, and capture a screenshot of the results.
          </Text>
          <View style={styles.screenshotActions}>
            <TouchableOpacity style={styles.screenshotPrimary} onPress={handleOpenBnrsExpanded}>
              <Text style={styles.screenshotPrimaryText}>Open full view</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.screenshotSecondary}
              onPress={pickScreenshot}
              disabled={isSubmitting}
            >
              <Text style={styles.screenshotSecondaryText}>Upload screenshot</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.documentsGrid}>
            {screenshots.map((shot) => (
              <View key={shot.id} style={styles.documentCard}>
                <Image source={{ uri: shot.uri }} style={styles.documentImage} />
                <Text style={styles.documentName} numberOfLines={1}>
                  {shot.name}
                </Text>
                <TouchableOpacity
                  onPress={() => removeScreenshot(shot.id)}
                  style={styles.removeButton}
                  disabled={isSubmitting}
                >
                  <Text style={styles.removeButtonText}>Remove</Text>
                </TouchableOpacity>
              </View>
            ))}
            {screenshots.length < MAX_SCREENSHOTS ? (
              <TouchableOpacity
                style={styles.addCard}
                onPress={handleOpenBnrsExpanded}
                disabled={isSubmitting}
              >
                <Text style={styles.addCardIcon}>+</Text>
                <Text style={styles.addCardLabel}>Capture in full view</Text>
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
              {existingVerification ? 'Resubmit BNRS screenshot' : 'Submit BNRS screenshot'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()} disabled={isSubmitting}>
          <Text style={styles.cancelButtonText}>Back to settings</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={isBnrsExpanded}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={handleCloseBnrsExpanded}
      >
        <SafeAreaView style={styles.bnrsExpandedSafeArea}>
          <View style={styles.bnrsExpandedHeader}>
            <Text style={styles.bnrsExpandedTitle}>DTI BNRS search</Text>
            <View style={styles.bnrsExpandedActions}>
              <TouchableOpacity
                style={[styles.bnrsCaptureButton, (isCapturing || bnrsError) && styles.buttonDisabled]}
                onPress={captureBnrsScreenshot}
                disabled={isCapturing || bnrsError}
              >
                {isCapturing ? (
                  <ActivityIndicator color="#0f172a" />
                ) : (
                  <Text style={styles.bnrsCaptureButtonText}>Capture</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.bnrsExpandedClose} onPress={handleCloseBnrsExpanded}>
                <Text style={styles.bnrsExpandedCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.bnrsExpandedBody}>{renderBnrsEmbed({ expanded: true })}</View>
        </SafeAreaView>
      </Modal>
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
  sectionHeaderActions: {
    flexDirection: 'row',
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
  screenshotActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 12,
  },
  screenshotPrimary: {
    backgroundColor: '#1d4ed8',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  screenshotPrimaryText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  screenshotSecondary: {
    marginLeft: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#e2e8f0',
  },
  screenshotSecondaryText: {
    color: '#1e293b',
    fontSize: 12,
    fontWeight: '600',
  },
  inlineLinkButton: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  inlineLinkButtonSpacer: {
    marginLeft: 12,
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
  webViewShot: {
    flex: 1,
  },
  webViewExpandedContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  webViewExpanded: {
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
  webErrorCardExpanded: {
    marginHorizontal: 16,
    marginTop: 12,
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
  bnrsExpandedSafeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  bnrsExpandedHeader: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  bnrsExpandedActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bnrsCaptureButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#fde047',
    marginRight: 10,
  },
  bnrsCaptureButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  bnrsExpandedTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  bnrsExpandedClose: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
  },
  bnrsExpandedCloseText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
  },
  bnrsExpandedBody: {
    flex: 1,
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

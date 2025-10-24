import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';

import ScreenHeader from '../../components/ScreenHeader';
import { useTheme } from '../../context/ThemeContext';

const DTI_SEARCH_URL = 'https://bnrs.dti.gov.ph/search';

export default function DtiBusinessSearchPage({ navigation }) {
  const { colors } = useTheme();
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [webViewKey, setWebViewKey] = useState(0);

  const loadingText = 'Loading DTI search...';

  const handleReload = useCallback(() => {
    setHasError(false);
    setIsLoading(true);
    setWebViewKey((prev) => prev + 1);
  }, []);

  const handleOpenExternal = useCallback(() => {
    Linking.openURL(DTI_SEARCH_URL).catch((error) => {
      console.warn('Unable to open DTI search link:', error);
    });
  }, []);

  const headerActions = useMemo(
    () => (
      <View style={styles.headerButtons}>
        <TouchableOpacity
          style={[styles.headerButton, { borderColor: colors.border }]}
          onPress={handleReload}
          accessibilityRole="button"
          accessible
          accessibilityLabel="Reload DTI search"
        >
          <Ionicons name="refresh" size={18} color={colors.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.headerButton, { borderColor: colors.border }]}
          onPress={handleOpenExternal}
          accessibilityRole="button"
          accessible
          accessibilityLabel="Open DTI search in browser"
        >
          <Ionicons name="open-outline" size={18} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>
    ),
    [colors.border, colors.textPrimary, handleOpenExternal, handleReload],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        navigation={navigation}
        title="DTI Business Search"
        subtitle="Verify Philippine business registrations for organizer review"
        rightSlot={headerActions}
      />
      <View style={styles.webViewWrapper}>
        {hasError ? (
          <View style={[styles.errorContainer, { backgroundColor: colors.surface }]}>
            <View style={[styles.errorIcon, { backgroundColor: colors.border }]}>
              <Ionicons name="warning-outline" size={24} color={colors.textPrimary} />
            </View>
            <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>
              Something went wrong
            </Text>
            <Text style={[styles.errorMessage, { color: colors.textMuted }]}>
              We could not load the DTI Business Name Search right now. Check your connection or try
              again.
            </Text>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: colors.accent }]}
              onPress={handleReload}
              accessibilityRole="button"
            >
              <Text style={styles.primaryButtonText}>Try again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleOpenExternal}
              accessibilityRole="button"
            >
              <Text style={[styles.secondaryButtonText, { color: colors.accent }]}>
                Open in browser
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <WebView
              key={webViewKey}
              source={{ uri: DTI_SEARCH_URL }}
              originWhitelist={['*']}
              onLoadStart={() => {
                setIsLoading(true);
                setHasError(false);
              }}
              onLoadEnd={() => {
                setIsLoading(false);
              }}
              onError={() => {
                setHasError(true);
                setIsLoading(false);
              }}
              startInLoadingState={false}
              style={styles.webView}
            />
            {isLoading ? (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={colors.accent} />
                <Text style={[styles.loadingText, { color: colors.textMuted }]}>{loadingText}</Text>
              </View>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webViewWrapper: {
    flex: 1,
    position: 'relative',
  },
  webView: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '500',
  },
  headerButtons: {
    flexDirection: 'row',
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  errorIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorMessage: {
    marginTop: 8,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  primaryButton: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 24,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
    textAlign: 'center',
  },
  secondaryButton: {
    marginTop: 12,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});

import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../context/ThemeContext';
import { supabaseStatus } from '../lib/supabase';
import { mapboxStatus } from '../lib/mapbox';

export default function StartupDiagnosticsGate({ children }) {
  const { colors } = useTheme();

  const { blockingIssues, warningIssues } = useMemo(() => {
    const blocking = [];
    const warnings = [];

    if (!supabaseStatus.isConfigured) {
      blocking.push({
        id: 'supabase',
        title: 'Supabase credentials missing',
        detail: supabaseStatus.missingReason,
        hints: [
          'Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your env or expo.extra.',
          'After updating the config, reinstall or reload the app to apply the values.',
        ],
      });
    }

    if (mapboxStatus.isEnabled) {
      if (!mapboxStatus.tokenConfigured) {
        warnings.push({
          id: 'mapbox-token',
          title: 'Mapbox access token missing',
          detail:
            'Set EXPO_PUBLIC_MAPBOX_TOKEN or expo.extra.mapboxAccessToken to enable trail and event maps.',
          hints: ['Store the token in app.json or your build env vars and reload the app.'],
        });
      } else if (!mapboxStatus.isAvailable) {
        warnings.push({
          id: 'mapbox',
          title: 'Mapbox native module unavailable',
          detail:
            mapboxStatus.missingReason ||
            'Install and configure @rnmapbox/maps to enable trail previews on native builds.',
          hints: [
            'Follow the Mapbox Expo installation guide and rebuild the native project.',
            'If you intend to run without Mapbox, you can ignore this warning—placeholder maps will be shown.',
          ],
        });
      }
    }

    return { blockingIssues: blocking, warningIssues: warnings };
  }, []);

  if (blockingIssues.length > 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Unable to start the app</Text>
          <Text style={[styles.description, { color: colors.textMuted }]}>
            Fix the issues below and reload to continue.
          </Text>
          <ScrollView style={styles.issueList} contentContainerStyle={styles.issueListContent}>
            {blockingIssues.map((issue) => (
              <View key={issue.id} style={[styles.issue, { borderColor: colors.border }]}>
                <Text style={[styles.issueTitle, { color: colors.dangerText }]}>{issue.title}</Text>
                <Text style={[styles.issueDetail, { color: colors.textPrimary }]}>{issue.detail}</Text>
                {issue.hints?.map((hint, index) => (
                  <Text key={`${issue.id}-hint-${index}`} style={[styles.hint, { color: colors.textMuted }]}>
                    • {hint}
                  </Text>
                ))}
              </View>
            ))}
            {warningIssues.length > 0 && (
              <View style={[styles.warningSection, { borderColor: colors.border }]}>
                <Text style={[styles.warningTitle, { color: colors.warningText }]}>Warnings detected</Text>
                {warningIssues.map((issue) => (
                  <View key={issue.id} style={styles.warningItem}>
                    <Text style={[styles.issueDetail, { color: colors.textPrimary }]}>{issue.title}</Text>
                    <Text style={[styles.hint, { color: colors.textMuted }]}>{issue.detail}</Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
          <Text style={[styles.footer, { color: colors.textMuted }]}>
            Startup diagnostics prevent silent crashes by surfacing blocking configuration errors.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.flexWrapper}>
      {children}
      {warningIssues.length > 0 && (
        <View pointerEvents="none" style={styles.warningOverlay}>
          <View style={[styles.warningCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {warningIssues.map((issue) => (
              <View key={issue.id} style={styles.warningItem}>
                <Text style={[styles.warningTitle, { color: colors.warningText }]}>{issue.title}</Text>
                <Text style={[styles.hint, { color: colors.textMuted }]}>{issue.detail}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flexWrapper: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 6,
  },
  description: {
    fontSize: 14,
    marginBottom: 16,
  },
  issueList: {
    maxHeight: 260,
  },
  issueListContent: {
    gap: 12,
  },
  issue: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 16,
  },
  issueTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  issueDetail: {
    fontSize: 14,
    marginBottom: 8,
  },
  hint: {
    fontSize: 13,
    marginTop: 2,
  },
  footer: {
    fontSize: 12,
    marginTop: 18,
    textAlign: 'center',
  },
  warningSection: {
    marginTop: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  warningItem: {
    marginBottom: 8,
  },
  warningOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 24,
    paddingHorizontal: 20,
  },
  warningCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
});

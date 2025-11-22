import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../context/ThemeContext';
import { supabaseStatus } from '../lib/supabase';

export default function StartupDiagnosticsGate({ children }) {
  const { colors } = useTheme();

  const blockingIssues = useMemo(() => {
    const issues = [];

    if (!supabaseStatus.isConfigured) {
      issues.push({
        id: 'supabase',
        title: 'Supabase credentials missing',
        detail: supabaseStatus.missingReason,
        hints: [
          'Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your env or expo.extra.',
          'After updating the config, reinstall or reload the app to apply the values.',
        ],
      });
    }

    return issues;
  }, []);

  if (blockingIssues.length === 0) {
    return children;
  }

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
        </ScrollView>
        <Text style={[styles.footer, { color: colors.textMuted }]}>
          Startup diagnostics prevent silent crashes by surfacing blocking configuration errors.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
});

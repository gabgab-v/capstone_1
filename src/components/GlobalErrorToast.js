import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useTheme } from '../context/ThemeContext';
import {
  enableGlobalErrorTracking,
  getLastGlobalError,
  subscribeToGlobalErrors,
} from '../utils/globalErrorTracker';

export default function GlobalErrorToast() {
  const { colors } = useTheme();
  const [report, setReport] = useState(() => getLastGlobalError());
  const [visible, setVisible] = useState(false);
  const hideTimerRef = useRef(null);

  useEffect(() => {
    enableGlobalErrorTracking();
    if (report) {
      setVisible(true);
    }

    const unsubscribe = subscribeToGlobalErrors((next) => {
      setReport(next);
      setVisible(true);
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
      hideTimerRef.current = setTimeout(() => setVisible(false), 12000);
    });

    return () => {
      unsubscribe();
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  if (!report || !visible) {
    return null;
  }

  const truncatedStack = report.stack
    ? report.stack
        .split('\n')
        .slice(0, 2)
        .join('\n')
    : 'No stack trace available.';

  const handlePress = () => {
    Alert.alert(report.message, report.stack || 'No stack trace available.');
  };

  return (
    <View pointerEvents="box-none" style={styles.absolute}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.92}
        style={[
          styles.toast,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            shadowColor: colors.textPrimary,
          },
        ]}
      >
        <Text style={[styles.title, { color: report.isFatal ? colors.dangerText : colors.warningText }]}>
          {report.isFatal ? 'Fatal error detected' : 'Error captured'}
        </Text>
        <Text numberOfLines={2} style={[styles.message, { color: colors.textPrimary }]}>
          {report.message}
        </Text>
        <Text numberOfLines={2} style={[styles.stack, { color: colors.textMuted }]}>
          {truncatedStack}
        </Text>
        <Text style={[styles.hint, { color: colors.textMuted }]}>Tap for full stack trace</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  absolute: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 24,
    paddingHorizontal: 20,
  },
  toast: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  message: {
    fontSize: 13,
    marginBottom: 4,
  },
  stack: {
    fontSize: 11,
  },
  hint: {
    fontSize: 11,
    marginTop: 6,
    textAlign: 'right',
  },
});

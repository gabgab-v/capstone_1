import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../context/ThemeContext';

export default function ScreenHeader({
  title,
  subtitle,
  navigation,
  rightSlot = null,
  onBackPress,
  showBackButton = true,
  backgroundColor,
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const resolvedBackground = backgroundColor ?? colors.surface;
  const canGoBack =
    showBackButton &&
    navigation &&
    typeof navigation.canGoBack === 'function' &&
    navigation.canGoBack();

  const handleBack = () => {
    if (typeof onBackPress === 'function') {
      onBackPress();
      return;
    }
    if (navigation && typeof navigation.goBack === 'function') {
      navigation.goBack();
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: Math.max(insets.top, 16),
          backgroundColor: resolvedBackground,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <View style={styles.row}>
        {canGoBack ? (
          <TouchableOpacity
            onPress={handleBack}
            style={styles.backButton}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : null}

        <View style={[styles.titleContainer, { marginLeft: canGoBack ? 8 : 0 }]}>
          {title ? (
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          {subtitle ? (
            <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {rightSlot ? <View style={styles.rightSlot}>{rightSlot}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    borderRadius: 999,
    padding: 4,
    marginRight: 4,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  rightSlot: {
    marginLeft: 12,
  },
});


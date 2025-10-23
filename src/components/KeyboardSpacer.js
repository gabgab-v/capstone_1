import React from 'react';
import { View } from 'react-native';

import useKeyboardInsets from '../hooks/useKeyboardInsets';

/**
 * Renders a flexible spacer whose height mirrors the on-screen keyboard.
 * Place this at the bottom of scrollable content or use as a list footer to
 * prevent important actions from being hidden when the keyboard appears.
 */
export default function KeyboardSpacer({ extraHeight = 0, minHeight = 0 }) {
  const { paddedBottom, isKeyboardVisible, safeAreaPadding } = useKeyboardInsets(extraHeight);
  const height = isKeyboardVisible ? paddedBottom : Math.max(minHeight, safeAreaPadding);

  if (height <= 0) {
    return null;
  }

  return <View style={{ height }} />;
}

import { useEffect, useMemo, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Tracks the on-screen keyboard height and exposes convenient bottom inset values.
 * Useful for padding scroll content or adding spacers so interactive elements
 * remain visible when the keyboard appears.
 */
export default function useKeyboardInsets(extraOffset = 0) {
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.select({
      ios: 'keyboardWillShow',
      default: 'keyboardDidShow',
    });
    const hideEvent = Platform.select({
      ios: 'keyboardWillHide',
      default: 'keyboardDidHide',
    });

    const handleShow = (event) => {
      const height = event?.endCoordinates?.height ?? 0;
      setKeyboardHeight(height);
    };
    const handleHide = () => setKeyboardHeight(0);

    const showListener = Keyboard.addListener(showEvent, handleShow);
    const hideListener = Keyboard.addListener(hideEvent, handleHide);

    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, []);

  return useMemo(() => {
    const safePadding = Math.max(extraOffset, insets.bottom);
    const bottom = keyboardHeight > 0 ? keyboardHeight + extraOffset : extraOffset;
    const paddedBottom = keyboardHeight > 0 ? keyboardHeight + safePadding : safePadding;

    return {
      keyboardHeight,
      bottom,
      paddedBottom,
      isKeyboardVisible: keyboardHeight > 0,
      safeAreaPadding: safePadding,
    };
  }, [extraOffset, insets.bottom, keyboardHeight]);
}

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Appearance, Platform, StatusBar, Text } from 'react-native';
import { NativeWindStyleSheet } from 'nativewind';
import * as SecureStore from 'expo-secure-store';

import { darkPalette, lightPalette } from '../theme/palette';

const STORAGE_KEY = 'trailmate.theme.preference';

const ThemeContext = createContext({
  isDarkMode: false,
  colors: lightPalette,
  setDarkMode: () => {},
  toggleDarkMode: () => {},
});

function getSystemScheme() {
  if (typeof Appearance?.getColorScheme !== 'function') {
    return 'light';
  }
  return Appearance.getColorScheme() ?? 'light';
}

async function persistPreference(value) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, value ? 'dark' : 'light');
    } catch (error) {
      console.warn('Unable to persist theme preference via localStorage', error);
    }
    return;
  }
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, value ? 'dark' : 'light');
  } catch (error) {
    console.warn('Unable to persist theme preference', error);
  }
}

async function readPersistedPreference() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'dark') {
        return true;
      }
      if (stored === 'light') {
        return false;
      }
    } catch (error) {
      console.warn('Unable to read theme preference via localStorage', error);
    }
    return null;
  }
  try {
    const stored = await SecureStore.getItemAsync(STORAGE_KEY);
    if (stored === 'dark') {
      return true;
    }
    if (stored === 'light') {
      return false;
    }
    return null;
  } catch (error) {
    console.warn('Unable to read theme preference', error);
    return null;
  }
}

export function ThemeProvider({ children }) {
  const [isDarkMode, setIsDarkMode] = useState(() => getSystemScheme() === 'dark');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    readPersistedPreference()
      .then((storedValue) => {
        if (mounted && storedValue !== null) {
          setIsDarkMode(storedValue);
        }
      })
      .finally(() => {
        if (mounted) {
          setIsReady(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    NativeWindStyleSheet?.setColorScheme?.(isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  useEffect(() => {
    StatusBar.setBarStyle(isDarkMode ? 'light-content' : 'dark-content');
  }, [isDarkMode]);

  useEffect(() => {
    const listener = Appearance.addChangeListener(({ colorScheme }) => {
      if (colorScheme && !isReady) {
        setIsDarkMode(colorScheme === 'dark');
      }
    });

    return () => {
      listener.remove();
    };
  }, [isReady]);

  const setDarkMode = useCallback((value) => {
    setIsDarkMode(value);
    persistPreference(value);
  }, []);

  const toggleDarkMode = useCallback(() => {
    setIsDarkMode((prev) => {
      const next = !prev;
      persistPreference(next);
      return next;
    });
  }, []);

  const colors = isDarkMode ? darkPalette : lightPalette;

  useEffect(() => {
    Text.defaultProps = Text.defaultProps || {};
    Text.defaultProps.style = [{ color: colors.textPrimary }];
  }, [colors.textPrimary]);

  const value = useMemo(
    () => ({
      isDarkMode,
      colors,
      setDarkMode,
      toggleDarkMode,
    }),
    [colors, isDarkMode, setDarkMode, toggleDarkMode],
  );

  if (!isReady) {
    return null;
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

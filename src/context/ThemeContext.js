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
  themePreference: 'system',
  colors: lightPalette,
  setThemePreference: () => {},
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
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch (error) {
      console.warn('Unable to persist theme preference via localStorage', error);
    }
    return;
  }
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, value);
  } catch (error) {
    console.warn('Unable to persist theme preference', error);
  }
}

async function readPersistedPreference() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const normalize = (storedValue) => {
      if (storedValue === 'dark' || storedValue === 'light' || storedValue === 'system') {
        return storedValue;
      }
      return null;
    };

    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      return normalize(stored);
    } catch (error) {
      console.warn('Unable to read theme preference via localStorage', error);
    }
    return null;
  }
  try {
    const stored = await SecureStore.getItemAsync(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light' || stored === 'system') {
      return stored;
    }
    return null;
  } catch (error) {
    console.warn('Unable to read theme preference', error);
    return null;
  }
}

export function ThemeProvider({ children }) {
  const [themePreference, setThemePreferenceState] = useState('system');
  const [systemScheme, setSystemScheme] = useState(getSystemScheme());
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    readPersistedPreference()
      .then((storedValue) => {
        if (mounted && storedValue) {
          setThemePreferenceState(storedValue);
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
    if (typeof Appearance?.addChangeListener !== 'function') {
      return undefined;
    }

    const listener = Appearance.addChangeListener(({ colorScheme }) => {
      if (colorScheme) {
        setSystemScheme(colorScheme);
      }
    });

    return () => {
      listener?.remove?.();
    };
  }, []);

  const isDarkMode = themePreference === 'system' ? systemScheme === 'dark' : themePreference === 'dark';

  useEffect(() => {
    NativeWindStyleSheet?.setColorScheme?.(isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  useEffect(() => {
    StatusBar.setBarStyle(isDarkMode ? 'light-content' : 'dark-content');
  }, [isDarkMode]);

  const applyThemePreference = useCallback((value) => {
    setThemePreferenceState(value);
    persistPreference(value);
  }, []);

  const setThemePreference = useCallback(
    (value) => {
      applyThemePreference(value);
    },
    [applyThemePreference],
  );

  const setDarkMode = useCallback(
    (value) => {
      applyThemePreference(value ? 'dark' : 'light');
    },
    [applyThemePreference],
  );

  const toggleDarkMode = useCallback(() => {
    setThemePreferenceState((prev) => {
      const next =
        prev === 'system' ? (systemScheme === 'dark' ? 'light' : 'dark') : prev === 'dark' ? 'light' : 'dark';
      persistPreference(next);
      return next;
    });
  }, [systemScheme]);

  const colors = isDarkMode ? darkPalette : lightPalette;

  useEffect(() => {
    Text.defaultProps = Text.defaultProps || {};
    Text.defaultProps.style = [{ color: colors.textPrimary }];
  }, [colors.textPrimary]);

  const value = useMemo(
    () => ({
      isDarkMode,
      themePreference,
      colors,
      setThemePreference,
      setDarkMode,
      toggleDarkMode,
    }),
    [colors, isDarkMode, setDarkMode, setThemePreference, themePreference, toggleDarkMode],
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

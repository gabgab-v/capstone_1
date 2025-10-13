import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

// An adapter for SecureStore to make it work with Supabase's browser-based storage persistence
const ExpoSecureStoreAdapter = {
  getItem: (key) => {
    return SecureStore.getItemAsync(key);
  },
  setItem: (key, value) => {
    return SecureStore.setItemAsync(key, value);
  },
  removeItem: (key) => {
    return SecureStore.deleteItemAsync(key);
  },
};

const extra = Constants.expoConfig?.extra ?? Constants.manifest?.extra ?? {};
const supabaseUrl =
  (typeof extra?.supabaseUrl === 'string' && extra.supabaseUrl.trim()) ||
  (typeof process !== 'undefined' &&
    process.env &&
    typeof process.env.EXPO_PUBLIC_SUPABASE_URL === 'string' &&
    process.env.EXPO_PUBLIC_SUPABASE_URL.trim()) ||
  '';
const supabaseAnonKey =
  (typeof extra?.supabaseAnonKey === 'string' && extra.supabaseAnonKey.trim()) ||
  (typeof process !== 'undefined' &&
    process.env &&
    typeof process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY === 'string' &&
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY.trim()) ||
  '';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase credentials are not configured. Define them in expo.extra or EXPO_PUBLIC_SUPABASE_* environment variables.',
  );
}

// Create and export the Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

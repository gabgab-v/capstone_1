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

const SUPABASE_CONFIG_MESSAGE =
  'Supabase credentials are not configured. Define EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY or set expo.extra.supabase* values.';

const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabaseStatus = {
  isConfigured: isSupabaseConfigured,
  missingReason: isSupabaseConfigured ? null : SUPABASE_CONFIG_MESSAGE,
  supabaseUrl,
};

function createDisabledSupabaseClient(errorMessage) {
  const createConfigError = () => {
    const error = new Error(errorMessage);
    error.code = 'SUPABASE_NOT_CONFIGURED';
    return error;
  };

  const disabledAuth = {
    async getSession() {
      return { data: { session: null }, error: createConfigError() };
    },
    async getUser() {
      return { data: { user: null }, error: createConfigError() };
    },
    async signInWithPassword() {
      throw createConfigError();
    },
    async signUp() {
      throw createConfigError();
    },
    async signOut() {
      throw createConfigError();
    },
    onAuthStateChange() {
      return {
        data: {
          subscription: {
            unsubscribe() {},
          },
        },
        error: createConfigError(),
      };
    },
  };

  const disabledStorageBucket = {
    async upload() {
      throw createConfigError();
    },
    getPublicUrl() {
      const error = createConfigError();
      return { data: { publicUrl: null }, error };
    },
  };

  const disabledStorage = {
    from() {
      return disabledStorageBucket;
    },
  };

  return {
    auth: disabledAuth,
    storage: disabledStorage,
    from() {
      throw createConfigError();
    },
  };
}

const supabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: ExpoSecureStoreAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : createDisabledSupabaseClient(SUPABASE_CONFIG_MESSAGE);

// Create and export the Supabase client (or a disabled stub)
export const supabase = supabaseClient;

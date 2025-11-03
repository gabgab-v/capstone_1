import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

import { getExpoExtra } from './expoConfig';

const memoryFallback = new Map();
let secureStoreAvailabilityPromise = null;
let secureStoreAvailableCache = null;

function ensureSecureStoreAvailability() {
  if (typeof secureStoreAvailableCache === 'boolean') {
    return Promise.resolve(secureStoreAvailableCache);
  }

  if (!SecureStore || typeof SecureStore.isAvailableAsync !== 'function') {
    secureStoreAvailableCache = false;
    return Promise.resolve(false);
  }

  if (!secureStoreAvailabilityPromise) {
    secureStoreAvailabilityPromise = SecureStore.isAvailableAsync()
      .then((available) => {
        secureStoreAvailableCache = available;
        return available;
      })
      .catch(() => {
        secureStoreAvailableCache = false;
        return false;
      });
  }

  return secureStoreAvailabilityPromise;
}

// Storage adapter that prefers SecureStore but falls back to in-memory storage when unavailable.
const ExpoSecureStoreAdapter = {
  async getItem(key) {
    const available = await ensureSecureStoreAvailability();
    if (available) {
      try {
        return await SecureStore.getItemAsync(key);
      } catch (error) {
        console.warn('SecureStore getItemAsync failed, falling back to memory storage.', error);
      }
    }
    return memoryFallback.has(key) ? memoryFallback.get(key) : null;
  },
  async setItem(key, value) {
    const available = await ensureSecureStoreAvailability();
    if (available) {
      try {
        await SecureStore.setItemAsync(key, value);
        return;
      } catch (error) {
        console.warn('SecureStore setItemAsync failed, using memory storage instead.', error);
      }
    }
    memoryFallback.set(key, value);
  },
  async removeItem(key) {
    const available = await ensureSecureStoreAvailability();
    if (available) {
      try {
        await SecureStore.deleteItemAsync(key);
        return;
      } catch (error) {
        console.warn('SecureStore deleteItemAsync failed, clearing memory storage record.', error);
      }
    }
    memoryFallback.delete(key);
  },
};

const extra = getExpoExtra();
const supabaseUrl =
  (typeof extra?.supabaseUrl === 'string' && extra.supabaseUrl.trim()) ||
  (typeof process !== 'undefined' &&
    process.env &&
    typeof process.env.EXPO_PUBLIC_SUPABASE_URL === 'string' &&
    process.env.EXPO_PUBLIC_SUPABASE_URL.trim()) ||
  (typeof extra?.supabaseUrl === 'object' && typeof extra?.supabaseUrl?.default === 'string'
    ? extra.supabaseUrl.default.trim()
    : '') ||
  '';

const supabaseAnonKey =
  (typeof extra?.supabaseAnonKey === 'string' && extra.supabaseAnonKey.trim()) ||
  (typeof process !== 'undefined' &&
    process.env &&
    typeof process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY === 'string' &&
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY.trim()) ||
  (typeof extra?.supabaseAnonKey === 'object' &&
  typeof extra?.supabaseAnonKey?.default === 'string'
    ? extra.supabaseAnonKey.default.trim()
    : '') ||
  '';

const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);
const missingConfigMessage =
  'Supabase credentials are not configured. Define them in expo.extra or EXPO_PUBLIC_SUPABASE_* environment variables.';

const noopSubscription = {
  unsubscribe() {},
};

const unconfiguredAuth = {
  async getSession() {
    throw new Error(missingConfigMessage);
  },
  async signInWithPassword() {
    throw new Error(missingConfigMessage);
  },
  async signOut() {
    throw new Error(missingConfigMessage);
  },
  async signUp() {
    throw new Error(missingConfigMessage);
  },
  async getUser() {
    throw new Error(missingConfigMessage);
  },
  onAuthStateChange() {
    console.error(missingConfigMessage);
    return {
      data: { subscription: noopSubscription },
      error: new Error(missingConfigMessage),
    };
  },
};

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: ExpoSecureStoreAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : { auth: unconfiguredAuth };

export const isSupabaseConfigured = hasSupabaseConfig;

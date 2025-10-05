import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

// An adapter for SecureStore to make it work with Supabase's browser-based storage persistence
const ExpoSecureStoreAdapter = {
  getItem: (key) => {
    return SecureStore.getItemAsync(key);
  },
  setItem: (key, value) => {
    SecureStore.setItemAsync(key, value);
  },
  removeItem: (key) => {
    SecureStore.deleteItemAsync(key);
  },
};

// It's recommended to store these in environment variables
const supabaseUrl = 'https://vifynucfnarnaxilodsj.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpZnludWNmbmFybmF4aWxvZHNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0MDQxNDMsImV4cCI6MjA3NDk4MDE0M30.PPQQa_mUTd15WTD88gc5hy_fH4OaL97eMDDpzdV5_TE';

// Create and export the Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
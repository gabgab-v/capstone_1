import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function LoginPage({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPass] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { isDarkMode } = useTheme();
  const placeholderColor = isDarkMode ? '#94a3b8' : '#888';

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter your email and password.');
      return;
    }

    setLoading(true); // Start loading

    try {
      // 1. Call the login function from the context directly.
      // This now calls supabase.auth.signInWithPassword(...)
      const { error } = await login(email, password);

      // If Supabase returns an error, show it.
      if (error) {
        throw error;
      }
      // On success, the AuthContext and App.js will handle navigation automatically.

    } catch (e) {
      Alert.alert(`Login Failed`, e.message);
      console.error(e);
    } finally {
      setLoading(false); // Stop loading
    }
  }

  const handleOpenLegal = (documentKey) => {
    navigation.navigate('LegalDocument', { documentKey });
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white dark:bg-slate-900"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        bounces={false}
      >
        <View className="flex-1 px-6 pt-16">
          {/* Header */}
          <View className="flex-row items-center justify-center mb-10">
            <Image source={require('../../assets/Pabukid-Logo.png')} className="w-8 h-8 mr-2" />
            <Text className="text-2xl font-bold text-green-700 dark:text-white">Pabukid</Text>
          </View>

          {/* Login Form */}
          <Text className="text-2xl font-bold text-center text-gray-800 mb-6 dark:text-slate-100">
            Welcome Back
          </Text>

          <TextInput
            className="mb-4 rounded-xl border border-gray-300 bg-white p-4 text-gray-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            placeholder="Email"
            placeholderTextColor={placeholderColor}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            selectionColor={isDarkMode ? '#bbf7d0' : '#166534'}
          />

          <TextInput
            className="mb-6 rounded-xl border border-gray-300 bg-white p-4 text-gray-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            placeholder="Password"
            placeholderTextColor={placeholderColor}
            secureTextEntry
            value={password}
            onChangeText={setPass}
            selectionColor={isDarkMode ? '#bbf7d0' : '#166534'}
          />

          <TouchableOpacity
            className="bg-green-700 rounded-xl py-4 mb-4"
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text className="text-center text-white font-semibold text-base">
                Sign In
              </Text>
            )}
          </TouchableOpacity>

          <Text className="text-center text-xs text-gray-500 dark:text-slate-400">
            By signing in you agree to our{' '}
            <Text className="font-semibold text-green-700 dark:text-white" onPress={() => handleOpenLegal('terms')}>
              Terms of Use
            </Text>
            ,{' '}
            <Text className="font-semibold text-green-700 dark:text-white" onPress={() => handleOpenLegal('privacy')}>
              Privacy Notice
            </Text>
            , and{' '}
            <Text className="font-semibold text-green-700 dark:text-white" onPress={() => handleOpenLegal('eula')}>
              End User License Agreement
            </Text>
            .
          </Text>

          <TouchableOpacity className="mt-6" onPress={() => navigation.navigate('Signup')}>
            <Text className="text-center font-medium text-green-700 dark:text-white">
              Don't have an account? <Text className="underline dark:text-white">Create one</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

import React, { useMemo, useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  Image,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

import { supabase } from '../lib/supabase';
import { post } from '../lib/api';
import KeyboardSpacer from '../components/KeyboardSpacer';

export default function SignupPage({ navigation }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasAcceptedPolicies, setHasAcceptedPolicies] = useState(false);

  const checkboxStyles = useMemo(
    () =>
      hasAcceptedPolicies
        ? 'border-green-700 bg-green-700'
        : 'border-slate-400 bg-white dark:bg-slate-900',
    [hasAcceptedPolicies],
  );

  const handleOpenLegal = (documentKey) => {
    navigation.navigate('LegalDocument', { documentKey });
  };

  async function handleSignup() {
    if (!name || !email || !password || !confirm) {
      Alert.alert('Error', 'Please fill out all fields.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }
    if (!hasAcceptedPolicies) {
      Alert.alert('Hold on', 'Please review and accept the terms before creating an account.');
      return;
    }

    setLoading(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Signup failed, no user created in Supabase.');

      await post('/api/auth/create-profile', {
        id: authData.user.id,
        email: authData.user.email,
        name,
      });

      Alert.alert(
        'Success!',
        'Your account has been created. Please check your email to verify your account before logging in.',
      );
      navigation.replace('Login');
    } catch (error) {
      console.error('Signup failed:', error);
      Alert.alert('Signup failed', error.message || 'An unknown error occurred.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <View className="flex-1 bg-white px-6 pt-16 pb-12 dark:bg-slate-900">
      <View className="mb-10 flex-row items-center justify-center">
        <Image source={require('../../assets/Pabukid-Logo.png')} className="mr-2 h-8 w-8" />
        <Text className="text-2xl font-bold text-green-700">Pabukid</Text>
      </View>

      <Text className="mb-6 text-center text-2xl font-bold text-gray-800 dark:text-slate-100">
        Create Your Account
      </Text>

      <TextInput
        className="mb-4 rounded-xl border border-gray-300 p-4 dark:border-slate-600"
        placeholder="Full Name"
        placeholderTextColor="#888"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
      />

      <TextInput
        className="mb-4 rounded-xl border border-gray-300 p-4 dark:border-slate-600"
        placeholder="Email"
        placeholderTextColor="#888"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <TextInput
        className="mb-4 rounded-xl border border-gray-300 p-4 dark:border-slate-600"
        placeholder="Password"
        placeholderTextColor="#888"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TextInput
        className="mb-6 rounded-xl border border-gray-300 p-4 dark:border-slate-600"
        placeholder="Confirm Password"
        placeholderTextColor="#888"
        secureTextEntry
        value={confirm}
        onChangeText={setConfirm}
      />

      <TouchableOpacity
        className="mb-6 flex-row items-start"
        activeOpacity={0.85}
        onPress={() => setHasAcceptedPolicies((prev) => !prev)}
      >
        <View className={`mr-3 flex h-5 w-5 items-center justify-center rounded-md border ${checkboxStyles}`}>
          {hasAcceptedPolicies ? <Feather name="check" size={14} color="#ffffff" /> : null}
        </View>
        <Text className="flex-1 text-sm text-slate-600 dark:text-slate-300">
          I have read and agree to the{' '}
          <Text className="font-semibold text-green-700" onPress={() => handleOpenLegal('terms')}>
            Terms of Use
          </Text>
          ,{' '}
          <Text className="font-semibold text-green-700" onPress={() => handleOpenLegal('privacy')}>
            Privacy Notice
          </Text>
          , and{' '}
          <Text className="font-semibold text-green-700" onPress={() => handleOpenLegal('eula')}>
            End User License Agreement
          </Text>
          .
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        className={`flex-row justify-center rounded-xl py-4 ${
          hasAcceptedPolicies ? 'bg-green-700' : 'bg-green-300'
        }`}
        onPress={handleSignup}
        disabled={loading || !hasAcceptedPolicies}
        activeOpacity={0.85}
      >
        {loading ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text className="text-center font-semibold text-white">Create Account</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity className="mt-6" onPress={() => navigation.goBack()}>
        <Text className="text-center font-medium text-green-700">
          Already have an account? <Text className="underline">Log in</Text>
        </Text>
      </TouchableOpacity>
          <KeyboardSpacer extraHeight={24} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

import React, { useMemo, useState } from 'react';
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
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifyingMfa, setVerifyingMfa] = useState(false);
  const { login, pendingMfa, verifyMfaCode, restartMfaChallenge } = useAuth();
  const { isDarkMode } = useTheme();
  const placeholderColor = isDarkMode ? '#94a3b8' : '#888';
  const hasPendingMfa = useMemo(() => Boolean(pendingMfa?.challengeId && pendingMfa?.factorId), [pendingMfa]);
  const mfaDeviceName = useMemo(() => {
    if (!pendingMfa?.factors?.length) return 'your authenticator app';
    const target = pendingMfa.factors.find((factor) => factor.id === pendingMfa.factorId) ?? pendingMfa.factors[0];
    return target?.friendly_name ? `${target.friendly_name} authenticator` : 'your authenticator app';
  }, [pendingMfa]);

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter your email and password.');
      return;
    }

    setLoading(true);
    setOtpCode('');

    try {
      const { error, mfaRequired } = await login(email, password);
      if (error) {
        throw error;
      }
      if (mfaRequired) {
        Alert.alert('Two-factor verification needed', 'Enter the 6-digit code from your authenticator app.');
      }
    } catch (e) {
      Alert.alert(`Login Failed`, e.message);
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const handleVerifyOtp = async () => {
    if (!otpCode.trim()) {
      Alert.alert('Enter code', 'Please enter the 6-digit code from your authenticator app.');
      return;
    }

    setVerifyingMfa(true);
    try {
      await verifyMfaCode(otpCode.trim());
      setOtpCode('');
    } catch (error) {
      console.error('MFA verification failed:', error);
      Alert.alert('Invalid code', error?.message ?? 'The verification code was not accepted.');
    } finally {
      setVerifyingMfa(false);
    }
  };

  const handleResendChallenge = async () => {
    setVerifyingMfa(true);
    try {
      await restartMfaChallenge();
      setOtpCode('');
      Alert.alert('New code requested', 'Enter the next code shown in your authenticator app.');
    } catch (error) {
      console.error('Failed to refresh MFA challenge:', error);
      Alert.alert('Unable to refresh', error?.message ?? 'Could not request a new verification code right now.');
    } finally {
      setVerifyingMfa(false);
    }
  };

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
            disabled={loading || verifyingMfa}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text className="text-center text-white font-semibold text-base">
                Sign In
              </Text>
            )}
          </TouchableOpacity>

          {hasPendingMfa ? (
            <View className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-400/40 dark:bg-amber-900/20">
              <Text className="text-base font-semibold text-amber-800 dark:text-amber-100">Two-factor verification</Text>
              <Text className="mt-1 text-sm text-amber-700 dark:text-amber-200">
                Enter the 6-digit code from {mfaDeviceName} to finish signing in.
              </Text>
              <TextInput
                className="mt-3 rounded-xl border border-amber-200 bg-white p-3 text-base dark:border-amber-400/40 dark:bg-slate-900 dark:text-white"
                placeholder="123456"
                placeholderTextColor={isDarkMode ? '#cbd5e1' : '#a3a3a3'}
                value={otpCode}
                onChangeText={setOtpCode}
                keyboardType="number-pad"
                maxLength={6}
              />
              <TouchableOpacity
                className="mt-3 rounded-xl bg-amber-600 py-3"
                onPress={handleVerifyOtp}
                disabled={verifyingMfa}
              >
                {verifyingMfa ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-center text-white font-semibold">Verify code</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity className="mt-2" onPress={handleResendChallenge} disabled={verifyingMfa}>
                <Text className="text-center text-sm font-semibold text-amber-700 dark:text-amber-200">
                  Trouble? Request a fresh code
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

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

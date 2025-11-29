import React, { useMemo, useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  Image,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Feather } from '@expo/vector-icons';

import { supabase } from '../lib/supabase';
import { post } from '../lib/api';
import SafePicker from '../components/SafePicker';
import { useTheme } from '../context/ThemeContext';

export default function SignupPage({ navigation }) {
  const { colors, isDarkMode } = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [birthday, setBirthday] = useState(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasAcceptedPolicies, setHasAcceptedPolicies] = useState(false);
  const [visitedTrail, setVisitedTrail] = useState(null);
  const [showBirthdayPicker, setShowBirthdayPicker] = useState(false);

  const defaultBirthday = useMemo(() => {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 21);
    date.setHours(12, 0, 0, 0);
    return date;
  }, []);

  const mountainOptions = useMemo(
    () => [
      { label: 'Mt. Pulag', value: 'mt-pulag' },
      { label: 'Mt. Apo', value: 'mt-apo' },
      { label: 'Mt. Batulao', value: 'mt-batulao' },
      { label: 'Mt. Ulap', value: 'mt-ulap' },
      { label: 'Other / not listed', value: 'other' },
    ],
    [],
  );

  const checkboxStyles = useMemo(
    () =>
      hasAcceptedPolicies
        ? 'border-green-700 bg-green-700'
        : 'border-slate-400 bg-white dark:bg-slate-900',
    [hasAcceptedPolicies],
  );

  const formatBirthday = (date) => {
    if (!date) return '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  };

  const handleOpenLegal = (documentKey) => {
    navigation.navigate('LegalDocument', { documentKey });
  };

  const handleToggleBirthdayPicker = () => {
    setShowBirthdayPicker(true);
  };

  const handleBirthdayChange = (_, selectedDate) => {
    if (Platform.OS === 'android') setShowBirthdayPicker(false);
    if (selectedDate) setBirthday(selectedDate);
  };

  async function handleSignup() {
    if (!name || !email || !password || !confirm || !birthday) {
      Alert.alert('Error', 'Please fill out all fields, including your birthday.');
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
        visitedTrail,
        birthday: birthday.toISOString().split('T')[0],      });

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

          <View className="mb-4">
            <Text className="mb-2 text-base font-semibold text-gray-800 dark:text-slate-100">Birthday</Text>
            <TouchableOpacity
              className="flex-row items-center justify-between rounded-xl border border-gray-300 bg-white p-4 dark:border-slate-600 dark:bg-slate-800"
              activeOpacity={0.85}
              onPress={handleToggleBirthdayPicker}
            >
              <Text className="text-base text-gray-800 dark:text-slate-100">
                {birthday ? formatBirthday(birthday) : 'Select your birthday'}
              </Text>
              <Feather name="calendar" size={18} color={colors.icon} />
            </TouchableOpacity>
            <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Helps us suggest age-appropriate events and preferences.
            </Text>
          </View>

          {showBirthdayPicker ? (
            <View className="mb-4 rounded-xl border border-gray-300 bg-white dark:border-slate-600 dark:bg-slate-800">
              <DateTimePicker
                value={birthday || defaultBirthday}
                mode="date"
                display="spinner"
                maximumDate={new Date()}
                onChange={handleBirthdayChange}
                themeVariant={isDarkMode ? 'dark' : 'light'}
              />
              {Platform.OS === 'ios' ? (
                <TouchableOpacity
                  className="border-t border-gray-200 px-4 py-3 dark:border-slate-700"
                  onPress={() => setShowBirthdayPicker(false)}
                  activeOpacity={0.85}
                >
                  <Text className="text-center font-semibold text-green-700">Done</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

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

          <View className="mb-6">
            <Text className="mb-2 text-base font-semibold text-gray-800 dark:text-slate-100">
              Which of these mountains/trails have you been to?
            </Text>
            <Text className="mb-3 text-sm text-slate-600 dark:text-slate-400">
              This will help you be suggested which trails that suits your profile.
            </Text>
            <SafePicker
              options={mountainOptions}
              selectedValue={visitedTrail}
              onValueChange={setVisitedTrail}
              placeholder="Select a mountain or trail"
              modalTitle="Choose a mountain or trail"
              containerStyle={{
                borderColor: colors.border,
                backgroundColor: colors.surfaceMuted,
              }}
              dropdownIconColor={colors.icon}
              textColor={colors.textPrimary}
              placeholderColor={colors.textMuted}
            />
            <Text className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Organizers can add more mountains in Settings.
            </Text>
          </View>

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
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

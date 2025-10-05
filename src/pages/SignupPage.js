import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, Image, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';
import { post } from '../lib/api';

export default function SignupPage({ navigation }) {
  const [name, setName] = useState(''); // ✅ Add state for the name
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false); // Add loading state

  async function handleSignup() {
    // ✅ Add name to the validation check
    if (!name || !email || !password || !confirm) {
      Alert.alert('Error', 'Please fill out all fields');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      // Step 1: Create the user in Supabase Authentication
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email,
        password: password,
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Signup failed, no user created in Supabase.');

      // Step 2: Create the user profile in your own database via your backend API
      await post('/api/auth/create-profile', {
        id: authData.user.id, // The ID from Supabase
        email: authData.user.email,
        name: name,
      });

      Alert.alert('Success!', 'Your account has been created. Please check your email to verify your account before logging in.');
      navigation.replace('Login');

    } catch (e) {
      console.error('🔴 Signup failed:', e);
      Alert.alert(`Signup failed`, e.message || 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View className="flex-1 bg-white px-6 pt-16">
      <View className="flex-row items-center justify-center mb-10">
        <Image
          source={require('../../assets/favicon.png')}
          className="w-8 h-8 mr-2"
        />
        <Text className="text-green-700 text-2xl font-bold">Pabukid</Text>
      </View>

      <Text className="text-2xl font-bold text-center text-gray-800 mb-6">
        Create Your Account
      </Text>

      {/* ✅ Add Name Input Field */}
      <TextInput
        className="border border-gray-300 rounded-xl p-4 mb-4"
        placeholder="Full Name"
        placeholderTextColor="#888"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
      />

      <TextInput
        className="border border-gray-300 rounded-xl p-4 mb-4"
        placeholder="Email"
        placeholderTextColor="#888"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <TextInput
        className="border border-gray-300 rounded-xl p-4 mb-4"
        placeholder="Password"
        placeholderTextColor="#888"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TextInput
        className="border border-gray-300 rounded-xl p-4 mb-6"
        placeholder="Confirm Password"
        placeholderTextColor="#888"
        secureTextEntry
        value={confirm}
        onChangeText={setConfirm}
      />

      <TouchableOpacity
        className="bg-green-700 rounded-xl py-4 mb-4 flex-row justify-center"
        onPress={handleSignup}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text className="text-center text-white font-semibold">
            Create Account
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text className="text-center text-green-700 font-medium">
          Already have an account? <Text className="underline">Log in</Text>
        </Text>
      </TouchableOpacity>
    </View>
  );
}
import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, Image } from 'react-native';
import { post } from '../lib/api'; // make sure path is correct

export default function SignupPage({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  async function handleSignup() {
    console.log('🟡 Signup attempt with:', { email, password, confirm });

    if (!email || !password || !confirm) {
      alert('Please fill out all fields');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      alert('Invalid email format');
      return;
    }

    if (password !== confirm) {
      alert('Passwords do not match');
      return;
    }

    try {
      const res = await post('/api/auth/signup', { email, password });
      console.log('🟢 Signup success:', res);
      alert('Account created! You can now log in.');
      navigation.replace('Login'); // adjust this screen name if needed
    } catch (e) {
      console.log('🔴 Signup failed:', e);
      const errorMessage = e?.message || 'An unknown error occurred';
      alert(`Signup failed: ${errorMessage}`);
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
        className="bg-green-700 rounded-xl py-4 mb-4"
        onPress={handleSignup}
      >
        <Text className="text-center text-white font-semibold">
          Create Account
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text className="text-center text-green-700 font-medium">
          Already have an account? <Text className="underline">Log in</Text>
        </Text>
      </TouchableOpacity>
    </View>
  );
}

//192.168.254.145
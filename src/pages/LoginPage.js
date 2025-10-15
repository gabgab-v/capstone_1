import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, Alert, ActivityIndicator } from 'react-native';
import { useAuth } from '../context/AuthContext'; // Import the useAuth hook

export default function LoginPage({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPass] = useState('');
  const [loading, setLoading] = useState(false); // Add loading state for better UX
  const { login } = useAuth(); // Get the login function from our context

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

  return (
    <View className="flex-1 bg-white px-6 pt-16 dark:bg-slate-900">
      {/* Header */}
      <View className="flex-row items-center justify-center mb-10">
        <Image
          source={require('../../assets/Pabukid-Logo.png')}
          className="w-8 h-8 mr-2"
        />
        <Text className="text-green-700 text-2xl font-bold">Pabukid</Text>
      </View>

      {/* Login Form */}
      <Text className="text-2xl font-bold text-center text-gray-800 mb-6 dark:text-slate-100">
        Welcome Back
      </Text>

      <TextInput
        className="border border-gray-300 rounded-xl p-4 mb-4 dark:border-slate-600"
        placeholder="Email"
        placeholderTextColor="#888"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <TextInput
        className="border border-gray-300 rounded-xl p-4 mb-6 dark:border-slate-600"
        placeholder="Password"
        placeholderTextColor="#888"
        secureTextEntry
        value={password}
        onChangeText={setPass}
      />

      <TouchableOpacity
        className="bg-green-700 rounded-xl py-4 mb-4"
        onPress={handleLogin}
      >
        <Text className="text-center text-white font-semibold text-base">
          Sign In
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
        <Text className="text-center text-green-700 font-medium">
          Don't have an account? <Text className="underline">Create one</Text>
        </Text>
      </TouchableOpacity>
    </View>
  );
}

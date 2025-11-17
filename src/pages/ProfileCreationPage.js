// src/pages/ProfileCreationPage.js
import React, { useState, useEffect } from 'react';
import {
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as SecureStore from 'expo-secure-store';

import { get, put } from '../lib/api';   // ⬅️ make sure you added get/put

export default function ProfileCreationPage({ navigation }) {
  /* form state */
  const [name, setName]         = useState('');
  const [birthdate, setBirth]   = useState('');
  const [showPicker, setShow]   = useState(false);
  const [saving, setSaving]     = useState(false);

  /* (optional) pre-fill if user already has partial data */
  useEffect(() => {
    (async () => {
      try {
        const token = await SecureStore.getItemAsync('jwt');
        if (!token) return;
        const me = await get('/api/users/me', token);
        if (me.name)      setName(me.name);
        if (me.birthdate) setBirth(me.birthdate);  // ISO 2025-05-23
      } catch (e) {
        console.warn('Failed pre-fill:', e.message);
      }
    })();
  }, []);

  /* submit handler */
  async function handleSave() {
    if (!name || !birthdate) {
      alert('Please complete all fields');
      return;
    }
    setSaving(true);
    try {
      const token = await SecureStore.getItemAsync('jwt');
      await put('/api/users/me', { name, birthdate }, token);
      navigation.replace('MainTabs');           // profile done → main app
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  /* UI */
  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white dark:bg-slate-900"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
    >
      <ScrollView
        className="flex-1 bg-white px-6 pt-16 dark:bg-slate-900"
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-2xl font-bold text-center mb-8">
          Complete Your Profile
        </Text>

        {/* name */}
        <Text className="text-gray-700 font-medium mb-2 dark:text-slate-300">Full Name</Text>
        <TextInput
          className="border border-gray-300 rounded-xl p-4 mb-6 dark:border-slate-600"
          placeholder="Juan Dela Cruz"
          value={name}
          onChangeText={setName}
        />

        {/* birthdate */}
        <Text className="text-gray-700 font-medium mb-2 dark:text-slate-300">Birthdate</Text>
        <TouchableOpacity
          onPress={() => setShow(true)}
          className="border border-gray-300 rounded-xl p-4 mb-6 dark:border-slate-600"
        >
          <Text className={birthdate ? 'text-gray-900' : 'text-gray-400'}>
            {birthdate || 'YYYY-MM-DD'}
          </Text>
        </TouchableOpacity>

        {showPicker && (
          <DateTimePicker
            mode="date"
            display="default"
            value={birthdate ? new Date(birthdate) : new Date()}
            onChange={(evt, date) => {
              setShow(false);
              if (date) setBirth(date.toISOString().slice(0, 10)); // 2025-06-23
            }}
          />
        )}

        {/* save */}
        <TouchableOpacity
          disabled={saving}
          onPress={handleSave}
          className="bg-green-700 rounded-xl py-4"
        >
          <Text className="text-center text-white font-semibold">
            {saving ? 'Saving…' : 'Save & Continue'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

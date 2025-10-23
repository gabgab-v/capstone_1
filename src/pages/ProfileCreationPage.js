// src/pages/ProfileCreationPage.js
import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as SecureStore from 'expo-secure-store';

import KeyboardSpacer from '../components/KeyboardSpacer';
import { get, put } from '../lib/api';

export default function ProfileCreationPage({ navigation }) {
  const [name, setName] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const token = await SecureStore.getItemAsync('jwt');
        if (!token) {
          return;
        }
        const me = await get('/api/users/me', token);
        if (me?.name) {
          setName(me.name);
        }
        if (me?.birthdate) {
          setBirthdate(me.birthdate);
        }
      } catch (error) {
        console.warn('Failed to pre-fill profile data:', error);
      }
    })();
  }, []);

  async function handleSave() {
    if (!name || !birthdate) {
      alert('Please complete all fields');
      return;
    }

    setSaving(true);
    try {
      const token = await SecureStore.getItemAsync('jwt');
      await put('/api/users/me', { name, birthdate }, token);
      navigation.replace('MainTabs');
    } catch (error) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-white px-6 pt-16 dark:bg-slate-900"
      contentContainerStyle={{ paddingBottom: 32 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text className="mb-8 text-center text-2xl font-bold text-slate-900 dark:text-slate-100">
        Complete Your Profile
      </Text>

      <Text className="mb-2 font-medium text-gray-700 dark:text-slate-300">Full Name</Text>
      <TextInput
        className="mb-6 rounded-xl border border-gray-300 p-4 dark:border-slate-600"
        placeholder="Juan Dela Cruz"
        value={name}
        onChangeText={setName}
      />

      <Text className="mb-2 font-medium text-gray-700 dark:text-slate-300">Birthdate</Text>
      <TouchableOpacity
        onPress={() => setShowPicker(true)}
        className="mb-6 rounded-xl border border-gray-300 p-4 dark:border-slate-600"
        activeOpacity={0.85}
      >
        <Text className={birthdate ? 'text-gray-900 dark:text-slate-100' : 'text-gray-400'}>
          {birthdate || 'YYYY-MM-DD'}
        </Text>
      </TouchableOpacity>

      {showPicker ? (
        <DateTimePicker
          mode="date"
          display="default"
          value={birthdate ? new Date(birthdate) : new Date()}
          onChange={(event, date) => {
            setShowPicker(false);
            if (date) {
              setBirthdate(date.toISOString().slice(0, 10));
            }
          }}
        />
      ) : null}

      <TouchableOpacity
        disabled={saving}
        onPress={handleSave}
        className="rounded-xl bg-green-700 py-4"
        activeOpacity={0.85}
      >
        <Text className="text-center font-semibold text-white">
          {saving ? 'Saving…' : 'Save & Continue'}
        </Text>
      </TouchableOpacity>

      <KeyboardSpacer extraHeight={24} />
    </ScrollView>
  );
}

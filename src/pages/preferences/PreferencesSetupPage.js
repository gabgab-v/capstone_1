import React, { useEffect, useMemo, useState } from 'react';
import {
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { post } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const EXPERIENCE_OPTIONS = [
  { label: 'Select...', value: '' },
  { label: 'Beginner', value: 'Beginner' },
  { label: 'Intermediate', value: 'Intermediate' },
  { label: 'Expert', value: 'Expert' },
];

export default function PreferencesSetupPage({ navigation }) {
  const { user, refreshUser } = useAuth();
  const [experience, setExperience] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [trailType, setTrailType] = useState('');
  const [duration, setDuration] = useState('');
  const [budget, setBudget] = useState('');
  const [saving, setSaving] = useState(false);

  const hasExistingPreferences = useMemo(
    () =>
      Boolean(
        user?.experienceLevel ||
          user?.preferredDifficulty ||
          user?.preferredTrailType ||
          user?.preferredDurationHrs ||
          user?.budgetRange
      ),
    [user]
  );

  useEffect(() => {
    if (!user) {
      return;
    }

    setExperience(user.experienceLevel ?? '');
    setDifficulty(user.preferredDifficulty ?? '');
    setTrailType(user.preferredTrailType ?? '');
    setDuration(
      typeof user.preferredDurationHrs === 'number' && Number.isFinite(user.preferredDurationHrs)
        ? String(user.preferredDurationHrs)
        : user.preferredDurationHrs
        ? String(user.preferredDurationHrs)
        : ''
    );
    setBudget(user.budgetRange ?? '');
  }, [user]);

  async function handleSave() {
    if (!experience || !difficulty || !trailType || !duration || !budget) {
      Alert.alert('Missing information', 'Please fill out all preferences before continuing.');
      return;
    }

    const durationValue = Number(duration);
    if (!Number.isFinite(durationValue) || durationValue <= 0) {
      Alert.alert('Invalid duration', 'Please enter a valid preferred duration in hours.');
      return;
    }

    setSaving(true);
    try {
      await post('/api/users/preferences', {
        experience_level: experience,
        preferred_difficulty: difficulty,
        preferred_trail_type: trailType,
        preferred_duration_hours: durationValue,
        budget_range: budget,
      });

      if (typeof refreshUser === 'function') {
        await refreshUser();
      }

      if (hasExistingPreferences && navigation.canGoBack()) {
        navigation.goBack();
      }
    } catch (error) {
      console.log('Failed to save preferences:', error);
      Alert.alert('Save failed', 'Could not save preferences. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView className="flex-1 bg-white px-6 pt-16 dark:bg-slate-900">
      <Text className="text-2xl font-bold mb-6 text-center">Set Up Your Preferences</Text>

      <Text className="font-medium mb-2">Experience Level</Text>
      <Picker selectedValue={experience} onValueChange={setExperience}>
        {EXPERIENCE_OPTIONS.map((option) => (
          <Picker.Item key={option.value || 'placeholder'} label={option.label} value={option.value} />
        ))}
      </Picker>

      <Text className="font-medium mt-4 mb-2">Preferred Difficulty</Text>
      <TextInput
        placeholder="e.g., Easy, Moderate, Hard"
        className="border border-gray-300 rounded-xl p-4 mb-4 dark:border-slate-600"
        value={difficulty}
        onChangeText={setDifficulty}
      />

      <Text className="font-medium mt-4 mb-2">Preferred Trail Type</Text>
      <TextInput
        placeholder="e.g., Forest, Summit"
        className="border border-gray-300 rounded-xl p-4 mb-4 dark:border-slate-600"
        value={trailType}
        onChangeText={setTrailType}
      />

      <Text className="font-medium mt-4 mb-2">Preferred Duration (hours)</Text>
      <TextInput
        placeholder="e.g., 3"
        className="border border-gray-300 rounded-xl p-4 mb-4 dark:border-slate-600"
        value={duration}
        onChangeText={setDuration}
        keyboardType="numeric"
      />

      <Text className="font-medium mt-4 mb-2">Budget Range</Text>
      <TextInput
        placeholder="e.g., PHP 500 - 1000"
        className="border border-gray-300 rounded-xl p-4 mb-4 dark:border-slate-600"
        value={budget}
        onChangeText={setBudget}
      />

      <TouchableOpacity
        className={`bg-green-700 rounded-xl py-4 mt-6 ${saving ? 'opacity-70' : ''}`}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text className="text-center text-white font-semibold">Save Preferences</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { Picker } from '@react-native-picker/picker';   // ✅ updated import
import { post } from '../../lib/api';

export default function PreferencesSetupPage({ navigation, route }) {
  const { userId } = route.params; // get user_id from signup/login response

  const [experience, setExperience] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [trailType, setTrailType] = useState('');
  const [duration, setDuration] = useState('');
  const [budget, setBudget] = useState('');

  async function handleSave() {
    if (!experience || !difficulty || !trailType || !duration || !budget) {
      alert('Please fill out all preferences');
      return;
    }

    try {
      const res = await post('/api/users/preferences', {
        user_id: userId,
        experience_level: experience,
        preferred_difficulty: difficulty,
        preferred_trail_type: trailType,
        preferred_duration_hours: parseFloat(duration),
        budget_range: budget,
      });

      console.log('✅ Preferences saved:', res);
      navigation.replace('MainTabs'); // or dashboard
    } catch (e) {
      console.log('❌ Failed to save preferences:', e);
      alert('Could not save preferences. Try again.');
    }
  }

  return (
    <ScrollView className="flex-1 bg-white px-6 pt-16">
      <Text className="text-2xl font-bold mb-6 text-center">
        Set Up Your Preferences
      </Text>

      <Text className="font-medium mb-2">Experience Level</Text>
      <Picker selectedValue={experience} onValueChange={setExperience}>
        <Picker.Item label="Select..." value="" />
        <Picker.Item label="Beginner" value="Beginner" />
        <Picker.Item label="Intermediate" value="Intermediate" />
        <Picker.Item label="Expert" value="Expert" />
      </Picker>

      <Text className="font-medium mt-4 mb-2">Preferred Difficulty</Text>
      <TextInput
        placeholder="e.g., Easy, Moderate, Hard"
        className="border border-gray-300 rounded-xl p-4 mb-4"
        value={difficulty}
        onChangeText={setDifficulty}
      />

      <Text className="font-medium mt-4 mb-2">Preferred Trail Type</Text>
      <TextInput
        placeholder="e.g., Forest, Summit"
        className="border border-gray-300 rounded-xl p-4 mb-4"
        value={trailType}
        onChangeText={setTrailType}
      />

      <Text className="font-medium mt-4 mb-2">Preferred Duration (hours)</Text>
      <TextInput
        placeholder="e.g., 3"
        className="border border-gray-300 rounded-xl p-4 mb-4"
        value={duration}
        onChangeText={setDuration}
        keyboardType="numeric"
      />

      <Text className="font-medium mt-4 mb-2">Budget Range</Text>
      <TextInput
        placeholder="e.g., $50-$100"
        className="border border-gray-300 rounded-xl p-4 mb-4"
        value={budget}
        onChangeText={setBudget}
      />

      <TouchableOpacity
        className="bg-green-700 rounded-xl py-4 mt-6"
        onPress={handleSave}
      >
        <Text className="text-center text-white font-semibold">Save Preferences</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

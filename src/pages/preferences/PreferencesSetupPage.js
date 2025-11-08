import React, { useEffect, useMemo, useState } from 'react';
import {
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { CommonActions } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { post } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { TRAIL_TYPE_OPTIONS } from '../../constants/trailTypes';

const EXPERIENCE_OPTIONS = [
  { label: 'Select...', value: '' },
  { label: 'Beginner', value: 'Beginner' },
  { label: 'Intermediate', value: 'Intermediate' },
  { label: 'Expert', value: 'Expert' },
];

const EXPERIENCE_DESCRIPTIONS = {
  Beginner: 'Ideal for hikers who are just getting started or prefer guided adventures.',
  Intermediate: 'Comfortable handling moderate elevation, distance, and varied terrain.',
  Expert: 'Seasoned hikers seeking challenging routes, technical climbs, or long distances.',
};

const DIFFICULTY_OPTIONS = [
  { label: 'Select...', value: '' },
  { label: 'Easy', value: 'Easy' },
  { label: 'Moderate', value: 'Moderate' },
  { label: 'Hard', value: 'Hard' },
  { label: 'Challenging', value: 'Challenging' },
];

export default function PreferencesSetupPage({ navigation }) {
  const { user, refreshUser } = useAuth();
  const { isDarkMode, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [experience, setExperience] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [trailType, setTrailType] = useState('');
  const [duration, setDuration] = useState('');
  const [distance, setDistance] = useState('');
  const [elevation, setElevation] = useState('');
  const [budget, setBudget] = useState('');
  const [saving, setSaving] = useState(false);
  const pickerStyle = useMemo(
    () => ({
      color: colors.textPrimary,
      fontSize: 16,
    }),
    [colors.textPrimary],
  );
  const pickerContainerStyle = useMemo(
    () => ({
      backgroundColor: isDarkMode ? colors.surfaceMuted : colors.surface,
    }),
    [colors.surface, colors.surfaceMuted, isDarkMode],
  );
  const difficultyOptions = useMemo(() => {
    if (!difficulty || DIFFICULTY_OPTIONS.some((option) => option.value === difficulty)) {
      return DIFFICULTY_OPTIONS;
    }
    return [...DIFFICULTY_OPTIONS, { label: difficulty, value: difficulty }];
  }, [difficulty]);
  const trailTypeOptions = useMemo(() => {
    const baseOptions = [{ label: 'Select...', value: '' }, ...TRAIL_TYPE_OPTIONS];
    if (!trailType || TRAIL_TYPE_OPTIONS.some((option) => option.value === trailType)) {
      return baseOptions;
    }
    return [...baseOptions, { label: trailType, value: trailType }];
  }, [trailType]);
  const isExperienceLocked = Boolean(user?.experienceLevelLocked);
  const hasExpertBadge = Boolean(user?.expertBadgeAwarded);
  const experienceOptions = useMemo(() => {
    const optionsWithoutExpert = EXPERIENCE_OPTIONS.filter((option) => option.value !== 'Expert');
    if (hasExpertBadge || experience === 'Expert') {
      const expertOption = EXPERIENCE_OPTIONS.find((option) => option.value === 'Expert');
      if (expertOption) {
        return [...optionsWithoutExpert, expertOption];
      }
    }
    return optionsWithoutExpert;
  }, [experience, hasExpertBadge]);
  const experienceHelperText = useMemo(() => {
    if (isExperienceLocked) {
      return 'Your experience level is locked because admins verified your expert badge.';
    }
    if (!hasExpertBadge) {
      if (!experience) {
        return 'Select the experience level that best matches how comfortable you feel on the trails. Apply for the Expert badge from Settings to unlock that option.';
      }
      const description = EXPERIENCE_DESCRIPTIONS[experience] ?? '';
      return description
        ? `${description} Apply for the Expert badge from Settings to unlock the Expert level.`
        : 'Apply for the Expert badge from Settings to unlock the Expert level.';
    }
    if (!experience) {
      return 'Select the experience level that best matches how comfortable you feel on the trails.';
    }
    return EXPERIENCE_DESCRIPTIONS[experience] ?? '';
  }, [experience, hasExpertBadge, isExperienceLocked]);

  const hasExistingPreferences = useMemo(
    () =>
      Boolean(
        user?.experienceLevel ||
        user?.preferredDifficulty ||
        user?.preferredTrailType ||
        user?.preferredDurationHrs ||
        user?.preferredDistanceKm ||
        user?.preferredElevationM ||
        user?.budgetRange
      ),
    [user]
  );
  const contentContainerStyle = useMemo(
    () => ({
      paddingTop: 64,
      paddingBottom: Math.max(48, insets.bottom + 48),
    }),
    [insets.bottom]
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
    setDistance(
      typeof user.preferredDistanceKm === 'number' && Number.isFinite(user.preferredDistanceKm)
        ? String(user.preferredDistanceKm)
        : user.preferredDistanceKm
        ? String(user.preferredDistanceKm)
        : ''
    );
    setElevation(
      typeof user.preferredElevationM === 'number' && Number.isFinite(user.preferredElevationM)
        ? String(user.preferredElevationM)
        : user.preferredElevationM
        ? String(user.preferredElevationM)
        : ''
    );
    setBudget(user.budgetRange ?? '');
  }, [user]);

  async function handleSave() {
    if (!isExperienceLocked && !hasExpertBadge && experience === 'Expert') {
      Alert.alert(
        'Expert level locked',
        'Apply for the Expert badge from Settings before selecting the Expert experience level.'
      );
      return;
    }
    if (
      (!isExperienceLocked && !experience) ||
      !difficulty ||
      !trailType ||
      !duration ||
      !distance ||
      !elevation ||
      !budget
    ) {
      Alert.alert('Missing information', 'Please fill out all preferences before continuing.');
      return;
    }

    const durationValue = Number(duration);
    if (!Number.isFinite(durationValue) || durationValue <= 0) {
      Alert.alert('Invalid duration', 'Please enter a valid preferred duration in hours.');
      return;
    }

    const distanceValue = Number(distance);
    if (!Number.isFinite(distanceValue) || distanceValue <= 0) {
      Alert.alert('Invalid distance', 'Please enter a valid preferred distance in kilometers.');
      return;
    }

    const elevationValue = Number(elevation);
    if (!Number.isFinite(elevationValue) || elevationValue <= 0) {
      Alert.alert('Invalid elevation', 'Please enter a valid preferred elevation gain in meters.');
      return;
    }

    setSaving(true);
    try {
      const redirectToHome = () => {
        try {
          navigation.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [{ name: 'MainTabs', params: { screen: 'Home' } }],
            }),
          );
        } catch (navError) {
          console.warn('Failed to redirect to MainTabs:', navError);
        }
      };

        await post('/api/users/preferences', {
          experience_level: isExperienceLocked ? user?.experienceLevel ?? 'Expert' : experience,
          preferred_difficulty: difficulty,
          preferred_trail_type: trailType,
          preferred_duration_hours: durationValue,
          preferred_distance_km: distanceValue,
          preferred_elevation_m: elevationValue,
          budget_range: budget,
        });

      let updatedProfile = null;
      if (typeof refreshUser === 'function') {
        updatedProfile = await refreshUser();
      }

      const routeNames = navigation?.getState?.()?.routeNames ?? [];
      if (updatedProfile?.preferencesComplete) {
        redirectToHome();
        return;
      }

      if (routeNames.includes('MainTabs')) {
        redirectToHome();
        return;
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
    <ScrollView
      className="flex-1 bg-white px-6 dark:bg-slate-900"
      contentContainerStyle={contentContainerStyle}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text className="text-2xl font-bold mb-6 text-center">Set Up Your Preferences</Text>

      <Text className="font-medium mb-2">Experience Level</Text>
      <View
        className="border border-gray-300 rounded-xl overflow-hidden mb-2 dark:border-slate-600"
        style={pickerContainerStyle}
      >
        <Picker
          mode="dropdown"
          selectedValue={experience}
          onValueChange={setExperience}
          style={pickerStyle}
          dropdownIconColor={colors.icon}
          enabled={!isExperienceLocked}
        >
          {experienceOptions.map((option) => (
            <Picker.Item key={option.value || 'placeholder'} label={option.label} value={option.value} />
          ))}
        </Picker>
      </View>
      {!!experienceHelperText && (
        <Text className="text-sm text-slate-500 dark:text-slate-400 mb-4">{experienceHelperText}</Text>
      )}

      <Text className="font-medium mt-4 mb-2">Preferred Difficulty</Text>
      <View
        className="border border-gray-300 rounded-xl overflow-hidden mb-4 dark:border-slate-600"
        style={pickerContainerStyle}
      >
        <Picker
          mode="dropdown"
          selectedValue={difficulty}
          onValueChange={setDifficulty}
          style={pickerStyle}
          dropdownIconColor={colors.icon}
        >
          {difficultyOptions.map((option) => (
            <Picker.Item key={option.value ? `difficulty-${option.value}` : 'difficulty-placeholder'} label={option.label} value={option.value} />
          ))}
        </Picker>
      </View>

      <Text className="font-medium mt-4 mb-2">Preferred Trail Type</Text>
      <View
        className="border border-gray-300 rounded-xl overflow-hidden mb-4 dark:border-slate-600"
        style={pickerContainerStyle}
      >
        <Picker
          mode="dropdown"
          selectedValue={trailType}
          onValueChange={setTrailType}
          style={pickerStyle}
          dropdownIconColor={colors.icon}
        >
          {trailTypeOptions.map((option) => (
            <Picker.Item key={option.value ? `trail-${option.value}` : 'trail-placeholder'} label={option.label} value={option.value} />
          ))}
        </Picker>
      </View>

      <Text className="font-medium mt-4 mb-2">Preferred Duration (hours)</Text>
      <TextInput
        placeholder="e.g., 3"
        className="border border-gray-300 rounded-xl p-4 mb-4 dark:border-slate-600"
        value={duration}
        onChangeText={setDuration}
        keyboardType="numeric"
      />

      <Text className="font-medium mt-4 mb-2">Preferred Distance (kilometers)</Text>
      <TextInput
        placeholder="e.g., 10"
        className="border border-gray-300 rounded-xl p-4 mb-4 dark:border-slate-600"
        value={distance}
        onChangeText={setDistance}
        keyboardType="numeric"
      />

      <Text className="font-medium mt-4 mb-2">Preferred Elevation Gain (meters)</Text>
      <TextInput
        placeholder="e.g., 800"
        className="border border-gray-300 rounded-xl p-4 mb-4 dark:border-slate-600"
        value={elevation}
        onChangeText={setElevation}
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

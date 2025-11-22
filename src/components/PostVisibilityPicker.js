import React from 'react';
import {
  Modal,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { POST_VISIBILITY_OPTIONS, getPostVisibilityOption } from '../constants/postVisibility';
import { useTheme } from '../context/ThemeContext';

export default function PostVisibilityPicker({
  visible,
  value,
  onSelect,
  onClose,
  title = 'Who can see this post?',
}) {
  const { colors } = useTheme();
  const selectedOption = getPostVisibilityOption(value);

  const handleSelect = (optionValue) => {
    if (typeof onSelect === 'function') {
      onSelect(optionValue);
    }
    if (typeof onClose === 'function') {
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View className="flex-1 bg-black/60 justify-end">
          <TouchableWithoutFeedback onPress={() => {}}>
            <View className="rounded-t-3xl bg-white dark:bg-slate-900 p-5">
              <View className="mb-4 items-center">
                <View className="h-1.5 w-16 rounded-full bg-gray-200 dark:bg-slate-700" />
              </View>
              <Text className="text-lg font-semibold text-gray-900 dark:text-white">{title}</Text>
              <Text className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                {selectedOption.description}
              </Text>
              <View className="mt-4 space-y-3">
                {POST_VISIBILITY_OPTIONS.map((option) => {
                  const isActive = option.value === selectedOption.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      onPress={() => handleSelect(option.value)}
                      activeOpacity={0.85}
                      className={`flex-row items-center justify-between rounded-2xl border px-4 py-3 ${
                        isActive
                          ? 'border-green-500 bg-green-50 dark:border-emerald-500 dark:bg-emerald-500/10'
                          : 'border-gray-200 dark:border-slate-700'
                      }`}
                    >
                      <View className="flex-row items-center">
                        <View className="mr-3 rounded-full bg-gray-100 dark:bg-slate-800 p-2">
                          <Feather
                            name={option.icon}
                            size={18}
                            color={isActive ? colors.accent : colors.textMuted}
                          />
                        </View>
                        <View>
                          <Text className="text-base font-semibold text-gray-900 dark:text-white">
                            {option.label}
                          </Text>
                          <Text className="text-xs text-gray-500 dark:text-slate-400">
                            {option.description}
                          </Text>
                        </View>
                      </View>
                      {isActive ? <Feather name="check" size={20} color={colors.accent} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

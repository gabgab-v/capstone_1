import React, { useMemo } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { AVAILABLE_LEGAL_DOCUMENTS, DEFAULT_LEGAL_DOCUMENT_KEY, LEGAL_DOCUMENTS } from '../../legal/legalContent';
import { useTheme } from '../../context/ThemeContext';

export default function LegalDocumentPage({ navigation, route }) {
  const { colors } = useTheme();
  const documentKey = route?.params?.documentKey ?? DEFAULT_LEGAL_DOCUMENT_KEY;

  const activeDocument = useMemo(() => {
    if (LEGAL_DOCUMENTS[documentKey]) {
      return LEGAL_DOCUMENTS[documentKey];
    }
    return LEGAL_DOCUMENTS[DEFAULT_LEGAL_DOCUMENT_KEY];
  }, [documentKey]);

  const handleSelectDocument = (key) => {
    if (key === activeDocument.key) {
      return;
    }
    navigation.setParams({ documentKey: key });
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-slate-950">
      <View className="flex-row items-center justify-between px-5 py-4">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text className="text-base font-semibold text-slate-900 dark:text-slate-100">Policies</Text>
        <View className="w-6" />
      </View>

      <View className="px-5">
        <View className="flex-row rounded-2xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900">
          {AVAILABLE_LEGAL_DOCUMENTS.map(({ key, title }) => {
            const isActive = key === activeDocument.key;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => handleSelectDocument(key)}
                className={`flex-1 rounded-xl px-3 py-2 ${isActive ? 'bg-white dark:bg-slate-800' : ''}`}
                activeOpacity={0.85}
              >
                <Text
                  className={`text-center text-sm font-semibold ${
                    isActive
                      ? 'text-slate-900 dark:text-slate-100'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {title}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <ScrollView className="flex-1 px-5 pb-8 pt-6" showsVerticalScrollIndicator={false}>
        <Text className="text-2xl font-bold text-slate-900 dark:text-slate-100">{activeDocument.title}</Text>
        <Text className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Last updated {activeDocument.lastUpdated}
        </Text>
        <Text className="mt-3 text-base text-slate-600 dark:text-slate-300">{activeDocument.summary}</Text>

        {activeDocument.sections.map((section) => (
          <View key={section.heading} className="mt-6">
            <Text className="text-lg font-semibold text-slate-900 dark:text-slate-100">{section.heading}</Text>
            {section.paragraphs.map((paragraph, index) => (
              <Text
                key={`${section.heading}-${index}`}
                className="mt-3 text-base leading-6 text-slate-600 dark:text-slate-300"
              >
                {paragraph}
              </Text>
            ))}
          </View>
        ))}
        <View className="h-10" />
      </ScrollView>
    </SafeAreaView>
  );
}

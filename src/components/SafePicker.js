import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../context/ThemeContext';

function resolveOptionKey(option, index) {
  if (option?.value !== undefined && option?.value !== null) {
    return String(option.value);
  }
  if (option?.label) {
    return option.label.toString();
  }
  return String(index);
}

export default function SafePicker({
  options = [],
  selectedValue,
  onValueChange,
  placeholder = 'Select an option',
  containerStyle,
  pickerStyle,
  dropdownIconColor,
  textColor,
  placeholderColor,
  modalTitle,
  disabled = false,
  testID,
}) {
  const { colors } = useTheme();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const resolvedTextColor = textColor ?? colors.textPrimary;
  const resolvedPlaceholderColor = placeholderColor ?? colors.textMuted;
  const resolvedIconColor = dropdownIconColor ?? colors.icon;
  const selectedOption = useMemo(
    () => options.find((option) => option.value === selectedValue),
    [options, selectedValue],
  );

  const handleChange = useCallback(
    (value, index) => {
      onValueChange?.(value, index);
    },
    [onValueChange],
  );

  const handleOpen = useCallback(() => {
    if (!disabled) {
      setIsModalVisible(true);
    }
  }, [disabled]);

  const handleClose = useCallback(() => {
    setIsModalVisible(false);
  }, []);

  return (
    <>
      <View
        style={[
          styles.pickerContainer,
          {
            borderColor: colors.border,
            backgroundColor: colors.surfaceMuted,
          },
          containerStyle,
          disabled && styles.disabledContainer,
        ]}
      >
        <Pressable
          style={styles.trigger}
          onPress={handleOpen}
          disabled={disabled}
          testID={testID}
          accessibilityRole="button"
          accessibilityLabel={modalTitle ?? placeholder}
        >
          <Text
            style={[
              styles.triggerText,
              {
                color: selectedOption ? resolvedTextColor : resolvedPlaceholderColor,
              },
              pickerStyle,
            ]}
            numberOfLines={1}
          >
            {selectedOption?.label ?? placeholder}
          </Text>
          <Icon name="chevron-down" size={18} color={resolvedIconColor} />
        </Pressable>
      </View>

      <Modal
        transparent
        animationType="fade"
        visible={isModalVisible}
        onRequestClose={handleClose}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              {modalTitle ?? placeholder}
            </Text>
            <FlatList
              data={options}
              keyExtractor={(item, index) => resolveOptionKey(item, index)}
              renderItem={({ item, index }) => {
                const isSelected = item.value === selectedValue;
                return (
                  <Pressable
                    style={styles.modalOption}
                    onPress={() => {
                      handleChange(item.value, index);
                      handleClose();
                    }}
                  >
                    <Text
                      style={[
                        styles.modalOptionLabel,
                        { color: colors.textPrimary },
                        isSelected && styles.modalOptionLabelSelected,
                      ]}
                    >
                      {item.label}
                    </Text>
                    {isSelected ? (
                      <Icon name="check" size={18} color={colors.accent} />
                    ) : null}
                  </Pressable>
                );
              }}
              ItemSeparatorComponent={() => (
                <View style={[styles.optionDivider, { backgroundColor: colors.border }]} />
              )}
              contentContainerStyle={styles.modalOptionList}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pickerContainer: {
    borderWidth: 1,
    borderRadius: 10,
  },
  disabledContainer: {
    opacity: 0.6,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    minHeight: 44,
  },
  triggerText: {
    fontSize: 16,
    flex: 1,
    marginRight: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    borderRadius: 16,
    padding: 20,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  modalOptionList: {
    paddingVertical: 4,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  modalOptionLabel: {
    fontSize: 16,
    flex: 1,
  },
  modalOptionLabelSelected: {
    fontWeight: '600',
  },
  optionDivider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
});

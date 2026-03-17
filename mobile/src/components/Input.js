import React, { useState } from 'react';
import {
  View,
  TextInput,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../theme';

export default function Input({
  label,
  error,
  icon,
  iconRight,
  secureTextEntry,
  style,
  inputStyle,
  containerStyle,
  ...props
}) {
  const [isSecure, setIsSecure] = useState(secureTextEntry);
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.inputWrapper,
          isFocused && styles.focused,
          error && styles.errorBorder,
          style,
        ]}
      >
        {icon && <View style={styles.iconLeft}>{icon}</View>}
        <TextInput
          style={[
            styles.input,
            icon && styles.inputWithIcon,
            (secureTextEntry || iconRight) && styles.inputWithRightIcon,
            inputStyle,
          ]}
          secureTextEntry={isSecure}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholderTextColor={colors.textLight}
          {...props}
        />
        {secureTextEntry && (
          <TouchableOpacity
            style={styles.iconRightWrap}
            onPress={() => setIsSecure(!isSecure)}
          >
            <Ionicons
              name={isSecure ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors.gray400}
            />
          </TouchableOpacity>
        )}
        {!secureTextEntry && iconRight && (
          <View style={styles.iconRightWrap}>{iconRight}</View>
        )}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 0,
    borderRadius: radius.md,
    minHeight: 52,
  },
  focused: {
    backgroundColor: colors.gray200,
  },
  errorBorder: {
    borderWidth: 1.5,
    borderColor: colors.danger,
    backgroundColor: 'rgba(227,24,55,0.04)',
  },
  iconLeft: {
    paddingLeft: spacing.md,
  },
  iconRightWrap: {
    paddingRight: spacing.md,
  },
  input: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 16,
    color: colors.text,
  },
  inputWithIcon: {
    paddingLeft: spacing.sm,
  },
  inputWithRightIcon: {
    paddingRight: spacing.sm,
  },
  error: {
    fontSize: 12,
    color: colors.danger,
    marginTop: spacing.xs,
    marginLeft: spacing.xs,
  },
});

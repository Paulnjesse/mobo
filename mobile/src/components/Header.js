import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, shadows } from '../theme';

export default function Header({
  title,
  subtitle,
  onBack,
  rightAction,
  rightIcon,
  rightLabel,
  transparent = false,
  light = false,
  style,
}) {
  const insets = useSafeAreaInsets();

  const fg = light || transparent ? colors.white : colors.text;
  const bg = transparent ? 'transparent' : light ? colors.secondary : colors.white;

  return (
    <View
      style={[
        styles.header,
        {
          backgroundColor: bg,
          paddingTop: insets.top + (Platform.OS === 'android' ? 8 : 0),
        },
        !transparent && styles.shadow,
        style,
      ]}
    >
      <View style={styles.row}>
        {onBack ? (
          <TouchableOpacity
            style={[styles.iconBtn, !transparent && styles.iconBtnBg]}
            onPress={onBack}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={22} color={fg} />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconBtn} />
        )}

        <View style={styles.titleContainer}>
          {title && (
            <Text style={[styles.title, { color: fg }]} numberOfLines={1}>
              {title}
            </Text>
          )}
          {subtitle && (
            <Text
              style={[
                styles.subtitle,
                { color: light ? 'rgba(255,255,255,0.7)' : colors.textSecondary },
              ]}
            >
              {subtitle}
            </Text>
          )}
        </View>

        {rightAction || rightIcon || rightLabel ? (
          <TouchableOpacity
            style={[styles.iconBtn, !transparent && styles.iconBtnBg]}
            onPress={rightAction}
            activeOpacity={0.7}
          >
            {rightIcon ? (
              <Ionicons name={rightIcon} size={22} color={fg} />
            ) : rightLabel ? (
              <Text style={[styles.rightLabel, { color: colors.primary }]}>{rightLabel}</Text>
            ) : null}
          </TouchableOpacity>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  shadow: {
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  iconBtnBg: {
    backgroundColor: colors.surface,
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  rightLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
});

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../theme';

export default function SurgeBadge({ multiplier, style }) {
  if (!multiplier || multiplier <= 1) return null;
  return (
    <View style={[styles.badge, style]}>
      <Ionicons name="flash" size={12} color={colors.white} />
      <Text style={styles.text}>{multiplier.toFixed(1)}x surge</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 1,
    borderRadius: radius.round,
    backgroundColor: colors.surge,
    gap: 3,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
});

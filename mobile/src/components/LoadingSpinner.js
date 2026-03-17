import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { colors, spacing } from '../theme';

export default function LoadingSpinner({ message, fullScreen = true, size = 'large' }) {
  if (!fullScreen) {
    return (
      <View style={styles.inline}>
        <ActivityIndicator size={size} color={colors.primary} />
        {message && <Text style={styles.messageInline}>{message}</Text>}
      </View>
    );
  }

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <View style={styles.logoMark}>
          <Text style={styles.logoText}>M</Text>
        </View>
        <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
        <Text style={styles.message}>{message || 'Loading...'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: spacing.xl,
    alignItems: 'center',
    minWidth: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 12,
  },
  logoMark: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  logoText: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.white,
  },
  spinner: {
    marginBottom: spacing.sm,
  },
  message: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
    fontWeight: '500',
  },
  inline: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
  },
  messageInline: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
});

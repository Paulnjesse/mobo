import React, { useRef } from 'react';
import { TouchableOpacity, Text, StyleSheet, Animated, Vibration } from 'react-native';
import { colors, shadows } from '../theme';

export default function SOSButton({ onPress, style }) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Vibration.vibrate([0, 100, 50, 100]);
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.88, duration: 100, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
    onPress && onPress();
  };

  return (
    <Animated.View style={[styles.wrapper, { transform: [{ scale }] }, style]}>
      <TouchableOpacity style={styles.button} onPress={handlePress} activeOpacity={0.85}>
        <Text style={styles.label}>SOS</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 200,
    right: 16,
    zIndex: 100,
  },
  button: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.white,
    shadowColor: colors.danger,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  label: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});

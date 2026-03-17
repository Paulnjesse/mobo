import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Animated,
} from 'react-native';
import { colors, radius, spacing } from '../theme';

const BOX_COUNT = 6;

/**
 * 6-box OTP input component (like Lyft's verification).
 * Auto-advances to next box, backspace goes to previous,
 * paste handling, pink focus border, shake animation on wrong code.
 * Props: value, onChange, onComplete, error
 */
export default function OTPInput({ value = '', onChange, onComplete, error = false }) {
  const [otp, setOtp] = useState(Array(BOX_COUNT).fill(''));
  const inputs = useRef([]);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Sync external value into boxes
  useEffect(() => {
    if (value !== undefined) {
      const chars = value.split('').slice(0, BOX_COUNT);
      const padded = [...chars, ...Array(BOX_COUNT - chars.length).fill('')];
      setOtp(padded);
    }
  }, [value]);

  // Shake on error
  useEffect(() => {
    if (error) {
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
      ]).start();
    }
  }, [error]);

  const handleChange = (text, index) => {
    // Handle paste: if more than 1 character is entered
    if (text.length > 1) {
      const pastedChars = text.replace(/\D/g, '').split('').slice(0, BOX_COUNT);
      const newOtp = [...Array(BOX_COUNT).fill('')];
      pastedChars.forEach((char, i) => {
        if (i < BOX_COUNT) newOtp[i] = char;
      });
      setOtp(newOtp);
      onChange && onChange(newOtp.join(''));
      const nextIndex = Math.min(pastedChars.length, BOX_COUNT - 1);
      inputs.current[nextIndex]?.focus();
      if (pastedChars.length === BOX_COUNT) {
        onComplete && onComplete(newOtp.join(''));
      }
      return;
    }

    const digit = text.replace(/\D/g, '').slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);

    const combined = newOtp.join('');
    onChange && onChange(combined);

    if (digit && index < BOX_COUNT - 1) {
      inputs.current[index + 1]?.focus();
    }

    if (combined.replace(/\s/g, '').length === BOX_COUNT) {
      onComplete && onComplete(combined);
    }
  };

  const handleKeyPress = (e, index) => {
    if (e.nativeEvent.key === 'Backspace') {
      const newOtp = [...otp];
      if (otp[index] !== '') {
        newOtp[index] = '';
        setOtp(newOtp);
        onChange && onChange(newOtp.join(''));
      } else if (index > 0) {
        newOtp[index - 1] = '';
        setOtp(newOtp);
        onChange && onChange(newOtp.join(''));
        inputs.current[index - 1]?.focus();
      }
    }
  };

  return (
    <Animated.View
      style={[styles.container, { transform: [{ translateX: shakeAnim }] }]}
    >
      {otp.map((digit, index) => (
        <TextInput
          key={index}
          ref={(ref) => { inputs.current[index] = ref; }}
          style={[
            styles.box,
            digit ? styles.boxFilled : null,
            error ? styles.boxError : null,
          ]}
          value={digit}
          onChangeText={(text) => handleChange(text, index)}
          onKeyPress={(e) => handleKeyPress(e, index)}
          keyboardType="number-pad"
          maxLength={6}
          selectTextOnFocus
          caretHidden
          textAlign="center"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
        />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  box: {
    width: 46,
    height: 54,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.gray300,
    backgroundColor: colors.white,
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  boxFilled: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(255,0,191,0.04)',
  },
  boxError: {
    borderColor: colors.danger,
    backgroundColor: 'rgba(227,24,55,0.05)',
  },
});

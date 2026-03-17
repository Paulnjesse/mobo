import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../theme';

const SIZE = 72;
const STROKE_WIDTH = 5;
const RADIUS = (SIZE - STROKE_WIDTH * 2) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Circular countdown timer for driver response (default 15s).
 * Pink circle that depletes, number in center, onExpire callback.
 * Props: duration (seconds), onExpire, size, color
 */
export default function CountdownTimer({
  duration = 15,
  onExpire,
  size = SIZE,
  color = colors.primary,
}) {
  const [timeLeft, setTimeLeft] = useState(duration);
  const progressAnim = useRef(new Animated.Value(1)).current;
  const animRef = useRef(null);

  useEffect(() => {
    setTimeLeft(duration);
    progressAnim.setValue(1);

    animRef.current = Animated.timing(progressAnim, {
      toValue: 0,
      duration: duration * 1000,
      useNativeDriver: false,
    });

    animRef.current.start(({ finished }) => {
      if (finished) {
        onExpire && onExpire();
      }
    });

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
      animRef.current && animRef.current.stop();
    };
  }, [duration]);

  const radius = (size - STROKE_WIDTH * 2) / 2;
  const circumference = 2 * Math.PI * radius;

  const strokeDashoffset = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  const AnimatedCircle = Animated.createAnimatedComponent(Circle);

  const urgent = timeLeft <= 5;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.svg}>
        {/* Background track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.gray200}
          strokeWidth={STROKE_WIDTH}
          fill="none"
        />
        {/* Animated progress arc */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={urgent ? colors.danger : color}
          strokeWidth={STROKE_WIDTH}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <Text style={[styles.timeText, urgent && styles.timeTextUrgent]}>
        {timeLeft}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  svg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  timeText: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: -0.5,
  },
  timeTextUrgent: {
    color: colors.danger,
  },
});

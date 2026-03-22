/**
 * Feature 30 — Offline Banner Component
 *
 * Shows a sticky banner at the top of the screen when the device goes offline.
 * Slides in/out with a smooth animation and shows "last updated X ago" when offline.
 * Displays a weaker amber warning for poor connections (2G / EDGE).
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { spacing } from '../theme';

function timeAgo(date) {
  if (!date) return '';
  const sec = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  return `${Math.floor(min / 60)}h ago`;
}

export default function OfflineBanner() {
  const { isOnline, isWeak, lastOnlineAt } = useNetworkStatus();
  const slideAnim = useRef(new Animated.Value(-60)).current;

  const visible = !isOnline || isWeak;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 0 : -60,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [visible, slideAnim]);

  if (!visible) return null;

  const offline = !isOnline;
  const bg = offline ? '#CC0000' : '#E6890A';   // red offline, amber weak

  return (
    <Animated.View
      style={[styles.banner, { backgroundColor: bg, transform: [{ translateY: slideAnim }] }]}
      pointerEvents="none"
    >
      <Ionicons
        name={offline ? 'cloud-offline-outline' : 'cellular-outline'}
        size={14}
        color="#fff"
      />
      <Text style={styles.text}>
        {offline
          ? `No connection · last updated ${timeAgo(lastOnlineAt)}`
          : 'Poor connection · updates may be delayed'}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
  },
  text: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});

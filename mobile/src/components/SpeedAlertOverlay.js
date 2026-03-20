import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Linking,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const SUPPORT_NUMBER = '+237 800 000 111';
const AUTO_DISMISS_MS = 10000;

export default function SpeedAlertOverlay({ visible, speed, onDismiss }) {
  const slideAnim = useRef(new Animated.Value(-120)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const autoDismissTimer = useRef(null);

  useEffect(() => {
    if (visible) {
      // Slide in
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 18,
          stiffness: 160,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto-dismiss after timeout
      autoDismissTimer.current = setTimeout(() => {
        handleDismiss();
      }, AUTO_DISMISS_MS);
    } else {
      // Slide out
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -120,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 280,
          useNativeDriver: true,
        }),
      ]).start();

      clearTimeout(autoDismissTimer.current);
    }

    return () => {
      clearTimeout(autoDismissTimer.current);
    };
  }, [visible]);

  const handleDismiss = () => {
    clearTimeout(autoDismissTimer.current);
    // Animate out then call prop
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -120,
        duration: 260,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (typeof onDismiss === 'function') onDismiss();
    });
  };

  const handleContactSupport = () => {
    Alert.alert(
      'Contact Support',
      `Call MOBO safety support at ${SUPPORT_NUMBER}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Call Now',
          onPress: () => Linking.openURL(`tel:${SUPPORT_NUMBER}`),
        },
      ]
    );
  };

  // Don't render at all if not visible and animation is complete
  if (!visible && slideAnim._value <= -119) return null;

  return (
    <Animated.View
      style={[
        styles.overlay,
        {
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <View style={styles.container}>
        {/* Left: warning icon */}
        <View style={styles.iconWrap}>
          <Ionicons name="warning" size={28} color="#FF4444" />
        </View>

        {/* Center: content */}
        <TouchableOpacity style={styles.textWrap} onPress={handleContactSupport} activeOpacity={0.8}>
          <Text style={styles.title}>Speed Alert</Text>
          <Text style={styles.body} numberOfLines={2}>
            Your driver is traveling at{' '}
            <Text style={styles.speedValue}>{speed} km/h</Text>
            {'. '}
            Tap to contact support.
          </Text>
        </TouchableOpacity>

        {/* Right: dismiss button */}
        <TouchableOpacity style={styles.dismissBtn} onPress={handleDismiss} activeOpacity={0.7} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      </View>

      {/* Progress bar for auto-dismiss */}
      <AutoDismissBar visible={visible} duration={AUTO_DISMISS_MS} />
    </Animated.View>
  );
}

// Animated shrinking bar showing time until auto-dismiss
function AutoDismissBar({ visible, duration }) {
  const widthAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      widthAnim.setValue(1);
      Animated.timing(widthAnim, {
        toValue: 0,
        duration,
        useNativeDriver: false,
      }).start();
    } else {
      widthAnim.setValue(1);
    }
  }, [visible]);

  return (
    <View style={styles.progressTrack}>
      <Animated.View
        style={[
          styles.progressBar,
          { flex: widthAnim },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 20,
    backgroundColor: 'rgba(100,0,0,0.92)',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,68,68,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.3,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  body: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 18,
  },
  speedValue: {
    fontWeight: '900',
    color: '#FF6B6B',
  },
  dismissBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  progressTrack: {
    height: 3,
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  progressBar: {
    height: 3,
    backgroundColor: '#FF4444',
  },
});

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  BackHandler,
  Alert,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const BREAK_SECONDS = 900; // 15 minutes

const BG = '#0F172A';
const CARD = '#1E293B';
const GREEN = '#10B981';
const DISABLED_BTN = '#374151';
const WHITE = '#FFFFFF';
const WHITE_DIM = 'rgba(255,255,255,0.55)';
const WHITE_FAINT = 'rgba(255,255,255,0.12)';

// ---------------------------------------------------------------------------
// Notification helper (expo-notifications — wrapped in try/catch)
// ---------------------------------------------------------------------------
async function scheduleBreakCompleteNotification() {
  try {
    const Notifications = await import('expo-notifications');
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Break complete!',
        body: 'You can go back online now.',
        sound: true,
      },
      trigger: null, // immediate — called when the break actually ends
    });
  } catch (err) {
    // expo-notifications not available or permission not granted — silently ignore
    console.warn('[FatigueBreak] Notification skipped:', err?.message);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatSeconds(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function FatigueBreakScreen({ navigation, route }) {
  const { reason = 'hours', hours_online = 0, trips_today = 0 } = route?.params ?? {};

  const [secondsLeft, setSecondsLeft] = useState(BREAK_SECONDS);
  const [goingOnline, setGoingOnline] = useState(false);
  const intervalRef = useRef(null);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const notifiedRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Countdown ticker
  // ---------------------------------------------------------------------------
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(intervalRef.current);
  }, []);

  // ---------------------------------------------------------------------------
  // Animate progress bar as time elapses
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const elapsed = BREAK_SECONDS - secondsLeft;
    const progress = elapsed / BREAK_SECONDS; // 0 → 1

    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 900,
      useNativeDriver: false,
    }).start();

    // Send notification once when countdown hits 0
    if (secondsLeft === 0 && !notifiedRef.current) {
      notifiedRef.current = true;
      scheduleBreakCompleteNotification();
    }
  }, [secondsLeft]);

  // ---------------------------------------------------------------------------
  // Block hardware back button — show alert instead of navigating
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const onBackPress = () => {
      Alert.alert(
        'Break Required',
        'You must complete your break before going back online.',
        [{ text: 'OK', style: 'default' }]
      );
      return true; // prevent default back navigation
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, []);

  // ---------------------------------------------------------------------------
  // Block the navigation header back gesture / button
  // ---------------------------------------------------------------------------
  useEffect(() => {
    navigation.setOptions({
      gestureEnabled: false,
      headerLeft: () => null,
    });
  }, [navigation]);

  // ---------------------------------------------------------------------------
  // Go Online handler (only callable after countdown)
  // ---------------------------------------------------------------------------
  const handleGoOnline = useCallback(async () => {
    if (secondsLeft > 0 || goingOnline) return;

    setGoingOnline(true);
    try {
      await api.post('/safety/fatigue-break');
    } catch (err) {
      // Fail open — if the API call fails, let the driver proceed anyway
      console.warn('[FatigueBreak] POST /safety/fatigue-break failed:', err?.message);
    } finally {
      setGoingOnline(false);
    }

    navigation.navigate('DriverHome', { fatigueCleared: true });
  }, [secondsLeft, goingOnline, navigation]);

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------
  const breakDone = secondsLeft === 0;
  const subtitle =
    reason === 'trips'
      ? `You've completed ${trips_today} trips in a row`
      : `You've been driving for ${hours_online} hour${hours_online !== 1 ? 's' : ''}`;

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />

      <View style={styles.content}>
        {/* Icon */}
        <View style={styles.iconWrap}>
          <Ionicons name="moon" size={52} color={GREEN} />
        </View>

        {/* Title */}
        <Text style={styles.title}>Time for a Break</Text>

        {/* Subtitle — reason */}
        <Text style={styles.subtitle}>{subtitle}</Text>

        {/* Large countdown timer */}
        <View style={styles.timerCard}>
          <Text style={styles.timerLabel}>
            {breakDone ? 'Break Complete!' : 'Time Remaining'}
          </Text>
          <Text style={[styles.timer, breakDone && styles.timerDone]}>
            {formatSeconds(secondsLeft)}
          </Text>
        </View>

        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
        </View>
        <Text style={styles.progressLabel}>
          {breakDone
            ? 'Rest complete — you\'re good to go!'
            : `${Math.floor((BREAK_SECONDS - secondsLeft) / 60)} min ${(BREAK_SECONDS - secondsLeft) % 60} sec elapsed`}
        </Text>

        {/* Info message */}
        <View style={styles.infoCard}>
          <Ionicons name="cafe-outline" size={22} color={GREEN} style={styles.infoIcon} />
          <Text style={styles.infoText}>
            Rest for 15 minutes. We'll notify you when you can go back online.
          </Text>
        </View>

        {/* Motivational note */}
        <View style={styles.motivCard}>
          <Ionicons name="shield-checkmark-outline" size={18} color="rgba(16,185,129,0.7)" style={styles.motivIcon} />
          <Text style={styles.motivText}>
            Regular breaks make you a safer driver and improve your ratings.
          </Text>
        </View>
      </View>

      {/* Go Online button — fixed at bottom */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.goOnlineBtn, !breakDone && styles.goOnlineBtnDisabled]}
          onPress={handleGoOnline}
          disabled={!breakDone || goingOnline}
          activeOpacity={0.85}
        >
          <Ionicons
            name={goingOnline ? 'hourglass-outline' : 'radio-button-on'}
            size={20}
            color={WHITE}
            style={styles.goOnlineIcon}
          />
          <Text style={styles.goOnlineBtnText}>
            {goingOnline ? 'Going Online…' : 'Go Online Now'}
          </Text>
        </TouchableOpacity>

        {!breakDone && (
          <Text style={styles.footerHint}>
            Available after countdown ends
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 32,
  },

  // Icon
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: WHITE_FAINT,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(16,185,129,0.3)',
  },

  // Title / subtitle
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: WHITE,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 15,
    color: WHITE_DIM,
    textAlign: 'center',
    marginBottom: 32,
    fontWeight: '500',
    lineHeight: 22,
  },

  // Timer card
  timerCard: {
    backgroundColor: CARD,
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 40,
    alignItems: 'center',
    marginBottom: 24,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  timerLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: WHITE_DIM,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  timer: {
    fontSize: 64,
    fontWeight: '800',
    color: WHITE,
    fontVariant: ['tabular-nums'],
    letterSpacing: 2,
  },
  timerDone: {
    color: GREEN,
  },

  // Progress bar
  progressTrack: {
    width: '100%',
    height: 8,
    backgroundColor: WHITE_FAINT,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: GREEN,
    borderRadius: 4,
  },
  progressLabel: {
    fontSize: 12,
    color: WHITE_DIM,
    marginBottom: 28,
    fontWeight: '500',
  },

  // Info card
  infoCard: {
    backgroundColor: CARD,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  infoIcon: {
    marginTop: 1,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: WHITE_DIM,
    lineHeight: 20,
    fontWeight: '500',
  },

  // Motivational note
  motivCard: {
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.2)',
  },
  motivIcon: {
    marginTop: 1,
  },
  motivText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(16,185,129,0.85)',
    lineHeight: 19,
    fontWeight: '500',
  },

  // Footer / button
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    paddingTop: 12,
    alignItems: 'center',
  },
  goOnlineBtn: {
    backgroundColor: GREEN,
    borderRadius: 100,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    gap: 8,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
  goOnlineBtnDisabled: {
    backgroundColor: DISABLED_BTN,
    shadowOpacity: 0,
    elevation: 0,
  },
  goOnlineIcon: {
    marginRight: 2,
  },
  goOnlineBtnText: {
    fontSize: 17,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: 0.4,
  },
  footerHint: {
    marginTop: 10,
    fontSize: 12,
    color: WHITE_DIM,
    fontWeight: '500',
  },
});

/**
 * WatchCompanionScreen — Apple Watch / Wear OS Companion Stub
 *
 * When the native watch extensions are ready, install:
 *   • iOS: react-native-watch-connectivity (WatchConnectivity framework)
 *   • Android: react-native-wearable (Wear OS DataClient)
 *
 * This screen acts as the in-app pairing guide and status display.
 * The `useWatchSession` hook below wraps the native bridge with a safe
 * fallback so the app never crashes on devices that don't have it installed.
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../theme';

// ─── Watch bridge shim ─────────────────────────────────────────────────────
// Replace with actual library once native modules are linked.
let WatchBridge = null;
try {
  // iOS: WatchBridge = require('react-native-watch-connectivity').default;
  // Android: WatchBridge = require('react-native-wearable').default;
} catch (_) { /* native module not linked yet */ }

function useWatchSession() {
  const [paired, setPaired] = useState(false);
  const [reachable, setReachable] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);

  useEffect(() => {
    if (!WatchBridge) return;
    const unsub = WatchBridge.watchEvents.on('reachabilityChanged', (r) => setReachable(r));
    WatchBridge.getIsWatchAppInstalled().then(setPaired).catch(() => {});
    return () => unsub();
  }, []);

  const sendToWatch = (message) => {
    if (!WatchBridge || !reachable) return false;
    WatchBridge.sendMessage(message, () => {}, () => {});
    return true;
  };

  return { paired, reachable, lastMessage, sendToWatch, available: !!WatchBridge };
}
// ─────────────────────────────────────────────────────────────────────────────

const WATCH_FEATURES = [
  {
    icon: 'navigate',
    title: 'Live Ride Status',
    desc: 'Driver ETA, ride progress, and arrival shown on your wrist.',
    color: colors.primary,
  },
  {
    icon: 'heart',
    title: 'Quick Tip',
    desc: 'Tip your driver with a single tap — 200, 500, or 1000 XAF.',
    color: '#e11d48',
  },
  {
    icon: 'shield-checkmark',
    title: 'SOS Alert',
    desc: 'Hold Digital Crown to trigger an emergency alert to your contacts.',
    color: colors.danger,
  },
  {
    icon: 'map',
    title: 'Book via Siri / Google',
    desc: '"Hey Siri, book a MOBO ride to the airport" — hands-free booking.',
    color: '#2563eb',
  },
  {
    icon: 'notifications',
    title: 'Driver Notifications',
    desc: 'Haptic alerts when your driver is 2 minutes away.',
    color: colors.warning,
  },
  {
    icon: 'card',
    title: 'Payment Confirmation',
    desc: 'Fare receipt and payment confirmation straight to your watch.',
    color: colors.success,
  },
];

const SETUP_STEPS = [
  { step: 1, text: 'Install the MOBO app on your paired Apple Watch / Wear OS device from the App Store / Play Store.' },
  { step: 2, text: 'Open the Watch app on your iPhone (or Wear OS app on Android) and enable MOBO in the installed apps list.' },
  { step: 3, text: 'Open MOBO on your watch and sign in using the QR code shown on your phone.' },
  { step: 4, text: 'Tap "Sync Now" below to push your active ride data to the watch.' },
];

export default function WatchCompanionScreen({ navigation, route }) {
  const { paired, reachable, available, sendToWatch } = useWatchSession();
  const activeRideId = route?.params?.rideId;

  const handleSync = () => {
    if (!available) {
      Alert.alert(
        'Native Module Not Linked',
        'The watch bridge is not yet installed. Add react-native-watch-connectivity (iOS) or react-native-wearable (Android) and rebuild the app.',
        [{ text: 'OK' }]
      );
      return;
    }
    const sent = sendToWatch({
      type: 'SYNC',
      rideId: activeRideId || null,
      timestamp: Date.now(),
    });
    if (sent) Alert.alert('Synced', 'Ride data pushed to your watch.');
    else Alert.alert('Watch Unreachable', 'Make sure your watch is nearby and the app is open.');
  };

  const StatusDot = ({ ok }) => (
    <View style={[styles.dot, { backgroundColor: ok ? colors.success : colors.danger }]} />
  );

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Watch Companion</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.watchIcon}>
            <Ionicons name="watch-outline" size={56} color={colors.primary} />
          </View>
          <Text style={styles.heroTitle}>MOBO on Your Wrist</Text>
          <Text style={styles.heroSub}>
            {Platform.OS === 'ios'
              ? 'Apple Watch companion for instant ride control'
              : 'Wear OS companion for hands-free ride management'}
          </Text>
        </View>

        {/* Connection status */}
        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>Connection Status</Text>
          <View style={styles.statusRow}>
            <StatusDot ok={available} />
            <Text style={styles.statusLabel}>Native bridge installed</Text>
            <Text style={[styles.statusVal, { color: available ? colors.success : colors.danger }]}>
              {available ? 'Yes' : 'Not linked'}
            </Text>
          </View>
          <View style={styles.statusRow}>
            <StatusDot ok={paired} />
            <Text style={styles.statusLabel}>Watch paired</Text>
            <Text style={[styles.statusVal, { color: paired ? colors.success : colors.textSecondary }]}>
              {paired ? 'Paired' : 'Not paired'}
            </Text>
          </View>
          <View style={styles.statusRow}>
            <StatusDot ok={reachable} />
            <Text style={styles.statusLabel}>Watch reachable</Text>
            <Text style={[styles.statusVal, { color: reachable ? colors.success : colors.textSecondary }]}>
              {reachable ? 'In range' : 'Out of range'}
            </Text>
          </View>
          <TouchableOpacity style={styles.syncBtn} onPress={handleSync} activeOpacity={0.85}>
            <Ionicons name="sync-outline" size={18} color={colors.white} />
            <Text style={styles.syncBtnText}>Sync Now</Text>
          </TouchableOpacity>
        </View>

        {/* Features */}
        <Text style={styles.sectionTitle}>What You Can Do</Text>
        {WATCH_FEATURES.map((f, i) => (
          <View key={i} style={styles.featureRow}>
            <View style={[styles.featureIcon, { backgroundColor: f.color + '18' }]}>
              <Ionicons name={f.icon} size={22} color={f.color} />
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>{f.title}</Text>
              <Text style={styles.featureDesc}>{f.desc}</Text>
            </View>
          </View>
        ))}

        {/* Setup guide */}
        <Text style={styles.sectionTitle}>Setup Guide</Text>
        <View style={styles.setupCard}>
          {SETUP_STEPS.map((s) => (
            <View key={s.step} style={styles.setupRow}>
              <View style={styles.setupNum}>
                <Text style={styles.setupNumText}>{s.step}</Text>
              </View>
              <Text style={styles.setupText}>{s.text}</Text>
            </View>
          ))}
        </View>

        {/* Platform note */}
        <View style={styles.noteBox}>
          <Ionicons name="information-circle-outline" size={18} color={colors.info} style={{ marginTop: 1 }} />
          <Text style={styles.noteText}>
            The watch app requires a physical device with a paired smartwatch.
            Simulator/emulator testing is not supported for watch features.
            {'\n\n'}
            <Text style={{ fontWeight: '700' }}>iOS:</Text> Requires watchOS 9+ and iPhone running iOS 16+.{'\n'}
            <Text style={{ fontWeight: '700' }}>Android:</Text> Requires Wear OS 3+ with Google Play Services.
          </Text>
        </View>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  hero: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
    marginBottom: spacing.sm,
  },
  watchIcon: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  heroTitle: { fontSize: 22, fontWeight: '900', color: colors.text, marginBottom: spacing.xs, letterSpacing: -0.3 },
  heroSub: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: spacing.xl, lineHeight: 20 },
  statusCard: {
    backgroundColor: colors.white,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  statusTitle: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.md },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { flex: 1, fontSize: 14, color: colors.text },
  statusVal: { fontSize: 13, fontWeight: '700' },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    marginTop: spacing.md,
  },
  syncBtnText: { fontSize: 14, fontWeight: '700', color: colors.white },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
    gap: spacing.md,
  },
  featureIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  featureText: { flex: 1 },
  featureTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 2 },
  featureDesc: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  setupCard: {
    backgroundColor: colors.white,
    marginHorizontal: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  setupRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  setupNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  setupNumText: { fontSize: 13, fontWeight: '800', color: colors.white },
  setupText: { flex: 1, fontSize: 14, color: colors.text, lineHeight: 20 },
  noteBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    backgroundColor: '#eff6ff',
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  noteText: { flex: 1, fontSize: 13, color: '#1e40af', lineHeight: 19 },
});

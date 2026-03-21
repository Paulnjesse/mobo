import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadows } from '../theme';
import api from '../services/api';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const COUNTDOWN_SECONDS = 15;

const SIZE_LABELS = {
  envelope:    { label: 'Envelope',    icon: '📄', color: '#3B82F6' },
  small:       { label: 'Small',       icon: '📦', color: '#10B981' },
  medium:      { label: 'Medium',      icon: '📦', color: colors.warning },
  large:       { label: 'Large',       icon: '🗳️', color: colors.primary },
  extra_large: { label: 'Extra Large', icon: '🏗️', color: colors.text },
};

function getSizeInfo(size) {
  return SIZE_LABELS[size] || { label: size || 'Package', icon: '📦', color: colors.textSecondary };
}

// ---------------------------------------------------------------------------
// Countdown ring component (SVG-free, uses border trick)
// ---------------------------------------------------------------------------
function CountdownRing({ countdown, total }) {
  const progress = countdown / total; // 1.0 → 0.0
  const ringAnim = useRef(new Animated.Value(1)).current;
  const colorAnim = useRef(new Animated.Value(0)).current;

  // Smoothly interpolate ring width to simulate progress
  const borderColor = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.success, colors.danger],
  });

  useEffect(() => {
    const elapsed = total - countdown;
    const pct = elapsed / total;
    Animated.timing(colorAnim, {
      toValue: pct,
      duration: 900,
      useNativeDriver: false,
    }).start();
  }, [countdown]);

  return (
    <Animated.View
      style={[
        styles.countdownRing,
        { borderColor },
      ]}
    >
      <Text style={styles.countdownNumber}>{countdown}</Text>
      <Text style={styles.countdownSub}>sec</Text>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function DriverDeliveryRequestScreen({ navigation, route }) {
  const { delivery } = route.params || {};
  const insets = useSafeAreaInsets();

  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [accepting, setAccepting] = useState(false);
  const countdownRef = useRef(null);

  const deliveryId = delivery?._id || delivery?.id;
  const sizeInfo = getSizeInfo(delivery?.package_size);
  const fare = delivery?.fare != null ? `${Number(delivery.fare).toLocaleString()} XAF` : '–';
  const distance = delivery?.distance_to_pickup || delivery?.distance || null;

  // ---------------------------------------------------------------------------
  // Countdown timer — auto-decline at 0
  // ---------------------------------------------------------------------------
  useEffect(() => {
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          handleDecline(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Accept
  // ---------------------------------------------------------------------------
  const handleAccept = async () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setAccepting(true);
    try {
      const res = await api.post(`/deliveries/${deliveryId}/accept`);
      const updatedDelivery = res.data?.delivery || res.data || delivery;
      navigation.replace('DriverDelivery', { delivery: updatedDelivery });
    } catch (err) {
      setAccepting(false);
      // Restart countdown if accept fails
      Alert.alert('Error', err.message || 'Could not accept delivery. Please try again.');
      navigation.goBack();
    }
  };

  // ---------------------------------------------------------------------------
  // Decline
  // ---------------------------------------------------------------------------
  const handleDecline = (auto = false) => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    navigation.goBack();
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* Background overlay */}
      <View style={styles.overlay} />

      <SafeAreaView style={styles.safeArea} edges={['bottom', 'top']}>
        <View style={[styles.card, { paddingBottom: insets.bottom + spacing.md }]}>
          {/* Header row */}
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.cardTitle}>Delivery Request</Text>
              <Text style={styles.cardSubtitle}>New package to deliver</Text>
            </View>
            <CountdownRing countdown={countdown} total={COUNTDOWN_SECONDS} />
          </View>

          {/* Package size badge */}
          <View style={[styles.sizeBadge, { borderColor: sizeInfo.color + '40', backgroundColor: sizeInfo.color + '12' }]}>
            <Text style={styles.sizeBadgeIcon}>{sizeInfo.icon}</Text>
            <Text style={[styles.sizeBadgeLabel, { color: sizeInfo.color }]}>{sizeInfo.label}</Text>
            {delivery?.fragile && (
              <View style={styles.fragileBadge}>
                <Text style={styles.fragileBadgeText}>⚠️ Fragile</Text>
              </View>
            )}
          </View>

          {/* Route */}
          <View style={styles.routeRow}>
            <View style={styles.dotsColumn}>
              <View style={styles.dotPickup} />
              <View style={styles.dotLine} />
              <View style={styles.dotDropoff} />
            </View>
            <View style={styles.routeTexts}>
              <View style={styles.routeItem}>
                <Text style={styles.routeLabel}>PICKUP</Text>
                <Text style={styles.routeAddress} numberOfLines={2}>
                  {delivery?.pickup_address || delivery?.pickup?.address || 'Pickup location'}
                </Text>
              </View>
              <View style={styles.routeItem}>
                <Text style={styles.routeLabel}>DROP-OFF</Text>
                <Text style={styles.routeAddress} numberOfLines={2}>
                  {delivery?.dropoff_address || delivery?.dropoff?.address || 'Drop-off location'}
                </Text>
              </View>
            </View>
          </View>

          {/* Meta row: distance + earnings */}
          <View style={styles.metaRow}>
            {distance != null && (
              <View style={styles.metaItem}>
                <Ionicons name="navigate-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.metaText}>{distance} km away</Text>
              </View>
            )}
            <View style={styles.metaItem}>
              <Ionicons name="cash-outline" size={16} color={colors.success} />
              <Text style={[styles.metaText, styles.fareText]}>{fare}</Text>
            </View>
          </View>

          {/* Package description */}
          {delivery?.description ? (
            <View style={styles.descriptionBox}>
              <Ionicons name="document-text-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.descriptionText} numberOfLines={2}>{delivery.description}</Text>
            </View>
          ) : null}

          {/* Earnings highlight */}
          <View style={styles.earningsHighlight}>
            <Text style={styles.earningsLabel}>Your Earnings</Text>
            <Text style={styles.earningsValue}>{fare}</Text>
          </View>

          {/* Action buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.declineBtn}
              onPress={() => handleDecline(false)}
              activeOpacity={0.8}
              disabled={accepting}
            >
              <Ionicons name="close" size={20} color={colors.textSecondary} />
              <Text style={styles.declineBtnText}>Decline</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.acceptBtn, accepting && styles.acceptBtnLoading]}
              onPress={handleAccept}
              activeOpacity={0.88}
              disabled={accepting}
            >
              {accepting ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={20} color={colors.white} />
                  <Text style={styles.acceptBtnText}>Accept</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Progress bar */}
          <View style={styles.progressBarBg}>
            <Animated.View
              style={[
                styles.progressBarFill,
                { width: `${(countdown / COUNTDOWN_SECONDS) * 100}%` },
              ]}
            />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  safeArea: {
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 24,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 3,
  },
  cardSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  countdownRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownNumber: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text,
    lineHeight: 22,
  },
  countdownSub: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  sizeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1.5,
    marginBottom: spacing.md,
    alignSelf: 'flex-start',
  },
  sizeBadgeIcon: {
    fontSize: 18,
  },
  sizeBadgeLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  fragileBadge: {
    backgroundColor: 'rgba(255,140,0,0.15)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    marginLeft: spacing.xs,
  },
  fragileBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.warning,
  },
  routeRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  dotsColumn: {
    alignItems: 'center',
    paddingTop: 4,
  },
  dotPickup: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#3B82F6',
    backgroundColor: 'rgba(59,130,246,0.15)',
  },
  dotLine: {
    width: 2,
    height: 36,
    backgroundColor: colors.gray300,
  },
  dotDropoff: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: colors.danger,
  },
  routeTexts: {
    flex: 1,
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  routeItem: {
    flex: 1,
  },
  routeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  routeAddress: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    lineHeight: 19,
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginBottom: spacing.sm,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  fareText: {
    color: colors.success,
    fontWeight: '700',
  },
  descriptionBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  descriptionText: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  earningsHighlight: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0,166,81,0.08)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(0,166,81,0.18)',
  },
  earningsLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.success,
  },
  earningsValue: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.success,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  declineBtn: {
    flex: 1,
    height: 54,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.gray300,
  },
  declineBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  acceptBtn: {
    flex: 2,
    height: 54,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.success,
    shadowColor: colors.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  acceptBtnLoading: {
    backgroundColor: colors.success + 'AA',
    shadowOpacity: 0,
    elevation: 0,
  },
  acceptBtnText: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.white,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: colors.gray200,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.success,
    borderRadius: 2,
  },
});

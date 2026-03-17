import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../context/LanguageContext';
import { useRide } from '../context/RideContext';
import { colors, spacing, radius, shadows } from '../theme';

function formatFare(amount) {
  if (!amount && amount !== 0) return '–';
  return `${Math.round(Number(amount)).toLocaleString()} XAF`;
}

export default function FareEstimateScreen({ navigation, route }) {
  const { pickup, dropoff, rideType = 'standard', estimate: passedEstimate } = route.params || {};
  const { t } = useLanguage();
  const { fareEstimate, getFareEstimate, nearbyDrivers, surgeInfo } = useRide();
  const [loading, setLoading] = useState(!passedEstimate && !fareEstimate);

  useEffect(() => {
    if (!passedEstimate && !fareEstimate && pickup && dropoff) {
      loadEstimate();
    } else {
      setLoading(false);
    }
  }, []);

  const loadEstimate = async () => {
    setLoading(true);
    try {
      await getFareEstimate(pickup, dropoff, rideType);
    } catch (err) {
      console.warn('Failed to load fare estimate:', err);
    } finally {
      setLoading(false);
    }
  };

  const estimate = passedEstimate || fareEstimate || {};
  const baseFare = estimate.baseFare ?? 1000;
  const distanceFare = estimate.distanceFare ?? 0;
  const timeFare = estimate.timeFare ?? 0;
  const bookingFee = estimate.bookingFee ?? 500;
  const serviceFee = estimate.serviceFee ?? 0;
  const surgeMultiplier = surgeInfo?.multiplier || estimate.surgeMultiplier || 1;
  const subscriptionDiscount = estimate.subscriptionDiscount ?? 0;
  const total = estimate.total ?? estimate.totalFare ?? (baseFare + distanceFare + timeFare + bookingFee + serviceFee);

  const fareRows = [
    { label: t('baseFare'), value: baseFare },
    distanceFare > 0 && { label: `${t('distanceFare')} (${estimate.distanceKm || 0} km)`, value: distanceFare },
    timeFare > 0 && { label: `${t('timeFare')} (${estimate.durationMin || 0} min)`, value: timeFare },
    { label: t('bookingFee'), value: bookingFee },
    serviceFee > 0 && { label: t('serviceFee'), value: serviceFee },
    surgeMultiplier > 1 && { label: t('surgeMultiplier'), isSurge: true, multiplier: surgeMultiplier },
    subscriptionDiscount > 0 && { label: t('subscriptionDiscount'), value: -subscriptionDiscount, isDiscount: true },
  ].filter(Boolean);

  const handleBook = () => {
    navigation.navigate('BookRide', { pickup, dropoff, rideType });
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('fareBreakdown')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Calculating fare...</Text>
          </View>
        ) : (
          <>
            {/* Big price hero */}
            <View style={styles.priceHero}>
              <Text style={styles.priceLabel}>Estimated total</Text>
              <Text style={styles.priceValue}>{formatFare(total)}</Text>
              <View style={styles.rideTypePill}>
                <Text style={styles.rideTypeText}>
                  {rideType.charAt(0).toUpperCase() + rideType.slice(1)}
                </Text>
              </View>
              {surgeMultiplier > 1 && (
                <View style={styles.surgePill}>
                  <Ionicons name="flash" size={13} color={colors.white} />
                  <Text style={styles.surgeText}>{surgeMultiplier.toFixed(1)}x surge pricing active</Text>
                </View>
              )}
            </View>

            {/* Route card */}
            {(pickup || dropoff) && (
              <View style={styles.routeCard}>
                <View style={styles.routeDotsCol}>
                  <View style={styles.routeDotPickup} />
                  <View style={styles.routeLine} />
                  <View style={styles.routeDotDropoff} />
                </View>
                <View style={styles.routeTexts}>
                  <Text style={styles.routeTextItem} numberOfLines={1}>
                    {pickup?.address || pickup || 'Pickup location'}
                  </Text>
                  <View style={styles.routeTextGap} />
                  <Text style={styles.routeTextItem} numberOfLines={1}>
                    {dropoff?.address || dropoff || 'Dropoff location'}
                  </Text>
                </View>
              </View>
            )}

            {/* Fare breakdown card */}
            <View style={styles.fareCard}>
              <Text style={styles.fareCardTitle}>Fare breakdown</Text>
              {fareRows.map((row, idx) => (
                <View key={idx} style={styles.fareRow}>
                  <Text style={[styles.fareLabel, row.isDiscount && styles.fareDiscount]}>
                    {row.label}
                  </Text>
                  {row.isSurge ? (
                    <Text style={styles.surgeMultText}>{row.multiplier.toFixed(1)}×</Text>
                  ) : (
                    <Text style={[styles.fareValue, row.isDiscount && styles.fareDiscount]}>
                      {row.isDiscount && row.value < 0 ? '-' : ''}
                      {formatFare(Math.abs(row.value))}
                    </Text>
                  )}
                </View>
              ))}
              <View style={styles.totalDivider} />
              <View style={styles.fareRow}>
                <Text style={styles.totalRowLabel}>{t('totalFare')}</Text>
                <Text style={styles.totalRowValue}>{formatFare(total)}</Text>
              </View>
            </View>

            {/* Info card — ETA + drivers */}
            <View style={styles.infoCard}>
              <View style={styles.infoItem}>
                <View style={styles.infoIconWrap}>
                  <Ionicons name="car" size={18} color={colors.primary} />
                </View>
                <View>
                  <Text style={styles.infoLabel}>{t('nearbyDrivers')}</Text>
                  <Text style={styles.infoValue}>{nearbyDrivers.length} available</Text>
                </View>
              </View>
              <View style={styles.infoDivider} />
              <View style={styles.infoItem}>
                <View style={styles.infoIconWrap}>
                  <Ionicons name="time-outline" size={18} color={colors.primary} />
                </View>
                <View>
                  <Text style={styles.infoLabel}>{t('estimatedPickup')}</Text>
                  <Text style={styles.infoValue}>
                    {estimate.etaMinutes || nearbyDrivers[0]?.eta || 5} {t('minutes')}
                  </Text>
                </View>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* Book button — fixed at bottom */}
      {!loading && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.bookBtn}
            onPress={handleBook}
            activeOpacity={0.88}
          >
            <Text style={styles.bookBtnText}>
              Book {rideType.charAt(0).toUpperCase() + rideType.slice(1)} · {formatFare(total)}
            </Text>
            <Ionicons name="arrow-forward" size={20} color={colors.white} />
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  headerSpacer: {
    width: 40,
  },
  scroll: {
    padding: spacing.md,
    paddingBottom: 100,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 80,
    gap: spacing.md,
  },
  loadingText: {
    fontSize: 15,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  priceHero: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.sm,
    ...shadows.md,
  },
  priceLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
  },
  priceValue: {
    fontSize: 42,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: -1.5,
    marginBottom: spacing.sm,
  },
  rideTypePill: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    borderRadius: radius.round,
    marginBottom: spacing.sm,
  },
  rideTypeText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  surgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surge,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    borderRadius: radius.round,
    gap: spacing.xs,
  },
  surgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
  },
  routeCard: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    alignItems: 'center',
    ...shadows.sm,
  },
  routeDotsCol: {
    alignItems: 'center',
    marginRight: spacing.md,
    paddingVertical: 2,
  },
  routeDotPickup: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  routeLine: {
    width: 2,
    height: 28,
    backgroundColor: colors.gray300,
    marginVertical: 3,
  },
  routeDotDropoff: {
    width: 9,
    height: 9,
    borderRadius: 2,
    backgroundColor: colors.text,
  },
  routeTexts: {
    flex: 1,
  },
  routeTextItem: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    lineHeight: 20,
  },
  routeTextGap: {
    height: 20,
  },
  fareCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  fareCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  fareLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    flex: 1,
  },
  fareValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  fareDiscount: {
    color: colors.success,
  },
  surgeMultText: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.surge,
  },
  totalDivider: {
    height: 2,
    backgroundColor: colors.gray200,
    marginVertical: spacing.xs,
  },
  totalRowLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  totalRowValue: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
  },
  infoCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  infoIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,0,191,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  infoDivider: {
    height: 1,
    backgroundColor: colors.gray200,
    marginVertical: spacing.sm,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.gray200,
  },
  bookBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  bookBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
  },
});

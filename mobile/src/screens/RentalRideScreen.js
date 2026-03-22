import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadows } from '../theme';
import { ridesService } from '../services/rides';

// Fallback packages if API is unreachable
const DEFAULT_PACKAGES = {
  '1h': { hours: 1, kmLimit: 50,  price: 8000  },
  '2h': { hours: 2, kmLimit: 100, price: 14000 },
  '4h': { hours: 4, kmLimit: 180, price: 25000 },
  '8h': { hours: 8, kmLimit: 300, price: 45000 },
};

const PACKAGE_ICONS = { '1h': 'time-outline', '2h': 'bicycle-outline', '4h': 'car-outline', '8h': 'rocket-outline' };
const PACKAGE_SUBTITLES = {
  '1h': 'Short errands & quick trips',
  '2h': 'City tours & shopping',
  '4h': 'Full half-day at your service',
  '8h': 'Full-day luxury service',
};

const PAYMENT_METHODS = [
  { key: 'mtn_money', label: 'MTN Mobile Money', icon: 'phone-portrait-outline' },
  { key: 'orange_money', label: 'Orange Money', icon: 'phone-portrait-outline' },
  { key: 'card', label: 'Debit / Credit Card', icon: 'card-outline' },
  { key: 'wallet', label: 'MOBO Wallet', icon: 'wallet-outline' },
  { key: 'cash', label: 'Cash', icon: 'cash-outline' },
];

export default function RentalRideScreen({ navigation, route }) {
  const { pickup } = route?.params || {};

  const [packages, setPackages] = useState(DEFAULT_PACKAGES);
  const [extraKmRate, setExtraKmRate] = useState(200);
  const [selectedPkg, setSelectedPkg] = useState('2h');
  const [selectedPayment, setSelectedPayment] = useState('mtn_money');
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    ridesService.getRentalPackages()
      .then((data) => {
        if (data?.packages) setPackages(data.packages);
        if (data?.extra_km_rate) setExtraKmRate(data.extra_km_rate);
      })
      .catch(() => {/* use defaults */})
      .finally(() => setLoading(false));
  }, []);

  const pkg = packages[selectedPkg] || {};

  const handleBook = async () => {
    if (!pickup) {
      Alert.alert('Location required', 'Please set your pickup location first.');
      return;
    }
    setBooking(true);
    try {
      const result = await ridesService.requestRentalRide(
        pickup.address || pickup,
        { lat: pickup.lat || pickup.latitude, lng: pickup.lng || pickup.longitude },
        selectedPkg,
        selectedPayment
      );
      navigation.replace('RideTracking', { rideId: result.ride?.id, isRental: true, rentalPackage: pkg });
    } catch (err) {
      Alert.alert('Booking failed', err?.response?.data?.error || 'Please try again.');
    } finally {
      setBooking(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Rental Ride</Text>
          <Text style={styles.headerSub}>Book a driver by the hour</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Pickup location */}
        <TouchableOpacity
          style={styles.pickupCard}
          onPress={() => navigation.navigate('SearchLocation', { onSelect: 'rental_pickup' })}
          activeOpacity={0.85}
        >
          <View style={styles.pickupDot} />
          <View style={{ flex: 1 }}>
            <Text style={styles.pickupLabel}>Pickup Location</Text>
            <Text style={styles.pickupValue} numberOfLines={1}>
              {pickup?.address || pickup || 'Tap to set pickup location'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.gray400} />
        </TouchableOpacity>

        {/* Package selection */}
        <Text style={styles.sectionTitle}>Choose a Package</Text>
        <View style={styles.packagesGrid}>
          {Object.entries(packages).map(([key, p]) => {
            const isSelected = selectedPkg === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.packageCard, isSelected && styles.packageCardSelected]}
                onPress={() => setSelectedPkg(key)}
                activeOpacity={0.85}
              >
                {isSelected && (
                  <View style={styles.packageCheckBadge}>
                    <Ionicons name="checkmark" size={12} color={colors.white} />
                  </View>
                )}
                <Ionicons
                  name={PACKAGE_ICONS[key] || 'car-outline'}
                  size={28}
                  color={isSelected ? colors.primary : colors.gray400}
                />
                <Text style={[styles.packageKey, isSelected && styles.packageKeySelected]}>{key}</Text>
                <Text style={[styles.packagePrice, isSelected && styles.packagePriceSelected]}>
                  {p.price.toLocaleString()} XAF
                </Text>
                <Text style={[styles.packageKm, isSelected && { color: colors.primary }]}>
                  {p.kmLimit} km included
                </Text>
                <Text style={styles.packageSub}>{PACKAGE_SUBTITLES[key]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Selected package details */}
        <View style={styles.detailCard}>
          <Text style={styles.sectionTitle}>What's included</Text>
          {[
            { icon: 'time-outline', label: `${pkg.hours} hour${pkg.hours > 1 ? 's' : ''} of service`, color: colors.primary },
            { icon: 'navigate-outline', label: `${pkg.kmLimit} km included`, color: colors.success },
            { icon: 'people-outline', label: 'Dedicated driver — no shared rides', color: colors.warning },
            { icon: 'refresh-outline', label: `Extra km: ${extraKmRate.toLocaleString()} XAF/km`, color: colors.textSecondary },
            { icon: 'shield-checkmark-outline', label: 'Insured & background-checked driver', color: colors.success },
          ].map((item) => (
            <View key={item.label} style={styles.includeRow}>
              <View style={[styles.includeIcon, { backgroundColor: `${item.color}18` }]}>
                <Ionicons name={item.icon} size={16} color={item.color} />
              </View>
              <Text style={styles.includeText}>{item.label}</Text>
            </View>
          ))}
        </View>

        {/* Payment method */}
        <Text style={styles.sectionTitle}>Payment Method</Text>
        <View style={styles.card}>
          {PAYMENT_METHODS.map((pm) => (
            <TouchableOpacity
              key={pm.key}
              style={[styles.paymentRow, selectedPayment === pm.key && styles.paymentRowSelected]}
              onPress={() => setSelectedPayment(pm.key)}
              activeOpacity={0.85}
            >
              <Ionicons
                name={pm.icon}
                size={20}
                color={selectedPayment === pm.key ? colors.primary : colors.gray400}
              />
              <Text style={[styles.paymentLabel, selectedPayment === pm.key && styles.paymentLabelSelected]}>
                {pm.label}
              </Text>
              <View style={[styles.radioOuter, selectedPayment === pm.key && styles.radioOuterActive]}>
                {selectedPayment === pm.key && <View style={styles.radioInner} />}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: 90 }} />
      </ScrollView>

      {/* Book button */}
      <View style={styles.footer}>
        <View style={styles.footerPriceSummary}>
          <Text style={styles.footerPriceLabel}>{selectedPkg} rental</Text>
          <Text style={styles.footerPrice}>{(pkg.price || 0).toLocaleString()} XAF</Text>
        </View>
        <TouchableOpacity
          style={[styles.bookBtn, booking && { opacity: 0.6 }]}
          onPress={handleBook}
          disabled={booking}
          activeOpacity={0.85}
        >
          {booking ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Text style={styles.bookBtnText}>Book Rental · {(pkg.price || 0).toLocaleString()} XAF</Text>
              <Ionicons name="arrow-forward" size={20} color={colors.white} />
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray200,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.text, textAlign: 'center' },
  headerSub: { fontSize: 12, color: colors.textSecondary, textAlign: 'center' },

  scroll: { padding: spacing.md },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: spacing.sm, marginTop: spacing.sm },

  pickupCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.white, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.md, ...shadows.sm,
  },
  pickupDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },
  pickupLabel: { fontSize: 11, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.3 },
  pickupValue: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 2 },

  packagesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  packageCard: {
    width: '48%', backgroundColor: colors.white, borderRadius: radius.lg,
    padding: spacing.md, alignItems: 'center', borderWidth: 1.5, borderColor: colors.gray200,
    position: 'relative', ...shadows.sm,
  },
  packageCardSelected: { borderColor: colors.primary, backgroundColor: 'rgba(255,0,191,0.04)' },
  packageCheckBadge: {
    position: 'absolute', top: 8, right: 8,
    width: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  packageKey: { fontSize: 22, fontWeight: '900', color: colors.text, marginTop: 6, letterSpacing: -0.5 },
  packageKeySelected: { color: colors.primary },
  packagePrice: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 2 },
  packagePriceSelected: { color: colors.primary },
  packageKm: { fontSize: 12, color: colors.textSecondary, marginTop: 2, fontWeight: '600' },
  packageSub: { fontSize: 10, color: colors.textLight, marginTop: 4, textAlign: 'center' },

  detailCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadows.sm },
  includeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  includeIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  includeText: { fontSize: 13, color: colors.text, fontWeight: '500', flex: 1 },

  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.sm, marginBottom: spacing.sm, ...shadows.sm },
  paymentRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 12, paddingHorizontal: spacing.sm,
    borderRadius: radius.md, marginBottom: 2,
  },
  paymentRowSelected: { backgroundColor: 'rgba(255,0,191,0.05)' },
  paymentLabel: { flex: 1, fontSize: 14, color: colors.textSecondary, fontWeight: '500' },
  paymentLabelSelected: { color: colors.text, fontWeight: '600' },
  radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.gray300, alignItems: 'center', justifyContent: 'center' },
  radioOuterActive: { borderColor: colors.primary },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.white, padding: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.gray200,
  },
  footerPriceSummary: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  footerPriceLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  footerPrice: { fontSize: 16, fontWeight: '800', color: colors.text },
  bookBtn: {
    backgroundColor: colors.primary, borderRadius: radius.pill, height: 56,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  bookBtnText: { fontSize: 16, fontWeight: '800', color: colors.white },
});

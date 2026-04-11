/**
 * VehicleSelectScreen — Uber / Lyft / FREE NOW style ride category picker
 *
 * Shows all available ride categories with:
 *   - Real-time fare estimates for each category
 *   - ETA to driver
 *   - Surge indicator
 *   - Seat count
 *   - Vehicle description
 *
 * Navigation:
 *   BookRideScreen → VehicleSelectScreen → FareEstimateScreen (confirm) → ride created
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, ScrollView, StatusBar, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../theme';
import { ridesService } from '../services/rides';
import { useLanguage } from '../context/LanguageContext';

const BRAND_RED   = '#E31837';
const BLACK       = '#000000';
const WHITE       = '#FFFFFF';
const GRAY_BG     = '#F7F7F7';
const GRAY_BORDER = 'rgba(0,0,0,0.08)';

// Category metadata (icon, description, badge)
const CATEGORY_META = {
  moto:     { icon: '🏍️', badge: null,        sortOrder: 0 },
  benskin:  { icon: '🛵', badge: null,        sortOrder: 1 },
  standard: { icon: '🚗', badge: null,        sortOrder: 2 },
  xl:       { icon: '🚐', badge: null,        sortOrder: 3 },
  women:    { icon: '👩', badge: 'Women+',    sortOrder: 4 },
  luxury:   { icon: '🚙', badge: 'Premium',   sortOrder: 5 },
  taxi:     { icon: '🚕', badge: 'Licensed',  sortOrder: 6 },
  private:  { icon: '🏎️', badge: 'Private',   sortOrder: 7 },
  van:      { icon: '🚌', badge: 'Groups',    sortOrder: 8 },
};

function formatXAF(amount) {
  if (!amount && amount !== 0) return '–';
  return `${Math.round(amount).toLocaleString()} XAF`;
}

function formatETA(distKm) {
  const mins = Math.max(2, Math.round(distKm * 3));
  return `${mins} min`;
}

export default function VehicleSelectScreen({ navigation, route }) {
  const {
    pickup, dropoff, pickupCoords, dropoffCoords,
    pickupAddress, dropoffAddress, stops = [],
    isForOther, otherName, otherPhone, childSeat, childSeatCount,
    pickupInstructions, quietMode, acPreference, musicPreference,
    routePolyline,
  } = route.params || {};

  const { t } = useLanguage();
  const [fares,     setFares]     = useState({});
  const [loading,   setLoading]   = useState(true);
  const [selected,  setSelected]  = useState('standard');
  const [nearbyETA, setNearbyETA] = useState({});
  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  useEffect(() => {
    loadFares();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const loadFares = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ridesService.getFare({
        pickup_location:  pickupCoords,
        dropoff_location: dropoffCoords,
        ride_type:        'standard',
        stops,
      });
      setFares(res.fares || {});
      // Simulated per-type ETA based on mocked nearby driver distances
      const etaMock = {};
      Object.keys(res.fares || {}).forEach((type) => {
        etaMock[type] = Math.round(Math.random() * 4 + 2); // 2–6 min
      });
      setNearbyETA(etaMock);
    } catch (err) {
      console.warn('[VehicleSelect] Failed to load fares:', err?.message);
    } finally {
      setLoading(false);
    }
  }, [pickupCoords, dropoffCoords, stops]);

  const categories = Object.entries(fares)
    .map(([type, fareObj]) => ({ type, fareObj, ...(CATEGORY_META[type] || {}) }))
    .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));

  const selectedFare = fares[selected];

  const handleConfirm = () => {
    navigation.navigate('FareEstimate', {
      pickup:           pickupAddress,
      dropoff:          dropoffAddress,
      pickupCoords,
      dropoffCoords,
      rideType:         selected,
      estimate:         selectedFare ? {
        total:        selectedFare.total,
        baseFare:     selectedFare.base,
        serviceFee:   selectedFare.serviceFee,
        bookingFee:   selectedFare.bookingFee,
        distanceKm:   selectedFare.distance_km,
        durationMin:  selectedFare.duration_minutes,
        surgeMultiplier: selectedFare.surge_multiplier,
      } : null,
      stops, isForOther, otherName, otherPhone,
      childSeat, childSeatCount,
      pickupInstructions, quietMode, acPreference, musicPreference,
      routePolyline,
    });
  };

  const renderCategory = ({ item }) => {
    const { type, fareObj, icon, badge, sortOrder } = item;
    const isActive = selected === type;
    const surge    = fareObj?.surge_multiplier > 1;

    return (
      <TouchableOpacity
        style={[styles.categoryCard, isActive && styles.categoryCardActive]}
        onPress={() => setSelected(type)}
        activeOpacity={0.85}
      >
        {/* Left — icon + name */}
        <View style={styles.catLeft}>
          <Text style={styles.catIcon}>{icon}</Text>
          <View>
            <View style={styles.catNameRow}>
              <Text style={[styles.catName, isActive && styles.catNameActive]}>
                {fareObj?.label || type.charAt(0).toUpperCase() + type.slice(1)}
              </Text>
              {badge && (
                <View style={[styles.badge, isActive && styles.badgeActive]}>
                  <Text style={[styles.badgeText, isActive && styles.badgeTextActive]}>{badge}</Text>
                </View>
              )}
            </View>
            <Text style={styles.catSeats}>
              {fareObj?.seats > 0 ? `Up to ${fareObj.seats} seats` : 'Delivery'}
            </Text>
            {fareObj?.description && (
              <Text style={styles.catDesc}>{fareObj.description}</Text>
            )}
          </View>
        </View>

        {/* Right — fare + ETA */}
        <View style={styles.catRight}>
          {surge && (
            <View style={styles.surgePill}>
              <Ionicons name="flash" size={10} color={BRAND_RED} />
              <Text style={styles.surgeText}>{fareObj.surge_multiplier.toFixed(1)}x</Text>
            </View>
          )}
          <Text style={[styles.catFare, isActive && styles.catFareActive]}>
            {fareObj ? formatXAF(fareObj.total) : '–'}
          </Text>
          <Text style={styles.catETA}>
            {nearbyETA[type] ? `${nearbyETA[type]} min` : '–'}
          </Text>
        </View>

        {isActive && (
          <View style={styles.checkMark}>
            <Ionicons name="checkmark-circle" size={20} color={BRAND_RED} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={WHITE} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={BLACK} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Choose your ride</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {pickupAddress} → {dropoffAddress}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={BRAND_RED} />
          <Text style={styles.loadingText}>Getting prices…</Text>
        </View>
      ) : (
        <>
          <FlatList
            data={categories}
            keyExtractor={(item) => item.type}
            renderItem={renderCategory}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />

          {/* Bottom confirm bar */}
          <View style={styles.bottomBar}>
            {selectedFare && (
              <View style={styles.selectedSummary}>
                <Text style={styles.selectedLabel}>
                  {CATEGORY_META[selected]?.icon} {selectedFare.label || selected}
                </Text>
                <Text style={styles.selectedFare}>{formatXAF(selectedFare.total)}</Text>
              </View>
            )}
            <TouchableOpacity
              style={[styles.confirmBtn, !selectedFare && styles.confirmBtnDisabled]}
              onPress={handleConfirm}
              disabled={!selectedFare}
              activeOpacity={0.85}
            >
              <Text style={styles.confirmBtnText}>Confirm ride type</Text>
              <Ionicons name="arrow-forward" size={18} color={WHITE} />
            </TouchableOpacity>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:              { flex: 1, backgroundColor: WHITE },
  header:            { flexDirection: 'row', alignItems: 'center', px: 16, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: GRAY_BORDER },
  backBtn:           { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter:      { flex: 1, alignItems: 'center' },
  headerTitle:       { fontSize: 16, fontWeight: '700', color: BLACK },
  headerSub:         { fontSize: 11, color: 'rgba(0,0,0,0.45)', marginTop: 2, maxWidth: 220 },

  loadingBox:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText:       { fontSize: 14, color: 'rgba(0,0,0,0.45)' },

  list:              { paddingHorizontal: 16, paddingVertical: 8 },
  separator:         { height: 1, backgroundColor: GRAY_BORDER, marginHorizontal: 4 },

  categoryCard: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 12,
    borderRadius: 12, backgroundColor: WHITE,
    position: 'relative',
  },
  categoryCardActive: { backgroundColor: 'rgba(227,24,55,0.04)', borderWidth: 1.5, borderColor: BRAND_RED },

  catLeft:    { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  catIcon:    { fontSize: 32, marginTop: 2 },
  catNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  catName:    { fontSize: 15, fontWeight: '600', color: BLACK },
  catNameActive: { color: BRAND_RED },
  catSeats:   { fontSize: 11, color: 'rgba(0,0,0,0.45)', marginTop: 1 },
  catDesc:    { fontSize: 11, color: 'rgba(0,0,0,0.45)', marginTop: 2, maxWidth: 180 },

  badge:      { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 20, backgroundColor: GRAY_BG },
  badgeActive: { backgroundColor: BRAND_RED },
  badgeText:   { fontSize: 9, fontWeight: '700', color: 'rgba(0,0,0,0.5)', textTransform: 'uppercase', letterSpacing: 0.3 },
  badgeTextActive: { color: WHITE },

  catRight:   { alignItems: 'flex-end', minWidth: 80 },
  catFare:    { fontSize: 15, fontWeight: '700', color: BLACK },
  catFareActive: { color: BRAND_RED },
  catETA:     { fontSize: 11, color: 'rgba(0,0,0,0.45)', marginTop: 2 },
  checkMark:  { position: 'absolute', top: 10, right: 10 },

  surgePill:  { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(227,24,55,0.08)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 20, marginBottom: 3 },
  surgeText:  { fontSize: 10, fontWeight: '700', color: BRAND_RED },

  bottomBar: {
    borderTopWidth: 1, borderTopColor: GRAY_BORDER,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16,
    backgroundColor: WHITE,
  },
  selectedSummary: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginBottom: 10, paddingHorizontal: 4,
  },
  selectedLabel:    { fontSize: 14, fontWeight: '600', color: BLACK },
  selectedFare:     { fontSize: 14, fontWeight: '700', color: BRAND_RED },

  confirmBtn: {
    backgroundColor: BRAND_RED, borderRadius: 50,
    paddingVertical: 15, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  confirmBtnDisabled: { backgroundColor: 'rgba(0,0,0,0.15)' },
  confirmBtnText:     { color: WHITE, fontSize: 15, fontWeight: '800' },
});

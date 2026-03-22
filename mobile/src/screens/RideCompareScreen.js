/**
 * Feature 26 — Ride Type Comparison Screen
 * Side-by-side comparison of all available ride types with live fare estimates.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, StatusBar, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius, shadows } from '../theme';
import { ridesService } from '../services/rides';

const { width } = Dimensions.get('window');

const RIDE_CATALOG = [
  {
    id: 'standard', label: 'Standard', icon: 'car-outline',
    description: '4-seater · Affordable everyday rides', capacity: 4,
    features: ['AC', 'Music'],
  },
  {
    id: 'comfort', label: 'Comfort', icon: 'car-sport-outline',
    description: 'Newer cars · Quieter, roomier ride', capacity: 4,
    features: ['AC', 'Quiet mode', 'Extra legroom'],
  },
  {
    id: 'luxury', label: 'Luxury', icon: 'diamond-outline',
    description: 'Premium vehicles · Top-rated drivers', capacity: 4,
    features: ['AC', 'Premium audio', 'Water', 'Wi-Fi'],
  },
  {
    id: 'shared', label: 'Shared', icon: 'people-outline',
    description: 'Share the ride · Split the cost', capacity: 3,
    features: ['Budget-friendly', 'Eco-friendly'],
  },
  {
    id: 'wav', label: 'Accessible', icon: 'accessibility-outline',
    description: 'Wheelchair accessible vehicles', capacity: 2,
    features: ['WAV certified', 'Ramp/lift'],
  },
  {
    id: 'ev', label: 'Green', icon: 'leaf-outline',
    description: 'Electric vehicles only · Zero emissions', capacity: 4,
    features: ['EV', 'Zero emissions', 'Quiet'],
  },
  {
    id: 'delivery', label: 'Delivery', icon: 'cube-outline',
    description: 'Send packages · Up to 20 kg', capacity: 0,
    features: ['Real-time tracking', 'OTP verification'],
  },
  {
    id: 'rental', label: 'Hourly Rental', icon: 'time-outline',
    description: 'Keep the car for hours', capacity: 4,
    features: ['1–8 hours', 'Km allowance included'],
    fixedPrice: 'From 8,000 XAF/hr',
  },
  {
    id: 'outstation', label: 'Outstation', icon: 'map-outline',
    description: 'Intercity trips · Long distance', capacity: 4,
    features: ['AC', 'Intercity', 'Fuel included'],
    fixedPrice: 'From 25,000 XAF',
  },
  {
    id: 'moto', label: 'Benskin', icon: 'bicycle-outline',
    description: 'Motorcycle taxi · Fastest in traffic', capacity: 1,
    features: ['Helmet provided', 'Beat traffic', 'Cash/Mobile Money'],
  },
  {
    id: 'xl', label: 'XL Group', icon: 'bus-outline',
    description: 'SUV/Minivan · Up to 7 passengers', capacity: 7,
    features: ['AC', 'Extra luggage', 'Family/Group'],
  },
];

const ETA_MAP = {
  standard: 3, comfort: 5, luxury: 8, shared: 4,
  wav: 8, ev: 6, delivery: 6, rental: 5, outstation: 20,
  moto: 2, xl: 6,
};

export default function RideCompareScreen({ navigation, route }) {
  const { colors } = useTheme();
  const s = makeStyles(colors);

  const { pickup, dropoff, initialRideType = 'standard' } = route.params || {};
  const [selected, setSelected] = useState(initialRideType);
  const [estimates, setEstimates] = useState({});
  const [loading, setLoading] = useState(true);

  const fetchEstimates = useCallback(async () => {
    if (!pickup || !dropoff) { setLoading(false); return; }
    setLoading(true);
    try {
      // Single call now returns fares for all ride types
      const estimate = await ridesService.getFareEstimate(pickup, dropoff, 'standard');
      if (estimate.faresPerType) {
        // Backend returned per-type breakdown in one shot — use it
        const map = {};
        Object.entries(estimate.faresPerType).forEach(([type, f]) => {
          map[type] = {
            ...estimate,
            total: f.total,
            baseFare: f.base,
            bookingFee: f.bookingFee,
            serviceFee: f.serviceFee,
          };
        });
        setEstimates(map);
      } else {
        // Fallback: parallel calls per type
        const billableTypes = ['standard', 'moto', 'xl', 'delivery'];
        const results = await Promise.allSettled(
          billableTypes.map((t) => ridesService.getFareEstimate(pickup, dropoff, t))
        );
        const map = { standard: estimate }; // already have standard
        billableTypes.forEach((t, i) => {
          if (t !== 'standard' && results[i].status === 'fulfilled') map[t] = results[i].value;
        });
        setEstimates(map);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [pickup, dropoff]);

  useEffect(() => { fetchEstimates(); }, [fetchEstimates]);

  const handleBook = () => {
    const type = RIDE_CATALOG.find((r) => r.id === selected);
    if (!type) return;

    if (selected === 'delivery') { navigation.navigate('DeliveryBooking'); return; }
    if (selected === 'rental')   { navigation.navigate('RentalRide', { pickup }); return; }
    if (selected === 'outstation') { navigation.navigate('OutstationRide'); return; }

    navigation.navigate('BookRide', {
      initialRideType: selected,
      ...(dropoff ? { dropoff } : {}),
    });
  };

  const renderItem = ({ item }) => {
    const isSelected = item.id === selected;
    const est = estimates[item.id];
    const total = est?.total ?? null;
    const eta = ETA_MAP[item.id] ?? '–';

    return (
      <TouchableOpacity
        style={[s.card, isSelected && s.cardSelected]}
        onPress={() => setSelected(item.id)}
        activeOpacity={0.85}
      >
        {/* Left: icon + info */}
        <View style={[s.cardIcon, { backgroundColor: isSelected ? colors.primary + '18' : colors.gray100 }]}>
          <Ionicons name={item.icon} size={26} color={isSelected ? colors.primary : colors.gray500} />
        </View>

        <View style={s.cardBody}>
          <View style={s.cardTitleRow}>
            <Text style={[s.cardTitle, isSelected && { color: colors.primary }]}>{item.label}</Text>
            {item.capacity > 0 && (
              <View style={s.capacityChip}>
                <Ionicons name="people-outline" size={11} color={colors.textSecondary} />
                <Text style={s.capacityText}>{item.capacity}</Text>
              </View>
            )}
          </View>
          <Text style={s.cardDesc} numberOfLines={1}>{item.description}</Text>
          <View style={s.featureRow}>
            {item.features.slice(0, 3).map((f) => (
              <View key={f} style={s.featureTag}>
                <Text style={s.featureTagText}>{f}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Right: price + ETA */}
        <View style={s.cardRight}>
          {loading && !item.fixedPrice ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={[s.cardPrice, isSelected && { color: colors.primary }]}>
              {item.fixedPrice ?? (total ? `${total.toLocaleString()} XAF` : '–')}
            </Text>
          )}
          <View style={s.etaChip}>
            <Ionicons name="time-outline" size={11} color={colors.textSecondary} />
            <Text style={s.etaText}>{eta} min</Text>
          </View>
        </View>

        {isSelected && (
          <View style={s.selectedDot}>
            <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const selectedType = RIDE_CATALOG.find((r) => r.id === selected);
  const selectedEst = estimates[selected];
  const bookLabel = selectedEst?.total
    ? `Book ${selectedType?.label} · ${selectedEst.total.toLocaleString()} XAF`
    : selectedType?.fixedPrice
      ? `Book ${selectedType?.label} · ${selectedType.fixedPrice}`
      : `Book ${selectedType?.label}`;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <StatusBar barStyle={colors.text === '#FFFFFF' ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={s.headerTitle}>Choose a ride</Text>
          {pickup && dropoff && (
            <Text style={s.headerSub} numberOfLines={1}>
              {typeof pickup === 'string' ? pickup : pickup.name || 'Pickup'} → {typeof dropoff === 'string' ? dropoff : dropoff.name || 'Dropoff'}
            </Text>
          )}
        </View>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={RIDE_CATALOG}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={s.separator} />}
      />

      {/* Bottom book button */}
      <View style={s.footer}>
        <TouchableOpacity style={s.bookBtn} onPress={handleBook} activeOpacity={0.88}>
          <Text style={s.bookBtnText} numberOfLines={1}>{bookLabel}</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: spacing.md, paddingVertical: spacing.md,
      backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray200,
    },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
    headerSub: { fontSize: 11, color: colors.textSecondary, marginTop: 1, maxWidth: width * 0.55 },

    list: { padding: spacing.md, paddingBottom: 120 },
    separator: { height: spacing.sm },

    card: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md,
      borderWidth: 1.5, borderColor: 'transparent', ...shadows.sm,
    },
    cardSelected: { borderColor: colors.primary, backgroundColor: colors.white },
    cardIcon: {
      width: 52, height: 52, borderRadius: radius.md,
      alignItems: 'center', justifyContent: 'center',
    },
    cardBody: { flex: 1 },
    cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 2 },
    cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
    capacityChip: {
      flexDirection: 'row', alignItems: 'center', gap: 2,
      backgroundColor: colors.gray100, borderRadius: 8,
      paddingHorizontal: 5, paddingVertical: 2,
    },
    capacityText: { fontSize: 10, color: colors.textSecondary, fontWeight: '600' },
    cardDesc: { fontSize: 12, color: colors.textSecondary, marginBottom: 6 },
    featureRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    featureTag: {
      backgroundColor: colors.gray100, borderRadius: 6,
      paddingHorizontal: 6, paddingVertical: 2,
    },
    featureTagText: { fontSize: 10, color: colors.textSecondary, fontWeight: '500' },

    cardRight: { alignItems: 'flex-end', gap: 4, minWidth: 80 },
    cardPrice: { fontSize: 14, fontWeight: '800', color: colors.text, textAlign: 'right' },
    etaChip: {
      flexDirection: 'row', alignItems: 'center', gap: 3,
      backgroundColor: colors.gray100, borderRadius: 8,
      paddingHorizontal: 6, paddingVertical: 3,
    },
    etaText: { fontSize: 10, color: colors.textSecondary, fontWeight: '600' },

    selectedDot: { position: 'absolute', top: spacing.sm, right: spacing.sm },

    footer: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      padding: spacing.md, paddingBottom: spacing.lg,
      backgroundColor: colors.white,
      borderTopWidth: 1, borderTopColor: colors.gray200,
    },
    bookBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
      backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: 16,
      ...shadows.sm,
    },
    bookBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  });
}

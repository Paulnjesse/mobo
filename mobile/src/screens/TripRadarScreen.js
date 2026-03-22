/**
 * Feature 37 — Trip Radar for Drivers
 * Shows upcoming available ride requests nearby so drivers can
 * pre-position themselves before completing the current trip.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  StatusBar, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius, shadows } from '../theme';
import api from '../services/api';

const RIDE_TYPE_ICONS = {
  standard: 'car-outline', comfort: 'car-sport-outline', luxury: 'diamond-outline',
  shared: 'people-outline', moto: 'bicycle-outline', xl: 'bus-outline',
  delivery: 'cube-outline', ev: 'leaf-outline', wav: 'accessibility-outline',
};

function fmtFare(f) {
  return Number(f).toLocaleString() + ' XAF';
}

const MOCK_RADAR = [
  { id: 'r1', ride_type: 'standard', pickup_address: 'Mokolo Market, Yaoundé', dropoff_address: 'Bastos, Yaoundé', estimated_fare: 2800, distance_km: 4.2, wait_min: 3, surge: 1.2 },
  { id: 'r2', ride_type: 'comfort',  pickup_address: 'Hippodrome, Yaoundé',   dropoff_address: 'Nsimalen Airport',   estimated_fare: 8500, distance_km: 22.1, wait_min: 6, surge: 1.0 },
  { id: 'r3', ride_type: 'xl',       pickup_address: 'Carrefour Warda',        dropoff_address: 'Mvan, Yaoundé',      estimated_fare: 4200, distance_km: 5.8, wait_min: 2, surge: 1.5 },
  { id: 'r4', ride_type: 'moto',     pickup_address: 'Mvog-Mbi, Yaoundé',      dropoff_address: 'Centre-Ville',       estimated_fare: 700,  distance_km: 2.1, wait_min: 1, surge: 1.0 },
];

export default function TripRadarScreen({ navigation }) {
  const { colors } = useTheme();
  const s = makeStyles(colors);

  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadRadar = useCallback(async () => {
    try {
      const res = await api.get('/rides/driver/radar');
      setRides(res.data?.rides || MOCK_RADAR);
    } catch {
      setRides(MOCK_RADAR);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadRadar(); }, [loadRadar]);

  // Auto-refresh every 30s
  useEffect(() => {
    const timer = setInterval(loadRadar, 30000);
    return () => clearInterval(timer);
  }, [loadRadar]);

  const renderRide = ({ item, index }) => {
    const icon = RIDE_TYPE_ICONS[item.ride_type] || 'car-outline';
    const isSurge = item.surge > 1;
    return (
      <View style={s.card}>
        <View style={s.cardTop}>
          <View style={[s.typeIcon, { backgroundColor: colors.primary + '15' }]}>
            <Ionicons name={icon} size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={s.cardTitleRow}>
              <Text style={s.cardType}>{item.ride_type.charAt(0).toUpperCase() + item.ride_type.slice(1)}</Text>
              {isSurge && (
                <View style={s.surgeBadge}>
                  <Ionicons name="flash" size={10} color="#fff" />
                  <Text style={s.surgeText}>{item.surge}x</Text>
                </View>
              )}
            </View>
            <Text style={s.distance}>{item.distance_km} km · ready in ~{item.wait_min} min</Text>
          </View>
          <Text style={[s.fare, { color: isSurge ? '#FF6B00' : colors.primary }]}>{fmtFare(item.estimated_fare)}</Text>
        </View>

        <View style={s.route}>
          <View style={s.routeDots}>
            <View style={[s.dotGreen]} />
            <View style={s.routeLine} />
            <View style={[s.dotRed]} />
          </View>
          <View style={{ flex: 1, gap: 8 }}>
            <Text style={s.routeText} numberOfLines={1}>{item.pickup_address}</Text>
            <Text style={s.routeText} numberOfLines={1}>{item.dropoff_address}</Text>
          </View>
        </View>

        <View style={s.cardFooter}>
          <Text style={s.radarRank}>#{index + 1} nearby</Text>
          <TouchableOpacity
            style={[s.previewBtn, { borderColor: colors.primary }]}
            onPress={() => navigation.navigate('DriverHome')}
          >
            <Text style={[s.previewBtnText, { color: colors.primary }]}>Pre-Position</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <StatusBar barStyle={colors.text === '#FFFFFF' ? 'light-content' : 'dark-content'} />
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={s.headerTitle}>Trip Radar</Text>
          <Text style={s.headerSub}>Upcoming rides near you</Text>
        </View>
        <TouchableOpacity style={s.backBtn} onPress={() => { setRefreshing(true); loadRadar(); }}>
          <Ionicons name="refresh-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={s.infoBar}>
        <Ionicons name="information-circle-outline" size={14} color={colors.textSecondary} />
        <Text style={s.infoText}>Pre-position near high-demand zones to reduce wait time between trips.</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} />
      ) : (
        <FlatList
          data={rides}
          keyExtractor={(item) => item.id}
          renderItem={renderRide}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadRadar(); }} colors={[colors.primary]} />}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="radio-outline" size={48} color={colors.gray300} />
              <Text style={[s.emptyText, { color: colors.textSecondary }]}>No rides on radar right now.</Text>
              <Text style={[s.emptySubText, { color: colors.gray400 }]}>Pull to refresh or move to a demand zone.</Text>
            </View>
          }
        />
      )}
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
    headerSub: { fontSize: 11, color: colors.textSecondary },
    infoBar: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
      backgroundColor: colors.gray100, paddingHorizontal: spacing.md, paddingVertical: 8,
    },
    infoText: { fontSize: 11, color: colors.textSecondary, flex: 1 },
    list: { padding: spacing.md, gap: spacing.sm },
    card: {
      backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md,
      ...shadows.sm,
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
    typeIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    cardType: { fontSize: 15, fontWeight: '700', color: colors.text },
    surgeBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 2,
      backgroundColor: '#FF6B00', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2,
    },
    surgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
    distance: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    fare: { fontSize: 16, fontWeight: '900' },
    route: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm, marginBottom: spacing.sm },
    routeDots: { alignItems: 'center', paddingTop: 2 },
    dotGreen: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
    routeLine: { width: 2, flex: 1, backgroundColor: colors.gray200, marginVertical: 2 },
    dotRed: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
    routeText: { fontSize: 13, color: colors.text, fontWeight: '500' },
    cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs },
    radarRank: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
    previewBtn: {
      borderWidth: 1.5, borderRadius: radius.pill,
      paddingHorizontal: 14, paddingVertical: 6,
    },
    previewBtnText: { fontSize: 12, fontWeight: '700' },
    empty: { alignItems: 'center', paddingTop: 80, gap: spacing.sm },
    emptyText: { fontSize: 15, fontWeight: '600' },
    emptySubText: { fontSize: 12, textAlign: 'center' },
  });
}

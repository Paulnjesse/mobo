/**
 * Feature 46 — Vehicle Maintenance Tracker
 * Tracks mileage, service intervals, and upcoming maintenance reminders.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius, shadows } from '../theme';
import api from '../services/api';

const SERVICE_ITEMS = [
  { key: 'oil_change', label: 'Oil Change', icon: 'water-outline', interval_km: 5000, color: '#FF6B00' },
  { key: 'tire_rotation', label: 'Tire Rotation', icon: 'reload-circle-outline', interval_km: 10000, color: '#0077CC' },
  { key: 'brake_inspection', label: 'Brake Inspection', icon: 'alert-circle-outline', interval_km: 20000, color: '#CC0000' },
  { key: 'air_filter', label: 'Air Filter', icon: 'cloudy-outline', interval_km: 15000, color: '#00A651' },
  { key: 'transmission', label: 'Transmission Service', icon: 'settings-outline', interval_km: 50000, color: '#9B59B6' },
  { key: 'full_service', label: 'Full Service', icon: 'build-outline', interval_km: 25000, color: '#E74C3C' },
];

const MOCK_MAINTENANCE = {
  vehicle_make: 'Toyota',
  vehicle_model: 'Corolla',
  plate: 'LT-2847-A',
  current_mileage_km: 87420,
  trip_mileage_km: 34200, // mileage accumulated on MOBO trips
  items: [
    { key: 'oil_change', last_service_km: 84500, next_service_km: 89500 },
    { key: 'tire_rotation', last_service_km: 80000, next_service_km: 90000 },
    { key: 'brake_inspection', last_service_km: 70000, next_service_km: 90000 },
    { key: 'air_filter', last_service_km: 75000, next_service_km: 90000 },
    { key: 'transmission', last_service_km: 50000, next_service_km: 100000 },
    { key: 'full_service', last_service_km: 75000, next_service_km: 100000 },
  ],
  partner_garages: [
    { name: 'Auto Service Yaoundé', address: 'Bastos, Yaoundé', phone: '677001234', discount_pct: 15 },
    { name: 'Mécanique Express', address: 'Hippodrome, Yaoundé', phone: '699887766', discount_pct: 10 },
  ],
};

function urgencyLevel(current, next) {
  const remaining = next - current;
  if (remaining <= 0) return 'overdue';
  if (remaining <= 500) return 'urgent';
  if (remaining <= 2000) return 'soon';
  return 'ok';
}

const URGENCY_COLORS = { overdue: '#CC0000', urgent: '#FF6B00', soon: '#F39C12', ok: '#00A651' };
const URGENCY_LABELS = { overdue: 'OVERDUE', urgent: 'Due Soon', soon: 'Upcoming', ok: 'Good' };

export default function MaintenanceTrackerScreen({ navigation }) {
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/drivers/me/maintenance');
        setData(res.data || MOCK_MAINTENANCE);
      } catch {
        setData(MOCK_MAINTENANCE);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const logService = (key) => {
    Alert.alert('Log Service', `Mark ${SERVICE_ITEMS.find((s) => s.key === key)?.label} as completed today?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark Complete', onPress: async () => {
          try {
            await api.post('/drivers/me/maintenance/log', { service_key: key, mileage_km: data.current_mileage_km });
          } catch {}
          const def = SERVICE_ITEMS.find((s) => s.key === key);
          setData((prev) => ({
            ...prev,
            items: prev.items.map((item) =>
              item.key === key
                ? { ...item, last_service_km: prev.current_mileage_km, next_service_km: prev.current_mileage_km + def.interval_km }
                : item
            ),
          }));
        },
      },
    ]);
  };

  if (loading) return <SafeAreaView style={s.root} edges={['top']}><ActivityIndicator style={{ marginTop: 80 }} color={colors.primary} /></SafeAreaView>;

  const urgentCount = data.items.filter((item) => {
    const level = urgencyLevel(data.current_mileage_km, item.next_service_km);
    return level === 'overdue' || level === 'urgent';
  }).length;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <StatusBar barStyle={colors.text === '#FFFFFF' ? 'light-content' : 'dark-content'} />

      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Maintenance Tracker</Text>
        <View style={s.backBtn} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Vehicle summary */}
        <View style={s.vehicleCard}>
          <View style={[s.vehicleIcon, { backgroundColor: colors.primary + '15' }]}>
            <Ionicons name="car-sport-outline" size={28} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.vehicleName}>{data.vehicle_make} {data.vehicle_model}</Text>
            <Text style={s.vehiclePlate}>{data.plate}</Text>
            <Text style={s.vehicleMileage}>{Number(data.current_mileage_km).toLocaleString()} km total · {Number(data.trip_mileage_km).toLocaleString()} km on MOBO</Text>
          </View>
          {urgentCount > 0 && (
            <View style={s.urgentBadge}>
              <Text style={s.urgentBadgeText}>{urgentCount} alert{urgentCount > 1 ? 's' : ''}</Text>
            </View>
          )}
        </View>

        {/* Service items */}
        <Text style={s.sectionTitle}>Service Schedule</Text>
        {data.items.map((item) => {
          const def = SERVICE_ITEMS.find((s) => s.key === item.key);
          if (!def) return null;
          const level = urgencyLevel(data.current_mileage_km, item.next_service_km);
          const remaining = item.next_service_km - data.current_mileage_km;
          const progress = Math.max(0, Math.min(1, (data.current_mileage_km - item.last_service_km) / def.interval_km));

          return (
            <View key={item.key} style={s.serviceCard}>
              <View style={[s.serviceIcon, { backgroundColor: def.color + '15' }]}>
                <Ionicons name={def.icon} size={20} color={def.color} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Text style={s.serviceLabel}>{def.label}</Text>
                  <View style={[s.urgencyBadge, { backgroundColor: URGENCY_COLORS[level] + '20' }]}>
                    <Text style={[s.urgencyText, { color: URGENCY_COLORS[level] }]}>{URGENCY_LABELS[level]}</Text>
                  </View>
                </View>
                <View style={s.progressBg}>
                  <View style={[s.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: URGENCY_COLORS[level] }]} />
                </View>
                <Text style={s.serviceDetail}>
                  {remaining > 0 ? `${Number(remaining).toLocaleString()} km remaining` : `${Number(Math.abs(remaining)).toLocaleString()} km overdue`}
                  {' · Next at '}{Number(item.next_service_km).toLocaleString()} km
                </Text>
              </View>
              <TouchableOpacity style={[s.logBtn, { borderColor: def.color }]} onPress={() => logService(item.key)}>
                <Text style={[s.logBtnText, { color: def.color }]}>Log</Text>
              </TouchableOpacity>
            </View>
          );
        })}

        {/* Partner garages */}
        <Text style={s.sectionTitle}>Partner Garages</Text>
        {data.partner_garages.map((g, i) => (
          <View key={i} style={s.garageCard}>
            <View style={[s.garageIcon, { backgroundColor: colors.primary + '15' }]}>
              <Ionicons name="build-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.garageName}>{g.name}</Text>
              <Text style={s.garageAddr}>{g.address}</Text>
              <Text style={[s.garageDiscount, { color: '#00A651' }]}>{g.discount_pct}% MOBO driver discount</Text>
            </View>
            <TouchableOpacity
              style={[s.callGarageBtn, { backgroundColor: colors.primary }]}
              onPress={() => { /* Linking.openURL('tel:' + g.phone) */ }}
            >
              <Ionicons name="call-outline" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        ))}

        <View style={{ height: spacing.xl }} />
      </ScrollView>
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
    vehicleCard: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      margin: spacing.md, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, ...shadows.sm,
    },
    vehicleIcon: { width: 56, height: 56, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
    vehicleName: { fontSize: 15, fontWeight: '800', color: colors.text },
    vehiclePlate: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    vehicleMileage: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
    urgentBadge: { backgroundColor: '#CC0000', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    urgentBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
    sectionTitle: { fontSize: 14, fontWeight: '800', color: colors.text, marginHorizontal: spacing.md, marginBottom: spacing.sm },
    serviceCard: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      marginHorizontal: spacing.md, marginBottom: spacing.xs,
      backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, ...shadows.sm,
    },
    serviceIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    serviceLabel: { fontSize: 13, fontWeight: '700', color: colors.text },
    urgencyBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
    urgencyText: { fontSize: 9, fontWeight: '800' },
    progressBg: { height: 5, backgroundColor: colors.gray200, borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
    progressFill: { height: 5, borderRadius: 3 },
    serviceDetail: { fontSize: 11, color: colors.textSecondary },
    logBtn: { borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
    logBtnText: { fontSize: 11, fontWeight: '700' },
    garageCard: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      marginHorizontal: spacing.md, marginBottom: spacing.xs,
      backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, ...shadows.sm,
    },
    garageIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    garageName: { fontSize: 13, fontWeight: '700', color: colors.text },
    garageAddr: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
    garageDiscount: { fontSize: 11, fontWeight: '600', marginTop: 2 },
    callGarageBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  });
}

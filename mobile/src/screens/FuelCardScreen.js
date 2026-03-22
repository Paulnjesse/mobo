/**
 * Feature 45 — Fuel Card / Savings for Drivers
 * Shows fuel card balance, partner stations, transactions, and discount rate by tier.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, ActivityIndicator, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius, shadows } from '../theme';
import api from '../services/api';

const MOCK_FUEL = {
  card_number: 'MOBO-FC-4821',
  balance_xaf: 18500,
  discount_pct: 10, // Gold tier
  total_saved_xaf: 47200,
  transactions: [
    { id: 't1', station: 'Total Energies — Bastos', liters: 25, amount: 28750, discount: 3194, date: '2026-03-20' },
    { id: 't2', station: 'Tradex — Hippodrome', liters: 18, amount: 20700, discount: 2300, date: '2026-03-17' },
    { id: 't3', station: 'Total Energies — Nlongkak', liters: 30, amount: 34500, discount: 3833, date: '2026-03-12' },
  ],
  partner_stations: [
    { name: 'Total Energies', locations: 12, logo_color: '#E31837' },
    { name: 'Tradex', locations: 8, logo_color: '#003087' },
    { name: 'Camair Oil', locations: 5, logo_color: '#00A651' },
  ],
};

export default function FuelCardScreen({ navigation }) {
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/drivers/me/fuel-card');
        setData(res.data || MOCK_FUEL);
      } catch {
        setData(MOCK_FUEL);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <SafeAreaView style={s.root} edges={['top']}><ActivityIndicator style={{ marginTop: 80 }} color={colors.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <StatusBar barStyle={colors.text === '#FFFFFF' ? 'light-content' : 'dark-content'} />

      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Fuel Card</Text>
        <View style={s.backBtn} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Card visual */}
        <LinearGradient colors={['#1A1A2E', '#16213E']} style={s.cardVisual} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <View style={s.cardTopRow}>
            <Ionicons name="flash" size={22} color="#FFD700" />
            <Text style={s.cardBrand}>MOBO Fuel Card</Text>
            <Text style={s.discountBadge}>{data.discount_pct}% OFF</Text>
          </View>
          <Text style={s.cardBalance}>{Number(data.balance_xaf).toLocaleString()} XAF</Text>
          <Text style={s.cardBalanceLabel}>Available Balance</Text>
          <View style={s.cardBottomRow}>
            <Text style={s.cardNumber}>{data.card_number}</Text>
            <View style={s.cardChip} />
          </View>
        </LinearGradient>

        {/* Savings stat */}
        <View style={s.savingsRow}>
          <View style={s.savingsStat}>
            <Ionicons name="trending-down-outline" size={20} color="#00A651" />
            <Text style={s.savingsVal}>{Number(data.total_saved_xaf).toLocaleString()} XAF</Text>
            <Text style={s.savingsLabel}>Total Saved</Text>
          </View>
          <View style={[s.savingsDivider, { backgroundColor: colors.gray200 }]} />
          <View style={s.savingsStat}>
            <Ionicons name="pricetag-outline" size={20} color="#FF6B00" />
            <Text style={s.savingsVal}>{data.discount_pct}%</Text>
            <Text style={s.savingsLabel}>Your Discount</Text>
          </View>
          <View style={[s.savingsDivider, { backgroundColor: colors.gray200 }]} />
          <View style={s.savingsStat}>
            <Ionicons name="location-outline" size={20} color="#0077CC" />
            <Text style={s.savingsVal}>25</Text>
            <Text style={s.savingsLabel}>Partner Stations</Text>
          </View>
        </View>

        {/* Partner stations */}
        <Text style={s.sectionTitle}>Partner Stations</Text>
        {data.partner_stations.map((station, i) => (
          <View key={i} style={s.stationRow}>
            <View style={[s.stationLogo, { backgroundColor: station.logo_color + '20' }]}>
              <Ionicons name="flash-outline" size={18} color={station.logo_color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.stationName}>{station.name}</Text>
              <Text style={s.stationCount}>{station.locations} locations near you</Text>
            </View>
            <TouchableOpacity style={[s.findBtn, { borderColor: colors.primary }]}>
              <Text style={[s.findBtnText, { color: colors.primary }]}>Find</Text>
            </TouchableOpacity>
          </View>
        ))}

        {/* Recent transactions */}
        <Text style={s.sectionTitle}>Recent Transactions</Text>
        {data.transactions.map((tx) => (
          <View key={tx.id} style={s.txRow}>
            <View style={[s.txIcon, { backgroundColor: colors.primary + '15' }]}>
              <Ionicons name="car-outline" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.txStation}>{tx.station}</Text>
              <Text style={s.txDate}>{tx.date} · {tx.liters}L</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.txAmount}>{Number(tx.amount).toLocaleString()} XAF</Text>
              <Text style={s.txSaved}>-{Number(tx.discount).toLocaleString()} saved</Text>
            </View>
          </View>
        ))}

        {/* Tier info */}
        <View style={s.tierInfo}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
          <Text style={s.tierInfoText}>Discount rates: Bronze 5% · Gold 10% · Platinum 15% · Diamond 20%. Upgrade your tier to unlock higher savings.</Text>
        </View>

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
    cardVisual: { margin: spacing.md, borderRadius: radius.xl, padding: spacing.lg, ...shadows.lg },
    cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.md },
    cardBrand: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.8)', flex: 1 },
    discountBadge: { fontSize: 11, fontWeight: '900', color: '#FFD700', backgroundColor: 'rgba(255,215,0,0.15)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    cardBalance: { fontSize: 32, fontWeight: '900', color: '#fff' },
    cardBalanceLabel: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: spacing.lg },
    cardBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardNumber: { fontSize: 13, color: 'rgba(255,255,255,0.7)', letterSpacing: 1 },
    cardChip: { width: 32, height: 24, borderRadius: 4, backgroundColor: '#FFD700' },
    savingsRow: {
      flexDirection: 'row', alignItems: 'center',
      marginHorizontal: spacing.md, marginBottom: spacing.md,
      backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, ...shadows.sm,
    },
    savingsStat: { flex: 1, alignItems: 'center', gap: 4 },
    savingsVal: { fontSize: 15, fontWeight: '800', color: colors.text },
    savingsLabel: { fontSize: 10, color: colors.textSecondary },
    savingsDivider: { width: 1, height: 36 },
    sectionTitle: { fontSize: 14, fontWeight: '800', color: colors.text, marginHorizontal: spacing.md, marginBottom: spacing.sm },
    stationRow: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      marginHorizontal: spacing.md, marginBottom: spacing.xs,
      backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, ...shadows.sm,
    },
    stationLogo: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    stationName: { fontSize: 13, fontWeight: '700', color: colors.text },
    stationCount: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
    findBtn: { borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 },
    findBtnText: { fontSize: 12, fontWeight: '700' },
    txRow: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      marginHorizontal: spacing.md, marginBottom: spacing.xs,
      backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, ...shadows.sm,
    },
    txIcon: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    txStation: { fontSize: 13, fontWeight: '600', color: colors.text },
    txDate: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
    txAmount: { fontSize: 13, fontWeight: '700', color: colors.text },
    txSaved: { fontSize: 11, color: '#00A651', fontWeight: '600', marginTop: 2 },
    tierInfo: {
      flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs,
      margin: spacing.md, backgroundColor: colors.gray100, borderRadius: radius.md, padding: spacing.sm,
    },
    tierInfoText: { fontSize: 11, color: colors.textSecondary, flex: 1, lineHeight: 16 },
  });
}

/**
 * Feature 44 — Driver Earnings Guarantee (minimum XAF/hr program)
 * Shows current guarantee window, earnings vs guarantee, and top-up status.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius, shadows } from '../theme';
import api from '../services/api';

const MOCK_GUARANTEE = {
  active: true,
  guarantee_xaf_per_hr: 2500,
  window_start: '2026-03-21T06:00:00Z',
  window_end: '2026-03-21T22:00:00Z',
  hours_online: 4.5,
  actual_earnings: 9800,
  guaranteed_earnings: 11250, // 4.5 * 2500
  topup_owed: 1450,
  topup_paid: false,
  history: [
    { date: '2026-03-20', hours: 8.2, actual: 23400, guarantee: 20500, topup: 0, paid: true },
    { date: '2026-03-19', hours: 6.0, actual: 12600, guarantee: 15000, topup: 2400, paid: true },
    { date: '2026-03-18', hours: 9.1, actual: 27300, guarantee: 22750, topup: 0, paid: true },
  ],
};

export default function EarningsGuaranteeScreen({ navigation }) {
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/drivers/me/guarantee');
        setData(res.data || MOCK_GUARANTEE);
      } catch {
        setData(MOCK_GUARANTEE);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <SafeAreaView style={s.root} edges={['top']}><ActivityIndicator style={{ marginTop: 80 }} color={colors.primary} /></SafeAreaView>;

  const pct = data.actual_earnings / data.guaranteed_earnings;
  const onTarget = pct >= 1;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <StatusBar barStyle={colors.text === '#FFFFFF' ? 'light-content' : 'dark-content'} />

      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Earnings Guarantee</Text>
        <View style={s.backBtn} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Current window card */}
        <LinearGradient
          colors={onTarget ? ['#00A651', '#007A3A'] : ['#FF6B00', '#CC4400']}
          style={s.heroCard}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        >
          <Text style={s.heroLabel}>Today's Guarantee</Text>
          <Text style={s.heroRate}>{Number(data.guarantee_xaf_per_hr).toLocaleString()} XAF/hr</Text>

          <View style={s.heroStats}>
            <View style={s.heroStat}>
              <Text style={s.heroStatVal}>{data.hours_online}h</Text>
              <Text style={s.heroStatLabel}>Online</Text>
            </View>
            <View style={s.heroStatDiv} />
            <View style={s.heroStat}>
              <Text style={s.heroStatVal}>{Number(data.actual_earnings).toLocaleString()}</Text>
              <Text style={s.heroStatLabel}>Earned (XAF)</Text>
            </View>
            <View style={s.heroStatDiv} />
            <View style={s.heroStat}>
              <Text style={s.heroStatVal}>{Number(data.guaranteed_earnings).toLocaleString()}</Text>
              <Text style={s.heroStatLabel}>Guaranteed</Text>
            </View>
          </View>

          {/* Progress bar */}
          <View style={s.progressBg}>
            <View style={[s.progressFill, { width: `${Math.min(100, Math.round(pct * 100))}%`, backgroundColor: onTarget ? '#fff' : '#FFD700' }]} />
          </View>
          <Text style={s.progressLabel}>{Math.round(pct * 100)}% of guarantee reached</Text>
        </LinearGradient>

        {/* Top-up owed */}
        {data.topup_owed > 0 && !data.topup_paid && (
          <View style={[s.topupCard, { backgroundColor: '#FFF3E0' }]}>
            <Ionicons name="cash-outline" size={22} color="#FF6B00" />
            <View style={{ flex: 1 }}>
              <Text style={s.topupTitle}>Top-Up Pending</Text>
              <Text style={s.topupSub}>MOBO will transfer {Number(data.topup_owed).toLocaleString()} XAF to your wallet by midnight.</Text>
            </View>
          </View>
        )}
        {data.topup_owed > 0 && data.topup_paid && (
          <View style={[s.topupCard, { backgroundColor: '#E8F5E9' }]}>
            <Ionicons name="checkmark-circle" size={22} color="#00A651" />
            <View style={{ flex: 1 }}>
              <Text style={[s.topupTitle, { color: '#00A651' }]}>Top-Up Paid</Text>
              <Text style={s.topupSub}>{Number(data.topup_owed).toLocaleString()} XAF has been added to your wallet.</Text>
            </View>
          </View>
        )}

        {/* How it works */}
        <View style={s.infoCard}>
          <Text style={s.infoTitle}>How Earnings Guarantee Works</Text>
          {[
            { icon: 'time-outline', text: 'Stay online for at least 6 hours in the guarantee window (6 AM – 10 PM).' },
            { icon: 'car-outline', text: 'Maintain an acceptance rate of 80% or higher during the window.' },
            { icon: 'cash-outline', text: 'If your earnings fall below the guaranteed rate, MOBO pays the difference.' },
            { icon: 'shield-checkmark-outline', text: 'Guaranteed rate varies by tier: Bronze 2,000 · Gold 2,500 · Platinum 3,000 · Diamond 4,000 XAF/hr.' },
          ].map((item, i) => (
            <View key={i} style={s.infoRow}>
              <Ionicons name={item.icon} size={16} color={colors.primary} />
              <Text style={s.infoText}>{item.text}</Text>
            </View>
          ))}
        </View>

        {/* History */}
        <Text style={s.sectionTitle}>Past Guarantees</Text>
        {data.history.map((row, i) => {
          const exceeded = row.actual >= row.guarantee;
          return (
            <View key={i} style={s.histRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.histDate}>{row.date}</Text>
                <Text style={s.histHours}>{row.hours}h online</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[s.histActual, { color: exceeded ? colors.success : colors.text }]}>
                  {Number(row.actual).toLocaleString()} XAF
                </Text>
                {row.topup > 0 && (
                  <Text style={s.histTopup}>+{Number(row.topup).toLocaleString()} top-up</Text>
                )}
              </View>
            </View>
          );
        })}

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
    heroCard: { margin: spacing.md, borderRadius: radius.xl, padding: spacing.lg, ...shadows.md },
    heroLabel: { fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
    heroRate: { fontSize: 28, fontWeight: '900', color: '#fff', marginVertical: 4 },
    heroStats: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: radius.lg, padding: spacing.sm, marginBottom: 14 },
    heroStat: { flex: 1, alignItems: 'center' },
    heroStatVal: { fontSize: 15, fontWeight: '900', color: '#fff' },
    heroStatLabel: { fontSize: 9, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
    heroStatDiv: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.3)' },
    progressBg: { height: 8, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 4, overflow: 'hidden' },
    progressFill: { height: 8, borderRadius: 4 },
    progressLabel: { fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 6, textAlign: 'right' },
    topupCard: {
      flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
      marginHorizontal: spacing.md, marginBottom: spacing.sm,
      borderRadius: radius.lg, padding: spacing.md,
    },
    topupTitle: { fontSize: 13, fontWeight: '800', color: '#FF6B00' },
    topupSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    infoCard: {
      marginHorizontal: spacing.md, marginBottom: spacing.md,
      backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, ...shadows.sm,
    },
    infoTitle: { fontSize: 13, fontWeight: '800', color: colors.text, marginBottom: 10 },
    infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: 5 },
    infoText: { fontSize: 12, color: colors.textSecondary, flex: 1, lineHeight: 17 },
    sectionTitle: { fontSize: 14, fontWeight: '800', color: colors.text, marginHorizontal: spacing.md, marginBottom: spacing.sm },
    histRow: {
      flexDirection: 'row', alignItems: 'center',
      marginHorizontal: spacing.md, marginBottom: spacing.xs,
      backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, ...shadows.sm,
    },
    histDate: { fontSize: 13, fontWeight: '700', color: colors.text },
    histHours: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
    histActual: { fontSize: 14, fontWeight: '800' },
    histTopup: { fontSize: 11, color: '#FF6B00', fontWeight: '600', marginTop: 2 },
  });
}

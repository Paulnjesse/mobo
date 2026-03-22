/**
 * Feature 38 — Driver Tier / Pro System
 * Bronze → Gold → Platinum → Diamond
 * Shows current tier, progress to next, perks, and requirements.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius, shadows } from '../theme';
import api from '../services/api';

const TIERS = [
  {
    name: 'Bronze',
    icon: 'trophy-outline',
    colors: ['#CD7F32', '#A0522D'],
    textColor: '#CD7F32',
    bgColor: '#CD7F3215',
    minTrips: 0,
    minRating: 0,
    minAcceptance: 0,
    perks: [
      'Access to all standard ride types',
      'Weekly payment processing',
      'In-app navigation',
      'Basic driver support',
    ],
  },
  {
    name: 'Gold',
    icon: 'trophy',
    colors: ['#FFD700', '#FFA500'],
    textColor: '#B8860B',
    bgColor: '#FFD70015',
    minTrips: 100,
    minRating: 4.5,
    minAcceptance: 80,
    perks: [
      'All Bronze perks',
      'Priority ride matching',
      'Access to Comfort & XL rides',
      'Bi-weekly bonus eligibility',
      '5% fuel card discount',
      'Priority support queue',
    ],
  },
  {
    name: 'Platinum',
    icon: 'diamond-outline',
    colors: ['#9B9B9B', '#C0C0C0'],
    textColor: '#707070',
    bgColor: '#C0C0C015',
    minTrips: 500,
    minRating: 4.7,
    minAcceptance: 85,
    perks: [
      'All Gold perks',
      'Access to Luxury & Airport rides',
      'Guaranteed minimum XAF/hr',
      '10% fuel card discount',
      'Dedicated driver success manager',
      'Early access to new features',
      'Monthly performance bonus',
    ],
  },
  {
    name: 'Diamond',
    icon: 'diamond',
    colors: ['#00BFFF', '#1E90FF'],
    textColor: '#0077CC',
    bgColor: '#00BFFF12',
    minTrips: 1500,
    minRating: 4.85,
    minAcceptance: 90,
    perks: [
      'All Platinum perks',
      'Top of ride queue always',
      'Exclusive Diamond badge in app',
      '15% fuel card discount',
      'Vehicle upgrade subsidy',
      'Annual recognition award',
      'Highest earnings guarantee',
      'Corporate & Business ride access',
    ],
  },
];

function getTierIndex(tierName) {
  return TIERS.findIndex((t) => t.name.toLowerCase() === (tierName || 'bronze').toLowerCase());
}

const MOCK_STATS = {
  tier: 'Gold',
  total_trips: 247,
  rating: 4.72,
  acceptance_rate: 86,
  trips_this_month: 38,
  earnings_this_month: 142600,
};

export default function DriverTierScreen({ navigation }) {
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/drivers/me/tier');
        setStats(res.data || MOCK_STATS);
      } catch {
        setStats(MOCK_STATS);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <ActivityIndicator style={{ marginTop: 80 }} color={colors.primary} />
      </SafeAreaView>
    );
  }

  const currentIdx = getTierIndex(stats.tier);
  const currentTier = TIERS[currentIdx];
  const nextTier = TIERS[currentIdx + 1] || null;

  // Progress toward next tier
  let tripProgress = 1;
  let ratingProgress = 1;
  let acceptanceProgress = 1;
  if (nextTier) {
    const prevTrips = currentTier.minTrips;
    tripProgress = Math.min(1, (stats.total_trips - prevTrips) / (nextTier.minTrips - prevTrips));
    const prevRating = currentTier.minRating || 4.0;
    ratingProgress = Math.min(1, Math.max(0, (stats.rating - prevRating) / (nextTier.minRating - prevRating)));
    const prevAcc = currentTier.minAcceptance;
    acceptanceProgress = Math.min(1, Math.max(0, (stats.acceptance_rate - prevAcc) / (nextTier.minAcceptance - prevAcc)));
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <StatusBar barStyle={colors.text === '#FFFFFF' ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Driver Tier</Text>
        <View style={s.backBtn} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Current Tier Card */}
        <LinearGradient colors={currentTier.colors} style={s.tierCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Ionicons name={currentTier.icon} size={48} color="#fff" style={{ marginBottom: 8 }} />
          <Text style={s.tierName}>{currentTier.name} Driver</Text>
          <Text style={s.tierSub}>{stats.total_trips} lifetime trips · ⭐ {stats.rating.toFixed(2)}</Text>

          <View style={s.statsRow}>
            <View style={s.statBox}>
              <Text style={s.statVal}>{stats.trips_this_month}</Text>
              <Text style={s.statLabel}>This Month</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statBox}>
              <Text style={s.statVal}>{stats.acceptance_rate}%</Text>
              <Text style={s.statLabel}>Acceptance</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statBox}>
              <Text style={s.statVal}>{Number(stats.earnings_this_month).toLocaleString()}</Text>
              <Text style={s.statLabel}>XAF Earned</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Progress to next tier */}
        {nextTier && (
          <View style={s.progressCard}>
            <Text style={s.progressTitle}>Progress to {nextTier.name}</Text>

            <ProgressRow
              label="Trips"
              current={stats.total_trips}
              target={nextTier.minTrips}
              progress={tripProgress}
              colors={colors}
              unit=""
            />
            <ProgressRow
              label="Rating"
              current={stats.rating.toFixed(2)}
              target={nextTier.minRating}
              progress={ratingProgress}
              colors={colors}
              unit="⭐"
            />
            <ProgressRow
              label="Acceptance"
              current={`${stats.acceptance_rate}%`}
              target={`${nextTier.minAcceptance}%`}
              progress={acceptanceProgress}
              colors={colors}
              unit=""
            />
          </View>
        )}
        {!nextTier && (
          <View style={[s.progressCard, { alignItems: 'center', paddingVertical: spacing.lg }]}>
            <Ionicons name="diamond" size={32} color="#0077CC" />
            <Text style={[s.progressTitle, { marginTop: 8 }]}>You've reached the top!</Text>
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4, textAlign: 'center' }}>Diamond is the highest Driver Tier. Thank you for your excellence.</Text>
          </View>
        )}

        {/* Current perks */}
        <View style={s.perksCard}>
          <View style={s.perksHeader}>
            <View style={[s.tierDot, { backgroundColor: currentTier.textColor }]} />
            <Text style={[s.perksTitle, { color: currentTier.textColor }]}>{currentTier.name} Perks</Text>
          </View>
          {currentTier.perks.map((perk, i) => (
            <View key={i} style={s.perkRow}>
              <Ionicons name="checkmark-circle" size={16} color={currentTier.textColor} />
              <Text style={s.perkText}>{perk}</Text>
            </View>
          ))}
        </View>

        {/* All tiers overview */}
        <Text style={s.allTiersTitle}>All Tiers</Text>
        {TIERS.map((tier, i) => {
          const isUnlocked = i <= currentIdx;
          return (
            <View key={tier.name} style={[s.tierRow, { opacity: isUnlocked ? 1 : 0.45 }]}>
              <LinearGradient colors={tier.colors} style={s.tierRowIcon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                <Ionicons name={tier.icon} size={18} color="#fff" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={[s.tierRowName, { color: colors.text }]}>{tier.name}</Text>
                <Text style={s.tierRowReq}>
                  {tier.minTrips > 0 ? `${tier.minTrips}+ trips · ${tier.minRating}⭐ · ${tier.minAcceptance}% AR` : 'Starting tier — no requirements'}
                </Text>
              </View>
              {i === currentIdx && (
                <View style={[s.currentBadge, { backgroundColor: currentTier.textColor + '20' }]}>
                  <Text style={[s.currentBadgeText, { color: currentTier.textColor }]}>Current</Text>
                </View>
              )}
              {i < currentIdx && <Ionicons name="checkmark-circle" size={18} color={colors.success} />}
              {i > currentIdx && <Ionicons name="lock-closed-outline" size={16} color={colors.gray300} />}
            </View>
          );
        })}

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function ProgressRow({ label, current, target, progress, colors, unit }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text }}>{label}</Text>
        <Text style={{ fontSize: 12, color: colors.textSecondary }}>{current} / {target}{unit}</Text>
      </View>
      <View style={{ height: 6, backgroundColor: colors.gray200, borderRadius: 3 }}>
        <View style={{ height: 6, width: `${Math.round(progress * 100)}%`, backgroundColor: colors.primary, borderRadius: 3 }} />
      </View>
    </View>
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
    tierCard: {
      margin: spacing.md, borderRadius: radius.xl, padding: spacing.lg,
      alignItems: 'center', ...shadows.md,
    },
    tierName: { fontSize: 26, fontWeight: '900', color: '#fff', marginBottom: 4 },
    tierSub: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginBottom: 20 },
    statsRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: radius.lg, padding: spacing.sm, width: '100%' },
    statBox: { flex: 1, alignItems: 'center' },
    statVal: { fontSize: 16, fontWeight: '900', color: '#fff' },
    statLabel: { fontSize: 10, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
    statDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.3)' },
    progressCard: {
      marginHorizontal: spacing.md, marginBottom: spacing.md,
      backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, ...shadows.sm,
    },
    progressTitle: { fontSize: 14, fontWeight: '800', color: colors.text, marginBottom: 14 },
    perksCard: {
      marginHorizontal: spacing.md, marginBottom: spacing.md,
      backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, ...shadows.sm,
    },
    perksHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 12 },
    tierDot: { width: 10, height: 10, borderRadius: 5 },
    perksTitle: { fontSize: 14, fontWeight: '800' },
    perkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 5 },
    perkText: { fontSize: 13, color: colors.text, flex: 1 },
    allTiersTitle: { fontSize: 14, fontWeight: '800', color: colors.text, marginHorizontal: spacing.md, marginBottom: spacing.sm },
    tierRow: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      marginHorizontal: spacing.md, marginBottom: spacing.sm,
      backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, ...shadows.sm,
    },
    tierRowIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    tierRowName: { fontSize: 14, fontWeight: '700' },
    tierRowReq: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
    currentBadge: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
    currentBadgeText: { fontSize: 10, fontWeight: '800' },
  });
}

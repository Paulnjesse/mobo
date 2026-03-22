import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadows } from '../theme';
import { ridesService } from '../services/rides';

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week',  label: '7 Days' },
  { key: 'month', label: '30 Days' },
  { key: 'year',  label: '12 Months' },
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function fmtXAF(n) {
  if (!n && n !== 0) return '–';
  return `${Math.round(Number(n)).toLocaleString()} XAF`;
}

function fmtHour(h) {
  const suffix = h < 12 ? 'AM' : 'PM';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}${suffix}`;
}

export default function DriverEarningsScreen({ navigation }) {
  const [period, setPeriod] = useState('week');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await ridesService.getDriverEarnings(period);
      setData(result);
    } catch (err) {
      console.warn('[DriverEarnings] load failed:', err.message);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  // ── Bar chart helpers ──────────────────────────────────────────────────────
  const dailyBars = data?.daily || [];
  const maxNet = Math.max(...dailyBars.map((d) => d.net || 0), 1);

  // Peak hours (24 buckets)
  const peakMap = {};
  (data?.peak_hours || []).forEach((r) => { peakMap[r.hour] = r; });
  const maxPeak = Math.max(...HOURS.map((h) => peakMap[h]?.earnings || 0), 1);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Earnings</Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={load}>
          <Ionicons name="refresh-outline" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Period selector */}
      <View style={styles.periodRow}>
        {PERIODS.map((p) => (
          <TouchableOpacity
            key={p.key}
            style={[styles.periodChip, period === p.key && styles.periodChipActive]}
            onPress={() => setPeriod(p.key)}
            activeOpacity={0.8}
          >
            <Text style={[styles.periodChipText, period === p.key && styles.periodChipTextActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* Today's quick stats */}
          <View style={styles.todayCard}>
            <View style={styles.todayStat}>
              <Text style={styles.todayValue}>{fmtXAF(data?.today?.earned_today)}</Text>
              <Text style={styles.todayLabel}>Earned Today</Text>
            </View>
            <View style={styles.todayDivider} />
            <View style={styles.todayStat}>
              <Text style={styles.todayValue}>{data?.today?.rides_today ?? 0}</Text>
              <Text style={styles.todayLabel}>Rides Today</Text>
            </View>
            <View style={styles.todayDivider} />
            <View style={styles.todayStat}>
              <Text style={styles.todayValue}>{fmtXAF(data?.today?.tips_today)}</Text>
              <Text style={styles.todayLabel}>Tips Today</Text>
            </View>
          </View>

          {/* Period totals */}
          <View style={styles.totalsGrid}>
            {[
              { label: 'Net Earnings', value: fmtXAF(data?.totals?.total_net), icon: 'cash-outline', color: colors.success },
              { label: 'Total Rides', value: data?.totals?.total_rides ?? 0, icon: 'car-outline', color: colors.primary },
              { label: 'Total Tips', value: fmtXAF(data?.totals?.total_tips), icon: 'heart-outline', color: '#FF6B9D' },
              { label: 'Avg Fare', value: fmtXAF(data?.totals?.avg_fare), icon: 'trending-up-outline', color: colors.warning },
            ].map((stat) => (
              <View key={stat.label} style={styles.statBox}>
                <View style={[styles.statIcon, { backgroundColor: `${stat.color}18` }]}>
                  <Ionicons name={stat.icon} size={20} color={stat.color} />
                </View>
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>

          {/* All-time streak */}
          {data?.all_time?.current_streak > 0 && (
            <View style={styles.streakCard}>
              <Ionicons name="flame" size={24} color="#FF6B00" />
              <View style={{ flex: 1 }}>
                <Text style={styles.streakTitle}>{data.all_time.current_streak} Ride Streak!</Text>
                <Text style={styles.streakSub}>Keep it up to earn bonus rewards</Text>
              </View>
              <Text style={styles.streakBonuses}>{fmtXAF(data.all_time.total_bonuses_earned)}</Text>
            </View>
          )}

          {/* Daily bar chart */}
          {dailyBars.length > 0 && (
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>Daily Net Earnings</Text>
              <View style={styles.barChart}>
                {dailyBars.map((day, idx) => {
                  const height = Math.max(4, Math.round((day.net / maxNet) * 100));
                  return (
                    <View key={idx} style={styles.barCol}>
                      <Text style={styles.barValue}>
                        {day.net >= 1000 ? `${Math.round(day.net / 1000)}k` : day.net}
                      </Text>
                      <View style={styles.barBg}>
                        <View style={[styles.barFill, { height: `${height}%`, backgroundColor: colors.primary }]} />
                      </View>
                      <Text style={styles.barLabel}>
                        {new Date(day.date).toLocaleDateString('en', { weekday: 'short' }).slice(0, 2)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Peak hours */}
          {data?.peak_hours?.length > 0 && (
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>Best Hours (Last 30 Days)</Text>
              <View style={styles.heatRow}>
                {HOURS.map((h) => {
                  const val = peakMap[h]?.earnings || 0;
                  const intensity = val / maxPeak;
                  const bg = intensity > 0.7 ? colors.primary
                    : intensity > 0.4 ? 'rgba(255,0,191,0.4)'
                    : intensity > 0.15 ? 'rgba(255,0,191,0.15)'
                    : colors.gray100;
                  return (
                    <View key={h} style={[styles.heatCell, { backgroundColor: bg }]}>
                      {intensity > 0.4 && (
                        <Text style={styles.heatLabel}>{h}</Text>
                      )}
                    </View>
                  );
                })}
              </View>
              <View style={styles.heatLegend}>
                <Text style={styles.heatLegendText}>Low demand</Text>
                <View style={styles.heatLegendBar}>
                  {['#F0F0F0', 'rgba(255,0,191,0.2)', 'rgba(255,0,191,0.5)', colors.primary].map((c, i) => (
                    <View key={i} style={[styles.heatLegendCell, { backgroundColor: c }]} />
                  ))}
                </View>
                <Text style={styles.heatLegendText}>High demand</Text>
              </View>

              {/* Top 3 hours */}
              <View style={styles.topHoursRow}>
                {(data.peak_hours || [])
                  .sort((a, b) => b.earnings - a.earnings)
                  .slice(0, 3)
                  .map((h, i) => (
                    <View key={h.hour} style={styles.topHourBadge}>
                      <Text style={styles.topHourRank}>#{i + 1}</Text>
                      <Text style={styles.topHourTime}>{fmtHour(h.hour)}</Text>
                      <Text style={styles.topHourEarnings}>{fmtXAF(h.earnings)}</Text>
                    </View>
                  ))}
              </View>
            </View>
          )}

          {/* All-time summary */}
          <View style={styles.allTimeCard}>
            <Text style={styles.chartTitle}>All-Time Summary</Text>
            <View style={styles.allTimeRow}>
              <Ionicons name="wallet-outline" size={20} color={colors.success} />
              <Text style={styles.allTimeLabel}>Total Earned</Text>
              <Text style={styles.allTimeValue}>{fmtXAF(data?.all_time?.total_earnings)}</Text>
            </View>
            <View style={styles.allTimeRow}>
              <Ionicons name="trophy-outline" size={20} color={colors.warning} />
              <Text style={styles.allTimeLabel}>Bonuses Earned</Text>
              <Text style={styles.allTimeValue}>{fmtXAF(data?.all_time?.total_bonuses_earned)}</Text>
            </View>
            <View style={styles.allTimeRow}>
              <Ionicons name="checkmark-circle-outline" size={20} color={colors.primary} />
              <Text style={styles.allTimeLabel}>Acceptance Rate</Text>
              <Text style={styles.allTimeValue}>{data?.all_time?.acceptance_rate ?? 100}%</Text>
            </View>
          </View>

          <View style={{ height: spacing.xl }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray200,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  refreshBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  periodRow: {
    flexDirection: 'row', paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray100,
    gap: spacing.sm,
  },
  periodChip: {
    paddingHorizontal: spacing.md, paddingVertical: 7,
    borderRadius: radius.round, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.gray200,
  },
  periodChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  periodChipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  periodChipTextActive: { color: colors.white },

  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: spacing.md },

  todayCard: {
    flexDirection: 'row', backgroundColor: colors.white, borderRadius: radius.xl,
    padding: spacing.md, marginBottom: spacing.sm, ...shadows.md,
  },
  todayStat: { flex: 1, alignItems: 'center' },
  todayValue: { fontSize: 16, fontWeight: '800', color: colors.text },
  todayLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: '500', marginTop: 2, textAlign: 'center' },
  todayDivider: { width: 1, backgroundColor: colors.gray200, marginHorizontal: spacing.sm },

  totalsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm,
  },
  statBox: {
    width: '48%', backgroundColor: colors.white, borderRadius: radius.lg,
    padding: spacing.md, alignItems: 'center', ...shadows.sm,
  },
  statIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statValue: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 2, textAlign: 'center' },
  statLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: '500', textAlign: 'center' },

  streakCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: '#FFF5EE', borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: '#FFD4A8',
  },
  streakTitle: { fontSize: 15, fontWeight: '800', color: '#CC5500' },
  streakSub: { fontSize: 12, color: '#996633', marginTop: 2 },
  streakBonuses: { fontSize: 14, fontWeight: '700', color: '#CC5500' },

  chartCard: {
    backgroundColor: colors.white, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.sm, ...shadows.sm,
  },
  chartTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: spacing.md },

  barChart: { flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 4, paddingTop: 24 },
  barCol: { flex: 1, alignItems: 'center', gap: 4 },
  barValue: { fontSize: 9, color: colors.textSecondary, fontWeight: '600' },
  barBg: { flex: 1, width: '100%', backgroundColor: colors.gray100, borderRadius: 4, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', borderRadius: 4, minHeight: 4 },
  barLabel: { fontSize: 10, color: colors.textSecondary, fontWeight: '500' },

  heatRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginBottom: spacing.sm },
  heatCell: { width: 24, height: 24, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  heatLabel: { fontSize: 8, color: colors.white, fontWeight: '800' },
  heatLegend: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  heatLegendText: { fontSize: 10, color: colors.textSecondary },
  heatLegendBar: { flex: 1, flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2 },
  heatLegendCell: { flex: 1 },

  topHoursRow: { flexDirection: 'row', gap: spacing.sm },
  topHourBadge: {
    flex: 1, backgroundColor: 'rgba(255,0,191,0.06)', borderRadius: radius.md,
    padding: spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,0,191,0.15)',
  },
  topHourRank: { fontSize: 10, fontWeight: '800', color: colors.primary, marginBottom: 2 },
  topHourTime: { fontSize: 14, fontWeight: '800', color: colors.text },
  topHourEarnings: { fontSize: 11, color: colors.textSecondary, fontWeight: '600', marginTop: 2, textAlign: 'center' },

  allTimeCard: {
    backgroundColor: colors.white, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.sm, ...shadows.sm,
  },
  allTimeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: colors.gray100 },
  allTimeLabel: { flex: 1, fontSize: 14, color: colors.textSecondary },
  allTimeValue: { fontSize: 15, fontWeight: '700', color: colors.text },
});

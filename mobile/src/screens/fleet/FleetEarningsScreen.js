import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { fleetService } from '../../services/fleet';
import { shadows, spacing } from '../../theme';

const PRIMARY  = '#FF00BF';
const GOLD     = '#F5A623';
const GREEN    = '#00A651';
const PERIODS  = [
  { key: 'week',  label: 'Week'  },
  { key: 'month', label: 'Month' },
  { key: 'year',  label: 'Year'  },
  { key: 'all',   label: 'All'   },
];

function formatXAF(amount) {
  if (!amount && amount !== 0) return 'XAF 0';
  return 'XAF ' + Number(amount).toLocaleString('fr-CM');
}

function SummaryCard({ label, value, icon, color, sub }) {
  return (
    <View style={styles.summaryCard}>
      <View style={[styles.summaryIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
      {sub ? <Text style={styles.summarySub}>{sub}</Text> : null}
    </View>
  );
}

function FleetEarningsCard({ fleet, period }) {
  const [detail, setDetail]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fleetService.getEarnings(fleet.id, period)
      .then((data) => { if (!cancelled) { setDetail(data); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [fleet.id, period]);

  const gross     = detail?.gross_revenue    ?? fleet.total_earnings ?? 0;
  const fee       = detail?.platform_fee     ?? Math.round(gross * 0.20);
  const net       = detail?.net_payout       ?? Math.round(gross * 0.80);
  const rides     = detail?.total_rides      ?? 0;
  const avgPerRide = rides > 0 ? Math.round(gross / rides) : 0;

  return (
    <View style={styles.fleetCard}>
      {/* Card header */}
      <View style={styles.fleetCardHeader}>
        <View>
          <Text style={styles.fleetCardName}>{fleet.name}</Text>
          <Text style={styles.fleetCardSub}>Fleet #{fleet.fleet_number} · {fleet.vehicle_count || 0} vehicles</Text>
        </View>
        {loading ? (
          <ActivityIndicator size="small" color={PRIMARY} />
        ) : error ? (
          <Ionicons name="cloud-offline-outline" size={18} color="#CCC" />
        ) : null}
      </View>

      {/* Earnings breakdown */}
      <View style={styles.breakdownRow}>
        <View style={styles.breakdownItem}>
          <Text style={styles.breakdownLabel}>Gross Revenue</Text>
          <Text style={[styles.breakdownValue, { color: '#1A1A1A' }]}>{formatXAF(gross)}</Text>
        </View>
        <View style={styles.breakdownDivider} />
        <View style={styles.breakdownItem}>
          <Text style={styles.breakdownLabel}>Platform Fee (20%)</Text>
          <Text style={[styles.breakdownValue, { color: '#E94560' }]}>− {formatXAF(fee)}</Text>
        </View>
        <View style={styles.breakdownDivider} />
        <View style={styles.breakdownItem}>
          <Text style={styles.breakdownLabel}>Net Payout</Text>
          <Text style={[styles.breakdownValue, { color: GREEN, fontWeight: '800' }]}>{formatXAF(net)}</Text>
        </View>
      </View>

      {/* Footer stats */}
      {detail && (
        <View style={styles.footerRow}>
          <View style={styles.footerStat}>
            <Ionicons name="car-outline" size={13} color="#888" />
            <Text style={styles.footerStatText}>{rides} rides</Text>
          </View>
          {avgPerRide > 0 && (
            <View style={styles.footerStat}>
              <Ionicons name="trending-up-outline" size={13} color="#888" />
              <Text style={styles.footerStatText}>{formatXAF(avgPerRide)} avg/ride</Text>
            </View>
          )}
          {detail.active_drivers != null && (
            <View style={styles.footerStat}>
              <Ionicons name="person-outline" size={13} color="#888" />
              <Text style={styles.footerStatText}>{detail.active_drivers} drivers</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

export default function FleetEarningsScreen({ navigation }) {
  const { myFleets, loadFleets } = useAuth();
  const [period, setPeriod]       = useState('month');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { loadFleets(); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFleets();
    setRefreshing(false);
  }, [loadFleets]);

  // Aggregate totals from fleet list (snapshot from dashboard data)
  const totalGross = myFleets.reduce((s, f) => s + Number(f.total_earnings || 0), 0);
  const totalNet   = Math.round(totalGross * 0.80);
  const totalCars  = myFleets.reduce((s, f) => s + Number(f.vehicle_count || 0), 0);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Earnings</Text>
        <Text style={styles.headerSub}>{myFleets.length} fleet{myFleets.length !== 1 ? 's' : ''} · {totalCars} vehicle{totalCars !== 1 ? 's' : ''}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PRIMARY} />
        }
      >
        {/* Period selector */}
        <View style={styles.periodRow}>
          {PERIODS.map((p) => (
            <TouchableOpacity
              key={p.key}
              style={[styles.periodBtn, period === p.key && styles.periodBtnActive]}
              onPress={() => setPeriod(p.key)}
              activeOpacity={0.8}
            >
              <Text style={[styles.periodBtnText, period === p.key && styles.periodBtnTextActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Summary cards */}
        <View style={styles.summaryRow}>
          <SummaryCard
            label="Gross Revenue"
            value={`XAF ${(totalGross / 1000).toFixed(0)}K`}
            icon="cash-outline"
            color={GOLD}
          />
          <SummaryCard
            label="Net Payout"
            value={`XAF ${(totalNet / 1000).toFixed(0)}K`}
            icon="wallet-outline"
            color={GREEN}
            sub="After 20% fee"
          />
          <SummaryCard
            label="Fleets"
            value={myFleets.length}
            icon="layers-outline"
            color={PRIMARY}
          />
        </View>

        {/* Per-fleet breakdown */}
        <Text style={styles.sectionTitle}>Per Fleet Breakdown</Text>

        {myFleets.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="bar-chart-outline" size={48} color="#DDD" />
            <Text style={styles.emptyTitle}>No earnings yet</Text>
            <Text style={styles.emptySubtitle}>Add vehicles to your fleet and get drivers on the road.</Text>
          </View>
        ) : (
          myFleets.map((fleet) => (
            <FleetEarningsCard key={fleet.id} fleet={fleet} period={period} />
          ))
        )}

        {/* Payout note */}
        {myFleets.length > 0 && (
          <View style={styles.payoutNote}>
            <Ionicons name="information-circle-outline" size={16} color="#888" />
            <Text style={styles.payoutNoteText}>
              Payouts are processed every Monday. Platform fee is 20% of gross revenue.
            </Text>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F8F8' },

  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#1A1A1A', letterSpacing: -0.3 },
  headerSub:   { fontSize: 13, color: '#888', fontWeight: '400', marginTop: 2 },

  content: { padding: spacing.lg, paddingBottom: 40 },

  // Period selector
  periodRow: {
    flexDirection: 'row',
    backgroundColor: '#F0F0F0',
    borderRadius: 12,
    padding: 3,
    marginBottom: spacing.lg,
  },
  periodBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
  },
  periodBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  periodBtnText:       { fontSize: 13, fontWeight: '600', color: '#888' },
  periodBtnTextActive: { color: '#1A1A1A', fontWeight: '700' },

  // Summary cards
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: spacing.lg },
  summaryCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: spacing.md,
    alignItems: 'center',
    ...shadows.sm,
  },
  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  summaryValue: { fontSize: 15, fontWeight: '800', color: '#1A1A1A', marginBottom: 2, textAlign: 'center' },
  summaryLabel: { fontSize: 10, color: '#888', fontWeight: '600', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.4 },
  summarySub:   { fontSize: 10, color: '#BBB', marginTop: 2, textAlign: 'center' },

  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1A1A1A',
    marginBottom: spacing.md,
    letterSpacing: -0.2,
  },

  // Fleet earnings card
  fleetCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.md,
  },
  fleetCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  fleetCardName: { fontSize: 16, fontWeight: '800', color: '#1A1A1A' },
  fleetCardSub:  { fontSize: 12, color: '#888', marginTop: 2 },

  // Breakdown
  breakdownRow: {
    flexDirection: 'row',
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  breakdownItem:    { flex: 1, alignItems: 'center', paddingVertical: 4 },
  breakdownDivider: { width: 1, backgroundColor: '#EEE', marginVertical: 4 },
  breakdownLabel:   { fontSize: 10, color: '#888', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 },
  breakdownValue:   { fontSize: 13, fontWeight: '700', color: '#1A1A1A', textAlign: 'center' },

  // Footer stats
  footerRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#F4F4F4',
  },
  footerStat:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footerStatText: { fontSize: 12, color: '#888', fontWeight: '500' },

  // Payout note
  payoutNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#F8F8F8',
    borderRadius: 10,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  payoutNoteText: { flex: 1, fontSize: 12, color: '#888', lineHeight: 17 },

  // Empty state
  emptyState:    { alignItems: 'center', paddingVertical: 48 },
  emptyTitle:    { fontSize: 17, fontWeight: '700', color: '#1A1A1A', marginTop: 12, marginBottom: 6 },
  emptySubtitle: { fontSize: 13, color: '#888', textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },
});

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
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { fleetService } from '../../services/fleet';
import { colors, spacing, radius, shadows } from '../../theme';

const PRIMARY = '#FF00BF';

function formatXAF(amount) {
  if (!amount && amount !== 0) return 'XAF 0';
  return 'XAF ' + Number(amount).toLocaleString('fr-CM');
}

function StatCard({ label, value, icon, color }) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function StatusBadge({ fleet }) {
  const count = parseInt(fleet.vehicle_count || 0, 10);
  if (!fleet.is_approved) {
    return <View style={[styles.badge, styles.badgePending]}><Text style={styles.badgeText}>Pending Review</Text></View>;
  }
  if (!fleet.is_active || count < fleet.min_vehicles) {
    return <View style={[styles.badge, styles.badgeWarning]}><Text style={styles.badgeText}>Needs {fleet.min_vehicles - count} more vehicle{fleet.min_vehicles - count !== 1 ? 's' : ''}</Text></View>;
  }
  return <View style={[styles.badge, styles.badgeActive]}><Text style={styles.badgeText}>Active</Text></View>;
}

function VehicleProgressBar({ current, max }) {
  const pct = Math.min(1, current / max);
  const color = current >= 5 ? PRIMARY : '#F5A623';
  return (
    <View style={styles.progressWrap}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.progressLabel}>{current} / {max} vehicles</Text>
    </View>
  );
}

function FleetCard({ fleet, onManage }) {
  const count = parseInt(fleet.vehicle_count || 0, 10);
  const canCreateNext = count >= fleet.max_vehicles;

  return (
    <View style={styles.fleetCard}>
      <View style={styles.fleetCardHeader}>
        <View style={styles.fleetNumberBadge}>
          <Text style={styles.fleetNumberText}>Fleet #{fleet.fleet_number}</Text>
        </View>
        <StatusBadge fleet={{ ...fleet, vehicle_count: count }} />
      </View>

      <Text style={styles.fleetName}>{fleet.name}</Text>
      {fleet.city ? <Text style={styles.fleetCity}><Ionicons name="location-outline" size={12} color="#888" /> {fleet.city}</Text> : null}

      <VehicleProgressBar current={count} max={fleet.max_vehicles} />

      <View style={styles.fleetEarnings}>
        <Ionicons name="cash-outline" size={14} color="#888" />
        <Text style={styles.fleetEarningsText}>
          {formatXAF(fleet.total_earnings)} total earnings
        </Text>
      </View>

      {count < 5 && (
        <View style={styles.warningBanner}>
          <Ionicons name="warning-outline" size={14} color="#F5A623" />
          <Text style={styles.warningText}>
            Add {5 - count} more vehicle{5 - count !== 1 ? 's' : ''} to activate this fleet
          </Text>
        </View>
      )}

      {count >= 5 && fleet.is_active && (
        <View style={styles.successBanner}>
          <Ionicons name="checkmark-circle-outline" size={14} color="#00A651" />
          <Text style={styles.successText}>Fleet is active</Text>
        </View>
      )}

      <TouchableOpacity style={styles.manageBtn} onPress={onManage} activeOpacity={0.85}>
        <Text style={styles.manageBtnText}>Manage Fleet</Text>
        <Ionicons name="chevron-forward" size={16} color={PRIMARY} />
      </TouchableOpacity>
    </View>
  );
}

export default function FleetDashboardScreen({ navigation }) {
  const { user, myFleets, loadFleets, fleetsLoading } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadFleets();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFleets();
    setRefreshing(false);
  }, [loadFleets]);

  const latestFleet = myFleets.length > 0
    ? myFleets[myFleets.length - 1]
    : null;
  const latestCount = latestFleet ? parseInt(latestFleet.vehicle_count || 0, 10) : 0;
  const canCreateNewFleet = latestFleet && latestCount >= latestFleet.max_vehicles;
  const newFleetLocked    = latestFleet && latestCount < (latestFleet.min_vehicles || 5);

  const totalVehicles = myFleets.reduce((s, f) => s + parseInt(f.vehicle_count || 0, 10), 0);
  const activeVehicles = myFleets.reduce((s, f) => s + parseInt(f.active_vehicle_count || 0, 10), 0);
  const totalEarnings  = myFleets.reduce((s, f) => s + parseInt(f.total_earnings || 0, 10), 0);

  const handleNewFleet = () => {
    if (newFleetLocked) {
      Alert.alert(
        'Fleet Not Ready',
        `Your current fleet needs at least ${latestFleet.min_vehicles} vehicles before you can create a new one. Currently has ${latestCount} vehicle(s).`
      );
      return;
    }
    navigation.navigate('CreateFleet');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerGreeting}>Good day,</Text>
          <Text style={styles.headerName}>{user?.full_name || 'Fleet Owner'}</Text>
        </View>
        <TouchableOpacity
          style={styles.newFleetBtn}
          onPress={handleNewFleet}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.newFleetBtnText}>New Fleet</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PRIMARY} />
        }
      >
        {/* Stats Row */}
        <View style={styles.statsRow}>
          <StatCard label="Vehicles" value={totalVehicles} icon="car-outline" color={PRIMARY} />
          <StatCard label="Active Now" value={activeVehicles} icon="radio-button-on-outline" color="#00A651" />
          <StatCard label="Earnings" value={`XAF ${(totalEarnings / 1000).toFixed(0)}K`} icon="cash-outline" color="#F5A623" />
        </View>

        {/* Fleets */}
        <Text style={styles.sectionTitle}>My Fleets</Text>

        {fleetsLoading && myFleets.length === 0 ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={PRIMARY} />
            <Text style={styles.loadingText}>Loading fleets...</Text>
          </View>
        ) : myFleets.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🚗</Text>
            <Text style={styles.emptyTitle}>No fleets yet</Text>
            <Text style={styles.emptySubtitle}>
              Your first fleet was created automatically. Add 5–15 vehicles to get started.
            </Text>
          </View>
        ) : (
          myFleets.map((fleet) => (
            <FleetCard
              key={fleet.id}
              fleet={fleet}
              onManage={() => navigation.navigate('FleetManagement', { fleetId: fleet.id, fleetName: fleet.name })}
            />
          ))
        )}

        {/* Create New Fleet card */}
        {canCreateNewFleet && (
          <TouchableOpacity
            style={styles.createFleetCard}
            onPress={handleNewFleet}
            activeOpacity={0.85}
          >
            <View style={styles.createFleetIcon}>
              <Ionicons name="add-circle-outline" size={28} color={PRIMARY} />
            </View>
            <Text style={styles.createFleetTitle}>Create New Fleet</Text>
            <Text style={styles.createFleetSubtitle}>
              Your Fleet #{latestFleet?.fleet_number} is full (15/15). Start Fleet #{(latestFleet?.fleet_number || 0) + 1}.
            </Text>
          </TouchableOpacity>
        )}

        {newFleetLocked && latestFleet && !canCreateNewFleet && (
          <View style={styles.lockedFleetCard}>
            <Ionicons name="lock-closed-outline" size={20} color="#C0C0C0" />
            <Text style={styles.lockedFleetText}>
              Add {(latestFleet.min_vehicles || 5) - latestCount} more vehicles to Fleet #{latestFleet.fleet_number} before creating a new fleet.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F8F8' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerGreeting: { fontSize: 13, color: '#888', fontWeight: '400' },
  headerName: { fontSize: 18, fontWeight: '800', color: '#1A1A1A', letterSpacing: -0.3 },
  newFleetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PRIMARY,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    gap: 4,
  },
  newFleetBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  content: { padding: spacing.lg, paddingBottom: 40 },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: spacing.lg },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: spacing.md,
    alignItems: 'center',
    ...shadows.sm,
  },
  statIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  statValue: { fontSize: 17, fontWeight: '800', color: '#1A1A1A', marginBottom: 2 },
  statLabel: { fontSize: 11, color: '#888', fontWeight: '500', textAlign: 'center' },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1A1A1A',
    marginBottom: spacing.md,
    letterSpacing: -0.2,
  },

  // Fleet card
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
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  fleetNumberBadge: {
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  fleetNumberText: { fontSize: 12, fontWeight: '700', color: '#444' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  badgePending: { backgroundColor: '#FFF3E0' },
  badgeWarning: { backgroundColor: '#FFF8E1' },
  badgeActive:  { backgroundColor: '#E8F5E9' },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#555' },
  fleetName: { fontSize: 17, fontWeight: '800', color: '#1A1A1A', marginBottom: 2 },
  fleetCity: { fontSize: 12, color: '#888', marginBottom: spacing.sm },

  progressWrap: { marginVertical: 10 },
  progressTrack: {
    height: 6,
    backgroundColor: '#F0F0F0',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: { height: '100%', borderRadius: 3 },
  progressLabel: { fontSize: 12, color: '#888', fontWeight: '500' },

  fleetEarnings: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  fleetEarningsText: { fontSize: 13, color: '#666', fontWeight: '500' },

  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    padding: 8,
    gap: 6,
    marginBottom: 10,
  },
  warningText: { fontSize: 12, color: '#D97706', fontWeight: '500', flex: 1 },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    padding: 8,
    gap: 6,
    marginBottom: 10,
  },
  successText: { fontSize: 12, color: '#00A651', fontWeight: '600' },

  manageBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F4F4F4',
  },
  manageBtnText: { fontSize: 14, fontWeight: '700', color: PRIMARY },

  // Create new fleet card
  createFleetCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.md,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: PRIMARY,
    borderStyle: 'dashed',
  },
  createFleetIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,0,191,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  createFleetTitle: { fontSize: 16, fontWeight: '800', color: PRIMARY, marginBottom: 4 },
  createFleetSubtitle: { fontSize: 13, color: '#888', textAlign: 'center', lineHeight: 18 },

  lockedFleetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F8F8',
    borderRadius: 14,
    padding: spacing.md,
    gap: 10,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    marginBottom: spacing.md,
  },
  lockedFleetText: { flex: 1, fontSize: 13, color: '#AAA', lineHeight: 18 },

  // Loading / empty
  loadingWrap: { alignItems: 'center', paddingVertical: 48 },
  loadingText: { marginTop: 12, color: '#888', fontSize: 14 },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A', marginBottom: 6 },
  emptySubtitle: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },
});

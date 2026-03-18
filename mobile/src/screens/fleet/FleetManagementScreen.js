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
  TextInput,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fleetService } from '../../services/fleet';
import { colors, spacing, shadows } from '../../theme';

const PRIMARY = '#FF00BF';
const TABS = ['Vehicles', 'Drivers', 'Earnings'];
const PERIODS = ['week', 'month', 'year'];

function formatXAF(n) {
  return 'XAF ' + Number(n || 0).toLocaleString('fr-CM');
}

function VehicleCard({ vehicle, onAssignDriver, onRemove, onTap }) {
  const hasDriver = !!vehicle.assigned_driver_id;
  return (
    <TouchableOpacity style={styles.vehicleCard} onPress={onTap} activeOpacity={0.88}>
      <View style={styles.vehicleCardTop}>
        <View style={styles.vehicleIconWrap}>
          <Ionicons name="car-outline" size={22} color={PRIMARY} />
        </View>
        <View style={styles.vehicleInfo}>
          <Text style={styles.vehicleName}>{vehicle.make} {vehicle.model} · {vehicle.year}</Text>
          <Text style={styles.vehiclePlate}>{vehicle.plate}</Text>
          <Text style={styles.vehicleType}>{vehicle.vehicle_type} · {vehicle.seats} seats</Text>
        </View>
        <View style={[styles.approvalBadge, vehicle.is_approved ? styles.approvedBadge : styles.pendingBadge]}>
          <Text style={styles.approvalBadgeText}>{vehicle.is_approved ? 'Approved' : 'Pending'}</Text>
        </View>
      </View>

      <View style={styles.vehicleCardDriver}>
        {hasDriver ? (
          <View style={styles.driverChip}>
            <Ionicons name="person-circle-outline" size={16} color="#555" />
            <Text style={styles.driverChipText}>{vehicle.assigned_driver_name || 'Driver assigned'}</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.assignDriverBtn} onPress={onAssignDriver} activeOpacity={0.8}>
            <Ionicons name="person-add-outline" size={14} color={PRIMARY} />
            <Text style={styles.assignDriverBtnText}>Assign Driver</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.removeBtn} onPress={onRemove} activeOpacity={0.8}>
          <Ionicons name="trash-outline" size={16} color="#E53935" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function DriverRow({ vehicle }) {
  if (!vehicle.assigned_driver_id) return null;
  return (
    <View style={styles.driverRow}>
      <View style={styles.driverAvatar}>
        <Text style={styles.driverAvatarText}>
          {(vehicle.assigned_driver_name || 'D').charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.driverRowInfo}>
        <Text style={styles.driverRowName}>{vehicle.assigned_driver_name}</Text>
        <Text style={styles.driverRowVehicle}>{vehicle.make} {vehicle.model} · {vehicle.plate}</Text>
      </View>
    </View>
  );
}

function EarningsBar({ label, value, maxValue }) {
  const pct = maxValue > 0 ? Math.min(1, value / maxValue) : 0;
  return (
    <View style={styles.earningsBarRow}>
      <Text style={styles.earningsBarLabel} numberOfLines={1}>{label}</Text>
      <View style={styles.earningsBarTrack}>
        <View style={[styles.earningsBarFill, { width: `${pct * 100}%` }]} />
      </View>
      <Text style={styles.earningsBarValue}>{formatXAF(value)}</Text>
    </View>
  );
}

export default function FleetManagementScreen({ route, navigation }) {
  const { fleetId, fleetName } = route.params;
  const [activeTab, setActiveTab] = useState('Vehicles');
  const [fleet, setFleet] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [earnings, setEarnings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [earningsPeriod, setEarningsPeriod] = useState('month');
  const [earningsLoading, setEarningsLoading] = useState(false);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [assignVehicleId, setAssignVehicleId] = useState(null);
  const [driverInput, setDriverInput] = useState('');
  const [assignLoading, setAssignLoading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await fleetService.getFleet(fleetId);
      setFleet(res.data.fleet);
      setVehicles(res.data.vehicles || []);
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to load fleet');
    } finally {
      setLoading(false);
    }
  }, [fleetId]);

  const loadEarnings = useCallback(async (period) => {
    setEarningsLoading(true);
    try {
      const res = await fleetService.getEarnings(fleetId, period);
      setEarnings(res.data);
    } catch (err) {
      console.warn('Failed to load earnings:', err.message);
    } finally {
      setEarningsLoading(false);
    }
  }, [fleetId]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (activeTab === 'Earnings') loadEarnings(earningsPeriod);
  }, [activeTab, earningsPeriod]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    if (activeTab === 'Earnings') await loadEarnings(earningsPeriod);
    setRefreshing(false);
  }, [loadData, loadEarnings, activeTab, earningsPeriod]);

  const handleRemoveVehicle = (vehicleId, plate) => {
    Alert.alert(
      'Remove Vehicle',
      `Remove ${plate} from this fleet? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await fleetService.removeVehicle(fleetId, vehicleId);
              setVehicles((prev) => prev.filter((v) => v.id !== vehicleId));
              if (fleet) setFleet((f) => ({ ...f, vehicle_count: parseInt(f.vehicle_count, 10) - 1 }));
            } catch (err) {
              Alert.alert('Cannot Remove', err?.message || 'Failed to remove vehicle');
            }
          },
        },
      ]
    );
  };

  const handleAssignDriver = async () => {
    if (!driverInput.trim()) return;
    setAssignLoading(true);
    try {
      await fleetService.assignDriver(fleetId, assignVehicleId, driverInput.trim());
      await loadData();
      setAssignModalVisible(false);
      setDriverInput('');
    } catch (err) {
      Alert.alert('Assign Failed', err?.message || 'Driver not found');
    } finally {
      setAssignLoading(false);
    }
  };

  const vehicleCount = parseInt(fleet?.vehicle_count || vehicles.length, 10);
  const maxVehicles  = fleet?.max_vehicles || 15;
  const minVehicles  = fleet?.min_vehicles || 5;

  const driversAssigned = vehicles.filter((v) => !!v.assigned_driver_id);
  const maxEarnings = earnings?.vehicles
    ? Math.max(...earnings.vehicles.map((v) => parseInt(v.earnings, 10)))
    : 0;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{fleetName || 'Fleet'}</Text>
        <TouchableOpacity
          style={styles.addVehicleBtn}
          onPress={() => navigation.navigate('AddVehicle', { fleetId, fleetName, maxVehicles, vehicleCount })}
          activeOpacity={0.85}
          disabled={vehicleCount >= maxVehicles}
        >
          <Ionicons name="add" size={18} color={vehicleCount >= maxVehicles ? '#CCC' : '#fff'} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={PRIMARY} />
          <Text style={styles.loadingText}>Loading fleet...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PRIMARY} />}
        >
          {/* ── VEHICLES TAB ── */}
          {activeTab === 'Vehicles' && (
            <View>
              {/* Progress bar */}
              <View style={styles.vehicleProgress}>
                <View style={styles.vpTop}>
                  <Text style={styles.vpTitle}>{vehicleCount} / {maxVehicles} vehicles</Text>
                  {vehicleCount >= maxVehicles && (
                    <View style={styles.fullBadge}><Text style={styles.fullBadgeText}>FULL</Text></View>
                  )}
                </View>
                <View style={styles.vpTrack}>
                  <View style={[styles.vpFill, {
                    width: `${(vehicleCount / maxVehicles) * 100}%`,
                    backgroundColor: vehicleCount >= 5 ? PRIMARY : '#F5A623',
                  }]} />
                </View>
              </View>

              {/* Banners */}
              {vehicleCount < minVehicles && (
                <View style={styles.warningBanner}>
                  <Ionicons name="warning-outline" size={16} color="#F5A623" />
                  <Text style={styles.warningText}>
                    Add {minVehicles - vehicleCount} more vehicle{minVehicles - vehicleCount !== 1 ? 's' : ''} to activate this fleet
                  </Text>
                </View>
              )}
              {vehicleCount >= minVehicles && fleet?.is_active && (
                <View style={styles.successBanner}>
                  <Ionicons name="checkmark-circle" size={16} color="#00A651" />
                  <Text style={styles.successText}>Fleet is active!</Text>
                </View>
              )}

              {vehicles.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyEmoji}>🚗</Text>
                  <Text style={styles.emptyTitle}>No vehicles yet</Text>
                  <Text style={styles.emptySubtitle}>Tap the + button to add your first vehicle</Text>
                </View>
              ) : (
                vehicles.map((v) => (
                  <VehicleCard
                    key={v.id}
                    vehicle={v}
                    onAssignDriver={() => {
                      setAssignVehicleId(v.id);
                      setAssignModalVisible(true);
                    }}
                    onRemove={() => handleRemoveVehicle(v.id, v.plate)}
                    onTap={() => navigation.navigate('VehicleDetail', { vehicleId: v.id, fleetId })}
                  />
                ))
              )}

              {/* FAB */}
              {vehicleCount < maxVehicles && (
                <TouchableOpacity
                  style={styles.fab}
                  onPress={() => navigation.navigate('AddVehicle', { fleetId, fleetName, maxVehicles, vehicleCount })}
                  activeOpacity={0.88}
                >
                  <Ionicons name="add" size={24} color="#fff" />
                  <Text style={styles.fabText}>Add Vehicle</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ── DRIVERS TAB ── */}
          {activeTab === 'Drivers' && (
            <View>
              <Text style={styles.tabSectionTitle}>Assigned Drivers</Text>
              {driversAssigned.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyEmoji}>👤</Text>
                  <Text style={styles.emptyTitle}>No drivers assigned</Text>
                  <Text style={styles.emptySubtitle}>
                    Go to the Vehicles tab to assign drivers to each vehicle
                  </Text>
                </View>
              ) : (
                driversAssigned.map((v) => <DriverRow key={v.id} vehicle={v} />)
              )}
            </View>
          )}

          {/* ── EARNINGS TAB ── */}
          {activeTab === 'Earnings' && (
            <View>
              {/* Period selector */}
              <View style={styles.periodRow}>
                {PERIODS.map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[styles.periodPill, earningsPeriod === p && styles.periodPillActive]}
                    onPress={() => setEarningsPeriod(p)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.periodPillText, earningsPeriod === p && styles.periodPillTextActive]}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {earningsLoading ? (
                <ActivityIndicator color={PRIMARY} style={{ marginTop: 40 }} />
              ) : earnings ? (
                <View>
                  <View style={styles.totalEarningsCard}>
                    <Text style={styles.totalEarningsLabel}>Total Earnings</Text>
                    <Text style={styles.totalEarningsValue}>{formatXAF(earnings.total_earnings)}</Text>
                    <Text style={styles.totalEarningsSub}>This {earningsPeriod}</Text>
                  </View>

                  <Text style={styles.tabSectionTitle}>Per Vehicle</Text>
                  {(earnings.vehicles || []).map((v) => (
                    <EarningsBar
                      key={v.id}
                      label={`${v.make} ${v.model} · ${v.plate}`}
                      value={parseInt(v.earnings, 10)}
                      maxValue={maxEarnings}
                    />
                  ))}
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyEmoji}>📊</Text>
                  <Text style={styles.emptyTitle}>No earnings data</Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      )}

      {/* Assign Driver Modal */}
      <Modal
        visible={assignModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAssignModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Assign Driver</Text>
            <Text style={styles.modalSubtitle}>Enter the phone number or email of a registered MOBO driver</Text>
            <TextInput
              style={styles.modalInput}
              value={driverInput}
              onChangeText={setDriverInput}
              placeholder="+237 6XX XXX XXX or driver@email.com"
              placeholderTextColor="#C0C0C0"
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TouchableOpacity
              style={[styles.modalConfirmBtn, assignLoading && { opacity: 0.7 }]}
              onPress={handleAssignDriver}
              disabled={assignLoading}
              activeOpacity={0.88}
            >
              {assignLoading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.modalConfirmText}>Assign Driver</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => { setAssignModalVisible(false); setDriverInput(''); }}
              activeOpacity={0.7}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F8F8' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F6F6F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: '#1A1A1A', letterSpacing: -0.2 },
  addVehicleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: PRIMARY,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    paddingHorizontal: spacing.lg,
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: PRIMARY },
  tabText: { fontSize: 14, fontWeight: '600', color: '#888' },
  tabTextActive: { color: PRIMARY },
  content: { padding: spacing.lg, paddingBottom: 100 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  loadingText: { marginTop: 12, color: '#888', fontSize: 14 },

  // Vehicle progress
  vehicleProgress: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  vpTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  vpTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  fullBadge: { backgroundColor: '#FFE4E4', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  fullBadgeText: { fontSize: 11, fontWeight: '700', color: '#E53935' },
  vpTrack: { height: 8, backgroundColor: '#F0F0F0', borderRadius: 4, overflow: 'hidden' },
  vpFill: { height: '100%', borderRadius: 4 },

  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    borderRadius: 10,
    padding: 10,
    gap: 8,
    marginBottom: spacing.md,
  },
  warningText: { flex: 1, fontSize: 13, color: '#D97706', fontWeight: '500' },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    padding: 10,
    gap: 8,
    marginBottom: spacing.md,
  },
  successText: { fontSize: 13, color: '#00A651', fontWeight: '600' },

  // Vehicle card
  vehicleCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  vehicleCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  vehicleIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,0,191,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  vehicleInfo: { flex: 1 },
  vehicleName: { fontSize: 14, fontWeight: '700', color: '#1A1A1A' },
  vehiclePlate: { fontSize: 13, color: '#555', fontWeight: '600', marginTop: 1 },
  vehicleType: { fontSize: 12, color: '#888', marginTop: 1 },
  approvalBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  approvedBadge: { backgroundColor: '#E8F5E9' },
  pendingBadge:  { backgroundColor: '#FFF3E0' },
  approvalBadgeText: { fontSize: 11, fontWeight: '700', color: '#555' },
  vehicleCardDriver: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F4F4F4',
  },
  driverChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F6F6F6',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  driverChipText: { fontSize: 12, color: '#444', fontWeight: '500' },
  assignDriverBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PRIMARY,
  },
  assignDriverBtnText: { fontSize: 12, color: PRIMARY, fontWeight: '600' },
  removeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFF0F0',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // FAB
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PRIMARY,
    borderRadius: 28,
    height: 52,
    marginTop: 8,
    gap: 8,
    ...shadows.lg,
  },
  fabText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Drivers tab
  tabSectionTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', marginBottom: spacing.md },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: 10,
    gap: 12,
    ...shadows.sm,
  },
  driverAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: PRIMARY,
    justifyContent: 'center',
    alignItems: 'center',
  },
  driverAvatarText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  driverRowInfo: { flex: 1 },
  driverRowName: { fontSize: 14, fontWeight: '700', color: '#1A1A1A' },
  driverRowVehicle: { fontSize: 12, color: '#888', marginTop: 2 },

  // Earnings tab
  periodRow: { flexDirection: 'row', gap: 8, marginBottom: spacing.md },
  periodPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#F0F0F0',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  periodPillActive: { backgroundColor: 'rgba(255,0,191,0.08)', borderColor: PRIMARY },
  periodPillText: { fontSize: 13, fontWeight: '600', color: '#888' },
  periodPillTextActive: { color: PRIMARY },
  totalEarningsCard: {
    backgroundColor: PRIMARY,
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  totalEarningsLabel: { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: '500', marginBottom: 4 },
  totalEarningsValue: { fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  totalEarningsSub: { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 4 },
  earningsBarRow: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: 8,
    ...shadows.sm,
  },
  earningsBarLabel: { fontSize: 12, fontWeight: '600', color: '#444', marginBottom: 6 },
  earningsBarTrack: { height: 6, backgroundColor: '#F0F0F0', borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  earningsBarFill: { height: '100%', backgroundColor: PRIMARY, borderRadius: 3 },
  earningsBarValue: { fontSize: 12, fontWeight: '700', color: '#1A1A1A' },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', marginBottom: 6 },
  emptySubtitle: { fontSize: 13, color: '#888', textAlign: 'center', lineHeight: 18, paddingHorizontal: 20 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    paddingBottom: 40,
  },
  modalHandle: { width: 40, height: 4, backgroundColor: '#E0E0E0', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#1A1A1A', marginBottom: 4 },
  modalSubtitle: { fontSize: 14, color: '#888', lineHeight: 20, marginBottom: spacing.md },
  modalInput: {
    backgroundColor: '#F6F6F6',
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1A1A1A',
    marginBottom: spacing.md,
  },
  modalConfirmBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 28,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalConfirmText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  modalCancelBtn: { height: 44, justifyContent: 'center', alignItems: 'center' },
  modalCancelText: { fontSize: 15, color: '#888', fontWeight: '500' },
});

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
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fleetService } from '../../services/fleet';
import { colors, spacing, shadows } from '../../theme';

const PRIMARY = '#FF00BF';

function formatXAF(n) {
  return 'XAF ' + Number(n || 0).toLocaleString('fr-CM');
}

function InfoRow({ icon, label, value }) {
  if (!value && value !== 0) return null;
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIconWrap}>
        <Ionicons name={icon} size={16} color="#888" />
      </View>
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function VehicleDetailScreen({ route, navigation }) {
  const { vehicleId, fleetId } = route.params;
  const [vehicle, setVehicle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [driverInput, setDriverInput] = useState('');
  const [assignLoading, setAssignLoading] = useState(false);
  const [removeLoading, setRemoveLoading] = useState(false);

  const loadVehicle = useCallback(async () => {
    try {
      const res = await fleetService.getFleet(fleetId);
      const found = (res.data.vehicles || []).find((v) => v.id === vehicleId);
      if (found) setVehicle(found);
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to load vehicle');
    } finally {
      setLoading(false);
    }
  }, [vehicleId, fleetId]);

  useEffect(() => { loadVehicle(); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadVehicle();
    setRefreshing(false);
  }, [loadVehicle]);

  const handleAssignDriver = async () => {
    if (!driverInput.trim()) return;
    setAssignLoading(true);
    try {
      await fleetService.assignDriver(fleetId, vehicleId, driverInput.trim());
      await loadVehicle();
      setAssignModalVisible(false);
      setDriverInput('');
    } catch (err) {
      Alert.alert('Assign Failed', err?.message || 'Driver not found');
    } finally {
      setAssignLoading(false);
    }
  };

  const handleUnassignDriver = () => {
    Alert.alert(
      'Unassign Driver',
      `Remove ${vehicle.assigned_driver_name} from this vehicle?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unassign',
          style: 'destructive',
          onPress: async () => {
            try {
              await fleetService.unassignDriver(fleetId, vehicleId);
              await loadVehicle();
            } catch (err) {
              Alert.alert('Error', err?.message || 'Failed to unassign driver');
            }
          },
        },
      ]
    );
  };

  const handleRemoveVehicle = () => {
    Alert.alert(
      'Remove Vehicle',
      `Remove ${vehicle?.make} ${vehicle?.model} (${vehicle?.plate}) from the fleet? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemoveLoading(true);
            try {
              await fleetService.removeVehicle(fleetId, vehicleId);
              navigation.goBack();
            } catch (err) {
              Alert.alert('Cannot Remove', err?.message || 'Failed to remove vehicle');
            } finally {
              setRemoveLoading(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={PRIMARY} />
        </View>
      </SafeAreaView>
    );
  }

  if (!vehicle) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={22} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Vehicle Not Found</Text>
          <View style={{ width: 36 }} />
        </View>
      </SafeAreaView>
    );
  }

  const insuranceDays = daysUntil(vehicle.insurance_expiry);
  const insuranceWarning = insuranceDays !== null && insuranceDays <= 30;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{vehicle.make} {vehicle.model}</Text>
        <TouchableOpacity
          style={styles.editBtn}
          onPress={() => navigation.navigate('EditVehicle', { vehicleId, fleetId, vehicle })}
          activeOpacity={0.8}
        >
          <Ionicons name="pencil-outline" size={18} color="#555" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PRIMARY} />}
      >
        {/* Photo gallery placeholder */}
        <View style={styles.photoGallery}>
          <View style={styles.photoPlaceholder}>
            <Ionicons name="car-outline" size={48} color="#D0D0D0" />
            <Text style={styles.photoPlaceholderText}>{vehicle.make} {vehicle.model} {vehicle.year}</Text>
          </View>
        </View>

        {/* Plate + approval badge */}
        <View style={styles.plateRow}>
          <View style={styles.plateBadge}>
            <Text style={styles.plateBadgeText}>{vehicle.plate}</Text>
          </View>
          <View style={[styles.approvalBadge, vehicle.is_approved ? styles.approvedBadge : styles.pendingBadge]}>
            <Ionicons
              name={vehicle.is_approved ? 'checkmark-circle-outline' : 'time-outline'}
              size={13}
              color={vehicle.is_approved ? '#00A651' : '#F5A623'}
            />
            <Text style={[styles.approvalText, { color: vehicle.is_approved ? '#00A651' : '#F5A623' }]}>
              {vehicle.is_approved ? 'Approved' : 'Pending Approval'}
            </Text>
          </View>
        </View>

        {/* Insurance warning */}
        {insuranceWarning && (
          <View style={styles.insuranceWarning}>
            <Ionicons name="warning-outline" size={16} color="#E53935" />
            <Text style={styles.insuranceWarningText}>
              {insuranceDays <= 0
                ? 'Insurance has expired! Renew immediately.'
                : `Insurance expires in ${insuranceDays} day${insuranceDays !== 1 ? 's' : ''}. Renew soon.`}
            </Text>
          </View>
        )}

        {/* Vehicle info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Vehicle Details</Text>
          <InfoRow icon="car-outline"        label="Make & Model" value={`${vehicle.make} ${vehicle.model}`} />
          <InfoRow icon="calendar-outline"   label="Year"         value={String(vehicle.year)} />
          <InfoRow icon="color-palette-outline" label="Color"     value={vehicle.color} />
          <InfoRow icon="options-outline"    label="Type"         value={vehicle.vehicle_type ? vehicle.vehicle_type.charAt(0).toUpperCase() + vehicle.vehicle_type.slice(1) : ''} />
          <InfoRow icon="people-outline"     label="Seats"        value={`${vehicle.seats} seats`} />
          {vehicle.is_wheelchair_accessible && (
            <InfoRow icon="accessibility-outline" label="Accessibility" value="Wheelchair Accessible" />
          )}
        </View>

        {/* Insurance */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Insurance</Text>
          {vehicle.insurance_expiry ? (
            <InfoRow
              icon="shield-outline"
              label="Expiry Date"
              value={new Date(vehicle.insurance_expiry).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            />
          ) : (
            <TouchableOpacity style={styles.uploadDocBtn} activeOpacity={0.8}>
              <Ionicons name="cloud-upload-outline" size={16} color={PRIMARY} />
              <Text style={styles.uploadDocText}>Upload Insurance Document</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Assigned driver */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Assigned Driver</Text>
          {vehicle.assigned_driver_id ? (
            <View>
              <View style={styles.driverInfo}>
                <View style={styles.driverAvatar}>
                  <Text style={styles.driverAvatarText}>
                    {(vehicle.assigned_driver_name || 'D').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.driverDetails}>
                  <Text style={styles.driverName}>{vehicle.assigned_driver_name}</Text>
                  <Text style={styles.driverPhone}>{vehicle.assigned_driver_phone}</Text>
                  {vehicle.assigned_driver_rating && (
                    <View style={styles.ratingRow}>
                      <Ionicons name="star" size={12} color="#F5A623" />
                      <Text style={styles.ratingText}>{vehicle.assigned_driver_rating}</Text>
                    </View>
                  )}
                </View>
              </View>
              <TouchableOpacity style={styles.unassignBtn} onPress={handleUnassignDriver} activeOpacity={0.8}>
                <Text style={styles.unassignBtnText}>Unassign Driver</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <Text style={styles.noDriverText}>No driver assigned to this vehicle</Text>
              <TouchableOpacity
                style={styles.assignBtn}
                onPress={() => setAssignModalVisible(true)}
                activeOpacity={0.85}
              >
                <Ionicons name="person-add-outline" size={16} color="#fff" />
                <Text style={styles.assignBtnText}>Assign Driver</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Remove vehicle */}
        <TouchableOpacity
          style={[styles.removeBtn, removeLoading && { opacity: 0.6 }]}
          onPress={handleRemoveVehicle}
          activeOpacity={0.85}
          disabled={removeLoading}
        >
          {removeLoading ? (
            <ActivityIndicator color="#E53935" />
          ) : (
            <>
              <Ionicons name="trash-outline" size={18} color="#E53935" />
              <Text style={styles.removeBtnText}>Remove from Fleet</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 20 }} />
      </ScrollView>

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
            <Text style={styles.modalSubtitle}>
              Enter the phone number or email of a registered MOBO driver
            </Text>
            <TextInput
              style={styles.modalInput}
              value={driverInput}
              onChangeText={setDriverInput}
              placeholder="+237 6XX XXX XXX or driver@email.com"
              placeholderTextColor="#C0C0C0"
              autoCapitalize="none"
              keyboardType="email-address"
              autoFocus
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
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F6F6F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: '#1A1A1A' },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F6F6F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { paddingBottom: 40 },

  // Photo gallery
  photoGallery: {
    height: 200,
    backgroundColor: '#F0F0F0',
  },
  photoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  photoPlaceholderText: { fontSize: 14, color: '#AAA', fontWeight: '500' },

  // Plate row
  plateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: spacing.lg,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F4F4F4',
  },
  plateBadge: {
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  plateBadgeText: { color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 2 },
  approvalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    gap: 4,
  },
  approvedBadge: { backgroundColor: '#E8F5E9' },
  pendingBadge:  { backgroundColor: '#FFF3E0' },
  approvalText: { fontSize: 12, fontWeight: '700' },

  // Insurance warning
  insuranceWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    gap: 8,
  },
  insuranceWarningText: { flex: 1, fontSize: 13, color: '#E53935', fontWeight: '500' },

  // Cards
  card: {
    backgroundColor: '#fff',
    margin: spacing.md,
    marginBottom: 0,
    borderRadius: 16,
    padding: spacing.md,
    ...shadows.sm,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#888', marginBottom: spacing.md, letterSpacing: 0.5, textTransform: 'uppercase' },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F8F8F8',
    gap: 10,
  },
  infoIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F6F6F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: 11, color: '#AAA', fontWeight: '500', marginBottom: 2 },
  infoValue: { fontSize: 14, color: '#1A1A1A', fontWeight: '600' },

  uploadDocBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  uploadDocText: { fontSize: 14, color: PRIMARY, fontWeight: '600' },

  // Driver section
  driverInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: spacing.md },
  driverAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: PRIMARY,
    justifyContent: 'center',
    alignItems: 'center',
  },
  driverAvatarText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  driverDetails: { flex: 1 },
  driverName: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  driverPhone: { fontSize: 13, color: '#888', marginTop: 2 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  ratingText: { fontSize: 13, fontWeight: '600', color: '#1A1A1A' },
  unassignBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F4F4F4',
  },
  unassignBtnText: { fontSize: 14, color: '#E53935', fontWeight: '600' },
  noDriverText: { fontSize: 14, color: '#888', marginBottom: spacing.md, textAlign: 'center' },
  assignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PRIMARY,
    borderRadius: 20,
    paddingVertical: 12,
    gap: 6,
  },
  assignBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Remove button
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    margin: spacing.md,
    marginTop: spacing.lg,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#FFCDD2',
    backgroundColor: '#FFF5F5',
    gap: 8,
  },
  removeBtnText: { fontSize: 15, fontWeight: '600', color: '#E53935' },

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

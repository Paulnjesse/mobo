import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, Alert, ActivityIndicator, KeyboardAvoidingView,
  Platform, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadows } from '../theme';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

// ── Status helpers ────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  pending:   { label: 'Pending',   color: '#F59E0B', bg: '#FFF8EC' },
  assigned:  { label: 'Assigned',  color: '#3B82F6', bg: '#EFF6FF' },
  completed: { label: 'Completed', color: '#22C55E', bg: '#F0FFF4' },
  cancelled: { label: 'Cancelled', color: '#EF4444', bg: '#FFF5F5' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <View style={styles.emptyWrap}>
      <Ionicons name="car-sport-outline" size={56} color={colors.gray300} />
      <Text style={styles.emptyTitle}>No concierge bookings yet</Text>
      <Text style={styles.emptyBody}>
        Tap "New Booking" to arrange a premium ride on behalf of a passenger.
      </Text>
    </View>
  );
}

// ── Booking card ──────────────────────────────────────────────────────────────
function BookingCard({ booking }) {
  const scheduledAt = booking.scheduled_at
    ? new Date(booking.scheduled_at).toLocaleString('en-US', {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : null;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardAvatar}>
          <Text style={styles.cardAvatarText}>
            {(booking.passenger_name || 'P')[0].toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardName}>{booking.passenger_name}</Text>
          <Text style={styles.cardPhone}>{booking.passenger_phone}</Text>
        </View>
        <StatusBadge status={booking.status} />
      </View>

      <View style={styles.cardRoute}>
        <View style={styles.routeRow}>
          <View style={[styles.routeDot, { backgroundColor: colors.primary }]} />
          <Text style={styles.routeText} numberOfLines={1}>{booking.pickup_address}</Text>
        </View>
        <View style={styles.routeConnector} />
        <View style={styles.routeRow}>
          <View style={[styles.routeDot, { backgroundColor: colors.text, borderRadius: 2 }]} />
          <Text style={styles.routeText} numberOfLines={1}>{booking.dropoff_address}</Text>
        </View>
      </View>

      {(scheduledAt || booking.notes) && (
        <View style={styles.cardMeta}>
          {scheduledAt && (
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
              <Text style={styles.metaText}>{scheduledAt}</Text>
            </View>
          )}
          {booking.notes ? (
            <View style={styles.metaItem}>
              <Ionicons name="chatbubble-ellipses-outline" size={13} color={colors.textSecondary} />
              <Text style={styles.metaText} numberOfLines={1}>{booking.notes}</Text>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

// ── Form modal ────────────────────────────────────────────────────────────────
function NewBookingModal({ visible, onClose, onCreated }) {
  const [form, setForm] = useState({
    passenger_name: '',
    passenger_phone: '',
    pickup_address: '',
    dropoff_address: '',
    scheduled_at: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const set = (field) => (val) => setForm((f) => ({ ...f, [field]: val }));

  const reset = () =>
    setForm({ passenger_name: '', passenger_phone: '', pickup_address: '', dropoff_address: '', scheduled_at: '', notes: '' });

  const submit = async () => {
    if (!form.passenger_name.trim()) return Alert.alert('Required', 'Passenger name is required.');
    if (!form.passenger_phone.trim()) return Alert.alert('Required', 'Passenger phone is required.');
    if (!form.pickup_address.trim()) return Alert.alert('Required', 'Pickup address is required.');
    if (!form.dropoff_address.trim()) return Alert.alert('Required', 'Dropoff address is required.');

    setSaving(true);
    try {
      const payload = {
        passenger_name: form.passenger_name.trim(),
        passenger_phone: form.passenger_phone.trim(),
        pickup_address: form.pickup_address.trim(),
        dropoff_address: form.dropoff_address.trim(),
        notes: form.notes.trim() || undefined,
        scheduled_at: form.scheduled_at.trim() || undefined,
      };
      const res = await api.post('/rides/concierge', payload);
      reset();
      onCreated(res.data.booking);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to create booking.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={styles.modalRoot}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New Concierge Booking</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalClose}>
              <Ionicons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldGroup}>Passenger</Text>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Full Name *</Text>
              <TextInput
                style={styles.fieldInput}
                value={form.passenger_name}
                onChangeText={set('passenger_name')}
                placeholder="e.g. Jean-Paul Mbarga"
                placeholderTextColor={colors.gray400}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Phone Number *</Text>
              <TextInput
                style={styles.fieldInput}
                value={form.passenger_phone}
                onChangeText={set('passenger_phone')}
                placeholder="+237 6XX XXX XXX"
                placeholderTextColor={colors.gray400}
                keyboardType="phone-pad"
              />
            </View>

            <Text style={[styles.fieldGroup, { marginTop: spacing.md }]}>Route</Text>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Pickup Address *</Text>
              <TextInput
                style={[styles.fieldInput, styles.fieldInputMulti]}
                value={form.pickup_address}
                onChangeText={set('pickup_address')}
                placeholder="Enter pickup location"
                placeholderTextColor={colors.gray400}
                multiline
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Dropoff Address *</Text>
              <TextInput
                style={[styles.fieldInput, styles.fieldInputMulti]}
                value={form.dropoff_address}
                onChangeText={set('dropoff_address')}
                placeholder="Enter destination"
                placeholderTextColor={colors.gray400}
                multiline
              />
            </View>

            <Text style={[styles.fieldGroup, { marginTop: spacing.md }]}>Details</Text>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Scheduled Time (optional)</Text>
              <TextInput
                style={styles.fieldInput}
                value={form.scheduled_at}
                onChangeText={set('scheduled_at')}
                placeholder="e.g. 2025-06-15 14:30"
                placeholderTextColor={colors.gray400}
              />
              <Text style={styles.fieldHint}>Leave blank for immediate dispatch</Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Notes (optional)</Text>
              <TextInput
                style={[styles.fieldInput, styles.fieldInputMulti]}
                value={form.notes}
                onChangeText={set('notes')}
                placeholder="Special instructions, luggage, accessibility needs…"
                placeholderTextColor={colors.gray400}
                multiline
              />
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, saving && { opacity: 0.6 }]}
              onPress={submit}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color={colors.white} />
                  <Text style={styles.submitBtnText}>Create Booking</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function ConciergeBookingScreen({ navigation }) {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Access check — admin or corporate admin/manager
  const canCreate =
    user?.role === 'admin' ||
    user?.corporate_role === 'admin' ||
    user?.corporate_role === 'manager';

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/rides/concierge');
      setBookings(res.data.bookings || []);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to load bookings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreated = (booking) => {
    setBookings((prev) => [booking, ...prev]);
    setShowModal(false);
    Alert.alert('Booking Created', `Concierge booking for ${booking.passenger_name} has been submitted.`);
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Concierge Bookings</Text>
          <Text style={styles.headerSub}>Premium rides on behalf of passengers</Text>
        </View>
        {canCreate && (
          <TouchableOpacity style={styles.newBtn} onPress={() => setShowModal(true)}>
            <Ionicons name="add" size={20} color={colors.white} />
            <Text style={styles.newBtnText}>New</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Stats strip */}
      {!loading && bookings.length > 0 && (
        <View style={styles.statsStrip}>
          {[
            { label: 'Total',     value: bookings.length },
            { label: 'Pending',   value: bookings.filter((b) => b.status === 'pending').length },
            { label: 'Assigned',  value: bookings.filter((b) => b.status === 'assigned').length },
            { label: 'Completed', value: bookings.filter((b) => b.status === 'completed').length },
          ].map((s) => (
            <View key={s.label} style={styles.statItem}>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}

      {/* List */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : bookings.length === 0 ? (
        <EmptyState />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        >
          {bookings.map((b) => (
            <BookingCard key={b.id} booking={b} />
          ))}
        </ScrollView>
      )}

      {/* Access notice for non-privileged users */}
      {!canCreate && !loading && (
        <View style={styles.accessNotice}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.accessNoticeText}>
            Creating concierge bookings requires a corporate admin or manager role.
          </Text>
        </View>
      )}

      <NewBookingModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onCreated={handleCreated}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
    gap: spacing.sm,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  headerSub: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  newBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
  },
  newBtnText: { fontSize: 13, fontWeight: '700', color: colors.white },

  // Stats
  statsStrip: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
    paddingVertical: spacing.sm,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },

  // List
  list: { padding: spacing.md, paddingBottom: 32, gap: spacing.sm },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Card
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadows.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  cardAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  cardAvatarText: { fontSize: 16, fontWeight: '800', color: colors.white },
  cardName: { fontSize: 15, fontWeight: '700', color: colors.text },
  cardPhone: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },

  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  badgeText: { fontSize: 11, fontWeight: '700' },

  cardRoute: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  routeDot: { width: 9, height: 9, borderRadius: 5 },
  routeText: { flex: 1, fontSize: 13, color: colors.text, fontWeight: '500' },
  routeConnector: { width: 1, height: 12, backgroundColor: colors.gray300, marginLeft: 4, marginVertical: 2 },

  cardMeta: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: colors.textSecondary },

  // Empty
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text, textAlign: 'center' },
  emptyBody: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },

  // Access notice
  accessNotice: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    margin: spacing.md,
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  accessNoticeText: { flex: 1, fontSize: 12, color: colors.textSecondary, lineHeight: 16 },

  // Modal
  modalRoot: { flex: 1, backgroundColor: colors.white },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  modalClose: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  modalScroll: { padding: spacing.md, paddingBottom: 48 },

  fieldGroup: {
    fontSize: 12, fontWeight: '700', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  field: { marginBottom: spacing.md },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  fieldInput: {
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.gray200,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    fontSize: 14, color: colors.text,
  },
  fieldInputMulti: { minHeight: 72, textAlignVertical: 'top' },
  fieldHint: { fontSize: 11, color: colors.textSecondary, marginTop: 4 },

  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    height: 54,
    marginTop: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  submitBtnText: { fontSize: 15, fontWeight: '700', color: colors.white },
});

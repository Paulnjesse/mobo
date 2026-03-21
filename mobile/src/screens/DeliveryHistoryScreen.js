import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadows } from '../theme';
import api from '../services/api';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const ACTIVE_STATUSES = ['pending', 'driver_assigned', 'driver_arriving', 'picked_up', 'in_transit'];
const TERMINAL_STATUSES = ['delivered', 'cancelled', 'failed'];

const SIZE_COLORS = {
  envelope:    { bg: 'rgba(59,130,246,0.12)', text: '#3B82F6' },
  small:       { bg: 'rgba(16,185,129,0.12)', text: '#10B981' },
  medium:      { bg: 'rgba(255,140,0,0.15)',   text: colors.warning },
  large:       { bg: 'rgba(255,0,191,0.12)',   text: colors.primary },
  extra_large: { bg: 'rgba(26,26,26,0.1)',     text: colors.text },
};

const STATUS_CHIPS = {
  pending:         { label: 'Pending',         color: colors.warning },
  driver_assigned: { label: 'Driver Assigned', color: '#3B82F6' },
  driver_arriving: { label: 'Arriving',        color: colors.warning },
  picked_up:       { label: 'Picked Up',       color: '#3B82F6' },
  in_transit:      { label: 'In Transit',      color: '#3B82F6' },
  delivered:       { label: 'Delivered',       color: colors.success },
  cancelled:       { label: 'Cancelled',       color: colors.danger },
  failed:          { label: 'Failed',          color: colors.danger },
};

function getSizeChipStyle(size) {
  return SIZE_COLORS[size] || { bg: colors.gray200, text: colors.textSecondary };
}

function getStatusChip(status) {
  return STATUS_CHIPS[status] || { label: status, color: colors.textSecondary };
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function truncate(str, max = 28) {
  if (!str) return '';
  return str.length > max ? str.substring(0, max) + '…' : str;
}

// ---------------------------------------------------------------------------
// Delivery card component
// ---------------------------------------------------------------------------
function DeliveryCard({ item, onTrack, onReorder }) {
  const isActive = ACTIVE_STATUSES.includes(item.status);
  const sizeChip = getSizeChipStyle(item.package_size);
  const statusChip = getStatusChip(item.status);
  const fare = item.fare != null ? `${Number(item.fare).toLocaleString()} XAF` : '–';

  return (
    <View style={styles.deliveryCard}>
      {/* Header row: date + package size chip */}
      <View style={styles.cardHeader}>
        <Text style={styles.cardDate}>{formatDate(item.created_at || item.createdAt)}</Text>
        <View style={[styles.sizeChip, { backgroundColor: sizeChip.bg }]}>
          <Text style={[styles.sizeChipText, { color: sizeChip.text }]}>
            {item.package_size ? item.package_size.replace('_', ' ') : 'Package'}
          </Text>
        </View>
      </View>

      {/* Route row */}
      <View style={styles.routeRow}>
        <View style={styles.routeDots}>
          <View style={styles.dotPickup} />
          <View style={styles.dotLine} />
          <View style={styles.dotDropoff} />
        </View>
        <View style={styles.routeAddresses}>
          <Text style={styles.routeAddress} numberOfLines={1}>
            {truncate(item.pickup_address || item.pickup?.address || 'Pickup')}
          </Text>
          <Text style={styles.routeAddress} numberOfLines={1}>
            {truncate(item.dropoff_address || item.dropoff?.address || 'Drop-off')}
          </Text>
        </View>
        <Ionicons name="arrow-forward" size={16} color={colors.gray300} />
      </View>

      {/* Footer: status + fare + action button */}
      <View style={styles.cardFooter}>
        <View style={[styles.statusChip, { backgroundColor: statusChip.color + '18' }]}>
          <Text style={[styles.statusChipText, { color: statusChip.color }]}>{statusChip.label}</Text>
        </View>

        <Text style={styles.fareText}>{fare}</Text>

        {isActive ? (
          <TouchableOpacity style={styles.trackBtn} onPress={() => onTrack(item)} activeOpacity={0.8}>
            <Ionicons name="navigate-outline" size={14} color={colors.white} />
            <Text style={styles.trackBtnText}>Track</Text>
          </TouchableOpacity>
        ) : item.status === 'delivered' ? (
          <TouchableOpacity style={styles.reorderBtn} onPress={() => onReorder(item)} activeOpacity={0.8}>
            <Ionicons name="repeat-outline" size={14} color={colors.primary} />
            <Text style={styles.reorderBtnText}>Reorder</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function DeliveryHistoryScreen({ navigation }) {
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchDeliveries = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await api.get('/deliveries/mine');
      const data = res.data?.deliveries || res.data || [];
      setDeliveries(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load deliveries.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDeliveries();
  }, []);

  const handleTrack = (item) => {
    const id = item._id || item.id;
    navigation.navigate('DeliveryTracking', { deliveryId: id });
  };

  const handleReorder = (item) => {
    navigation.navigate('DeliveryBooking', {
      prefill: {
        pickup: item.pickup_address || item.pickup?.address,
        dropoff: item.dropoff_address || item.dropoff?.address,
        packageSize: item.package_size,
      },
    });
  };

  // Split into active and past
  const active = deliveries.filter((d) => ACTIVE_STATUSES.includes(d.status));
  const past = deliveries.filter((d) => !ACTIVE_STATUSES.includes(d.status));

  // ---------------------------------------------------------------------------
  // Render states
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading deliveries...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const ListHeader = () => (
    <>
      {/* Active deliveries section */}
      {active.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <View style={styles.activeDot} />
            <Text style={styles.sectionTitle}>Active Deliveries</Text>
          </View>
          {active.map((item) => (
            <DeliveryCard
              key={item._id || item.id}
              item={item}
              onTrack={handleTrack}
              onReorder={handleReorder}
            />
          ))}
        </View>
      )}

      {/* Past deliveries header */}
      {past.length > 0 && (
        <Text style={styles.pastHeader}>Past Deliveries</Text>
      )}
    </>
  );

  const EmptyComponent = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name="cube-outline" size={48} color={colors.gray300} />
      </View>
      <Text style={styles.emptyTitle}>No deliveries yet</Text>
      <Text style={styles.emptySubtitle}>Send your first package!</Text>
      <TouchableOpacity
        style={styles.emptyBtn}
        onPress={() => navigation.navigate('DeliveryBooking')}
        activeOpacity={0.88}
      >
        <Ionicons name="add" size={18} color={colors.white} />
        <Text style={styles.emptyBtnText}>Book a Delivery</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Deliveries</Text>
          <View style={styles.headerSpacer} />
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="warning-outline" size={16} color={colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => fetchDeliveries()}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        <FlatList
          data={past}
          keyExtractor={(item) => String(item._id || item.id)}
          ListHeaderComponent={<ListHeader />}
          ListEmptyComponent={deliveries.length === 0 ? <EmptyComponent /> : null}
          renderItem={({ item }) => (
            <DeliveryCard
              item={item}
              onTrack={handleTrack}
              onReorder={handleReorder}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchDeliveries(true)}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.white,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  headerSpacer: {
    width: 40,
  },
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontSize: 15,
    color: colors.textSecondary,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(227,24,55,0.08)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(227,24,55,0.15)',
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: colors.danger,
  },
  retryText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  section: {
    marginBottom: spacing.sm,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  pastHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  deliveryCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.gray200,
    ...shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  cardDate: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  sizeChip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  sizeChipText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  routeDots: {
    alignItems: 'center',
    paddingVertical: 2,
  },
  dotPickup: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#3B82F6',
    borderWidth: 2,
    borderColor: 'rgba(59,130,246,0.3)',
  },
  dotLine: {
    width: 2,
    height: 20,
    backgroundColor: colors.gray300,
  },
  dotDropoff: {
    width: 8,
    height: 8,
    borderRadius: 2,
    backgroundColor: colors.danger,
  },
  routeAddresses: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 8,
  },
  routeAddress: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '500',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusChip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  fareText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'right',
  },
  trackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#3B82F6',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  trackBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
  },
  reorderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,0,191,0.08)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,0,191,0.2)',
  },
  reorderBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: spacing.xxl + spacing.xl,
    paddingHorizontal: spacing.xl,
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  emptyBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
  },
});

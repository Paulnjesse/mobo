import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../context/LanguageContext';
import api from '../services/api';
import { colors, spacing, radius, shadows } from '../theme';

const POLL_INTERVAL_MS = 5000;
const POOL_TIMEOUT_MS  = 120000; // 2 minutes forming window

function formatFare(amount) {
  if (!amount && amount !== 0) return '–';
  return `${Math.round(Number(amount)).toLocaleString()} XAF`;
}

// ── Fare comparison card ──────────────────────────────────────────────────────
function FareComparisonCard({ estimate }) {
  if (!estimate) return null;
  const { solo_fare, pool_fare_1, pool_fare_2, pool_fare_4, distance_km, duration_min } = estimate;

  return (
    <View style={styles.compareCard}>
      <Text style={styles.compareTitle}>Fare comparison</Text>
      <Text style={styles.compareSubtitle}>
        {distance_km?.toFixed(1)} km · ~{Math.round(duration_min)} min
      </Text>
      <View style={styles.compareRows}>
        <View style={styles.compareRow}>
          <Ionicons name="person-outline" size={18} color={colors.textSecondary} />
          <Text style={styles.compareLabel}>Solo ride</Text>
          <Text style={styles.compareFare}>{formatFare(solo_fare)}</Text>
        </View>
        <View style={[styles.compareRow, styles.compareRowHighlight]}>
          <Ionicons name="people-outline" size={18} color={colors.primary} />
          <Text style={[styles.compareLabel, { color: colors.primary, fontWeight: '700' }]}>
            Pool (you + 1)
          </Text>
          <Text style={[styles.compareFare, { color: colors.primary }]}>{formatFare(pool_fare_2)}</Text>
        </View>
        <View style={styles.compareRow}>
          <Ionicons name="people-circle-outline" size={18} color={colors.textSecondary} />
          <Text style={styles.compareLabel}>Pool (3–4 riders)</Text>
          <Text style={styles.compareFare}>{formatFare(pool_fare_4)}</Text>
        </View>
      </View>
      <Text style={styles.savingsNote}>
        Save up to {Math.round(((solo_fare - pool_fare_4) / solo_fare) * 100)}% vs solo
      </Text>
    </View>
  );
}

// ── Waiting card shown while pool group is forming ────────────────────────────
function WaitingCard({ group, onCancel }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = Math.max(0, Math.round((POOL_TIMEOUT_MS / 1000) - elapsed));
  const riders     = group?.current_riders || 1;
  const maxRiders  = group?.max_riders || 4;

  return (
    <View style={styles.waitCard}>
      <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: spacing.md }} />
      <Text style={styles.waitTitle}>Finding pool partners…</Text>
      <Text style={styles.waitSubtitle}>
        {riders}/{maxRiders} rider{riders !== 1 ? 's' : ''} matched
      </Text>
      <View style={styles.dotsRow}>
        {Array.from({ length: maxRiders }).map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i < riders && styles.dotFilled]}
          />
        ))}
      </View>
      <Text style={styles.waitTimer}>
        {remaining > 0 ? `Dispatching in ${remaining}s if no more riders join` : 'Dispatching driver…'}
      </Text>
      <TouchableOpacity style={styles.cancelWaitBtn} onPress={onCancel}>
        <Text style={styles.cancelWaitText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function PoolRideScreen({ navigation, route }) {
  const { t } = useLanguage();
  const { pickup, dropoff, pickupCoords, dropoffCoords } = route.params || {};

  const pickupAddress  = pickup?.address  || (typeof pickup  === 'string' ? pickup  : '');
  const dropoffAddress = dropoff?.address || (typeof dropoff === 'string' ? dropoff : '');

  const [estimate, setEstimate]   = useState(null);
  const [loading, setLoading]     = useState(true);
  const [booking, setBooking]     = useState(false);
  const [groupId, setGroupId]     = useState(null);
  const [group, setGroup]         = useState(null);
  const [waiting, setWaiting]     = useState(false);
  const [dispatched, setDispatched] = useState(false);

  // ── Fetch fare estimate ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!pickupCoords || !dropoffCoords) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await api.get('/rides/pool/estimate', {
          params: {
            pickup_lat:   pickupCoords.latitude,
            pickup_lng:   pickupCoords.longitude,
            dropoff_lat:  dropoffCoords.latitude,
            dropoff_lng:  dropoffCoords.longitude,
          },
        });
        setEstimate(res.data?.data || res.data);
      } catch (err) {
        Alert.alert('Error', err.response?.data?.message || 'Could not get fare estimate.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Poll group status while waiting ────────────────────────────────────────
  useEffect(() => {
    if (!groupId || !waiting) return;

    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/rides/pool/groups/${groupId}`);
        const g = res.data?.data || res.data;
        setGroup(g);

        if (g?.status === 'active' || g?.driver_id) {
          clearInterval(interval);
          setWaiting(false);
          setDispatched(true);
        }
      } catch (_) {}
    }, POLL_INTERVAL_MS);

    // Timeout: dispatch anyway after 2 minutes
    const timeout = setTimeout(async () => {
      clearInterval(interval);
      if (!dispatched) {
        try {
          await api.post(`/rides/pool/groups/${groupId}/dispatch`);
        } catch (_) {}
        setWaiting(false);
        setDispatched(true);
      }
    }, POOL_TIMEOUT_MS);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [groupId, waiting]);

  // ── Navigate when driver dispatched ────────────────────────────────────────
  useEffect(() => {
    if (!dispatched || !group) return;
    const myRide = group.rides?.find((r) => r.is_mine);
    if (myRide) {
      navigation.replace('RideTracking', { rideId: myRide.id });
    } else {
      Alert.alert('Ride confirmed!', 'Your driver is on the way.', [
        { text: 'OK', onPress: () => navigation.navigate('Home') },
      ]);
    }
  }, [dispatched]);

  // ── Request pool ride ───────────────────────────────────────────────────────
  const handleBook = async () => {
    if (!pickupCoords || !dropoffCoords) {
      Alert.alert('Location Required', 'Please set your pickup and drop-off locations.');
      return;
    }

    setBooking(true);
    try {
      const res = await api.post('/rides/pool/request', {
        pickup_address:   pickupAddress,
        dropoff_address:  dropoffAddress,
        pickup_location:  pickupCoords,
        dropoff_location: dropoffCoords,
      });
      const data = res.data?.data || res.data;
      setGroupId(data.pool_group_id);
      setGroup(data.group);
      setWaiting(true);
    } catch (err) {
      Alert.alert('Booking Failed', err.response?.data?.message || 'Could not request pool ride.');
    } finally {
      setBooking(false);
    }
  };

  const handleCancelWait = () => {
    setWaiting(false);
    setGroupId(null);
    setGroup(null);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Getting fare estimate…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pool Ride</Text>
        <View style={{ width: 40 }} />
      </View>

      {waiting ? (
        <View style={styles.center}>
          <WaitingCard group={group} onCancel={handleCancelWait} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Route summary */}
          <View style={styles.routeCard}>
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, { backgroundColor: colors.success }]} />
              <Text style={styles.routeText} numberOfLines={1}>{pickupAddress || 'Current location'}</Text>
            </View>
            <View style={styles.routeLine} />
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, { backgroundColor: colors.primary }]} />
              <Text style={styles.routeText} numberOfLines={1}>{dropoffAddress || 'Destination'}</Text>
            </View>
          </View>

          {/* How pool works */}
          <View style={styles.infoCard}>
            <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.infoTitle}>How pool rides work</Text>
              <Text style={styles.infoBody}>
                You'll share the ride with up to 3 other riders going the same direction.
                Routes may add a few minutes. You save up to 30% on the fare.
              </Text>
            </View>
          </View>

          {/* Fare comparison */}
          <FareComparisonCard estimate={estimate} />

          {/* Pool fare highlight */}
          {estimate?.pool_fare_2 && (
            <View style={styles.yourFareCard}>
              <Text style={styles.yourFareLabel}>Your estimated fare</Text>
              <Text style={styles.yourFareValue}>{formatFare(estimate.pool_fare_2)}</Text>
              <Text style={styles.yourFareSub}>Final fare depends on number of riders</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Book button */}
      {!waiting && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.bookBtn, booking && styles.bookBtnDisabled]}
            onPress={handleBook}
            disabled={booking}
            activeOpacity={0.88}
          >
            {booking ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <>
                <Ionicons name="people-outline" size={20} color={colors.white} />
                <Text style={styles.bookBtnText}>Request Pool Ride</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: 14,
    color: colors.textSecondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.white,
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
  scroll: {
    padding: spacing.md,
    paddingBottom: 100,
  },
  routeCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  routeText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  routeLine: {
    width: 2,
    height: 16,
    backgroundColor: colors.gray300,
    marginLeft: 4,
    marginVertical: 3,
  },
  infoCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: 'rgba(255,0,191,0.05)',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,0,191,0.15)',
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  infoBody: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  compareCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  compareTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  compareSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  compareRows: {
    gap: spacing.sm,
  },
  compareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  compareRowHighlight: {
    backgroundColor: 'rgba(255,0,191,0.05)',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    marginHorizontal: -spacing.sm,
  },
  compareLabel: {
    flex: 1,
    fontSize: 14,
    color: colors.textSecondary,
  },
  compareFare: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  savingsNote: {
    marginTop: spacing.sm,
    fontSize: 12,
    color: colors.success,
    fontWeight: '600',
    textAlign: 'center',
  },
  yourFareCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  yourFareLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: spacing.xs,
  },
  yourFareValue: {
    fontSize: 36,
    fontWeight: '900',
    color: colors.primary,
    letterSpacing: -1,
  },
  yourFareSub: {
    fontSize: 12,
    color: colors.textLight,
    marginTop: spacing.xs,
  },
  // Waiting card
  waitCard: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    width: '100%',
    ...shadows.lg,
  },
  waitTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  waitSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.gray200,
  },
  dotFilled: {
    backgroundColor: colors.primary,
  },
  waitTimer: {
    fontSize: 12,
    color: colors.textLight,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  cancelWaitBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.gray300,
  },
  cancelWaitText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.gray200,
  },
  bookBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  bookBtnDisabled: { opacity: 0.7 },
  bookBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.white,
  },
});

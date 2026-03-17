import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../context/LanguageContext';
import { ridesService } from '../services/rides';
import RideCard from '../components/RideCard';
import { colors, spacing, radius, shadows } from '../theme';

const FILTERS = [
  { id: 'all', labelKey: 'allRides' },
  { id: 'completed', labelKey: 'completedRides' },
  { id: 'cancelled', labelKey: 'cancelledRides' },
];

export default function RideHistoryScreen({ navigation }) {
  const { t } = useLanguage();
  const [rides, setRides] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const loadRides = useCallback(async (reset = false) => {
    try {
      const currentPage = reset ? 1 : page;
      const params = { page: currentPage, limit: 20 };
      if (filter !== 'all') params.status = filter;
      const result = await ridesService.listRides(params);
      const newRides = result.rides || result.data || result || [];
      if (reset) {
        setRides(newRides);
        setPage(2);
      } else {
        setRides((prev) => [...prev, ...newRides]);
        setPage(currentPage + 1);
      }
      setHasMore(newRides.length === 20);
    } catch (err) {
      if (reset) setRides([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, page]);

  useEffect(() => {
    setLoading(true);
    setPage(1);
    setRides([]);
    loadRides(true);
  }, [filter]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setPage(1);
    await loadRides(true);
  }, [filter]);

  const handleRidePress = (ride) => {
    Alert.alert(
      'Ride Details',
      `From: ${ride.pickup?.address || '–'}\nTo: ${ride.dropoff?.address || '–'}\nStatus: ${ride.status}\nFare: ${Number(ride.fare || ride.totalFare || 0).toLocaleString()} XAF`,
      [{ text: 'Close' }]
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name="car-outline" size={48} color={colors.gray400} />
      </View>
      <Text style={styles.emptyTitle}>{t('noRidesYet')}</Text>
      <Text style={styles.emptySubtitle}>{t('startRiding')}</Text>
      <TouchableOpacity
        style={styles.emptyBtn}
        onPress={() => navigation.navigate('Home')}
        activeOpacity={0.88}
      >
        <Text style={styles.emptyBtnText}>Book a Ride</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('rideHistory')}</Text>
        <TouchableOpacity
          style={styles.notifBtn}
          onPress={() => navigation.navigate('Notifications')}
          activeOpacity={0.7}
        >
          <Ionicons name="notifications-outline" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Filter pills */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.id}
            style={[styles.filterPill, filter === f.id && styles.filterPillActive]}
            onPress={() => setFilter(f.id)}
            activeOpacity={0.8}
          >
            <Text style={[styles.filterPillText, filter === f.id && styles.filterPillTextActive]}>
              {t(f.labelKey)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      <FlatList
        data={rides}
        keyExtractor={(item, idx) => item._id || item.id || String(idx)}
        renderItem={({ item }) => (
          <RideCard ride={item} onPress={() => handleRidePress(item)} />
        )}
        ListEmptyComponent={!loading ? renderEmpty : null}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        onEndReached={() => { if (hasMore && !loading) loadRides(); }}
        onEndReachedThreshold={0.3}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3,
  },
  notifBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
    gap: spacing.sm,
  },
  filterPill: {
    paddingVertical: spacing.xs + 3,
    paddingHorizontal: spacing.md,
    borderRadius: radius.round,
    backgroundColor: colors.surface,
  },
  filterPillActive: {
    backgroundColor: colors.primary,
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterPillTextActive: {
    color: colors.white,
  },
  listContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
    flexGrow: 1,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyIconWrap: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  emptyBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xl,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyBtnText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 15,
  },
});

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, Alert, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadows } from '../theme';
import { ridesService } from '../services/rides';

function fmtTime(d) {
  return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function AirportModeScreen({ navigation }) {
  const [zones, setZones]         = useState([]);
  const [myPosition, setMyPosition] = useState(null);
  const [loading, setLoading]     = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [zonesData, posData] = await Promise.all([
        ridesService.getAirportZones(),
        ridesService.getMyAirportQueuePosition(),
      ]);
      setZones(zonesData.zones || []);
      setMyPosition(posData);
    } catch (err) {
      console.warn('[AirportMode] load error:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCheckIn = async (zone) => {
    setActionLoading(true);
    try {
      const result = await ridesService.airportCheckIn(zone.id);
      await loadData();
      Alert.alert('You\'re in the queue!',
        `${result.message}\n\nWhen a passenger requests a ride at this airport, you'll be dispatched in order.`
      );
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.error || 'Could not check in.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckOut = () => {
    Alert.alert('Leave Queue', 'Are you sure you want to leave the airport queue?', [
      { text: 'Stay' },
      {
        text: 'Leave', style: 'destructive', onPress: async () => {
          setActionLoading(true);
          try {
            await ridesService.airportCheckOut();
            await loadData();
          } catch { Alert.alert('Error', 'Could not leave queue.'); }
          finally { setActionLoading(false); }
        }
      }
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.loadingWrap}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  const isInQueue = myPosition?.airport_mode && myPosition?.position != null;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Airport Mode</Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadData}>
          <Ionicons name="refresh-outline" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* In-queue status banner */}
      {isInQueue && (
        <View style={styles.queueBanner}>
          <View style={styles.queueBannerLeft}>
            <Ionicons name="airplane" size={24} color={colors.white} />
            <View>
              <Text style={styles.queueBannerTitle}>You're in the queue!</Text>
              <Text style={styles.queueBannerSub}>{myPosition.zone_name}</Text>
            </View>
          </View>
          <View style={styles.queuePositionBadge}>
            <Text style={styles.queuePositionNum}>#{myPosition.position}</Text>
            <Text style={styles.queuePositionLabel}>position</Text>
          </View>
        </View>
      )}

      <FlatList
        data={zones}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            {/* How it works */}
            <View style={styles.howItWorksCard}>
              <Text style={styles.howTitle}>How Airport Mode Works</Text>
              {[
                { icon: 'location-outline',    text: 'Drive to an airport and check in to the queue' },
                { icon: 'list-outline',         text: 'Wait your turn — queue is first-come, first-served' },
                { icon: 'notifications-outline', text: "You'll be notified when a passenger needs a ride" },
                { icon: 'cash-outline',          text: 'Airport rides typically have higher fares' },
              ].map((item) => (
                <View key={item.text} style={styles.howRow}>
                  <View style={styles.howIcon}>
                    <Ionicons name={item.icon} size={18} color={colors.primary} />
                  </View>
                  <Text style={styles.howText}>{item.text}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.zonesTitle}>Available Airports</Text>
          </>
        }
        renderItem={({ item }) => {
          const isMyZone = isInQueue && myPosition.zone_name === item.name;
          return (
            <View style={[styles.zoneCard, isMyZone && styles.zoneCardActive]}>
              <View style={styles.zoneInfo}>
                <View style={styles.zoneIconWrap}>
                  <Ionicons name="airplane" size={22} color={isMyZone ? colors.white : colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.zoneName}>{item.name}</Text>
                  <Text style={styles.zoneCity}>{item.city}{item.iata_code ? ` · ${item.iata_code}` : ''}</Text>
                </View>
                {isMyZone && (
                  <View style={styles.activeTag}>
                    <Ionicons name="checkmark-circle" size={14} color={colors.white} />
                    <Text style={styles.activeTagText}>Active</Text>
                  </View>
                )}
              </View>

              {isMyZone ? (
                <View style={styles.myQueueInfo}>
                  <View style={styles.queueStatRow}>
                    {[
                      { label: 'Your Position', value: `#${myPosition.position}` },
                      { label: 'Total Waiting', value: myPosition.total_waiting ?? '–' },
                      { label: 'Est. Wait', value: myPosition.estimated_wait_minutes > 0 ? `~${myPosition.estimated_wait_minutes} min` : 'Next up!' },
                    ].map((stat) => (
                      <View key={stat.label} style={styles.queueStat}>
                        <Text style={styles.queueStatValue}>{stat.value}</Text>
                        <Text style={styles.queueStatLabel}>{stat.label}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.checkedInRow}>
                    <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                    <Text style={styles.checkedInText}>
                      Checked in at {fmtTime(myPosition.checked_in_at)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.leaveBtn, actionLoading && { opacity: 0.6 }]}
                    onPress={handleCheckOut}
                    disabled={actionLoading}
                  >
                    {actionLoading ? <ActivityIndicator color={colors.white} size="small" /> : (
                      <>
                        <Ionicons name="exit-outline" size={16} color={colors.white} />
                        <Text style={styles.leaveBtnText}>Leave Queue</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.checkInBtn, (isInQueue || actionLoading) && styles.checkInBtnDisabled]}
                  onPress={() => handleCheckIn(item)}
                  disabled={isInQueue || actionLoading}
                  activeOpacity={0.85}
                >
                  {actionLoading ? (
                    <ActivityIndicator color={colors.white} size="small" />
                  ) : (
                    <>
                      <Ionicons name="enter-outline" size={16} color={isInQueue ? colors.gray400 : colors.white} />
                      <Text style={[styles.checkInBtnText, isInQueue && { color: colors.gray400 }]}>
                        {isInQueue ? 'Already in a queue' : 'Join Queue at This Airport'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray200,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  refreshBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  queueBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.primary, padding: spacing.md,
  },
  queueBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  queueBannerTitle: { fontSize: 15, fontWeight: '800', color: colors.white },
  queueBannerSub: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  queuePositionBadge: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 6 },
  queuePositionNum: { fontSize: 22, fontWeight: '900', color: colors.white },
  queuePositionLabel: { fontSize: 10, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },

  list: { padding: spacing.md },
  howItWorksCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, ...shadows.sm },
  howTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  howRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 5 },
  howIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,0,191,0.08)', alignItems: 'center', justifyContent: 'center' },
  howText: { fontSize: 13, color: colors.text, flex: 1 },
  zonesTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },

  zoneCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadows.sm },
  zoneCardActive: { borderWidth: 2, borderColor: colors.primary },
  zoneInfo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  zoneIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,0,191,0.1)', alignItems: 'center', justifyContent: 'center' },
  zoneName: { fontSize: 14, fontWeight: '700', color: colors.text },
  zoneCity: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  activeTag: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  activeTagText: { fontSize: 11, fontWeight: '700', color: colors.white },

  myQueueInfo: {},
  queueStatRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.gray100, paddingTop: spacing.sm, marginBottom: spacing.sm },
  queueStat: { flex: 1, alignItems: 'center' },
  queueStatValue: { fontSize: 18, fontWeight: '900', color: colors.primary },
  queueStatLabel: { fontSize: 10, color: colors.textSecondary, fontWeight: '500', marginTop: 2, textAlign: 'center' },
  checkedInRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: spacing.sm },
  checkedInText: { fontSize: 12, color: colors.textSecondary },
  leaveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.danger || '#E31837', borderRadius: radius.pill, paddingVertical: 11,
  },
  leaveBtnText: { fontSize: 14, fontWeight: '700', color: colors.white },

  checkInBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: 12,
  },
  checkInBtnDisabled: { backgroundColor: colors.gray200 },
  checkInBtnText: { fontSize: 14, fontWeight: '700', color: colors.white },
});

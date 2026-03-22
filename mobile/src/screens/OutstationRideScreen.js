import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, StatusBar, FlatList, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadows } from '../theme';
import { ridesService } from '../services/rides';

const VEHICLE_TYPES = [
  { key: 'standard', label: 'Standard Sedan', icon: 'car-outline',      desc: 'Up to 4 passengers', multiplier: 1.0 },
  { key: 'comfort',  label: 'Comfort SUV',    icon: 'car-sport-outline', desc: 'Up to 6 passengers', multiplier: 1.5 },
  { key: 'luxury',   label: 'Luxury',         icon: 'diamond-outline',   desc: 'Executive class',     multiplier: 2.5 },
];

const DAYS_OPTIONS = [1, 2, 3, 4, 5, 6, 7];

function nextDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function fmtXAF(n) {
  return n ? `${Math.round(n).toLocaleString()} XAF` : '–';
}

function fmtDate(s) {
  if (!s) return '';
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function OutstationRideScreen({ navigation }) {
  const [cities, setCities] = useState([]);
  const [originCity, setOriginCity] = useState('');
  const [destCity, setDestCity]     = useState('');
  const [travelDate, setTravelDate] = useState(nextDays(1));
  const [days, setDays]             = useState(1);
  const [vehicle, setVehicle]       = useState('standard');
  const [passengers, setPassengers] = useState(1);
  const [estimate, setEstimate]     = useState(null);
  const [myBookings, setMyBookings] = useState([]);

  const [loadingCities, setLoadingCities]   = useState(true);
  const [loadingEst, setLoadingEst]         = useState(false);
  const [booking, setBooking]               = useState(false);
  const [tab, setTab]                       = useState('book');  // 'book' | 'trips'
  const [cityModal, setCityModal]           = useState(null);    // 'origin' | 'dest'

  useEffect(() => {
    ridesService.getOutstationCities()
      .then((d) => setCities(d.cities || []))
      .catch(() => {})
      .finally(() => setLoadingCities(false));
    loadMyBookings();
  }, []);

  const loadMyBookings = async () => {
    try {
      const d = await ridesService.getMyOutstationBookings();
      setMyBookings(d.bookings || []);
    } catch {}
  };

  const handleEstimate = useCallback(async () => {
    if (!originCity || !destCity) {
      Alert.alert('Required', 'Please select origin and destination cities.');
      return;
    }
    if (originCity === destCity) {
      Alert.alert('Invalid', 'Origin and destination must be different.');
      return;
    }
    setLoadingEst(true);
    try {
      const data = await ridesService.getOutstationEstimate(originCity, destCity, days, vehicle, passengers);
      setEstimate(data);
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.error || 'Could not get estimate.');
    } finally {
      setLoadingEst(false);
    }
  }, [originCity, destCity, days, vehicle, passengers]);

  useEffect(() => {
    if (originCity && destCity && originCity !== destCity) handleEstimate();
  }, [originCity, destCity, days, vehicle]);

  const handleBook = async () => {
    if (!estimate) return;
    setBooking(true);
    try {
      await ridesService.createOutstationBooking({
        origin_city: originCity, destination_city: destCity,
        travel_date: travelDate,
        return_date: days > 1 ? nextDays(days) : null,
        vehicle_category: vehicle, num_passengers: passengers,
      });
      Alert.alert('Booking Confirmed!',
        `Your intercity ride from ${originCity} to ${destCity} on ${fmtDate(travelDate)} is confirmed.`,
        [{ text: 'View Trips', onPress: () => { setTab('trips'); loadMyBookings(); } }]
      );
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.error || 'Booking failed.');
    } finally {
      setBooking(false);
    }
  };

  const handleCancel = (bookingId) => {
    Alert.alert('Cancel Booking', 'Are you sure you want to cancel this outstation booking?', [
      { text: 'No' },
      {
        text: 'Yes, Cancel', style: 'destructive', onPress: async () => {
          try {
            await ridesService.cancelOutstationBooking(bookingId);
            loadMyBookings();
          } catch { Alert.alert('Error', 'Could not cancel booking.'); }
        }
      },
    ]);
  };

  const statusColor = (s) => {
    if (s === 'confirmed') return colors.success;
    if (s === 'pending')   return colors.warning;
    if (s === 'cancelled') return colors.danger || '#E31837';
    return colors.textSecondary;
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Outstation Rides</Text>
          <Text style={styles.headerSub}>Intercity trips across Cameroon</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {[['book','Book Trip'],['trips','My Trips']].map(([key,label]) => (
          <TouchableOpacity key={key} style={[styles.tab, tab === key && styles.tabActive]} onPress={() => setTab(key)}>
            <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'book' ? (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* Route selection */}
          <View style={styles.routeCard}>
            <TouchableOpacity style={styles.cityRow} onPress={() => setCityModal('origin')}>
              <View style={styles.cityDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cityLabel}>From</Text>
                <Text style={[styles.cityValue, !originCity && { color: colors.textLight }]}>
                  {originCity || 'Select origin city'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.gray400} />
            </TouchableOpacity>

            <View style={styles.routeDivider} />

            <TouchableOpacity style={styles.cityRow} onPress={() => setCityModal('dest')}>
              <View style={[styles.cityDot, { backgroundColor: colors.text, borderRadius: 2 }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cityLabel}>To</Text>
                <Text style={[styles.cityValue, !destCity && { color: colors.textLight }]}>
                  {destCity || 'Select destination city'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.gray400} />
            </TouchableOpacity>

            {/* Swap button */}
            {originCity && destCity && (
              <TouchableOpacity
                style={styles.swapBtn}
                onPress={() => { setOriginCity(destCity); setDestCity(originCity); setEstimate(null); }}
              >
                <Ionicons name="swap-vertical" size={18} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Travel date */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionLabel}>Travel Date</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              {Array.from({ length: 14 }, (_, i) => {
                const d = nextDays(i + 1);
                const isSelected = travelDate === d;
                const dateObj = new Date(d);
                return (
                  <TouchableOpacity
                    key={d}
                    style={[styles.dateChip, isSelected && styles.dateChipActive]}
                    onPress={() => setTravelDate(d)}
                  >
                    <Text style={[styles.dateChipDay, isSelected && { color: colors.white }]}>
                      {dateObj.toLocaleDateString('en', { weekday: 'short' })}
                    </Text>
                    <Text style={[styles.dateChipNum, isSelected && { color: colors.white }]}>
                      {dateObj.getDate()}
                    </Text>
                    <Text style={[styles.dateChipMonth, isSelected && { color: 'rgba(255,255,255,0.8)' }]}>
                      {dateObj.toLocaleDateString('en', { month: 'short' })}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Trip duration */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionLabel}>Number of Days</Text>
            <View style={styles.daysRow}>
              {DAYS_OPTIONS.map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[styles.dayChip, days === d && styles.dayChipActive]}
                  onPress={() => setDays(d)}
                >
                  <Text style={[styles.dayChipText, days === d && styles.dayChipTextActive]}>
                    {d === 1 ? '1 Day' : `${d} Days`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Vehicle type */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionLabel}>Vehicle Type</Text>
            {VEHICLE_TYPES.map((v) => (
              <TouchableOpacity
                key={v.key}
                style={[styles.vehicleRow, vehicle === v.key && styles.vehicleRowActive]}
                onPress={() => setVehicle(v.key)}
              >
                <View style={[styles.vehicleIcon, { backgroundColor: vehicle === v.key ? 'rgba(255,0,191,0.1)' : colors.surface }]}>
                  <Ionicons name={v.icon} size={22} color={vehicle === v.key ? colors.primary : colors.gray400} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.vehicleLabel, vehicle === v.key && { color: colors.primary }]}>{v.label}</Text>
                  <Text style={styles.vehicleDesc}>{v.desc}</Text>
                </View>
                <View style={[styles.radioOuter, vehicle === v.key && { borderColor: colors.primary }]}>
                  {vehicle === v.key && <View style={styles.radioInner} />}
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* Estimate panel */}
          {loadingEst ? (
            <View style={styles.estimateLoading}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.estimateLoadingText}>Calculating fare…</Text>
            </View>
          ) : estimate ? (
            <View style={styles.estimateCard}>
              <Text style={styles.estimateTitle}>Fare Estimate</Text>
              <View style={styles.estimateHero}>
                <Text style={styles.estimateTotalLabel}>Total</Text>
                <Text style={styles.estimateTotal}>{fmtXAF(estimate.total)}</Text>
              </View>
              {[
                { label: `Base fare (${estimate.distance_km} km)`, value: estimate.base_fare },
                estimate.days_surcharge > 0 && { label: `${days - 1} day waiting allowance`, value: estimate.days_surcharge },
              ].filter(Boolean).map((row) => (
                <View key={row.label} style={styles.estimateRow}>
                  <Text style={styles.estimateRowLabel}>{row.label}</Text>
                  <Text style={styles.estimateRowValue}>{fmtXAF(row.value)}</Text>
                </View>
              ))}
              <View style={styles.includedBox}>
                {estimate.includes?.map((item) => (
                  <View key={item} style={styles.includedRow}>
                    <Ionicons name="checkmark-circle" size={15} color={colors.success} />
                    <Text style={styles.includedText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <View style={{ height: 100 }} />
        </ScrollView>
      ) : (
        /* My Trips tab */
        <FlatList
          data={myBookings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.tripsList}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="car-outline" size={48} color={colors.gray300} />
              <Text style={styles.emptyText}>No outstation trips yet</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.tripCard}>
              <View style={styles.tripHeader}>
                <Text style={styles.tripRoute}>{item.origin_city} → {item.destination_city}</Text>
                <View style={[styles.tripStatusBadge, { backgroundColor: statusColor(item.status) + '18' }]}>
                  <Text style={[styles.tripStatusText, { color: statusColor(item.status) }]}>
                    {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                  </Text>
                </View>
              </View>
              <View style={styles.tripMeta}>
                <View style={styles.tripMetaItem}>
                  <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
                  <Text style={styles.tripMetaText}>{fmtDate(item.travel_date)}</Text>
                </View>
                <View style={styles.tripMetaItem}>
                  <Ionicons name="car-outline" size={14} color={colors.textSecondary} />
                  <Text style={styles.tripMetaText}>{item.vehicle_category} · {item.days} day{item.days > 1 ? 's' : ''}</Text>
                </View>
                <View style={styles.tripMetaItem}>
                  <Ionicons name="wallet-outline" size={14} color={colors.textSecondary} />
                  <Text style={styles.tripMetaText}>{fmtXAF(item.package_price)}</Text>
                </View>
              </View>
              {['pending','confirmed'].includes(item.status) && (
                <TouchableOpacity style={styles.cancelTripBtn} onPress={() => handleCancel(item.id)}>
                  <Text style={styles.cancelTripText}>Cancel Booking</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        />
      )}

      {/* Book button */}
      {tab === 'book' && estimate && !loadingEst && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.bookBtn, booking && { opacity: 0.6 }]}
            onPress={handleBook}
            disabled={booking}
            activeOpacity={0.85}
          >
            {booking ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <Text style={styles.bookBtnText}>Book · {fmtXAF(estimate.total)}</Text>
                <Ionicons name="arrow-forward" size={20} color={colors.white} />
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* City picker modal */}
      <Modal visible={!!cityModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalRoot} edges={['top']}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              Select {cityModal === 'origin' ? 'Origin' : 'Destination'} City
            </Text>
            <TouchableOpacity onPress={() => setCityModal(null)}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          {loadingCities ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
          ) : (
            <FlatList
              data={cities.filter((c) => cityModal === 'origin' ? c !== destCity : c !== originCity)}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.cityItem}
                  onPress={() => {
                    if (cityModal === 'origin') setOriginCity(item);
                    else setDestCity(item);
                    setCityModal(null);
                    setEstimate(null);
                  }}
                >
                  <Ionicons name="location-outline" size={18} color={colors.primary} />
                  <Text style={styles.cityItemText}>{item}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.gray400} />
                </TouchableOpacity>
              )}
            />
          )}
        </SafeAreaView>
      </Modal>
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
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.text, textAlign: 'center' },
  headerSub: { fontSize: 12, color: colors.textSecondary, textAlign: 'center' },

  tabRow: { flexDirection: 'row', backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray200 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  tabTextActive: { color: colors.primary, fontWeight: '700' },

  scroll: { padding: spacing.md },

  routeCard: {
    backgroundColor: colors.white, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.sm, ...shadows.sm, position: 'relative',
  },
  cityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  cityDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },
  cityLabel: { fontSize: 11, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.3 },
  cityValue: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 2 },
  routeDivider: { height: 1, backgroundColor: colors.gray100, marginVertical: 6, marginLeft: 20 },
  swapBtn: {
    position: 'absolute', right: spacing.md, top: '50%', marginTop: -16,
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.gray200,
  },

  sectionCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadows.sm },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },

  dateChip: {
    width: 58, height: 68, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.gray200,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface,
  },
  dateChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dateChipDay: { fontSize: 10, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase' },
  dateChipNum: { fontSize: 20, fontWeight: '900', color: colors.text },
  dateChipMonth: { fontSize: 10, color: colors.textSecondary },

  daysRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  dayChip: {
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.round, borderWidth: 1.5, borderColor: colors.gray200, backgroundColor: colors.surface,
  },
  dayChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayChipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  dayChipTextActive: { color: colors.white },

  vehicleRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, borderRadius: radius.md, paddingHorizontal: spacing.xs,
    marginBottom: 2, borderWidth: 1.5, borderColor: 'transparent',
  },
  vehicleRowActive: { borderColor: 'rgba(255,0,191,0.3)', backgroundColor: 'rgba(255,0,191,0.03)' },
  vehicleIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  vehicleLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
  vehicleDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.gray300, alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },

  estimateLoading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'center', paddingVertical: spacing.lg },
  estimateLoadingText: { fontSize: 14, color: colors.textSecondary },
  estimateCard: { backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.md, marginBottom: spacing.sm, ...shadows.md },
  estimateTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  estimateHero: { alignItems: 'center', marginBottom: spacing.md },
  estimateTotalLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  estimateTotal: { fontSize: 38, fontWeight: '900', color: colors.primary, letterSpacing: -1.5 },
  estimateRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.gray100 },
  estimateRowLabel: { fontSize: 13, color: colors.textSecondary },
  estimateRowValue: { fontSize: 14, fontWeight: '600', color: colors.text },
  includedBox: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.sm, gap: 6 },
  includedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  includedText: { fontSize: 13, color: colors.text, flex: 1 },

  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.white, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.gray200 },
  bookBtn: {
    backgroundColor: colors.primary, borderRadius: radius.pill, height: 56,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  bookBtnText: { fontSize: 16, fontWeight: '800', color: colors.white },

  tripsList: { padding: spacing.md },
  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: spacing.sm },
  emptyText: { fontSize: 14, color: colors.textSecondary },
  tripCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadows.sm },
  tripHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  tripRoute: { fontSize: 16, fontWeight: '800', color: colors.text, flex: 1 },
  tripStatusBadge: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  tripStatusText: { fontSize: 11, fontWeight: '700' },
  tripMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  tripMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tripMetaText: { fontSize: 12, color: colors.textSecondary },
  cancelTripBtn: { borderTopWidth: 1, borderTopColor: colors.gray100, paddingTop: spacing.sm, alignItems: 'center' },
  cancelTripText: { fontSize: 13, fontWeight: '600', color: colors.danger || '#E31837' },

  modalRoot: { flex: 1, backgroundColor: colors.white },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.gray200 },
  modalTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  cityItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 14, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.gray100 },
  cityItemText: { flex: 1, fontSize: 16, color: colors.text, fontWeight: '500' },
});

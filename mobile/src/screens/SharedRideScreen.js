import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadows } from '../theme';

const MOCK_SHARED_RIDES = [
  {
    id: '1',
    driver: { name: 'Jean-Paul M.', rating: 4.9 },
    passengers: [
      { id: 'p1', name: 'Amina K.', initial: 'A', pickupDistance: '0.3 km away' },
      { id: 'p2', name: 'Bruno T.', initial: 'B', pickupDistance: '0.6 km away' },
    ],
    pickup: 'Carrefour Warda',
    dropoff: 'Mvan, Yaoundé',
    sharedFare: 800,
    soloFare: 1800,
    savings: 1000,
    waitTime: 3,
    eta: 22,
    vehicleModel: 'Toyota Corolla',
    licensePlate: 'LT 2341 A',
    seatsAvailable: 1,
  },
  {
    id: '2',
    driver: { name: 'Sylvie N.', rating: 4.8 },
    passengers: [
      { id: 'p3', name: 'Celine F.', initial: 'C', pickupDistance: '0.5 km away' },
    ],
    pickup: 'Avenue Kennedy',
    dropoff: 'Cité Verte, Yaoundé',
    sharedFare: 700,
    soloFare: 1500,
    savings: 800,
    waitTime: 5,
    eta: 18,
    vehicleModel: 'Honda Civic',
    licensePlate: 'LT 5782 B',
    seatsAvailable: 2,
  },
];

const PassengerAvatar = ({ passenger }) => (
  <View style={styles.passengerItem}>
    <View style={styles.passengerAvatar}>
      <Text style={styles.passengerInitial}>{passenger.initial}</Text>
    </View>
    <Text style={styles.passengerName} numberOfLines={1}>{passenger.name}</Text>
    <Text style={styles.passengerDistance} numberOfLines={1}>{passenger.pickupDistance}</Text>
  </View>
);

export default function SharedRideScreen({ navigation, route }) {
  const [joiningRideId, setJoiningRideId] = useState(null);

  const origin = route?.params?.origin;
  const destination = route?.params?.destination;

  const handleJoin = (ride) => {
    setJoiningRideId(ride.id);
    setTimeout(() => {
      setJoiningRideId(null);
      navigation.navigate('RideTracking', {
        rideId: ride.id,
        isShared: true,
        driver: ride.driver,
      });
    }, 1500);
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Shared Rides</Text>
          <Text style={styles.headerSubtitle}>Save up to 50% on your trip</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Route Banner */}
      <View style={styles.routeBanner}>
        <View style={styles.routeRow}>
          <View style={styles.dotGreen} />
          <Text style={styles.routeText} numberOfLines={1}>{origin || 'Your location'}</Text>
        </View>
        <View style={styles.routeConnector}>
          <View style={styles.routeLine} />
        </View>
        <View style={styles.routeRow}>
          <View style={styles.dotPink} />
          <Text style={styles.routeText} numberOfLines={1}>{destination || 'Destination'}</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent}>
        <Text style={styles.sectionTitle}>{MOCK_SHARED_RIDES.length} shared rides nearby</Text>

        {MOCK_SHARED_RIDES.map((ride) => (
          <View key={ride.id} style={styles.rideCard}>
            {/* Driver Info */}
            <View style={styles.driverRow}>
              <View style={styles.driverAvatar}>
                <Ionicons name="person" size={18} color={colors.white} />
              </View>
              <View style={styles.driverInfo}>
                <Text style={styles.driverName}>{ride.driver.name}</Text>
                <View style={styles.driverMeta}>
                  <Ionicons name="star" size={12} color={colors.primary} />
                  <Text style={styles.driverRating}>{ride.driver.rating}</Text>
                  <Text style={styles.vehicleText}> · {ride.vehicleModel}</Text>
                </View>
              </View>
              <View style={styles.waitBadge}>
                <Ionicons name="time-outline" size={12} color={colors.primary} />
                <Text style={styles.waitText}>{ride.waitTime} min away</Text>
              </View>
            </View>

            {/* Passengers */}
            <View style={styles.passengersSection}>
              <Text style={styles.passengersLabel}>Passengers on this ride</Text>
              <View style={styles.passengersList}>
                {ride.passengers.map((p) => (
                  <PassengerAvatar key={p.id} passenger={p} />
                ))}
                {/* "You" slot */}
                <View style={styles.passengerItem}>
                  <View style={[styles.passengerAvatar, styles.youAvatar]}>
                    <Ionicons name="add" size={16} color={colors.primary} />
                  </View>
                  <Text style={[styles.passengerName, { color: colors.primary }]}>You</Text>
                  <Text style={styles.passengerDistance}>{ride.seatsAvailable} seat{ride.seatsAvailable !== 1 ? 's' : ''} left</Text>
                </View>
              </View>
            </View>

            {/* Route */}
            <View style={styles.rideRoute}>
              <View style={styles.routeStopRow}>
                <View style={styles.dotSmGreen} />
                <Text style={styles.rideRouteText} numberOfLines={1}>{ride.pickup}</Text>
              </View>
              <View style={styles.routeSmLine} />
              <View style={styles.routeStopRow}>
                <View style={styles.dotSmPink} />
                <Text style={styles.rideRouteText} numberOfLines={1}>{ride.dropoff}</Text>
              </View>
            </View>

            {/* Fare Breakdown */}
            <View style={styles.fareSection}>
              <View style={styles.fareCompare}>
                <View style={styles.fareItem}>
                  <Text style={styles.fareLabel}>Shared fare</Text>
                  <Text style={styles.sharedFare}>{ride.sharedFare.toLocaleString()} XAF</Text>
                </View>
                <View style={styles.fareItem}>
                  <Text style={styles.fareLabel}>Solo fare</Text>
                  <Text style={styles.soloFare}>{ride.soloFare.toLocaleString()} XAF</Text>
                </View>
                <View style={styles.fareItem}>
                  <Text style={styles.fareLabel}>You save</Text>
                  <Text style={styles.savingsText}>-{ride.savings.toLocaleString()} XAF</Text>
                </View>
              </View>

              <View style={styles.etaRow}>
                <Ionicons name="navigate-circle-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.etaText}>ETA {ride.eta} min · {ride.licensePlate}</Text>
              </View>
            </View>

            {/* Join Button */}
            <TouchableOpacity
              style={[styles.joinBtn, joiningRideId === ride.id && styles.joinBtnLoading]}
              onPress={() => handleJoin(ride)}
              disabled={joiningRideId !== null}
              activeOpacity={0.85}
            >
              {joiningRideId === ride.id ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <>
                  <Ionicons name="people-outline" size={18} color={colors.white} />
                  <Text style={styles.joinBtnText}>Join This Ride</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ))}

        {/* No more rides */}
        <View style={styles.noMoreCard}>
          <Ionicons name="search-outline" size={28} color={colors.textLight} />
          <Text style={styles.noMoreText}>No more shared rides available right now</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('BookRide')}
            style={styles.soloBtn}
            activeOpacity={0.8}
          >
            <Text style={styles.soloBtnText}>Book a Solo Ride</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
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
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  headerSubtitle: { fontSize: 12, fontWeight: '400', color: colors.textSecondary, marginTop: 1 },
  routeBanner: {
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 4,
  },
  routeConnector: { paddingLeft: 5 },
  routeLine: { width: 2, height: 16, backgroundColor: colors.gray300 },
  routeText: { flex: 1, fontSize: 14, fontWeight: '500', color: colors.text },
  dotGreen: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  dotPink: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  listContent: { padding: spacing.md },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  rideCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.md,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  driverAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverInfo: { flex: 1 },
  driverName: { fontSize: 15, fontWeight: '700', color: colors.text },
  driverMeta: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  driverRating: { fontSize: 12, fontWeight: '600', color: colors.text },
  vehicleText: { fontSize: 12, fontWeight: '400', color: colors.textSecondary },
  waitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,0,191,0.08)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  waitText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  passengersSection: { marginBottom: spacing.md },
  passengersLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  passengersList: { flexDirection: 'row', gap: spacing.md },
  passengerItem: { alignItems: 'center', width: 58 },
  passengerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.gray200,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  youAvatar: {
    backgroundColor: 'rgba(255,0,191,0.1)',
    borderWidth: 2,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  passengerInitial: { fontSize: 18, fontWeight: '700', color: colors.text },
  passengerName: { fontSize: 11, fontWeight: '600', color: colors.text, textAlign: 'center' },
  passengerDistance: { fontSize: 10, fontWeight: '400', color: colors.textSecondary, textAlign: 'center' },
  rideRoute: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  routeStopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  routeSmLine: {
    width: 2,
    height: 14,
    backgroundColor: colors.gray300,
    marginLeft: 4,
    marginVertical: 2,
  },
  dotSmGreen: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  dotSmPink: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  rideRouteText: { flex: 1, fontSize: 13, fontWeight: '500', color: colors.text },
  fareSection: { marginBottom: spacing.md },
  fareCompare: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  fareItem: { alignItems: 'center' },
  fareLabel: { fontSize: 10, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 3 },
  sharedFare: { fontSize: 16, fontWeight: '900', color: colors.primary },
  soloFare: { fontSize: 14, fontWeight: '600', color: colors.textSecondary, textDecorationLine: 'line-through' },
  savingsText: { fontSize: 14, fontWeight: '800', color: colors.success },
  etaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  etaText: { fontSize: 12, fontWeight: '400', color: colors.textSecondary },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 14,
    ...shadows.sm,
  },
  joinBtnLoading: { opacity: 0.7 },
  joinBtnText: { fontSize: 15, fontWeight: '800', color: colors.white },
  noMoreCard: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  noMoreText: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  soloBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.primary,
    marginTop: spacing.sm,
  },
  soloBtnText: { fontSize: 14, fontWeight: '700', color: colors.primary },
});

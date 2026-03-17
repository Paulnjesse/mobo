import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Share,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadows } from '../theme';
import FareBreakdown from '../components/FareBreakdown';
import StarRating from '../components/StarRating';

const MOCK_RECEIPT = {
  rideId: 'MOBO-20240320-0042',
  date: 'March 20, 2026',
  time: '08:47 AM',
  pickup: 'Bastos, Yaoundé',
  dropoff: 'Aéroport International de Yaoundé-Nsimalen',
  duration: '28 min',
  distance: '14.3 km',
  driver: {
    name: 'Emmanuel B.',
    vehicle: 'Toyota Corolla',
    licensePlate: 'LT 2341 A',
    rating: 4.9,
    initial: 'E',
  },
  paymentMethod: 'MTN Mobile Money',
  rideType: 'Comfort',
  fareData: {
    base: 800,
    distance: 2145,
    time: 420,
    bookingFee: 100,
    serviceFee: 150,
    surge: 0,
    discount: 0,
    total: 3615,
  },
  rated: false,
};

export default function RideReceiptScreen({ navigation, route }) {
  const receipt = route?.params?.receipt || MOCK_RECEIPT;
  const [rating, setRating] = useState(0);
  const [hasRated, setHasRated] = useState(receipt.rated);
  const [submittingRating, setSubmittingRating] = useState(false);

  const handleShare = async () => {
    try {
      await Share.share({
        message: `MOBO Receipt - ${receipt.rideId}\n\n${receipt.date} ${receipt.time}\nFrom: ${receipt.pickup}\nTo: ${receipt.dropoff}\nTotal: ${receipt.fareData.total.toLocaleString()} XAF\nPaid via: ${receipt.paymentMethod}`,
        title: 'MOBO Ride Receipt',
      });
    } catch (e) {
      // ignore share errors
    }
  };

  const handleRate = () => {
    if (!rating) return;
    setSubmittingRating(true);
    setTimeout(() => {
      setSubmittingRating(false);
      setHasRated(true);
    }, 1000);
  };

  const handleBookAgain = () => {
    navigation.navigate('BookRide', {
      pickup: receipt.pickup,
      dropoff: receipt.dropoff,
    });
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trip Receipt</Text>
        <TouchableOpacity onPress={handleShare} style={styles.shareBtn} activeOpacity={0.7}>
          <Ionicons name="share-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* Status Badge */}
        <View style={styles.statusBadge}>
          <Ionicons name="checkmark-circle" size={20} color={colors.success} />
          <Text style={styles.statusText}>Trip Completed</Text>
        </View>

        {/* Map Thumbnail Placeholder */}
        <View style={styles.mapThumbnail}>
          <View style={styles.mapPlaceholder}>
            <Ionicons name="map" size={40} color={colors.gray300} />
            <Text style={styles.mapPlaceholderText}>Route Map</Text>
          </View>
          {/* Pickup dot */}
          <View style={[styles.mapPin, styles.mapPinGreen]}>
            <Ionicons name="ellipse" size={10} color={colors.white} />
          </View>
          {/* Dropoff dot */}
          <View style={[styles.mapPin, styles.mapPinPink]}>
            <Ionicons name="location" size={14} color={colors.white} />
          </View>
        </View>

        {/* Trip Info */}
        <View style={styles.card}>
          <View style={styles.tripIdRow}>
            <Text style={styles.tripId}>{receipt.rideId}</Text>
            <Text style={styles.tripDateTime}>{receipt.date} · {receipt.time}</Text>
          </View>

          <View style={styles.locationSection}>
            <View style={styles.locationRow}>
              <View style={styles.dotGreen} />
              <View style={styles.locationTexts}>
                <Text style={styles.locationLabel}>Pickup</Text>
                <Text style={styles.locationValue}>{receipt.pickup}</Text>
              </View>
            </View>
            <View style={styles.locationLine} />
            <View style={styles.locationRow}>
              <View style={styles.dotPink} />
              <View style={styles.locationTexts}>
                <Text style={styles.locationLabel}>Dropoff</Text>
                <Text style={styles.locationValue}>{receipt.dropoff}</Text>
              </View>
            </View>
          </View>

          <View style={styles.tripStatsRow}>
            <View style={styles.tripStat}>
              <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.tripStatValue}>{receipt.duration}</Text>
              <Text style={styles.tripStatLabel}>Duration</Text>
            </View>
            <View style={styles.tripStatDivider} />
            <View style={styles.tripStat}>
              <Ionicons name="speedometer-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.tripStatValue}>{receipt.distance}</Text>
              <Text style={styles.tripStatLabel}>Distance</Text>
            </View>
            <View style={styles.tripStatDivider} />
            <View style={styles.tripStat}>
              <Ionicons name="car-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.tripStatValue}>{receipt.rideType}</Text>
              <Text style={styles.tripStatLabel}>Ride Type</Text>
            </View>
          </View>
        </View>

        {/* Driver Info */}
        <View style={[styles.card, { marginTop: spacing.sm }]}>
          <Text style={styles.sectionTitle}>Driver</Text>
          <View style={styles.driverRow}>
            <View style={styles.driverAvatar}>
              <Text style={styles.driverInitial}>{receipt.driver.initial}</Text>
            </View>
            <View style={styles.driverInfo}>
              <Text style={styles.driverName}>{receipt.driver.name}</Text>
              <Text style={styles.driverVehicle}>{receipt.driver.vehicle} · {receipt.driver.licensePlate}</Text>
            </View>
            <View style={styles.driverRatingWrap}>
              <Ionicons name="star" size={14} color={colors.primary} />
              <Text style={styles.driverRating}>{receipt.driver.rating}</Text>
            </View>
          </View>
        </View>

        {/* Fare Breakdown */}
        <View style={{ marginTop: spacing.sm }}>
          <FareBreakdown fareData={receipt.fareData} />
        </View>

        {/* Payment Method */}
        <View style={[styles.card, { marginTop: spacing.sm }]}>
          <View style={styles.paymentRow}>
            <Ionicons name="phone-portrait-outline" size={22} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.paymentLabel}>Payment method</Text>
              <Text style={styles.paymentValue}>{receipt.paymentMethod}</Text>
            </View>
            <Text style={styles.paymentTotal}>{receipt.fareData.total.toLocaleString()} XAF</Text>
          </View>
        </View>

        {/* Rate Driver */}
        {!hasRated ? (
          <View style={[styles.card, styles.ratingCard]}>
            <Text style={styles.ratingTitle}>Rate your driver</Text>
            <Text style={styles.ratingSubtitle}>How was your experience with {receipt.driver.name}?</Text>
            <View style={styles.starsRow}>
              <StarRating rating={rating} onRate={setRating} size={40} />
            </View>
            {rating > 0 && (
              <TouchableOpacity
                style={[styles.rateBtn, submittingRating && styles.rateBtnDisabled]}
                onPress={handleRate}
                disabled={submittingRating}
                activeOpacity={0.85}
              >
                {submittingRating ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text style={styles.rateBtnText}>Submit Rating</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={[styles.card, styles.ratedCard]}>
            <Ionicons name="checkmark-circle" size={24} color={colors.success} />
            <Text style={styles.ratedText}>Thanks for rating {receipt.driver.name}!</Text>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.shareReceiptBtn} onPress={handleShare} activeOpacity={0.8}>
            <Ionicons name="share-outline" size={18} color={colors.primary} />
            <Text style={styles.shareReceiptText}>Share Receipt</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.bookAgainBtn} onPress={handleBookAgain} activeOpacity={0.85}>
            <Ionicons name="repeat-outline" size={18} color={colors.white} />
            <Text style={styles.bookAgainText}>Book Again</Text>
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
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  shareBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: spacing.md },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(0,166,81,0.1)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  statusText: { fontSize: 14, fontWeight: '700', color: colors.success },
  mapThumbnail: {
    height: 140,
    backgroundColor: colors.gray100,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  mapPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  mapPlaceholderText: { fontSize: 12, fontWeight: '500', color: colors.textLight },
  mapPin: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPinGreen: { backgroundColor: colors.success, top: 30, left: '25%' },
  mapPinPink: { backgroundColor: colors.primary, bottom: 30, right: '25%' },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadows.sm,
  },
  tripIdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  tripId: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.3 },
  tripDateTime: { fontSize: 12, fontWeight: '400', color: colors.textSecondary },
  locationSection: { marginBottom: spacing.md },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  locationLine: {
    width: 2,
    height: 24,
    backgroundColor: colors.gray300,
    marginLeft: 4,
    marginVertical: 2,
  },
  dotGreen: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  dotPink: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  locationTexts: { flex: 1 },
  locationLabel: { fontSize: 10, fontWeight: '600', color: colors.textLight, textTransform: 'uppercase', letterSpacing: 0.3 },
  locationValue: { fontSize: 14, fontWeight: '600', color: colors.text },
  tripStatsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.gray100,
    paddingTop: spacing.sm,
  },
  tripStat: { flex: 1, alignItems: 'center', gap: 4 },
  tripStatDivider: { width: 1, backgroundColor: colors.gray200 },
  tripStatValue: { fontSize: 14, fontWeight: '700', color: colors.text },
  tripStatLabel: { fontSize: 10, fontWeight: '500', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.3 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  driverAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverInitial: { fontSize: 20, fontWeight: '800', color: colors.white },
  driverInfo: { flex: 1 },
  driverName: { fontSize: 15, fontWeight: '700', color: colors.text },
  driverVehicle: { fontSize: 12, fontWeight: '400', color: colors.textSecondary, marginTop: 2 },
  driverRatingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255,0,191,0.08)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  driverRating: { fontSize: 14, fontWeight: '800', color: colors.text },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  paymentLabel: { fontSize: 11, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.3 },
  paymentValue: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 2 },
  paymentTotal: { fontSize: 18, fontWeight: '900', color: colors.text },
  ratingCard: { marginTop: spacing.sm, alignItems: 'center', paddingVertical: spacing.lg },
  ratingTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 4, letterSpacing: -0.3 },
  ratingSubtitle: { fontSize: 13, fontWeight: '400', color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.md },
  starsRow: { marginBottom: spacing.md },
  rateBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: 12,
    minWidth: 160,
    alignItems: 'center',
  },
  rateBtnDisabled: { opacity: 0.6 },
  rateBtnText: { fontSize: 15, fontWeight: '800', color: colors.white },
  ratedCard: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  ratedText: { fontSize: 14, fontWeight: '600', color: colors.success },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  shareReceiptBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.white,
  },
  shareReceiptText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  bookAgainBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    ...shadows.sm,
  },
  bookAgainText: { fontSize: 14, fontWeight: '800', color: colors.white },
});

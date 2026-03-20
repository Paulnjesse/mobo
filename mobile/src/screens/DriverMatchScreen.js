import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  StatusBar,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadows } from '../theme';

// Format name as "Jean K."
function formatDriverName(fullName) {
  if (!fullName) return 'Driver';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

function StarRating({ rating }) {
  const stars = Math.round(Number(rating) || 0);
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={i <= stars ? 'star' : 'star-outline'}
          size={18}
          color={i <= stars ? '#F5A623' : colors.gray300}
        />
      ))}
      {rating ? (
        <Text style={styles.ratingValue}>{Number(rating).toFixed(1)}</Text>
      ) : null}
    </View>
  );
}

export default function DriverMatchScreen({ navigation, route }) {
  const { driver = {}, vehicle = {}, rideId } = route.params || {};

  const driverName = formatDriverName(driver.name || driver.full_name);
  const vehicleDesc = [vehicle.color, vehicle.make, vehicle.model]
    .filter(Boolean)
    .join(' ');

  const handleConfirm = () => {
    navigation.goBack();
  };

  const handleNotMyDriver = () => {
    Alert.alert(
      'Not Your Driver?',
      "Are you sure? We'll contact support immediately and make sure you're safe.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, this is NOT my driver',
          style: 'destructive',
          onPress: () => navigation.navigate('SOSScreen'),
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Confirm Your Driver</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Privacy instruction */}
        <View style={styles.instructionBanner}>
          <Ionicons name="shield-checkmark-outline" size={16} color="#3B82F6" />
          <Text style={styles.instructionText}>
            Always check the plate and driver photo before getting in
          </Text>
        </View>

        {/* Driver photo */}
        <View style={styles.photoSection}>
          {driver.photo_url ? (
            <Image source={{ uri: driver.photo_url }} style={styles.driverPhoto} />
          ) : (
            <View style={styles.driverPhotoPlaceholder}>
              <Ionicons name="person" size={56} color={colors.gray300} />
            </View>
          )}
          <View style={styles.verifiedBadge}>
            <Ionicons name="shield-checkmark" size={14} color={colors.white} />
            <Text style={styles.verifiedBadgeText}>Verified</Text>
          </View>
        </View>

        {/* Driver name */}
        <Text style={styles.driverName}>{driverName}</Text>
        <StarRating rating={driver.rating} />

        <View style={styles.divider} />

        {/* Vehicle info */}
        <View style={styles.vehicleSection}>
          <Text style={styles.sectionLabel}>Your Vehicle</Text>
          <Text style={styles.vehicleDesc}>{vehicleDesc || 'Vehicle details unavailable'}</Text>

          {/* License plate */}
          {vehicle.plate && (
            <View style={styles.plateWrap}>
              <View style={styles.plateContainer}>
                {/* Left accent */}
                <View style={styles.plateLeftAccent} />
                <Text style={styles.plateText}>{vehicle.plate}</Text>
                {/* Right accent */}
                <View style={styles.plateRightAccent} />
              </View>
              <Text style={styles.plateLabel}>License Plate</Text>
            </View>
          )}
        </View>

        {/* Extra driver details */}
        {(driver.phone || driver.total_rides) && (
          <View style={styles.detailsCard}>
            {driver.total_rides ? (
              <View style={styles.detailItem}>
                <Ionicons name="car-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.detailText}>{driver.total_rides} rides completed</Text>
              </View>
            ) : null}
            {driver.acceptance_rate ? (
              <View style={styles.detailItem}>
                <Ionicons name="thumbs-up-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.detailText}>{Number(driver.acceptance_rate).toFixed(0)}% acceptance rate</Text>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>

      {/* Action buttons */}
      <View style={styles.actionsWrap}>
        {/* Confirm button */}
        <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm} activeOpacity={0.85}>
          <Ionicons name="checkmark-circle" size={22} color={colors.white} />
          <Text style={styles.confirmBtnText}>This is my driver — Start Ride</Text>
        </TouchableOpacity>

        {/* Not my driver button */}
        <TouchableOpacity style={styles.wrongDriverBtn} onPress={handleNotMyDriver} activeOpacity={0.85}>
          <Ionicons name="close-circle" size={22} color={colors.danger} />
          <Text style={styles.wrongDriverBtnText}>This is NOT my driver</Text>
        </TouchableOpacity>

        <Text style={styles.footerNote}>
          If you feel unsafe at any time, tap "Not my driver" to contact support immediately.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  content: { padding: spacing.lg, paddingBottom: spacing.md, alignItems: 'center' },
  // Instruction banner
  instructionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xl,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.15)',
  },
  instructionText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#3B82F6', lineHeight: 18 },
  // Driver photo
  photoSection: { alignItems: 'center', marginBottom: spacing.md, position: 'relative' },
  driverPhoto: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 4,
    borderColor: '#3B82F6',
  },
  driverPhotoPlaceholder: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.gray200,
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#3B82F6',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 2,
    borderColor: colors.white,
  },
  verifiedBadgeText: { fontSize: 10, fontWeight: '800', color: colors.white },
  driverName: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: -0.5,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  starRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: spacing.lg },
  ratingValue: { fontSize: 15, fontWeight: '700', color: colors.text, marginLeft: spacing.xs },
  divider: { width: '100%', height: 1, backgroundColor: colors.gray100, marginBottom: spacing.lg },
  // Vehicle section
  vehicleSection: { width: '100%', alignItems: 'center', marginBottom: spacing.lg },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  vehicleDesc: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3,
    textAlign: 'center',
    marginBottom: spacing.lg,
    textTransform: 'capitalize',
  },
  plateWrap: { alignItems: 'center', gap: spacing.xs },
  plateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#1A1A1A',
    borderRadius: 8,
    backgroundColor: '#FFFDE7',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...shadows.md,
  },
  plateLeftAccent: {
    width: 8,
    height: 28,
    borderRadius: 4,
    backgroundColor: '#1565C0',
    marginRight: spacing.sm,
  },
  plateRightAccent: {
    width: 8,
    height: 28,
    borderRadius: 4,
    backgroundColor: '#1565C0',
    marginLeft: spacing.sm,
  },
  plateText: {
    fontSize: 26,
    fontWeight: '900',
    color: '#1A1A1A',
    letterSpacing: 4,
    fontFamily: 'monospace',
  },
  plateLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  // Driver details card
  detailsCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  detailText: { fontSize: 14, fontWeight: '500', color: colors.text },
  // Action buttons
  actionsWrap: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.gray100,
    gap: spacing.sm,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.success,
    borderRadius: radius.pill,
    paddingVertical: 16,
    ...shadows.md,
  },
  confirmBtnText: { fontSize: 16, fontWeight: '900', color: colors.white },
  wrongDriverBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(227,24,55,0.08)',
    borderRadius: radius.pill,
    paddingVertical: 15,
    borderWidth: 1.5,
    borderColor: 'rgba(227,24,55,0.3)',
  },
  wrongDriverBtnText: { fontSize: 15, fontWeight: '800', color: colors.danger },
  footerNote: {
    fontSize: 12,
    color: colors.textLight,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
  },
});

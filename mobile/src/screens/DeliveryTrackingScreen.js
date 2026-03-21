import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Linking,
  Platform,
  StatusBar,
  Animated,
  ActivityIndicator,
  Image,
  Share,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadows } from '../theme';
import api from '../services/api';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const POLL_INTERVAL_MS = 10000;

const TERMINAL_STATUSES = ['delivered', 'cancelled', 'failed'];

const STATUS_CONFIG = {
  pending: {
    icon: 'hourglass-outline',
    label: 'Finding a driver...',
    color: colors.warning,
    badge: 'Pending',
  },
  driver_assigned: {
    icon: 'car-outline',
    label: 'Driver is heading to pickup',
    color: '#3B82F6',
    badge: 'Driver Assigned',
  },
  driver_arriving: {
    icon: 'location-outline',
    label: 'Driver is almost at pickup',
    color: colors.warning,
    badge: 'Driver Arriving',
  },
  picked_up: {
    icon: 'cube-outline',
    label: 'Your package is on the way!',
    color: '#3B82F6',
    badge: 'Picked Up',
  },
  in_transit: {
    icon: 'car-sport-outline',
    label: 'Your package is on its way',
    color: '#3B82F6',
    badge: 'In Transit',
  },
  delivered: {
    icon: 'checkmark-circle-outline',
    label: 'Package delivered!',
    color: colors.success,
    badge: 'Delivered',
  },
  cancelled: {
    icon: 'close-circle-outline',
    label: 'Delivery cancelled',
    color: colors.danger,
    badge: 'Cancelled',
  },
  failed: {
    icon: 'alert-circle-outline',
    label: 'Delivery failed',
    color: colors.danger,
    badge: 'Failed',
  },
};

function getStatusConfig(status) {
  return STATUS_CONFIG[status] || STATUS_CONFIG['pending'];
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function DeliveryTrackingScreen({ navigation, route }) {
  const { deliveryId } = route.params || {};
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const [delivery, setDelivery] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  const pollRef = useRef(null);

  // ---------------------------------------------------------------------------
  // Pulse animation for status dot
  // ---------------------------------------------------------------------------
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.35, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // ---------------------------------------------------------------------------
  // Polling
  // ---------------------------------------------------------------------------
  const fetchDelivery = async (isInitial = false) => {
    try {
      const res = await api.get(`/deliveries/${deliveryId}`);
      const data = res.data?.delivery || res.data;
      setDelivery(data);
      if (isInitial) setLoading(false);
      // Stop polling if terminal status reached
      if (TERMINAL_STATUSES.includes(data?.status)) {
        stopPolling();
      }
    } catch (err) {
      console.warn('[DeliveryTracking] Fetch failed:', err.message);
      if (isInitial) setLoading(false);
    }
  };

  const startPolling = () => {
    fetchDelivery(true);
    pollRef.current = setInterval(() => fetchDelivery(false), POLL_INTERVAL_MS);
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    if (!deliveryId) {
      setLoading(false);
      return;
    }
    startPolling();
    return () => stopPolling();
  }, [deliveryId]);

  // ---------------------------------------------------------------------------
  // Map fit — fit both markers when we have pickup and dropoff coords
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!delivery) return;
    const pickup = delivery.pickup_coords || delivery.pickup?.coords;
    const dropoff = delivery.dropoff_coords || delivery.dropoff?.coords;
    if (pickup && dropoff && mapRef.current) {
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(
          [
            { latitude: pickup.latitude || pickup.lat, longitude: pickup.longitude || pickup.lng },
            { latitude: dropoff.latitude || dropoff.lat, longitude: dropoff.longitude || dropoff.lng },
          ],
          { edgePadding: { top: 80, right: 60, bottom: 320, left: 60 }, animated: true }
        );
      }, 400);
    }
  }, [delivery?.pickup_coords, delivery?.dropoff_coords]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  const handleCallDriver = () => {
    const phone = delivery?.driver?.phone;
    if (!phone) { Alert.alert('Not available', 'Driver phone number not available'); return; }
    Linking.openURL(`tel:${phone}`);
  };

  const handleShareTracking = async () => {
    try {
      await Share.share({
        message: `Track my delivery on MOBO: delivery ID ${deliveryId}`,
        title: 'Track My Delivery',
      });
    } catch (err) {
      console.warn('[DeliveryTracking] Share failed:', err.message);
    }
  };

  const handleCancel = () => {
    Alert.alert(
      'Cancel Delivery',
      'Are you sure you want to cancel this delivery?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            try {
              await api.patch(`/deliveries/${deliveryId}/status`, { status: 'cancelled', reason: 'User cancelled' });
              await fetchDelivery(false);
            } catch (err) {
              Alert.alert('Error', err.message || 'Could not cancel delivery');
            } finally {
              setCancelling(false);
            }
          },
        },
      ]
    );
  };

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------
  const status = delivery?.status || 'pending';
  const statusCfg = getStatusConfig(status);
  const driver = delivery?.driver;
  const otp = delivery?.otp || delivery?.pickup_otp || delivery?.recipient_otp;
  const isTerminal = TERMINAL_STATUSES.includes(status);
  const canCancel = status === 'pending' || status === 'driver_assigned';

  const pickupCoords = delivery?.pickup_coords || delivery?.pickup?.coords;
  const dropoffCoords = delivery?.dropoff_coords || delivery?.dropoff?.coords;
  const driverCoords = delivery?.driver_location || driver?.location;

  const mapRegion = pickupCoords
    ? {
        latitude: pickupCoords.latitude || pickupCoords.lat,
        longitude: pickupCoords.longitude || pickupCoords.lng,
        latitudeDelta: 0.03,
        longitudeDelta: 0.03,
      }
    : { latitude: 3.848, longitude: 11.502, latitudeDelta: 0.04, longitudeDelta: 0.04 };

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading delivery...</Text>
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        region={mapRegion}
        showsUserLocation={false}
      >
        {/* Pickup marker — blue house */}
        {pickupCoords && (
          <Marker
            coordinate={{
              latitude: pickupCoords.latitude || pickupCoords.lat,
              longitude: pickupCoords.longitude || pickupCoords.lng,
            }}
            title="Pickup"
          >
            <View style={styles.pickupMarker}>
              <Ionicons name="home" size={14} color={colors.white} />
            </View>
          </Marker>
        )}

        {/* Dropoff marker — red flag */}
        {dropoffCoords && (
          <Marker
            coordinate={{
              latitude: dropoffCoords.latitude || dropoffCoords.lat,
              longitude: dropoffCoords.longitude || dropoffCoords.lng,
            }}
            title="Drop-off"
          >
            <View style={styles.dropoffMarker}>
              <Ionicons name="flag" size={14} color={colors.white} />
            </View>
          </Marker>
        )}

        {/* Driver / truck marker */}
        {driverCoords && (
          <Marker
            coordinate={{
              latitude: driverCoords.latitude || driverCoords.lat,
              longitude: driverCoords.longitude || driverCoords.lng,
            }}
            title={driver?.name || 'Driver'}
          >
            <View style={styles.driverMarker}>
              <Ionicons name="car" size={14} color={colors.white} />
            </View>
          </Marker>
        )}
      </MapView>

      {/* Top overlay — back button + status pill */}
      <SafeAreaView style={styles.topOverlay} edges={['top']}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.topBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>

          <View style={[styles.statusPill, { backgroundColor: statusCfg.color + '18', borderColor: statusCfg.color }]}>
            <Animated.View style={[styles.statusDot, { backgroundColor: statusCfg.color, transform: [{ scale: pulseAnim }] }]} />
            <Text style={[styles.statusPillText, { color: statusCfg.color }]} numberOfLines={1}>
              {statusCfg.badge}
            </Text>
          </View>

          <View style={styles.topBtnPlaceholder} />
        </View>
      </SafeAreaView>

      {/* Bottom card */}
      <View style={[styles.bottomCard, { paddingBottom: insets.bottom + spacing.sm }]}>
        {/* Status message */}
        <View style={styles.statusRow}>
          <View style={[styles.statusIconCircle, { backgroundColor: statusCfg.color + '18' }]}>
            <Ionicons name={statusCfg.icon} size={22} color={statusCfg.color} />
          </View>
          <View style={styles.statusTexts}>
            <Text style={[styles.statusLabel, { color: statusCfg.color }]}>{statusCfg.badge}</Text>
            <Text style={styles.statusMessage}>{statusCfg.label}</Text>
          </View>
        </View>

        {/* Package info */}
        {delivery && (
          <View style={styles.packageInfoRow}>
            <Ionicons name="cube-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.packageInfoText}>
              {delivery.package_size || 'Package'}
              {delivery.fragile ? '  ⚠️ Fragile' : ''}
            </Text>
          </View>
        )}

        {/* Recipient OTP — shown throughout tracking */}
        {otp && !isTerminal && (
          <View style={styles.otpBox}>
            <View style={styles.otpLeft}>
              <Text style={styles.otpTitle}>Recipient Code</Text>
              <Text style={styles.otpSub}>Share this with your recipient</Text>
            </View>
            <Text style={styles.otpCode}>{otp}</Text>
          </View>
        )}

        {/* Driver info — shown after driver assigned */}
        {driver && ['driver_assigned', 'driver_arriving', 'picked_up', 'in_transit'].includes(status) && (
          <View style={styles.driverRow}>
            <View style={styles.driverAvatar}>
              <Text style={styles.driverAvatarText}>{(driver.name || 'D').charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.driverInfo}>
              <Text style={styles.driverName}>{driver.name || driver.full_name || 'Driver'}</Text>
              {driver.rating != null && (
                <View style={styles.ratingRow}>
                  <Ionicons name="star" size={13} color={colors.warning} />
                  <Text style={styles.ratingText}>{Number(driver.rating).toFixed(1)}</Text>
                </View>
              )}
              {(driver.vehicle?.make || driver.vehicle_make) && (
                <Text style={styles.vehicleText}>
                  {driver.vehicle?.make || driver.vehicle_make}{' '}
                  {driver.vehicle?.model || driver.vehicle_model}
                  {(driver.vehicle?.plate || driver.plate) ? ` · ${driver.vehicle?.plate || driver.plate}` : ''}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Pickup photo — shown from picked_up onwards */}
        {delivery?.pickup_photo_url && ['picked_up', 'in_transit', 'delivered'].includes(status) && (
          <View style={styles.photoSection}>
            <Text style={styles.photoLabel}>Pickup Photo</Text>
            <Image source={{ uri: delivery.pickup_photo_url }} style={styles.deliveryPhoto} />
          </View>
        )}

        {/* Delivery photo + success state */}
        {delivery?.delivery_photo_url && status === 'delivered' && (
          <View style={styles.photoSection}>
            <Text style={styles.photoLabel}>Delivery Photo</Text>
            <Image source={{ uri: delivery.delivery_photo_url }} style={styles.deliveryPhoto} />
            {delivery.delivered_at && (
              <Text style={styles.deliveryTimestamp}>
                Delivered at {new Date(delivery.delivered_at).toLocaleTimeString()}
              </Text>
            )}
          </View>
        )}

        {/* Success banner for delivered */}
        {status === 'delivered' && (
          <View style={styles.deliveredBanner}>
            <Ionicons name="checkmark-circle" size={32} color={colors.success} />
            <Text style={styles.deliveredText}>Package delivered successfully!</Text>
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.actionRow}>
          {driver && (
            <TouchableOpacity style={styles.actionBtn} onPress={handleCallDriver} activeOpacity={0.8}>
              <View style={styles.actionIcon}>
                <Ionicons name="call-outline" size={20} color={colors.text} />
              </View>
              <Text style={styles.actionBtnText}>Call Driver</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.actionBtn} onPress={handleShareTracking} activeOpacity={0.8}>
            <View style={styles.actionIcon}>
              <Ionicons name="share-social-outline" size={20} color={colors.text} />
            </View>
            <Text style={styles.actionBtnText}>Share</Text>
          </TouchableOpacity>

          {canCancel && (
            <TouchableOpacity style={styles.actionBtn} onPress={handleCancel} disabled={cancelling} activeOpacity={0.8}>
              <View style={[styles.actionIcon, { backgroundColor: 'rgba(227,24,55,0.1)' }]}>
                {cancelling ? (
                  <ActivityIndicator size="small" color={colors.danger} />
                ) : (
                  <Ionicons name="close-outline" size={20} color={colors.danger} />
                )}
              </View>
              <Text style={[styles.actionBtnText, { color: colors.danger }]}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.mapBackground,
  },
  loadingRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    gap: spacing.md,
  },
  loadingText: {
    fontSize: 15,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  topBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  topBtnPlaceholder: {
    width: 44,
  },
  statusPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 3,
    borderRadius: radius.round,
    borderWidth: 1.5,
    backgroundColor: colors.white,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusPillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  pickupMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: colors.white,
    ...shadows.md,
  },
  dropoffMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: colors.white,
    ...shadows.md,
  },
  driverMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: colors.white,
    ...shadows.md,
  },
  bottomCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 16,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  statusIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTexts: {
    flex: 1,
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '800',
  },
  statusMessage: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 1,
  },
  packageInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  packageInfoText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  otpBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1.5,
    borderColor: 'rgba(59,130,246,0.25)',
  },
  otpLeft: {
    flex: 1,
  },
  otpTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  otpSub: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  otpCode: {
    fontSize: 28,
    fontWeight: '900',
    color: '#3B82F6',
    letterSpacing: 4,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
  },
  driverAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverAvatarText: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.white,
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 2,
  },
  ratingText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  vehicleText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  photoSection: {
    marginBottom: spacing.sm,
  },
  photoLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  deliveryPhoto: {
    width: '100%',
    height: 120,
    borderRadius: radius.md,
    backgroundColor: colors.gray200,
  },
  deliveryTimestamp: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 4,
    textAlign: 'right',
  },
  deliveredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(0,166,81,0.08)',
    borderRadius: radius.md,
    padding: spacing.sm + 4,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(0,166,81,0.2)',
  },
  deliveredText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.success,
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs + 1,
  },
  actionIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
});

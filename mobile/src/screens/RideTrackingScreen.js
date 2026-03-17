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
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../context/LanguageContext';
import { useRide } from '../context/RideContext';
import SOSButton from '../components/SOSButton';
import { colors, spacing, radius, shadows } from '../theme';
import { connectSockets, onDriverLocation, onRideStatus, onMessage } from '../services/socket';

const STATUS_LABELS = {
  pending: 'Finding your driver...',
  accepted: 'Driver assigned',
  arriving: 'Driver is arriving',
  arrived: 'Driver has arrived!',
  in_progress: 'Ride in progress',
  completed: 'Ride completed',
};

const STATUS_COLORS = {
  pending: colors.warning,
  accepted: colors.primary,
  arriving: colors.warning,
  arrived: colors.success,
  in_progress: colors.primary,
  completed: colors.success,
};

export default function RideTrackingScreen({ navigation, route }) {
  const { rideId } = route.params || {};
  const { t } = useLanguage();
  const { activeRide, refreshActiveRide, cancelRide } = useRide();
  const insets = useSafeAreaInsets();

  const mapRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Real-time driver position received via WebSocket
  const [driverLocation, setDriverLocation] = useState(null);
  // Toast notification for incoming messages
  const [messageToast, setMessageToast] = useState(null);
  const messageToastTimer = useRef(null);

  const ride = activeRide;
  const status = ride?.status || 'pending';
  const driver = ride?.driver;
  const otp = ride?.otp || ride?.pickupOtp;

  // Derive the displayed status — WebSocket ride_status_change updates this
  const [liveStatus, setLiveStatus] = useState(status);

  // Sync liveStatus when REST-polled activeRide status changes
  useEffect(() => {
    setLiveStatus(ride?.status || 'pending');
  }, [ride?.status]);

  // -------------------------------------------------------------------------
  // WebSocket setup — connect sockets, join ride room, subscribe to events
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!rideId) return;

    let unsubLocation = () => {};
    let unsubStatus = () => {};
    let unsubMessage = () => {};

    const setup = async () => {
      await connectSockets();

      // Subscribe to driver GPS updates → update marker on map
      unsubLocation = onDriverLocation(rideId, (data) => {
        const { latitude, longitude } = data;
        if (latitude != null && longitude != null) {
          setDriverLocation({ latitude, longitude });
          // Smoothly animate map camera to keep driver in view
          if (mapRef.current) {
            mapRef.current.animateCamera(
              { center: { latitude, longitude }, zoom: 15 },
              { duration: 800 }
            );
          }
        }
      });

      // Subscribe to ride status changes → update status banner
      unsubStatus = onRideStatus(rideId, (data) => {
        setLiveStatus(data.status);
        if (data.status === 'completed') {
          // Give the rider a moment to see the "completed" state before navigating
          setTimeout(() => {
            navigation.replace('RideComplete', { rideId });
          }, 2000);
        }
        if (data.status === 'cancelled') {
          Alert.alert('Ride Cancelled', 'Your ride has been cancelled.');
          navigation.goBack();
        }
      });

      // Subscribe to in-app messages → show toast notification
      unsubMessage = onMessage(rideId, (data) => {
        if (messageToastTimer.current) clearTimeout(messageToastTimer.current);
        setMessageToast({ text: data.text, senderName: data.senderName });
        messageToastTimer.current = setTimeout(() => setMessageToast(null), 4000);
      });
    };

    setup().catch((err) => {
      console.warn('[RideTrackingScreen] Socket setup failed:', err.message);
    });

    // Fallback REST polling every 5 s (keeps data fresh if socket drops)
    refreshActiveRide(rideId);
    const pollInterval = setInterval(() => refreshActiveRide(rideId), 5000);

    return () => {
      unsubLocation();
      unsubStatus();
      unsubMessage();
      clearInterval(pollInterval);
      if (messageToastTimer.current) clearTimeout(messageToastTimer.current);
    };
  }, [rideId]);

  // -------------------------------------------------------------------------
  // Pulse animation for status dot
  // -------------------------------------------------------------------------
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------
  const handleCancel = () => {
    Alert.alert('Cancel Ride', 'Are you sure you want to cancel?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelRide(rideId, 'User cancelled');
            navigation.goBack();
          } catch (err) {
            Alert.alert('Error', err.message || 'Failed to cancel ride');
          }
        },
      },
    ]);
  };

  const handleCallDriver = () => {
    const phone = driver?.phone;
    if (!phone) { Alert.alert('Not available', 'Driver phone number not available'); return; }
    Linking.openURL(`tel:${phone}`);
  };

  // -------------------------------------------------------------------------
  // Map region — prefer live WebSocket position, fallback to REST data
  // -------------------------------------------------------------------------
  const mapRegion = ride?.pickup?.coords
    ? { latitude: ride.pickup.coords.latitude, longitude: ride.pickup.coords.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 }
    : { latitude: 3.848, longitude: 11.502, latitudeDelta: 0.04, longitudeDelta: 0.04 };

  // Driver marker coordinate — live WebSocket position takes precedence
  const driverCoord = driverLocation || driver?.location;

  const statusColor = STATUS_COLORS[liveStatus] || colors.primary;
  const statusLabel = STATUS_LABELS[liveStatus] || liveStatus;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* Full-screen map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        region={mapRegion}
        showsUserLocation
      >
        {driverCoord && (
          <Marker
            coordinate={{ latitude: driverCoord.latitude, longitude: driverCoord.longitude }}
            title={driver?.name || 'Driver'}
            tracksViewChanges={false}
          >
            <View style={styles.driverMarker}>
              <Ionicons name="car" size={16} color={colors.white} />
            </View>
          </Marker>
        )}
        {ride?.pickup?.coords && (
          <Marker coordinate={ride.pickup.coords} title="Pickup">
            <View style={styles.pickupMarker}>
              <View style={styles.pickupDot} />
            </View>
          </Marker>
        )}
        {ride?.dropoff?.coords && (
          <Marker coordinate={ride.dropoff.coords} title="Dropoff">
            <View style={styles.dropoffMarker}>
              <Ionicons name="location" size={18} color={colors.text} />
            </View>
          </Marker>
        )}
      </MapView>

      {/* Status bar overlay on map */}
      <SafeAreaView style={styles.topOverlay} edges={['top']}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.topBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>

          <View style={[styles.statusPill, { backgroundColor: statusColor + '18', borderColor: statusColor }]}>
            <Animated.View style={[styles.statusDot, { backgroundColor: statusColor, transform: [{ scale: pulseAnim }] }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>

          {(liveStatus === 'pending' || liveStatus === 'accepted') ? (
            <TouchableOpacity style={styles.cancelChip} onPress={handleCancel}>
              <Text style={styles.cancelChipText}>Cancel</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.topBtnPlaceholder} />
          )}
        </View>
      </SafeAreaView>

      {/* Message toast notification */}
      {messageToast && (
        <View style={styles.messageToast}>
          <Ionicons name="chatbubble-ellipses" size={16} color={colors.white} />
          <View style={styles.messageToastTexts}>
            <Text style={styles.messageToastSender} numberOfLines={1}>{messageToast.senderName}</Text>
            <Text style={styles.messageToastText} numberOfLines={2}>{messageToast.text}</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('Messages')}>
            <Text style={styles.messageToastReply}>Reply</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* SOS button */}
      <SOSButton onPress={() => navigation.navigate('SOS')} style={{ bottom: insets.bottom + 280 }} />

      {/* Bottom card */}
      <View style={[styles.bottomCard, { paddingBottom: insets.bottom + spacing.md }]}>
        {/* OTP banner */}
        {otp && (liveStatus === 'accepted' || liveStatus === 'arriving' || liveStatus === 'arrived') && (
          <View style={styles.otpBanner}>
            <View style={styles.otpLeft}>
              <Text style={styles.otpLabel}>{t('pickupOtp')}</Text>
              <Text style={styles.otpSubLabel}>{t('showToDriver')}</Text>
            </View>
            <Text style={styles.otpCode}>{otp}</Text>
          </View>
        )}

        {/* Pink ETA progress bar */}
        {driver?.eta && (
          <View style={styles.etaBarWrap}>
            <View style={styles.etaBar}>
              <View style={[styles.etaBarFill, { width: '65%' }]} />
            </View>
          </View>
        )}

        {/* Driver info */}
        {driver ? (
          <View style={styles.driverRow}>
            <View style={styles.driverAvatar}>
              <Text style={styles.driverAvatarText}>
                {(driver.name || 'D').charAt(0).toUpperCase()}
              </Text>
            </View>

            <View style={styles.driverInfo}>
              <Text style={styles.driverName}>{driver.name}</Text>
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={13} color={colors.warning} />
                <Text style={styles.ratingText}>{driver.rating?.toFixed(1) || '–'}</Text>
              </View>
              <Text style={styles.vehicleText}>
                {driver.vehicle?.make} {driver.vehicle?.model}
                {driver.vehicle?.color ? ` · ${driver.vehicle.color}` : ''}
              </Text>
              {driver.vehicle?.plate && (
                <Text style={styles.plateText}>{driver.vehicle.plate}</Text>
              )}
            </View>

            <View style={styles.etaBox}>
              <Text style={styles.etaBoxLabel}>ETA</Text>
              <Text style={styles.etaBoxValue}>{driver.eta || '–'}</Text>
              <Text style={styles.etaBoxUnit}>min</Text>
            </View>
          </View>
        ) : (
          <View style={styles.findingRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.findingText}>Finding your driver...</Text>
          </View>
        )}

        {/* Action buttons: Message + Call */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('Messages')}
            activeOpacity={0.8}
          >
            <View style={styles.actionIcon}>
              <Ionicons name="chatbubble-outline" size={20} color={colors.text} />
            </View>
            <Text style={styles.actionBtnText}>{t('messageDriver')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleCallDriver}
            activeOpacity={0.8}
          >
            <View style={styles.actionIcon}>
              <Ionicons name="call-outline" size={20} color={colors.text} />
            </View>
            <Text style={styles.actionBtnText}>{t('callDriver')}</Text>
          </TouchableOpacity>
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
    width: 56,
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
  statusText: {
    fontSize: 13,
    fontWeight: '700',
  },
  cancelChip: {
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 3,
    ...shadows.sm,
  },
  cancelChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.danger,
  },
  messageToast: {
    position: 'absolute',
    top: 100,
    left: spacing.md,
    right: spacing.md,
    zIndex: 20,
    backgroundColor: 'rgba(30,30,30,0.92)',
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    ...shadows.md,
  },
  messageToastTexts: {
    flex: 1,
  },
  messageToastSender: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 2,
  },
  messageToastText: {
    fontSize: 14,
    color: colors.white,
    fontWeight: '500',
  },
  messageToastReply: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
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
  pickupMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,0,191,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
  },
  pickupDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  dropoffMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.gray300,
    ...shadows.sm,
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
  otpBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,0,191,0.07)',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1.5,
    borderColor: 'rgba(255,0,191,0.2)',
  },
  otpLeft: {},
  otpLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  otpSubLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  otpCode: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.primary,
    letterSpacing: 5,
  },
  etaBarWrap: {
    marginBottom: spacing.md,
  },
  etaBar: {
    height: 4,
    backgroundColor: colors.gray200,
    borderRadius: 2,
    overflow: 'hidden',
  },
  etaBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  driverAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverAvatarText: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.white,
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 3,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 3,
  },
  ratingText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  vehicleText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  plateText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  etaBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,0,191,0.08)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    minWidth: 64,
  },
  etaBoxLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  etaBoxValue: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.primary,
    lineHeight: 26,
  },
  etaBoxUnit: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  findingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  findingText: {
    fontSize: 15,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs + 1,
  },
  actionIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
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

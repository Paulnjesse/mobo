import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  StatusBar,
  Animated,
  Platform,
  ScrollView,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as ExpoLocation from 'expo-location';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { colors, spacing, radius, shadows } from '../theme';
import { connectSockets, disconnectSockets, rideSocket, locationSocket } from '../services/socket';
import api from '../services/api';

const COUNTDOWN_SECONDS = 15;

const QUICK_ACTIONS = [
  {
    icon: 'navigate-circle-outline',
    label: 'Destination\nMode',
    screen: 'DestinationMode',
    color: colors.primary,
  },
  {
    icon: 'trophy-outline',
    label: 'Bonuses',
    screen: 'DriverBonus',
    color: colors.warning,
  },
  {
    icon: 'flash-outline',
    label: 'Express\nPay',
    screen: 'ExpressPay',
    color: colors.success,
  },
];

export default function DriverHomeScreen({ navigation }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  const [isOnline, setIsOnline] = useState(false);
  const [rideRequest, setRideRequest] = useState(null);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const countdownRef = useRef(null);
  const ringAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(300)).current;

  // Nearby deliveries bottom sheet state
  const [showDeliverySheet, setShowDeliverySheet] = useState(false);
  const [nearbyDeliveries, setNearbyDeliveries] = useState([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);
  const deliverySheetAnim = useRef(new Animated.Value(400)).current;

  // Track whether sockets have been set up this session
  const socketsReady = useRef(false);

  const mapRegion = {
    latitude: 3.848,
    longitude: 11.502,
    latitudeDelta: 0.04,
    longitudeDelta: 0.04,
  };

  // -------------------------------------------------------------------------
  // Connect sockets on mount; clean up on unmount
  // -------------------------------------------------------------------------
  useEffect(() => {
    const init = async () => {
      try {
        await connectSockets();
        socketsReady.current = true;
        setupSocketListeners();
      } catch (err) {
        console.warn('[DriverHomeScreen] Socket connect failed:', err.message);
      }
    };
    init();

    return () => {
      // Remove listeners but keep sockets alive — disconnection is handled by RideContext/logout
      if (rideSocket) {
        rideSocket.off('incoming_ride_request');
        rideSocket.off('ride_request_expired');
      }
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // -------------------------------------------------------------------------
  // Register socket event listeners
  // -------------------------------------------------------------------------
  function setupSocketListeners() {
    if (!rideSocket) return;

    /**
     * `incoming_ride_request` — server pushes a new trip request to this driver.
     * Show the ride request popup with 15-second countdown.
     */
    rideSocket.on('incoming_ride_request', (data) => {
      console.log('[DriverHomeScreen] incoming_ride_request', data);
      setRideRequest(data);
    });

    /**
     * `ride_request_expired` — server confirms the request timed out
     * (15-second window elapsed with no response).
     */
    rideSocket.on('ride_request_expired', ({ rideId }) => {
      setRideRequest((prev) => {
        if (prev?.rideId === rideId) return null;
        return prev;
      });
    });
  }

  // -------------------------------------------------------------------------
  // Ride request popup animation & countdown
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (rideRequest) {
      setCountdown(COUNTDOWN_SECONDS);
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 9 }).start();
      startCountdown();
      startRing();
    } else {
      slideAnim.setValue(300);
      ringAnim.setValue(0);
      if (countdownRef.current) clearInterval(countdownRef.current);
    }
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [rideRequest]);

  const startCountdown = () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          setRideRequest(null);
          return COUNTDOWN_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const startRing = () => {
    ringAnim.setValue(0);
    Animated.loop(
      Animated.timing(ringAnim, { toValue: 1, duration: COUNTDOWN_SECONDS * 1000, useNativeDriver: false })
    ).start();
  };

  // -------------------------------------------------------------------------
  // Nearby deliveries
  // -------------------------------------------------------------------------
  const handleShowNearbyDeliveries = async () => {
    setLoadingDeliveries(true);
    setShowDeliverySheet(true);
    Animated.spring(deliverySheetAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 9,
    }).start();

    try {
      let lat = mapRegion.latitude;
      let lng = mapRegion.longitude;

      // Try to get actual device location
      try {
        const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced });
          lat = loc.coords.latitude;
          lng = loc.coords.longitude;
        }
      } catch (_) {}

      const res = await api.get('/deliveries/nearby', {
        params: { lat, lng, radius_km: 5 },
      });
      const data = res.data?.deliveries || res.data || [];
      setNearbyDeliveries(Array.isArray(data) ? data : []);
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not load nearby deliveries.');
      setNearbyDeliveries([]);
    } finally {
      setLoadingDeliveries(false);
    }
  };

  const handleCloseDeliverySheet = () => {
    Animated.timing(deliverySheetAnim, {
      toValue: 400,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setShowDeliverySheet(false));
  };

  const handleAcceptDelivery = (delivery) => {
    handleCloseDeliverySheet();
    navigation.navigate('DriverDeliveryRequest', { delivery });
  };

  // -------------------------------------------------------------------------
  // Online / offline toggle
  // -------------------------------------------------------------------------
  const handleToggleOnline = async () => {
    if (isOnline) {
      Alert.alert('Go Offline', 'Stop receiving ride requests?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Go Offline',
          style: 'destructive',
          onPress: () => {
            setIsOnline(false);
            setRideRequest(null);
            // Emit driver_offline via location socket
            if (locationSocket?.connected) {
              locationSocket.emit('driver_offline', {});
            }
          },
        },
      ]);
    } else {
      // Check fatigue before going online
      try {
        const fatigueRes = await api.get('/safety/fatigue-check');
        if (fatigueRes.data?.should_break) {
          navigation.navigate('FatigueBreak', {
            reason: fatigueRes.data.reason || 'hours',
            hours_online: fatigueRes.data.hours_online || 0,
            trips_today: fatigueRes.data.trips_today || 0,
          });
          return; // Don't go online yet
        }
      } catch (fatigueErr) {
        // If fatigue check fails, allow going online (fail open)
        console.warn('[Fatigue Check]', fatigueErr.message);
      }

      setIsOnline(true);
      // Emit driver_online via location socket
      if (locationSocket?.connected) {
        locationSocket.emit('driver_online', {
          // Pass current location if available; omit if not yet fetched
          latitude: null,
          longitude: null,
        });
      }
    }
  };

  // -------------------------------------------------------------------------
  // Accept / Decline
  // -------------------------------------------------------------------------
  const handleAccept = () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    const req = rideRequest;
    setRideRequest(null);

    // Emit driver_response → accepted
    if (rideSocket?.connected && req?.rideId) {
      rideSocket.emit('driver_response', {
        rideId: req.rideId,
        accepted: true,
      });
    }

    navigation.navigate('DriverRide', { rideRequest: req });
  };

  const handleDecline = () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    const req = rideRequest;
    setRideRequest(null);

    // Emit driver_response → declined
    if (rideSocket?.connected && req?.rideId) {
      rideSocket.emit('driver_response', {
        rideId: req.rideId,
        accepted: false,
      });
    }
  };

  const ringColor = ringAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.success, colors.danger],
  });

  const circumference = 2 * Math.PI * 44;
  const strokeDash = ringAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      <MapView
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        region={mapRegion}
        showsUserLocation
        showsMyLocationButton={false}
      />

      {/* Top bar */}
      <SafeAreaView style={styles.topOverlay} edges={['top']}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.topIconBtn} onPress={() => navigation.navigate('Settings')}>
            <Ionicons name="menu-outline" size={22} color={colors.text} />
          </TouchableOpacity>

          <View style={[styles.statusPill, { backgroundColor: isOnline ? colors.success + '18' : colors.gray200, borderColor: isOnline ? colors.success : colors.gray300 }]}>
            <View style={[styles.statusDot, { backgroundColor: isOnline ? colors.success : colors.gray400 }]} />
            <Text style={[styles.statusPillText, { color: isOnline ? colors.success : colors.textSecondary }]}>
              {isOnline ? 'Online' : 'Offline'}
            </Text>
          </View>

          <TouchableOpacity style={styles.topIconBtn} onPress={() => navigation.navigate('Notifications')}>
            <Ionicons name="notifications-outline" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Bottom card */}
      <View style={[styles.bottomCard, { paddingBottom: insets.bottom + spacing.md }]}>
        {/* Driver greeting */}
        <View style={styles.greetRow}>
          <View style={styles.driverAvatar}>
            <Text style={styles.driverAvatarText}>{(user?.name || 'D').charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.greetTexts}>
            <Text style={styles.greetName}>Hi, {user?.name?.split(' ')[0] || 'Driver'}</Text>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={13} color={colors.warning} />
              <Text style={styles.ratingText}>{user?.rating?.toFixed(1) || '5.0'}</Text>
            </View>
          </View>
          <View style={styles.earningsBox}>
            <Text style={styles.earningsLabel}>Today</Text>
            <Text style={styles.earningsValue}>0 XAF</Text>
          </View>
        </View>

        {/* Quick action buttons */}
        <View style={styles.quickActionsRow}>
          {QUICK_ACTIONS.map((action) => (
            <TouchableOpacity
              key={action.screen}
              style={styles.quickActionBtn}
              onPress={() => navigation.navigate(action.screen)}
              activeOpacity={0.75}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: action.color + '18' }]}>
                <Ionicons name={action.icon} size={24} color={action.color} />
              </View>
              <Text style={styles.quickActionLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Nearby deliveries chip */}
        <TouchableOpacity
          style={styles.deliveriesChip}
          onPress={handleShowNearbyDeliveries}
          activeOpacity={0.8}
        >
          <Ionicons name="cube-outline" size={17} color={colors.white} />
          <Text style={styles.deliveriesChipText}>📦 Deliveries nearby</Text>
          <View style={styles.deliveriesChipArrow}>
            <Ionicons name="chevron-up" size={14} color={colors.white} />
          </View>
        </TouchableOpacity>

        {/* Go Online / Offline button */}
        <TouchableOpacity
          style={[styles.toggleBtn, isOnline ? styles.toggleBtnOnline : styles.toggleBtnOffline]}
          onPress={handleToggleOnline}
          activeOpacity={0.85}
        >
          <Ionicons name={isOnline ? 'radio-button-on' : 'radio-button-off'} size={22} color={colors.white} />
          <Text style={styles.toggleBtnText}>{isOnline ? 'GO OFFLINE' : 'GO ONLINE'}</Text>
        </TouchableOpacity>
      </View>

      {/* Nearby Deliveries Bottom Sheet */}
      {showDeliverySheet && (
        <Animated.View
          style={[
            styles.deliverySheet,
            { transform: [{ translateY: deliverySheetAnim }], paddingBottom: insets.bottom + spacing.md },
          ]}
        >
          <View style={styles.deliverySheetHeader}>
            <Text style={styles.deliverySheetTitle}>Nearby Deliveries</Text>
            <TouchableOpacity onPress={handleCloseDeliverySheet} activeOpacity={0.7}>
              <Ionicons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          {loadingDeliveries ? (
            <View style={styles.deliverySheetLoading}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.deliverySheetLoadingText}>Finding deliveries nearby...</Text>
            </View>
          ) : nearbyDeliveries.length === 0 ? (
            <View style={styles.deliverySheetEmpty}>
              <Ionicons name="cube-outline" size={36} color={colors.gray300} />
              <Text style={styles.deliverySheetEmptyText}>No deliveries nearby right now</Text>
            </View>
          ) : (
            <FlatList
              data={nearbyDeliveries}
              keyExtractor={(item) => String(item._id || item.id)}
              style={styles.deliverySheetList}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const fare = item.fare != null ? `${Number(item.fare).toLocaleString()} XAF` : '–';
                return (
                  <View style={styles.deliverySheetItem}>
                    <View style={styles.deliverySheetItemInfo}>
                      <View style={styles.deliverySheetItemBadge}>
                        <Text style={styles.deliverySheetItemBadgeText}>
                          {item.package_size ? item.package_size.replace('_', ' ') : 'Package'}
                        </Text>
                        {item.fragile && (
                          <Text style={styles.deliverySheetItemFragile}>⚠️</Text>
                        )}
                      </View>
                      <Text style={styles.deliverySheetItemAddress} numberOfLines={1}>
                        {item.pickup_address || item.pickup?.address || 'Pickup'}
                      </Text>
                      <Text style={styles.deliverySheetItemFare}>{fare}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.deliverySheetAcceptBtn}
                      onPress={() => handleAcceptDelivery(item)}
                      activeOpacity={0.88}
                    >
                      <Text style={styles.deliverySheetAcceptBtnText}>Accept</Text>
                    </TouchableOpacity>
                  </View>
                );
              }}
            />
          )}
        </Animated.View>
      )}

      {/* Ride Request Popup */}
      {rideRequest && (
        <Animated.View style={[styles.requestCard, { transform: [{ translateY: slideAnim }], paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.requestHeader}>
            <Text style={styles.requestTitle}>Ride Request</Text>
            {/* Countdown ring */}
            <View style={styles.countdownWrap}>
              <Text style={styles.countdownNumber}>{countdown}</Text>
            </View>
          </View>

          <View style={styles.requestRouteRow}>
            <View style={styles.dotsColumn}>
              <View style={styles.dotPickup} />
              <View style={styles.dotLine} />
              <View style={styles.dotDropoff} />
            </View>
            <View style={styles.requestRouteTexts}>
              <Text style={styles.requestAddress} numberOfLines={1}>{rideRequest.pickup?.address}</Text>
              <Text style={styles.requestAddress} numberOfLines={1}>{rideRequest.dropoff?.address}</Text>
            </View>
          </View>

          <View style={styles.requestMeta}>
            <View style={styles.requestMetaItem}>
              <Ionicons name="navigate-outline" size={16} color={colors.primary} />
              <Text style={styles.requestMetaText}>{rideRequest.distance}</Text>
            </View>
            <View style={styles.requestMetaItem}>
              <Ionicons name="time-outline" size={16} color={colors.primary} />
              <Text style={styles.requestMetaText}>{rideRequest.eta} away</Text>
            </View>
            <View style={styles.requestFareWrap}>
              <Text style={styles.requestFare}>{Number(rideRequest.fare).toLocaleString()} XAF</Text>
            </View>
          </View>

          <View style={styles.requestActions}>
            <TouchableOpacity style={styles.declineBtn} onPress={handleDecline} activeOpacity={0.8}>
              <Text style={styles.declineBtnText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.acceptBtn} onPress={handleAccept} activeOpacity={0.88}>
              <Text style={styles.acceptBtnText}>Accept</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  map: { ...StyleSheet.absoluteFillObject },
  topOverlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: spacing.md, marginTop: spacing.sm, gap: spacing.sm,
  },
  topIconBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center', ...shadows.md,
  },
  statusPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 3,
    borderRadius: radius.round, borderWidth: 1.5, backgroundColor: colors.white,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusPillText: { fontSize: 13, fontWeight: '700' },
  bottomCard: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: spacing.lg, shadowColor: '#000', shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.1, shadowRadius: 20, elevation: 16,
  },
  greetRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  driverAvatar: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  driverAvatarText: { fontSize: 22, fontWeight: '900', color: colors.white },
  greetTexts: { flex: 1 },
  greetName: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 3 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingText: { fontSize: 13, fontWeight: '600', color: colors.text },
  earningsBox: {
    alignItems: 'center', backgroundColor: 'rgba(255,0,191,0.08)',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md,
  },
  earningsLabel: { fontSize: 10, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  earningsValue: { fontSize: 16, fontWeight: '800', color: colors.primary },
  quickActionsRow: {
    flexDirection: 'row', justifyContent: 'space-around',
    marginBottom: spacing.md, paddingHorizontal: spacing.xs,
  },
  quickActionBtn: { alignItems: 'center', flex: 1 },
  quickActionIcon: {
    width: 56, height: 56, borderRadius: radius.lg,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs,
  },
  quickActionLabel: {
    fontSize: 11, fontWeight: '600', color: colors.textSecondary,
    textAlign: 'center', lineHeight: 14,
  },
  toggleBtn: {
    borderRadius: radius.pill, height: 56, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: spacing.sm,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  toggleBtnOffline: { backgroundColor: colors.success, shadowColor: colors.success },
  toggleBtnOnline: { backgroundColor: colors.danger, shadowColor: colors.danger },
  toggleBtnText: { fontSize: 17, fontWeight: '800', color: colors.white, letterSpacing: 0.5 },
  requestCard: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: spacing.lg, shadowColor: '#000', shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.15, shadowRadius: 24, elevation: 20, zIndex: 20,
  },
  requestHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  requestTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  countdownWrap: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,0,191,0.1)',
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.primary,
  },
  countdownNumber: { fontSize: 17, fontWeight: '900', color: colors.primary },
  requestRouteRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  dotsColumn: { alignItems: 'center', paddingTop: 4, paddingBottom: 4, gap: 0 },
  dotPickup: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.primary, backgroundColor: 'rgba(255,0,191,0.15)' },
  dotLine: { width: 2, height: 28, backgroundColor: colors.gray300 },
  dotDropoff: { width: 10, height: 10, borderRadius: 2, backgroundColor: colors.text },
  requestRouteTexts: { flex: 1, justifyContent: 'space-between' },
  requestAddress: { fontSize: 14, color: colors.text, fontWeight: '500', paddingVertical: 3 },
  requestMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  requestMetaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  requestMetaText: { fontSize: 14, fontWeight: '600', color: colors.text },
  requestFareWrap: { flex: 1, alignItems: 'flex-end' },
  requestFare: { fontSize: 20, fontWeight: '900', color: colors.text },
  requestActions: { flexDirection: 'row', gap: spacing.md },
  declineBtn: {
    flex: 1, height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.gray300,
  },
  declineBtnText: { fontSize: 16, fontWeight: '700', color: colors.textSecondary },
  acceptBtn: {
    flex: 2, height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary, shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  acceptBtnText: { fontSize: 16, fontWeight: '800', color: colors.white },

  // Nearby deliveries chip
  deliveriesChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: '#3B82F6',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.sm,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  deliveriesChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
    flex: 1,
    textAlign: 'center',
  },
  deliveriesChipArrow: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Nearby deliveries bottom sheet
  deliverySheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: spacing.lg,
    maxHeight: '60%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 22,
    zIndex: 18,
  },
  deliverySheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  deliverySheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  deliverySheetLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  deliverySheetLoadingText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  deliverySheetEmpty: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  deliverySheetEmptyText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  deliverySheetList: {
    maxHeight: 300,
  },
  deliverySheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  deliverySheetItemInfo: {
    flex: 1,
    gap: 3,
  },
  deliverySheetItemBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  deliverySheetItemBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3B82F6',
    textTransform: 'capitalize',
  },
  deliverySheetItemFragile: {
    fontSize: 13,
  },
  deliverySheetItemAddress: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
  deliverySheetItemFare: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.success,
  },
  deliverySheetAcceptBtn: {
    backgroundColor: '#3B82F6',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  deliverySheetAcceptBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.white,
  },
});

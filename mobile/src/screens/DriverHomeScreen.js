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
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { colors, spacing, radius, shadows } from '../theme';

const COUNTDOWN_SECONDS = 15;

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

  const mapRegion = {
    latitude: 3.848,
    longitude: 11.502,
    latitudeDelta: 0.04,
    longitudeDelta: 0.04,
  };

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

  const handleToggleOnline = () => {
    if (isOnline) {
      Alert.alert('Go Offline', 'Stop receiving ride requests?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Go Offline',
          style: 'destructive',
          onPress: () => { setIsOnline(false); setRideRequest(null); },
        },
      ]);
    } else {
      setIsOnline(true);
      // Simulate incoming request after 3s for demo
      setTimeout(() => {
        setRideRequest({
          id: 'req_demo',
          pickup: { address: 'Marché Central, Yaoundé', coords: { latitude: 3.861, longitude: 11.521 } },
          dropoff: { address: 'Aéroport International de Yaoundé', coords: { latitude: 3.722, longitude: 11.553 } },
          fare: 3500,
          distance: '12.4 km',
          eta: '4 min',
          rider: { name: 'Jean Dupont', rating: 4.8 },
        });
      }, 3000);
    }
  };

  const handleAccept = () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    const req = rideRequest;
    setRideRequest(null);
    navigation.navigate('DriverRide', { rideRequest: req });
  };

  const handleDecline = () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setRideRequest(null);
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
              <Text style={styles.requestAddress} numberOfLines={1}>{rideRequest.pickup.address}</Text>
              <Text style={styles.requestAddress} numberOfLines={1}>{rideRequest.dropoff.address}</Text>
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
  greetRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
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
});

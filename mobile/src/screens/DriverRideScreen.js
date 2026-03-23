import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
  StatusBar,
  Linking,
  Platform,
  ScrollView,
  Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as ExpoLocation from 'expo-location';
import { useLanguage } from '../context/LanguageContext';
import SOSButton from '../components/SOSButton';
import AudioRecordingToggle from '../components/AudioRecordingToggle';
import { colors, spacing, radius, shadows } from '../theme';
import { connectSockets, rideSocket } from '../services/socket';
import { ridesService } from '../services/rides';

// ── OSRM turn-by-turn routing ─────────────────────────────────────────────────
const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';

async function fetchOSRMRoute(originLat, originLng, destLat, destLng) {
  try {
    const url = `${OSRM_URL}/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson&steps=true&annotations=false`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes[0]) return null;

    const route = data.routes[0];
    const polylineCoords = route.geometry.coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));

    // Flatten steps from all legs
    const steps = route.legs.flatMap((leg) =>
      leg.steps.map((step) => ({
        instruction: step.maneuver.type === 'arrive' ? 'Arrive at destination' : formatInstruction(step),
        distance: step.distance,
        duration: step.duration,
        maneuver: step.maneuver.type,
        modifier: step.maneuver.modifier,
      }))
    );

    return {
      polyline: polylineCoords,
      steps,
      distanceM: route.distance,
      durationS: route.duration,
    };
  } catch (err) {
    console.warn('[OSRM]', err.message);
    return null;
  }
}

function formatInstruction(step) {
  const type = step.maneuver?.type || '';
  const modifier = step.maneuver?.modifier || '';
  const name = step.name || 'the road';

  const typeMap = {
    'turn': `Turn ${modifier}`, 'new name': `Continue onto`, 'depart': 'Head',
    'arrive': 'Arrive at', 'merge': 'Merge', 'ramp': `Take the ramp ${modifier}`,
    'on ramp': 'Take the on-ramp', 'off ramp': 'Take the off-ramp',
    'fork': `Keep ${modifier} at the fork`, 'end of road': `Turn ${modifier}`,
    'continue': 'Continue on', 'roundabout': 'Enter the roundabout',
    'rotary': 'Enter the rotary', 'roundabout turn': `Take the ${modifier} exit`,
    'notification': 'Continue', 'exit roundabout': 'Exit the roundabout',
  };
  const prefix = typeMap[type] || `${type} ${modifier}`.trim();
  return name ? `${prefix} onto ${name}` : prefix;
}

function maneuverIcon(maneuver, modifier) {
  if (maneuver === 'arrive') return 'location';
  if (maneuver === 'depart') return 'navigate';
  if (maneuver === 'roundabout' || maneuver === 'rotary') return 'refresh-circle-outline';
  if (modifier === 'left') return 'arrow-back';
  if (modifier === 'right') return 'arrow-forward';
  if (modifier === 'sharp left') return 'return-down-back-outline';
  if (modifier === 'sharp right') return 'return-down-forward-outline';
  if (modifier === 'slight left') return 'arrow-up-outline';
  if (modifier === 'slight right') return 'arrow-up-outline';
  if (modifier === 'uturn') return 'refresh-outline';
  return 'arrow-up';
}

function fmtDist(m) {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}
function fmtDur(s) {
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`;
}

const RIDE_STEPS = [
  { key: 'pickup',    label: 'Navigate to Pickup',  action: 'Arrived at Pickup',  icon: 'navigate-outline',           color: colors.warning },
  { key: 'verify',   label: 'Verify Rider OTP',     action: 'Start Ride',         icon: 'shield-checkmark-outline',   color: colors.primary },
  { key: 'inprogress', label: 'Ride in Progress',   action: 'Complete Ride',      icon: 'car-outline',                color: colors.success },
  { key: 'completed',  label: 'Ride Completed',     action: null,                 icon: 'checkmark-circle-outline',   color: colors.success },
];

/** Map step index → ride_status_change value emitted to riders */
const STEP_STATUS_MAP = {
  0: 'arriving',
  1: 'arrived',
  2: 'in_progress',
  3: 'completed',
};

export default function DriverRideScreen({ navigation, route }) {
  const { rideRequest } = route.params || {};
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);

  const [stepIndex, setStepIndex] = useState(0);
  const [otpInput, setOtpInput] = useState('');
  const [otpError, setOtpError] = useState(false);

  // ── Waiting fee timer (shown after "Arrived at Pickup" = step 1) ──────────
  const [waitSeconds, setWaitSeconds] = useState(0);
  const waitTimerRef = useRef(null);

  const FREE_WAIT_SEC = 3 * 60;   // 3 minutes free
  const WAIT_RATE_XAF = 50 / 60;  // 50 XAF/min → per second

  // Explicit unmount cleanup for all timers and intervals
  useEffect(() => {
    return () => {
      if (waitTimerRef.current) clearInterval(waitTimerRef.current);
      if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
      if (locationIntervalRef.current) clearInterval(locationIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (stepIndex === 1) {
      // Start timer when driver marks "Arrived at Pickup"
      setWaitSeconds(0);
      waitTimerRef.current = setInterval(() => setWaitSeconds((s) => s + 1), 1000);
    } else {
      clearInterval(waitTimerRef.current);
    }
    return () => clearInterval(waitTimerRef.current);
  }, [stepIndex]);

  const chargeableSec = Math.max(0, waitSeconds - FREE_WAIT_SEC);
  const waitingFee = Math.round(chargeableSec * WAIT_RATE_XAF);

  // ── In-app navigation ──────────────────────────────────────────────────────
  const [navRoute, setNavRoute] = useState(null);       // { polyline, steps, distanceM, durationS }
  const [navStepIdx, setNavStepIdx] = useState(0);
  const [navExpanded, setNavExpanded] = useState(false);

  // Incoming messages from the rider
  const [riderMessage, setRiderMessage] = useState(null);
  const messageTimerRef = useRef(null);

  // GPS emit interval handle
  const locationIntervalRef = useRef(null);
  // Stable ref for AudioRecordingToggle save callback
  const recordingCompleteRef = useRef(() => {});

  const currentStep = RIDE_STEPS[stepIndex];
  const ride = rideRequest || {};
  const rideId = ride.rideId || ride.id;

  const mapRegion = ride.pickup?.coords
    ? { latitude: ride.pickup.coords.latitude, longitude: ride.pickup.coords.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 }
    : { latitude: 3.848, longitude: 11.502, latitudeDelta: 0.04, longitudeDelta: 0.04 };

  // ── Fetch OSRM route whenever the navigation target changes ──────────────
  useEffect(() => {
    // step 0 → navigate to pickup; step 2 → navigate to dropoff
    const targetCoords =
      stepIndex === 0 ? ride.pickup?.coords :
      stepIndex === 2 ? ride.dropoff?.coords : null;

    if (!targetCoords) { setNavRoute(null); return; }

    let cancelled = false;
    (async () => {
      // Get current driver position
      try {
        const perm = await ExpoLocation.requestForegroundPermissionsAsync();
        if (perm.status !== 'granted') return;
        const loc = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced });
        if (cancelled) return;
        const result = await fetchOSRMRoute(
          loc.coords.latitude, loc.coords.longitude,
          targetCoords.latitude, targetCoords.longitude,
        );
        if (!cancelled) { setNavRoute(result); setNavStepIdx(0); }
      } catch { /* silent — nav is best-effort */ }
    })();

    return () => { cancelled = true; };
  }, [stepIndex]);

  // -------------------------------------------------------------------------
  // Connect sockets + start GPS broadcasting + listen for rider messages
  // -------------------------------------------------------------------------
  useEffect(() => {
    const init = async () => {
      try {
        await connectSockets();

        // Listen for messages from the rider
        if (rideSocket) {
          rideSocket.on('message', handleRiderMessage);
          rideSocket.on('ride_cancelled', handleRideCancelled);
        }

        // Start emitting GPS position every 5 seconds
        await startGPSBroadcast();
      } catch (err) {
        console.warn('[DriverRideScreen] Socket init failed:', err.message);
      }
    };

    init();

    return () => {
      stopGPSBroadcast();
      if (rideSocket) {
        rideSocket.off('message', handleRiderMessage);
        rideSocket.off('ride_cancelled', handleRideCancelled);
      }
      if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    };
  }, []);

  // -------------------------------------------------------------------------
  // GPS broadcasting helpers
  // -------------------------------------------------------------------------
  const startGPSBroadcast = async () => {
    // Request location permission
    const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.warn('[DriverRideScreen] Location permission denied — GPS broadcast disabled');
      return;
    }

    const emit = async () => {
      if (!rideSocket?.connected || !rideId) return;
      try {
        const loc = await ExpoLocation.getCurrentPositionAsync({
          accuracy: ExpoLocation.Accuracy.High,
        });
        rideSocket.emit('driver_location_update', {
          rideId,
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          heading: loc.coords.heading ?? null,
          speed: loc.coords.speed ?? null,
          timestamp: loc.timestamp,
        });
      } catch (err) {
        console.warn('[DriverRideScreen] GPS emit failed:', err.message);
      }
    };

    // Emit immediately, then every 5 seconds
    emit();
    locationIntervalRef.current = setInterval(emit, 5000);
  };

  const stopGPSBroadcast = () => {
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
      locationIntervalRef.current = null;
    }
  };

  // -------------------------------------------------------------------------
  // Socket event handlers
  // -------------------------------------------------------------------------
  const handleRiderMessage = useCallback((data) => {
    if (data.rideId !== rideId) return;
    if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    setRiderMessage({ text: data.text, senderName: data.senderName });
    messageTimerRef.current = setTimeout(() => setRiderMessage(null), 4000);
  }, [rideId]);

  const handleRideCancelled = useCallback((data) => {
    if (data.rideId !== rideId) return;
    stopGPSBroadcast();
    Alert.alert('Ride Cancelled', 'The rider has cancelled this ride.', [
      { text: 'OK', onPress: () => navigation.goBack() },
    ]);
  }, [rideId]);

  // -------------------------------------------------------------------------
  // Emit ride_status_change when step advances
  // -------------------------------------------------------------------------
  const emitStatusChange = (newStepIndex) => {
    if (!rideSocket?.connected || !rideId) return;
    const status = STEP_STATUS_MAP[newStepIndex];
    if (status) {
      rideSocket.emit('ride_status_change', { rideId, status });
    }
  };

  // -------------------------------------------------------------------------
  // Action button handler
  // -------------------------------------------------------------------------
  const handleAction = () => {
    if (currentStep.key === 'verify') {
      if (otpInput.length < 4) {
        setOtpError(true);
        Alert.alert('Invalid OTP', 'Please enter the 4-digit OTP from the rider.');
        return;
      }
      setOtpError(false);
      const next = stepIndex + 1;
      setStepIndex(next);
      emitStatusChange(next);
    } else if (currentStep.key === 'completed') {
      stopGPSBroadcast();
      if (recordingCompleteRef.current.currentSave) {
        recordingCompleteRef.current.currentSave().catch(() => {});
      }
      navigation.goBack();
    } else {
      const next = stepIndex + 1;
      setStepIndex(next);
      emitStatusChange(next);
    }
  };

  const handleCallRider = async () => {
    if (!rideId) { Alert.alert('Not available', 'Ride ID missing'); return; }
    try {
      const session = await ridesService.initiateCall(rideId);
      const dialNumber = session.masked_number || ride.rider?.phone;
      if (!dialNumber) throw new Error('no number');
      Linking.openURL(`tel:${dialNumber}`);
    } catch {
      // Fall back to direct dial
      const phone = ride.rider?.phone;
      if (phone) Linking.openURL(`tel:${phone}`);
      else Alert.alert('Not available', 'Rider phone not available');
    }
  };

  const handleMessageRider = () => {
    navigation.navigate('Messages');
  };

  const handleNavigate = () => {
    const coords = stepIndex === 0 ? ride.pickup?.coords : ride.dropoff?.coords;
    if (!coords) return;
    const url = Platform.OS === 'android'
      ? `geo:${coords.latitude},${coords.longitude}`
      : `maps:?q=${coords.latitude},${coords.longitude}`;
    Linking.openURL(url);
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        region={mapRegion}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {ride.pickup?.coords && (
          <Marker coordinate={ride.pickup.coords} title="Pickup">
            <View style={styles.pickupMarker}><View style={styles.pickupDot} /></View>
          </Marker>
        )}
        {ride.dropoff?.coords && stepIndex >= 2 && (
          <Marker coordinate={ride.dropoff.coords} title="Dropoff">
            <View style={styles.dropoffMarker}>
              <Ionicons name="location" size={18} color={colors.text} />
            </View>
          </Marker>
        )}
        {navRoute?.polyline?.length > 1 && (
          <Polyline
            coordinates={navRoute.polyline}
            strokeColor={colors.primary}
            strokeWidth={4}
            lineDashPattern={undefined}
          />
        )}
      </MapView>

      {/* Top bar */}
      <SafeAreaView style={styles.topOverlay} edges={['top']}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.topBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={[styles.stepPill, { borderColor: currentStep.color, backgroundColor: currentStep.color + '15' }]}>
            <Ionicons name={currentStep.icon} size={14} color={currentStep.color} />
            <Text style={[styles.stepPillText, { color: currentStep.color }]}>{currentStep.label}</Text>
          </View>
          <TouchableOpacity style={styles.topBtn} onPress={handleNavigate}>
            <Ionicons name="navigate-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Navigation instruction panel */}
      {navRoute && (stepIndex === 0 || stepIndex === 2) && (() => {
        const step = navRoute.steps[navStepIdx];
        return (
          <View style={styles.navPanel}>
            <TouchableOpacity
              style={styles.navPanelMain}
              activeOpacity={0.85}
              onPress={() => setNavExpanded((v) => !v)}
            >
              <View style={styles.navIconWrap}>
                <Ionicons
                  name={maneuverIcon(step?.maneuver, step?.modifier)}
                  size={28}
                  color={colors.white}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.navInstruction} numberOfLines={2}>
                  {step?.instruction || 'Follow route'}
                </Text>
                <Text style={styles.navMeta}>
                  {fmtDist(step?.distance ?? 0)}
                  {'  ·  '}
                  {fmtDur(navRoute.durationS)} total
                  {'  ·  '}
                  {fmtDist(navRoute.distanceM)}
                </Text>
              </View>
              <Ionicons
                name={navExpanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color="rgba(255,255,255,0.7)"
              />
            </TouchableOpacity>

            {navExpanded && (
              <ScrollView style={styles.navStepList} nestedScrollEnabled>
                {navRoute.steps.map((s, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.navStepRow, i === navStepIdx && styles.navStepRowActive]}
                    onPress={() => setNavStepIdx(i)}
                    activeOpacity={0.75}
                  >
                    <Ionicons
                      name={maneuverIcon(s.maneuver, s.modifier)}
                      size={16}
                      color={i === navStepIdx ? colors.white : 'rgba(255,255,255,0.6)'}
                    />
                    <Text style={[styles.navStepText, i === navStepIdx && { color: colors.white }]} numberOfLines={1}>
                      {s.instruction}
                    </Text>
                    <Text style={styles.navStepDist}>{fmtDist(s.distance)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Step prev / next */}
            {navRoute.steps.length > 1 && (
              <View style={styles.navStepNav}>
                <TouchableOpacity
                  style={[styles.navStepBtn, navStepIdx === 0 && { opacity: 0.3 }]}
                  disabled={navStepIdx === 0}
                  onPress={() => setNavStepIdx((i) => i - 1)}
                >
                  <Ionicons name="chevron-back" size={16} color={colors.white} />
                  <Text style={styles.navStepBtnText}>Prev</Text>
                </TouchableOpacity>
                <Text style={styles.navStepCount}>
                  {navStepIdx + 1} / {navRoute.steps.length}
                </Text>
                <TouchableOpacity
                  style={[styles.navStepBtn, navStepIdx === navRoute.steps.length - 1 && { opacity: 0.3 }]}
                  disabled={navStepIdx === navRoute.steps.length - 1}
                  onPress={() => setNavStepIdx((i) => i + 1)}
                >
                  <Text style={styles.navStepBtnText}>Next</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.white} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      })()}

      {/* Rider message toast */}
      {riderMessage && (
        <View style={styles.messageToast}>
          <Ionicons name="chatbubble-ellipses" size={16} color={colors.white} />
          <View style={styles.messageToastTexts}>
            <Text style={styles.messageToastSender} numberOfLines={1}>{riderMessage.senderName}</Text>
            <Text style={styles.messageToastText} numberOfLines={2}>{riderMessage.text}</Text>
          </View>
          <TouchableOpacity onPress={handleMessageRider}>
            <Text style={styles.messageToastReply}>Reply</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* SOS */}
      <SOSButton onPress={() => navigation.navigate('SOS', { rideId })} style={{ bottom: insets.bottom + 300 }} />

      {/* Bottom card */}
      <View style={[styles.bottomCard, { paddingBottom: insets.bottom + spacing.md }]}>
        {/* Rider info */}
        <View style={styles.riderRow}>
          <View style={styles.riderAvatar}>
            <Text style={styles.riderAvatarText}>{(ride.rider?.name || 'R').charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.riderInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <Text style={[styles.riderName, { marginBottom: 0 }]}>{ride.rider?.name || 'Rider'}</Text>
              {ride.rider?.is_verified && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#eff6ff', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12, borderWidth: 1, borderColor: '#bfdbfe' }}>
                  <Ionicons name="shield-checkmark" size={10} color="#3b82f6" />
                  <Text style={{ fontSize: 9, fontWeight: '700', color: '#1e40af', textTransform: 'uppercase' }}>Verified</Text>
                </View>
              )}
            </View>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={13} color={colors.warning} />
              <Text style={styles.ratingText}>{ride.rider?.rating?.toFixed(1) || '–'}</Text>
            </View>
          </View>
          <View style={styles.fareBox}>
            <Text style={styles.fareLabel}>Fare</Text>
            <Text style={styles.fareValue}>{Number(ride.fare || 0).toLocaleString()} XAF</Text>
          </View>
        </View>

        {/* ── Pickup instructions ──────────────────────────────────────── */}
        {ride.pickup_instructions && (
          <View style={[styles.alertBanner, { backgroundColor: '#eff6ff', borderLeftColor: '#3b82f6' }]}>
            <Ionicons name="information-circle-outline" size={15} color="#3b82f6" />
            <Text style={[styles.alertBannerText, { color: '#1e40af' }]}>
              Pickup note: <Text style={{ fontWeight: '700' }}>{ride.pickup_instructions}</Text>
            </Text>
          </View>
        )}

        {/* ── Ride preferences ─────────────────────────────────────────── */}
        {(ride.quiet_mode || ride.ac_preference === 'on' || ride.ac_preference === 'off' || ride.music_preference === false) && (
          <View style={[styles.alertBanner, { backgroundColor: '#f5f3ff', borderLeftColor: '#7c3aed', flexWrap: 'wrap', gap: 4 }]}>
            <Ionicons name="options-outline" size={15} color="#7c3aed" />
            <Text style={[styles.alertBannerText, { color: '#4c1d95', flex: undefined }]}>Rider preferences:</Text>
            {ride.quiet_mode && (
              <View style={styles.prefChip}><Ionicons name="volume-mute-outline" size={11} color="#7c3aed" /><Text style={styles.prefChipText}>Quiet</Text></View>
            )}
            {ride.ac_preference === 'on' && (
              <View style={styles.prefChip}><Ionicons name="snow-outline" size={11} color="#7c3aed" /><Text style={styles.prefChipText}>AC On</Text></View>
            )}
            {ride.ac_preference === 'off' && (
              <View style={styles.prefChip}><Ionicons name="sunny-outline" size={11} color="#7c3aed" /><Text style={styles.prefChipText}>AC Off</Text></View>
            )}
            {ride.music_preference === false && (
              <View style={styles.prefChip}><Ionicons name="musical-notes-outline" size={11} color="#7c3aed" /><Text style={styles.prefChipText}>No music</Text></View>
            )}
          </View>
        )}

        {/* ── Waiting fee timer (step 1 = verify, driver has arrived) ────── */}
        {stepIndex === 1 && (
          <View style={[styles.alertBanner, {
            backgroundColor: waitingFee > 0 ? '#fef2f2' : '#f0fdf4',
            borderLeftColor: waitingFee > 0 ? colors.danger : colors.success,
          }]}>
            <Ionicons name="timer-outline" size={15} color={waitingFee > 0 ? colors.danger : colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.alertBannerText, { color: waitingFee > 0 ? '#991b1b' : '#14532d' }]}>
                {waitSeconds < FREE_WAIT_SEC
                  ? `Free wait: ${Math.floor((FREE_WAIT_SEC - waitSeconds) / 60)}:${String(Math.floor((FREE_WAIT_SEC - waitSeconds) % 60)).padStart(2, '0')} remaining`
                  : `Waiting fee: +${waitingFee.toLocaleString()} XAF`}
              </Text>
              <Text style={{ fontSize: 10, color: colors.textSecondary }}>
                {waitSeconds < FREE_WAIT_SEC
                  ? '3 min free — 50 XAF/min after'
                  : `${Math.floor(chargeableSec / 60)}:${String(Math.floor(chargeableSec % 60)).padStart(2,'0')} chargeable`}
              </Text>
            </View>
          </View>
        )}

        {/* Ride-for-other alert */}
        {ride.is_for_other && ride.other_passenger_name && (
          <View style={styles.alertBanner}>
            <Ionicons name="person" size={15} color="#2563eb" />
            <Text style={styles.alertBannerText}>
              Passenger: <Text style={{ fontWeight: '800' }}>{ride.other_passenger_name}</Text>
              {ride.other_passenger_phone ? `  ·  ${ride.other_passenger_phone}` : ''}
            </Text>
          </View>
        )}

        {/* Child seat alert */}
        {ride.child_seat_required && (
          <View style={[styles.alertBanner, { backgroundColor: '#fff7ed', borderLeftColor: colors.warning }]}>
            <Ionicons name="happy" size={15} color={colors.warning} />
            <Text style={[styles.alertBannerText, { color: '#92400e' }]}>
              Child seat required — {ride.child_seat_count || 1} seat{(ride.child_seat_count || 1) > 1 ? 's' : ''}
            </Text>
          </View>
        )}

        {/* Route */}
        <View style={styles.routeRow}>
          <View style={styles.dotsColumn}>
            <View style={styles.dotPickup} />
            <View style={styles.dotLine} />
            <View style={styles.dotDropoff} />
          </View>
          <View style={styles.routeTexts}>
            <Text style={styles.routeAddress} numberOfLines={1}>{ride.pickup?.address || 'Pickup location'}</Text>
            <Text style={styles.routeAddress} numberOfLines={1}>{ride.dropoff?.address || 'Dropoff location'}</Text>
          </View>
        </View>

        {/* OTP input shown during verify step */}
        {currentStep.key === 'verify' && (
          <View style={styles.otpSection}>
            <Text style={styles.otpPrompt}>Enter rider's OTP code</Text>
            <View style={[styles.otpInputWrap, otpError && styles.otpInputError]}>
              <Ionicons name="keypad-outline" size={20} color={otpError ? colors.danger : colors.gray400} />
              <TextInput
                style={styles.otpInput}
                value={otpInput}
                onChangeText={(v) => { setOtpInput(v); setOtpError(false); }}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="0000"
                placeholderTextColor={colors.textLight}
              />
            </View>
          </View>
        )}

        {/* Safety recording — available while ride is in progress */}
        {currentStep.key === 'inprogress' && (
          <AudioRecordingToggle
            rideId={rideId}
            role="driver"
            onRecordingComplete={recordingCompleteRef.current}
          />
        )}

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.iconBtn} onPress={handleMessageRider} activeOpacity={0.8}>
            <View style={styles.iconBtnInner}>
              <Ionicons name="chatbubble-outline" size={20} color={colors.text} />
            </View>
            <Text style={styles.iconBtnLabel}>Message</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={handleCallRider} activeOpacity={0.8}>
            <View style={styles.iconBtnInner}>
              <Ionicons name="call-outline" size={20} color={colors.text} />
            </View>
            <Text style={styles.iconBtnLabel}>Call</Text>
          </TouchableOpacity>
          {currentStep.action && (
            <TouchableOpacity style={[styles.mainActionBtn, { backgroundColor: currentStep.color, shadowColor: currentStep.color }]} onPress={handleAction} activeOpacity={0.88}>
              <Text style={styles.mainActionBtnText}>{currentStep.action}</Text>
            </TouchableOpacity>
          )}
          {!currentStep.action && (
            <TouchableOpacity style={[styles.mainActionBtn, { backgroundColor: colors.success, shadowColor: colors.success }]} onPress={handleAction} activeOpacity={0.88}>
              <Text style={styles.mainActionBtnText}>Done</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
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
  topBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center', ...shadows.md,
  },
  stepPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 3,
    borderRadius: radius.round, borderWidth: 1.5, backgroundColor: colors.white,
  },
  stepPillText: { fontSize: 12, fontWeight: '700' },
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
  messageToastTexts: { flex: 1 },
  messageToastSender: {
    fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.7)', marginBottom: 2,
  },
  messageToastText: { fontSize: 14, color: colors.white, fontWeight: '500' },
  messageToastReply: { fontSize: 13, fontWeight: '700', color: colors.primary },
  bottomCard: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: spacing.md, shadowColor: '#000', shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.1, shadowRadius: 20, elevation: 16,
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#eff6ff',
    borderLeftWidth: 3,
    borderLeftColor: '#2563eb',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    marginBottom: spacing.sm,
  },
  alertBannerText: { flex: 1, fontSize: 13, color: '#1e40af', fontWeight: '500' },
  prefChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#ede9fe', borderRadius: radius.pill,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  prefChipText: { fontSize: 10, fontWeight: '700', color: '#7c3aed' },
  riderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  riderAvatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  riderAvatarText: { fontSize: 20, fontWeight: '900', color: colors.white },
  riderInfo: { flex: 1 },
  riderName: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 3 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingText: { fontSize: 13, fontWeight: '600', color: colors.text },
  fareBox: {
    alignItems: 'center', backgroundColor: 'rgba(255,0,191,0.08)',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md,
  },
  fareLabel: { fontSize: 10, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  fareValue: { fontSize: 15, fontWeight: '800', color: colors.primary },
  routeRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  dotsColumn: { alignItems: 'center', paddingTop: 4, paddingBottom: 4 },
  dotPickup: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.primary, backgroundColor: 'rgba(255,0,191,0.15)' },
  dotLine: { width: 2, height: 24, backgroundColor: colors.gray300 },
  dotDropoff: { width: 10, height: 10, borderRadius: 2, backgroundColor: colors.text },
  routeTexts: { flex: 1, justifyContent: 'space-between' },
  routeAddress: { fontSize: 14, color: colors.text, fontWeight: '500', paddingVertical: 2 },
  otpSection: { marginBottom: spacing.md },
  otpPrompt: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.sm },
  otpInputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1.5, borderColor: colors.gray200,
  },
  otpInputError: { borderColor: colors.danger, backgroundColor: 'rgba(227,24,55,0.05)' },
  otpInput: { flex: 1, fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: 6 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconBtn: { alignItems: 'center', gap: spacing.xs },
  iconBtnInner: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  iconBtnLabel: { fontSize: 11, fontWeight: '600', color: colors.text },
  mainActionBtn: {
    flex: 1, height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  mainActionBtnText: { fontSize: 15, fontWeight: '800', color: colors.white },
  pickupMarker: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,0,191,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.primary },
  pickupDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  dropoffMarker: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.gray300, ...shadows.sm },

  // ── Navigation panel ──────────────────────────────────────────────────────
  navPanel: {
    position: 'absolute', top: 90, left: spacing.md, right: spacing.md,
    zIndex: 15, borderRadius: radius.lg, overflow: 'hidden',
    backgroundColor: 'rgba(25,25,35,0.93)', ...shadows.lg,
  },
  navPanelMain: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.md,
  },
  navIconWrap: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  navInstruction: { fontSize: 15, fontWeight: '700', color: colors.white, lineHeight: 20 },
  navMeta: { fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 3 },
  navStepList: { maxHeight: 200, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  navStepRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: 10,
  },
  navStepRowActive: { backgroundColor: 'rgba(255,0,191,0.25)' },
  navStepText: { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.65)', fontWeight: '500' },
  navStepDist: { fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: '600' },
  navStepNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)',
  },
  navStepBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  navStepBtnText: { fontSize: 12, fontWeight: '600', color: colors.white },
  navStepCount: { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
});

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
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as ExpoLocation from 'expo-location';
import { useLanguage } from '../context/LanguageContext';
import SOSButton from '../components/SOSButton';
import AudioRecordingToggle from '../components/AudioRecordingToggle';
import { colors, spacing, radius, shadows } from '../theme';
import { connectSockets, rideSocket } from '../services/socket';

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

  const handleCallRider = () => {
    const phone = ride.rider?.phone;
    if (!phone) { Alert.alert('Not available', 'Rider phone not available'); return; }
    Linking.openURL(`tel:${phone}`);
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
      <SOSButton onPress={() => navigation.navigate('SOS')} style={{ bottom: insets.bottom + 300 }} />

      {/* Bottom card */}
      <View style={[styles.bottomCard, { paddingBottom: insets.bottom + spacing.md }]}>
        {/* Rider info */}
        <View style={styles.riderRow}>
          <View style={styles.riderAvatar}>
            <Text style={styles.riderAvatarText}>{(ride.rider?.name || 'R').charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.riderInfo}>
            <Text style={styles.riderName}>{ride.rider?.name || 'Rider'}</Text>
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
});

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
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, radius, shadows } from '../theme';
import api from '../services/api';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Delivery workflow steps for the driver:
 *   0. Navigate to pickup (status: driver_assigned | driver_arriving)
 *   1. Arrived at pickup (status: arrived_at_pickup)
 *   2. Take pickup photo → Confirm pickup (status: picked_up)
 *   3. Navigate to dropoff — verify OTP or take delivery photo (status: in_transit)
 *   4. Confirm delivery (status: delivered)
 */
const DRIVER_STEPS = {
  NAVIGATE_PICKUP: 'navigate_pickup',
  ARRIVED_PICKUP: 'arrived_pickup',
  PICKUP_PHOTO: 'pickup_photo',
  IN_TRANSIT: 'in_transit',
  DELIVERED: 'delivered',
};

// Map app delivery status → local driver step
function statusToStep(status) {
  switch (status) {
    case 'driver_assigned':
    case 'driver_arriving': return DRIVER_STEPS.NAVIGATE_PICKUP;
    case 'arrived_at_pickup': return DRIVER_STEPS.ARRIVED_PICKUP;
    case 'picked_up': return DRIVER_STEPS.IN_TRANSIT;
    case 'in_transit': return DRIVER_STEPS.IN_TRANSIT;
    case 'delivered': return DRIVER_STEPS.DELIVERED;
    default: return DRIVER_STEPS.NAVIGATE_PICKUP;
  }
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function DriverDeliveryScreen({ navigation, route }) {
  const { delivery: initialDelivery } = route.params || {};
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);

  const [delivery, setDelivery] = useState(initialDelivery || {});
  const [localStep, setLocalStep] = useState(statusToStep(initialDelivery?.status));
  const [pickupPhoto, setPickupPhoto] = useState(null);
  const [deliveryPhoto, setDeliveryPhoto] = useState(null);
  const [otpInput, setOtpInput] = useState('');
  const [otpError, setOtpError] = useState(false);
  const [loading, setLoading] = useState(false);

  const deliveryId = delivery._id || delivery.id;

  // ---------------------------------------------------------------------------
  // Map region — show pickup if not yet picked up, else dropoff
  // ---------------------------------------------------------------------------
  const showPickup = [DRIVER_STEPS.NAVIGATE_PICKUP, DRIVER_STEPS.ARRIVED_PICKUP, DRIVER_STEPS.PICKUP_PHOTO].includes(localStep);

  const activeCoords = showPickup
    ? (delivery.pickup_coords || delivery.pickup?.coords)
    : (delivery.dropoff_coords || delivery.dropoff?.coords);

  const mapRegion = activeCoords
    ? {
        latitude: activeCoords.latitude || activeCoords.lat,
        longitude: activeCoords.longitude || activeCoords.lng,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }
    : { latitude: 3.848, longitude: 11.502, latitudeDelta: 0.04, longitudeDelta: 0.04 };

  // ---------------------------------------------------------------------------
  // Open navigation app
  // ---------------------------------------------------------------------------
  const handleNavigate = () => {
    if (!activeCoords) return;
    const lat = activeCoords.latitude || activeCoords.lat;
    const lng = activeCoords.longitude || activeCoords.lng;
    const url = Platform.OS === 'android'
      ? `geo:${lat},${lng}?q=${lat},${lng}`
      : `maps:?q=${lat},${lng}`;
    Linking.openURL(url);
  };

  // ---------------------------------------------------------------------------
  // Call recipient
  // ---------------------------------------------------------------------------
  const handleCallRecipient = () => {
    const phone = delivery.recipient_phone;
    if (!phone) { Alert.alert('Not available', 'Recipient phone not available'); return; }
    Linking.openURL(`tel:${phone}`);
  };

  // ---------------------------------------------------------------------------
  // Photo capture helper
  // ---------------------------------------------------------------------------
  const capturePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera access is needed to take a photo.');
        return null;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.75,
      });
      if (!result.canceled && result.assets?.[0]) {
        return result.assets[0].uri;
      }
    } catch (err) {
      Alert.alert('Error', 'Could not open camera.');
    }
    return null;
  };

  // ---------------------------------------------------------------------------
  // API calls — status updates
  // ---------------------------------------------------------------------------
  const updateStatus = async (status, extraData = {}) => {
    setLoading(true);
    try {
      await api.patch(`/deliveries/${deliveryId}/status`, { status, ...extraData });
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not update delivery status.');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Step actions
  // ---------------------------------------------------------------------------

  // Step 0 → Arrived at pickup
  const handleArrivedAtPickup = async () => {
    try {
      await updateStatus('arrived_at_pickup');
      setLocalStep(DRIVER_STEPS.ARRIVED_PICKUP);
    } catch {}
  };

  // Step 1 → Take pickup photo
  const handleTakePickupPhoto = async () => {
    const uri = await capturePhoto();
    if (uri) setPickupPhoto(uri);
  };

  // Confirm pickup after photo
  const handleConfirmPickup = async () => {
    if (!pickupPhoto) {
      Alert.alert('Photo Required', 'Please take a pickup photo first.');
      return;
    }
    // Simulate upload — use local URI as placeholder URL
    const photoUrl = `delivery://local/${Date.now()}`;
    try {
      await updateStatus('picked_up', { pickup_photo_url: photoUrl });
      setLocalStep(DRIVER_STEPS.IN_TRANSIT);
    } catch {}
  };

  // Step 3 — Verify OTP
  const handleVerifyOtp = async () => {
    if (otpInput.trim().length < 4) {
      setOtpError(true);
      Alert.alert('Invalid Code', 'Please enter the delivery code provided by the recipient.');
      return;
    }
    setOtpError(false);
    try {
      await updateStatus('verify_otp', { otp: otpInput.trim() });
    } catch {}
  };

  // Step 3 — Take delivery photo
  const handleTakeDeliveryPhoto = async () => {
    const uri = await capturePhoto();
    if (uri) setDeliveryPhoto(uri);
  };

  // Confirm delivery
  const handleConfirmDelivery = async () => {
    // Delivery can proceed via verified OTP OR delivery photo
    if (!deliveryPhoto && otpInput.trim().length < 4) {
      Alert.alert(
        'Verification Required',
        'Please either verify the recipient\'s OTP or take a delivery photo.'
      );
      return;
    }
    const photoUrl = deliveryPhoto ? `delivery://local/${Date.now()}` : undefined;
    try {
      await updateStatus('delivered', {
        ...(photoUrl ? { delivery_photo_url: photoUrl } : {}),
        ...(otpInput.trim().length >= 4 ? { otp: otpInput.trim() } : {}),
      });
      setLocalStep(DRIVER_STEPS.DELIVERED);
      Alert.alert('Delivery Complete!', 'Great job! The delivery has been confirmed.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch {}
  };

  // ---------------------------------------------------------------------------
  // Report issue
  // ---------------------------------------------------------------------------
  const handleReportIssue = () => {
    Alert.alert('Report Issue', 'What is the issue?', [
      {
        text: 'Recipient not home',
        onPress: () => cancelWithReason('Recipient not home'),
      },
      {
        text: 'Wrong address',
        onPress: () => cancelWithReason('Wrong address'),
      },
      {
        text: 'Cannot access building',
        onPress: () => cancelWithReason('Cannot access building'),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const cancelWithReason = async (reason) => {
    try {
      await updateStatus('failed', { reason });
      navigation.goBack();
    } catch {}
  };

  // ---------------------------------------------------------------------------
  // Computed
  // ---------------------------------------------------------------------------
  const fare = delivery.fare != null ? `${Number(delivery.fare).toLocaleString()} XAF` : '–';
  const recipientOtp = delivery.recipient_otp || delivery.otp;
  const senderNote = delivery.sender_note;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        region={mapRegion}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {activeCoords && (
          <Marker
            coordinate={{
              latitude: activeCoords.latitude || activeCoords.lat,
              longitude: activeCoords.longitude || activeCoords.lng,
            }}
            title={showPickup ? 'Pickup' : 'Drop-off'}
          >
            <View style={showPickup ? styles.pickupMarker : styles.dropoffMarker}>
              <Ionicons name={showPickup ? 'cube-outline' : 'flag'} size={14} color={colors.white} />
            </View>
          </Marker>
        )}
      </MapView>

      {/* Top bar */}
      <SafeAreaView style={styles.topOverlay} edges={['top']}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.topBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>

          <View style={[styles.stepPill, { borderColor: '#3B82F6', backgroundColor: 'rgba(59,130,246,0.1)' }]}>
            <Ionicons name="cube-outline" size={14} color="#3B82F6" />
            <Text style={[styles.stepPillText, { color: '#3B82F6' }]}>
              {showPickup ? 'Navigate to Pickup' : 'Navigate to Drop-off'}
            </Text>
          </View>

          <TouchableOpacity style={styles.topBtn} onPress={handleNavigate} activeOpacity={0.8}>
            <Ionicons name="navigate-outline" size={22} color="#3B82F6" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Bottom scroll card */}
      <View style={[styles.bottomCard, { paddingBottom: insets.bottom + spacing.sm }]}>
        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
          {/* Earnings */}
          <View style={styles.earningsRow}>
            <Ionicons name="cash-outline" size={18} color={colors.success} />
            <Text style={styles.earningsText}>You'll earn <Text style={styles.earningsAmount}>{fare}</Text> for this delivery</Text>
          </View>

          {/* Package info card */}
          <View style={styles.infoCard}>
            <Text style={styles.infoCardTitle}>Package Info</Text>
            <View style={styles.infoRow}>
              <Ionicons name="resize-outline" size={15} color={colors.textSecondary} />
              <Text style={styles.infoText}>
                Size: <Text style={styles.infoTextBold}>{delivery.package_size || '–'}</Text>
                {delivery.weight ? `  |  ${delivery.weight} kg` : ''}
              </Text>
            </View>
            {delivery.fragile && (
              <View style={styles.fragileTag}>
                <Text style={styles.fragileTagText}>⚠️ FRAGILE — Handle with care</Text>
              </View>
            )}
            {delivery.description ? (
              <View style={styles.infoRow}>
                <Ionicons name="document-text-outline" size={15} color={colors.textSecondary} />
                <Text style={styles.infoText}>{delivery.description}</Text>
              </View>
            ) : null}
            {senderNote ? (
              <View style={[styles.infoRow, styles.noteRow]}>
                <Ionicons name="information-circle-outline" size={15} color="#3B82F6" />
                <Text style={[styles.infoText, { color: '#3B82F6' }]}>{senderNote}</Text>
              </View>
            ) : null}
          </View>

          {/* Recipient info — shown after pickup */}
          {[DRIVER_STEPS.IN_TRANSIT, DRIVER_STEPS.DELIVERED].includes(localStep) && (
            <View style={styles.infoCard}>
              <Text style={styles.infoCardTitle}>Recipient</Text>
              <View style={styles.recipientRow}>
                <View style={styles.recipientAvatar}>
                  <Ionicons name="person" size={18} color={colors.white} />
                </View>
                <View style={styles.recipientInfo}>
                  <Text style={styles.recipientName}>{delivery.recipient_name || '–'}</Text>
                  {delivery.recipient_phone && (
                    <Text style={styles.recipientPhone}>{delivery.recipient_phone}</Text>
                  )}
                </View>
                {delivery.recipient_phone && (
                  <TouchableOpacity style={styles.callBtn} onPress={handleCallRecipient} activeOpacity={0.8}>
                    <Ionicons name="call-outline" size={18} color="#3B82F6" />
                  </TouchableOpacity>
                )}
              </View>

              {/* OTP to verify */}
              {recipientOtp && (
                <View style={styles.otpInfoBox}>
                  <Text style={styles.otpInfoLabel}>Delivery Code</Text>
                  <Text style={styles.otpInfoValue}>{recipientOtp}</Text>
                  <Text style={styles.otpInfoSub}>Ask recipient to confirm this code</Text>
                </View>
              )}
            </View>
          )}

          {/* ---------------------------------------------------------------
               Action section — changes based on step
          --------------------------------------------------------------- */}

          {/* Step 0: Arrived at pickup */}
          {localStep === DRIVER_STEPS.NAVIGATE_PICKUP && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.warning, shadowColor: colors.warning }]}
              onPress={handleArrivedAtPickup}
              disabled={loading}
              activeOpacity={0.88}
            >
              {loading ? <ActivityIndicator color={colors.white} size="small" /> : (
                <>
                  <Ionicons name="location" size={18} color={colors.white} />
                  <Text style={styles.actionBtnText}>I've Arrived at Pickup</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* Step 1: Take pickup photo */}
          {localStep === DRIVER_STEPS.ARRIVED_PICKUP && (
            <>
              {pickupPhoto ? (
                <View style={styles.photoPreviewWrap}>
                  <Text style={styles.photoPreviewLabel}>Pickup Photo</Text>
                  <Image source={{ uri: pickupPhoto }} style={styles.photoPreview} />
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#3B82F6', shadowColor: '#3B82F6' }]}
                    onPress={handleConfirmPickup}
                    disabled={loading}
                    activeOpacity={0.88}
                  >
                    {loading ? <ActivityIndicator color={colors.white} size="small" /> : (
                      <>
                        <Ionicons name="cube" size={18} color={colors.white} />
                        <Text style={styles.actionBtnText}>Confirm Pickup</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#3B82F6', shadowColor: '#3B82F6' }]}
                  onPress={handleTakePickupPhoto}
                  activeOpacity={0.88}
                >
                  <Ionicons name="camera" size={18} color={colors.white} />
                  <Text style={styles.actionBtnText}>Take Pickup Photo</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* Step 3: OTP + delivery photo */}
          {localStep === DRIVER_STEPS.IN_TRANSIT && (
            <>
              {/* OTP input */}
              <View style={styles.otpSection}>
                <Text style={styles.otpPrompt}>Enter Recipient's Delivery Code</Text>
                <View style={[styles.otpInputWrap, otpError && styles.otpInputError]}>
                  <Ionicons
                    name="keypad-outline"
                    size={20}
                    color={otpError ? colors.danger : colors.gray400}
                  />
                  <TextInput
                    style={styles.otpInput}
                    value={otpInput}
                    onChangeText={(v) => { setOtpInput(v); setOtpError(false); }}
                    keyboardType="number-pad"
                    maxLength={8}
                    placeholder="Enter code"
                    placeholderTextColor={colors.textLight}
                  />
                </View>
              </View>

              {/* OR divider */}
              <View style={styles.orRow}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>OR</Text>
                <View style={styles.orLine} />
              </View>

              {/* Take delivery photo */}
              {deliveryPhoto ? (
                <View style={styles.photoPreviewWrap}>
                  <Text style={styles.photoPreviewLabel}>Delivery Photo</Text>
                  <Image source={{ uri: deliveryPhoto }} style={styles.photoPreview} />
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.photoBtn]}
                  onPress={handleTakeDeliveryPhoto}
                  activeOpacity={0.8}
                >
                  <Ionicons name="camera-outline" size={20} color={colors.primary} />
                  <Text style={styles.photoBtnText}>Take Delivery Photo</Text>
                </TouchableOpacity>
              )}

              {/* Confirm delivery */}
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.success, shadowColor: colors.success, marginTop: spacing.md }]}
                onPress={handleConfirmDelivery}
                disabled={loading}
                activeOpacity={0.88}
              >
                {loading ? <ActivityIndicator color={colors.white} size="small" /> : (
                  <>
                    <Ionicons name="checkmark-circle" size={18} color={colors.white} />
                    <Text style={styles.actionBtnText}>Confirm Delivery</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}

          {/* Report issue link */}
          {localStep !== DRIVER_STEPS.DELIVERED && (
            <TouchableOpacity style={styles.reportLink} onPress={handleReportIssue} activeOpacity={0.7}>
              <Ionicons name="warning-outline" size={15} color={colors.danger} />
              <Text style={styles.reportLinkText}>Report an Issue</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: spacing.xl }} />
        </ScrollView>
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
  pickupMarker: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#3B82F6',
    alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: colors.white, ...shadows.md,
  },
  dropoffMarker: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.danger,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: colors.white, ...shadows.md,
  },
  bottomCard: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: spacing.md, maxHeight: '52%',
    shadowColor: '#000', shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.1, shadowRadius: 20, elevation: 16,
  },
  earningsRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: 'rgba(0,166,81,0.08)', borderRadius: radius.md,
    padding: spacing.sm + 4, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: 'rgba(0,166,81,0.18)',
  },
  earningsText: { fontSize: 13, color: colors.text, flex: 1 },
  earningsAmount: { fontWeight: '800', color: colors.success },
  infoCard: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.sm + 4, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.gray200,
  },
  infoCardTitle: {
    fontSize: 12, fontWeight: '700', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm,
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  noteRow: {
    backgroundColor: 'rgba(59,130,246,0.06)', borderRadius: radius.sm,
    padding: spacing.sm, marginTop: spacing.xs,
  },
  infoText: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 18 },
  infoTextBold: { fontWeight: '700' },
  fragileTag: {
    backgroundColor: 'rgba(255,140,0,0.12)', borderRadius: radius.sm,
    paddingHorizontal: spacing.sm, paddingVertical: 4, alignSelf: 'flex-start',
    marginBottom: spacing.xs, borderWidth: 1, borderColor: 'rgba(255,140,0,0.25)',
  },
  fragileTagText: { fontSize: 12, fontWeight: '700', color: colors.warning },
  recipientRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  recipientAvatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#3B82F6',
    alignItems: 'center', justifyContent: 'center',
  },
  recipientInfo: { flex: 1 },
  recipientName: { fontSize: 15, fontWeight: '700', color: colors.text },
  recipientPhone: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  callBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(59,130,246,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  otpInfoBox: {
    backgroundColor: 'rgba(59,130,246,0.08)', borderRadius: radius.sm,
    padding: spacing.sm, borderWidth: 1, borderColor: 'rgba(59,130,246,0.2)',
  },
  otpInfoLabel: { fontSize: 11, fontWeight: '700', color: '#3B82F6', textTransform: 'uppercase', letterSpacing: 0.5 },
  otpInfoValue: { fontSize: 22, fontWeight: '900', color: '#3B82F6', letterSpacing: 4, marginVertical: 4 },
  otpInfoSub: { fontSize: 11, color: colors.textSecondary },
  otpSection: { marginBottom: spacing.sm },
  otpPrompt: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.sm },
  otpInputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1.5, borderColor: colors.gray200,
  },
  otpInputError: { borderColor: colors.danger, backgroundColor: 'rgba(227,24,55,0.05)' },
  otpInput: { flex: 1, fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: 6 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  orLine: { flex: 1, height: 1, backgroundColor: colors.gray200 },
  orText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  photoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: 'rgba(255,0,191,0.07)', borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1.5, borderColor: 'rgba(255,0,191,0.2)',
    borderStyle: 'dashed',
  },
  photoBtnText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  photoPreviewWrap: { marginBottom: spacing.sm },
  photoPreviewLabel: {
    fontSize: 12, fontWeight: '700', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.xs,
  },
  photoPreview: {
    width: '100%', height: 140, borderRadius: radius.md,
    backgroundColor: colors.gray200, marginBottom: spacing.sm,
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, height: 54, borderRadius: radius.pill,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
    marginBottom: spacing.sm,
  },
  actionBtnText: { fontSize: 16, fontWeight: '800', color: colors.white },
  reportLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, paddingVertical: spacing.sm, marginTop: spacing.xs,
  },
  reportLinkText: { fontSize: 13, fontWeight: '600', color: colors.danger },
});

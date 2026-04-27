import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Switch,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import { useLanguage } from '../context/LanguageContext';
import { paymentsService } from '../services/payments';
import { colors, spacing, radius, shadows } from '../theme';

// ── Payment method config ───────────────────────────────────────────────────
// id:     used as selectedMethod state value and displayed in UI
// type:   sent to the backend (backend enum values)
const PAYMENT_METHODS = [
  { id: 'wallet', type: 'wallet',           label: 'MOBO Wallet',       icon: 'wallet-outline',         color: colors.primary },
  { id: 'cash',   type: 'cash',             label: 'Cash',              icon: 'cash-outline',           color: colors.success },
  { id: 'mtn',    type: 'mtn_mobile_money', label: 'MTN Mobile Money',  icon: 'phone-portrait-outline', color: '#FFCB00' },
  { id: 'orange', type: 'orange_money',     label: 'Orange Money',      icon: 'phone-portrait-outline', color: '#FF6600' },
  { id: 'wave',   type: 'wave',             label: 'Wave',              icon: 'flash-outline',          color: '#0A4BF0' },
  { id: 'card',   type: 'card',             label: 'Card',              icon: 'card-outline',           color: colors.text },
];

const MOBILE_MONEY_IDS = new Set(['mtn', 'orange', 'wave']);
const POLL_INTERVAL_MS = 3000;   // poll every 3 s
const POLL_TIMEOUT_MS  = 90000;  // give up after 90 s

const QUICK_TIPS = [500, 1000, 2000];

function formatFare(amount) {
  if (!amount && amount !== 0) return '–';
  return `${Math.round(Number(amount)).toLocaleString()} XAF`;
}

// ── Pending overlay shown while waiting for USSD confirmation ───────────────
function MobileMoneyPendingOverlay({ method, onCancel }) {
  const label = method === 'mtn' ? 'MTN Mobile Money' : 'Orange Money';
  const [dots, setDots] = useState('');

  useEffect(() => {
    const t = setInterval(() => setDots((d) => (d.length >= 3 ? '' : d + '.')), 600);
    return () => clearInterval(t);
  }, []);

  return (
    <View style={styles.loadingOverlay}>
      <View style={styles.pendingCard}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.pendingTitle}>Waiting for confirmation{dots}</Text>
        <Text style={styles.pendingSubtitle}>
          A USSD prompt has been sent to your phone.{'\n'}
          Approve the {label} request to complete payment.
        </Text>
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function PaymentScreen({ navigation, route }) {
  const {
    ride, fare,
    // Extended booking params from FareEstimateScreen
    isForOther, otherName, otherPhone,
    childSeat, childSeatCount,
    splitPayment: splitPaymentParam, walletPct: walletPctParam,
    // FareEstimateScreen passes pickup/dropoff objects (with .address) and coords
    pickup, dropoff, pickupCoords, dropoffCoords,
    rideType, priceLocked,
    upfront_fare: upfrontFare,  // FareEstimateScreen key
    stops, recurringRideId,
    pickupInstructions, quietMode, acPreference, musicPreference,
  } = route.params || {};

  const pickupAddress = pickup?.address || (typeof pickup === 'string' ? pickup : null);
  const dropoffAddress = dropoff?.address || (typeof dropoff === 'string' ? dropoff : null);
  const { t } = useLanguage();

  // Pre-select wallet if split payment was requested
  const [selectedMethod, setSelectedMethod] = useState(splitPaymentParam ? 'wallet' : 'cash');
  const [phone, setPhone]     = useState('');
  const [tip, setTip]         = useState('');
  const [roundUp, setRoundUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);

  const pollTimerRef   = useRef(null);
  const timeoutRef     = useRef(null);
  const cancelledRef   = useRef(false);

  const totalFare    = fare || ride?.fare || ride?.totalFare || 0;
  const tipAmount    = parseFloat(tip) || 0;
  const roundedFare  = roundUp ? Math.ceil(totalFare / 100) * 100 : totalFare;
  const roundUpAmt   = roundUp ? roundedFare - totalFare : 0;
  const grandTotal   = roundedFare + tipAmount;

  const isMobileMoney = MOBILE_MONEY_IDS.has(selectedMethod);
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      clearInterval(pollTimerRef.current);
      clearTimeout(timeoutRef.current);
    };
  }, []);

  // ── Mobile-money polling loop ─────────────────────────────────────────────
  function startPolling(referenceId) {
    cancelledRef.current = false;

    // Timeout guard
    timeoutRef.current = setTimeout(() => {
      if (cancelledRef.current) return;
      clearInterval(pollTimerRef.current);
      setPending(false);
      Alert.alert(
        'Payment Timeout',
        'We did not receive confirmation from your mobile money provider. Please check your phone and try again.',
        [{ text: 'OK' }]
      );
    }, POLL_TIMEOUT_MS);

    // Polling interval
    pollTimerRef.current = setInterval(async () => {
      if (cancelledRef.current) return;
      try {
        const res  = await paymentsService.checkStatus(referenceId);
        const status = res?.data?.status;

        if (status === 'completed') {
          clearInterval(pollTimerRef.current);
          clearTimeout(timeoutRef.current);
          if (!cancelledRef.current) {
            setPending(false);
            Alert.alert('Payment Successful', t('paymentSuccess'), [
              { text: 'Done', onPress: () => navigation.navigate('Home') },
            ]);
          }
        } else if (status === 'failed') {
          clearInterval(pollTimerRef.current);
          clearTimeout(timeoutRef.current);
          if (!cancelledRef.current) {
            setPending(false);
            Alert.alert('Payment Failed', res?.data?.reason || t('paymentError'));
          }
        }
        // 'pending' — keep polling
      } catch (err) {
        // Network hiccup — keep polling silently
        console.warn('[PaymentScreen] Poll error:', err.message);
      }
    }, POLL_INTERVAL_MS);
  }

  function cancelPending() {
    cancelledRef.current = true;
    clearInterval(pollTimerRef.current);
    clearTimeout(timeoutRef.current);
    setPending(false);
  }

  // ── Stripe card payment sheet ─────────────────────────────────────────────
  const handleCardPayment = async (rideId) => {
    // Fetch PaymentIntent from backend — service maps Stripe's field to intentSecret
    const { intentSecret, publishable_key } = await paymentsService.createPaymentIntent(rideId, grandTotal);

    if (!intentSecret) throw new Error('Failed to initialize card payment.');

    const { error: initError } = await initPaymentSheet({
      paymentIntentClientSecret: intentSecret,
      merchantDisplayName: 'MOBO',
      style: 'alwaysLight',
    });
    if (initError) throw new Error(initError.message);

    const { error: presentError } = await presentPaymentSheet();
    if (presentError) {
      if (presentError.code === 'Canceled') return false; // user dismissed
      throw new Error(presentError.message);
    }
    return true;
  };

  // ── Main pay handler ──────────────────────────────────────────────────────
  const handlePay = async () => {
    if (isMobileMoney && !phone.trim()) {
      Alert.alert('Phone Required', 'Please enter your mobile money phone number.');
      return;
    }

    const methodConfig = PAYMENT_METHODS.find((m) => m.id === selectedMethod);
    const backendMethod = methodConfig?.type || selectedMethod;

    setLoading(true);
    try {
      // ── Step 1: Create the ride if not already created ──────────────────
      let rideId = ride?._id || ride?.id;
      if (!rideId && pickupCoords && dropoffCoords) {
        const { ridesService } = require('../services/rides');
        const rideResult = await ridesService.requestRide({
          pickup_address:        pickupAddress,
          dropoff_address:       dropoffAddress,
          pickup_location:       pickupCoords,
          dropoff_location:      dropoffCoords,
          ride_type:             rideType || 'standard',
          payment_method:        backendMethod,
          stops:                 stops || [],
          use_price_lock:        priceLocked || false,
          locked_fare:           upfrontFare || undefined,
          is_for_other:          isForOther || false,
          other_passenger_name:  otherName || undefined,
          other_passenger_phone: otherPhone || undefined,
          child_seat_required:   childSeat || false,
          child_seat_count:      childSeatCount || 0,
          split_payment:         splitPaymentParam || false,
          split_wallet_pct:      walletPctParam || 100,
          split_momo_pct:        walletPctParam ? 100 - walletPctParam : 0,
          recurring_ride_id:     recurringRideId || undefined,
          pickup_instructions:   pickupInstructions || undefined,
          quiet_mode:            quietMode || false,
          ac_preference:         acPreference || 'auto',
          music_preference:      musicPreference !== false,
        });
        rideId = rideResult?.ride?.id;
      }

      if (!rideId) throw new Error('Could not create ride — check your location details.');

      // ── Step 2: Card payments go through Stripe payment sheet ────────────
      if (selectedMethod === 'card') {
        setLoading(false);
        const success = await handleCardPayment(rideId);
        if (success) {
          Alert.alert('Payment Successful', t('paymentSuccess'), [
            { text: 'Done', onPress: () => navigation.navigate('Home') },
          ]);
        }
        return;
      }

      // ── Step 3: Mobile money / wallet / cash ─────────────────────────────
      const result = await paymentsService.chargeRide(rideId, {
        method:  backendMethod,
        phone:   phone.trim() || undefined,
        tip:     tipAmount,
        roundUp,
        total:   grandTotal,
        split_payment:    splitPaymentParam || false,
        split_wallet_pct: walletPctParam || 100,
        split_momo_pct:   walletPctParam ? 100 - walletPctParam : 0,
      });

      setLoading(false);

      if (result.pending && result.data?.reference_id) {
        setPending(true);
        startPolling(result.data.reference_id);
      } else {
        Alert.alert('Payment Successful', t('paymentSuccess'), [
          { text: 'Done', onPress: () => navigation.navigate('Home') },
        ]);
      }
    } catch (err) {
      setLoading(false);
      Alert.alert('Payment Failed', err.response?.data?.message || err.message || t('paymentError'));
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* Synchronous loading spinner */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Processing payment...</Text>
          </View>
        </View>
      )}

      {/* Mobile-money pending overlay */}
      {pending && (
        <MobileMoneyPendingOverlay method={selectedMethod} onCancel={cancelPending} />
      )}

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('payment')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Summary card */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTotalLabel}>Total</Text>
          <Text style={styles.summaryTotalValue}>{formatFare(grandTotal)}</Text>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Ride fare</Text>
            <Text style={styles.summaryValue}>{formatFare(totalFare)}</Text>
          </View>
          {tipAmount > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Driver tip</Text>
              <Text style={styles.summaryValue}>{formatFare(tipAmount)}</Text>
            </View>
          )}
          {roundUp && roundUpAmt > 0 && (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, styles.loyaltyLabel]}>Round-up (loyalty)</Text>
              <Text style={[styles.summaryValue, styles.loyaltyValue]}>+{formatFare(roundUpAmt)}</Text>
            </View>
          )}
          {priceLocked && (
            <View style={styles.upfrontBadge}>
              <Text style={styles.upfrontBadgeText}>🔒 Upfront Price — Guaranteed</Text>
            </View>
          )}
        </View>

        {/* Ride-for-someone-else info card */}
        {isForOther && otherName && (
          <View style={[styles.infoCard, { borderLeftColor: '#2563eb' }]}>
            <Ionicons name="person" size={18} color="#2563eb" />
            <View style={styles.infoCardText}>
              <Text style={styles.infoCardTitle}>Ride for {otherName}</Text>
              {otherPhone ? <Text style={styles.infoCardSub}>{otherPhone}</Text> : null}
            </View>
          </View>
        )}

        {/* Child seat info card */}
        {childSeat && (
          <View style={[styles.infoCard, { borderLeftColor: colors.warning }]}>
            <Ionicons name="happy" size={18} color={colors.warning} />
            <View style={styles.infoCardText}>
              <Text style={styles.infoCardTitle}>Child seat required</Text>
              <Text style={styles.infoCardSub}>{childSeatCount || 1} seat{(childSeatCount || 1) > 1 ? 's' : ''} — driver confirmed</Text>
            </View>
          </View>
        )}

        {/* Split payment info card */}
        {splitPaymentParam && walletPctParam && (
          <View style={[styles.infoCard, { borderLeftColor: colors.primary }]}>
            <Ionicons name="git-branch-outline" size={18} color={colors.primary} />
            <View style={styles.infoCardText}>
              <Text style={styles.infoCardTitle}>Split payment</Text>
              <Text style={styles.infoCardSub}>
                Wallet {walletPctParam}% ({formatFare(Math.round(grandTotal * walletPctParam / 100))})
                {' + '}MTN MoMo {100 - walletPctParam}% ({formatFare(Math.round(grandTotal * (100 - walletPctParam) / 100))})
              </Text>
            </View>
          </View>
        )}

        {/* Payment methods */}
        <Text style={styles.sectionLabel}>{t('selectPaymentMethod')}</Text>
        <View style={styles.methodList}>
          {PAYMENT_METHODS.map((pm, idx) => (
            <TouchableOpacity
              key={pm.id}
              style={[
                styles.methodItem,
                idx < PAYMENT_METHODS.length - 1 && styles.methodItemBorder,
                selectedMethod === pm.id && styles.methodItemSelected,
              ]}
              onPress={() => setSelectedMethod(pm.id)}
              activeOpacity={0.8}
            >
              <View style={[styles.methodIconWrap, { backgroundColor: pm.color + '18' }]}>
                <Ionicons name={pm.icon} size={20} color={pm.color} />
              </View>
              <Text style={[styles.methodLabel, selectedMethod === pm.id && styles.methodLabelSelected]}>
                {pm.label}
              </Text>
              <View style={[styles.radio, selectedMethod === pm.id && styles.radioSelected]}>
                {selectedMethod === pm.id && <View style={styles.radioInner} />}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Phone number input — shown only for mobile money */}
        {isMobileMoney && (
          <View style={styles.phoneCard}>
            <Text style={styles.phoneLabel}>
              {selectedMethod === 'mtn' ? 'MTN' : 'Orange'} phone number
            </Text>
            <View style={styles.phoneInputRow}>
              <Text style={styles.phonePrefix}>+237</Text>
              <TextInput
                style={styles.phoneInput}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="6XX XXX XXX"
                placeholderTextColor={colors.textLight}
                maxLength={9}
              />
            </View>
            <Text style={styles.phoneHint}>
              You will receive a USSD prompt on this number to approve the payment.
            </Text>
          </View>
        )}

        {/* Tip section */}
        <Text style={styles.sectionLabel}>{t('addTip')}</Text>
        <View style={styles.tipCard}>
          <View style={styles.tipInputRow}>
            <Text style={styles.tipCurrency}>XAF</Text>
            <TextInput
              style={styles.tipInput}
              value={tip}
              onChangeText={setTip}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={colors.textLight}
            />
          </View>
          <View style={styles.quickTipsRow}>
            {QUICK_TIPS.map((amt) => (
              <TouchableOpacity
                key={amt}
                style={[styles.quickTip, tip === String(amt) && styles.quickTipActive]}
                onPress={() => setTip(tip === String(amt) ? '' : String(amt))}
                activeOpacity={0.8}
              >
                <Text style={[styles.quickTipText, tip === String(amt) && styles.quickTipTextActive]}>
                  +{amt.toLocaleString()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Round-up for loyalty */}
        <View style={styles.roundUpCard}>
          <View style={styles.roundUpLeft}>
            <View style={styles.roundUpIconWrap}>
              <Ionicons name="gift-outline" size={20} color={colors.warning} />
            </View>
            <View style={styles.roundUpTexts}>
              <Text style={styles.roundUpLabel}>{t('roundUpFare')}</Text>
              {roundUp && roundUpAmt > 0 && (
                <Text style={styles.roundUpSub}>
                  +{Math.round(roundUpAmt).toLocaleString()} XAF → loyalty points
                </Text>
              )}
            </View>
          </View>
          <Switch
            value={roundUp}
            onValueChange={setRoundUp}
            trackColor={{ false: colors.gray200, true: colors.primary + '60' }}
            thumbColor={roundUp ? colors.primary : colors.white}
            ios_backgroundColor={colors.gray200}
          />
        </View>
      </ScrollView>

      {/* Pay button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.payBtn, (loading || pending) && styles.payBtnDisabled]}
          onPress={handlePay}
          disabled={loading || pending}
          activeOpacity={0.88}
        >
          <Text style={styles.payBtnLabel}>{t('payNow')}</Text>
          <View style={styles.payBtnAmountWrap}>
            <Text style={styles.payBtnAmount}>{formatFare(grandTotal)}</Text>
          </View>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  loadingCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    minWidth: 180,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  // Mobile-money pending overlay
  pendingCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.xl,
  },
  pendingTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  pendingSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  cancelBtn: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.gray300,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  headerSpacer: { width: 40 },
  scroll: {
    padding: spacing.md,
    paddingBottom: 100,
  },
  summaryCard: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    alignItems: 'center',
    ...shadows.md,
  },
  summaryTotalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: spacing.xs,
  },
  summaryTotalValue: {
    fontSize: 40,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: -1.5,
  },
  summaryDivider: {
    width: '100%',
    height: 1,
    backgroundColor: colors.gray200,
    marginVertical: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: spacing.xs + 1,
  },
  summaryLabel: { fontSize: 14, color: colors.textSecondary },
  summaryValue: { fontSize: 14, fontWeight: '600', color: colors.text },
  loyaltyLabel: { color: colors.warning },
  loyaltyValue: { color: colors.warning },
  upfrontBadge: {
    backgroundColor: '#f0fdf4',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    alignSelf: 'center',
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  upfrontBadgeText: { fontSize: 12, fontWeight: '700', color: colors.success },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderLeftWidth: 3,
    ...shadows.sm,
  },
  infoCardText: { flex: 1 },
  infoCardTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  infoCardSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  methodList: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  methodItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  methodItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  methodItemSelected: {
    backgroundColor: 'rgba(255,0,191,0.04)',
  },
  methodIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodLabel: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    fontWeight: '400',
  },
  methodLabelSelected: {
    fontWeight: '700',
    color: colors.primary,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.gray300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: colors.primary },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  // Phone input
  phoneCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  phoneLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  phoneInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  phonePrefix: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginRight: spacing.sm,
  },
  phoneInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: 1,
  },
  phoneHint: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  tipCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  tipInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  tipCurrency: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
    marginRight: spacing.sm,
  },
  tipInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  quickTipsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quickTip: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.gray200,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  quickTipActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(255,0,191,0.06)',
  },
  quickTipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  quickTipTextActive: { color: colors.primary, fontWeight: '700' },
  roundUpCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  roundUpLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  roundUpIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,140,0,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundUpTexts: { flex: 1 },
  roundUpLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  roundUpSub: { fontSize: 12, color: colors.warning, marginTop: 2 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.gray200,
  },
  payBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  payBtnDisabled: { opacity: 0.7 },
  payBtnLabel: { fontSize: 17, fontWeight: '700', color: colors.white },
  payBtnAmountWrap: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
  },
  payBtnAmount: { fontSize: 15, fontWeight: '800', color: colors.white },
});

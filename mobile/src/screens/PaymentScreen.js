import React, { useState } from 'react';
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
import { useLanguage } from '../context/LanguageContext';
import { paymentsService } from '../services/payments';
import { colors, spacing, radius, shadows } from '../theme';

const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash', icon: 'cash-outline', color: colors.success },
  { id: 'mtn', label: 'MTN Mobile Money', icon: 'phone-portrait-outline', color: '#FFCB00' },
  { id: 'orange', label: 'Orange Money', icon: 'phone-portrait-outline', color: '#FF6600' },
  { id: 'wave', label: 'Wave', icon: 'wallet-outline', color: '#0A4BF0' },
  { id: 'card', label: 'Card', icon: 'card-outline', color: colors.text },
];

const QUICK_TIPS = [500, 1000, 2000];

function formatFare(amount) {
  if (!amount && amount !== 0) return '–';
  return `${Math.round(Number(amount)).toLocaleString()} XAF`;
}

export default function PaymentScreen({ navigation, route }) {
  const { ride, fare } = route.params || {};
  const { t } = useLanguage();

  const [selectedMethod, setSelectedMethod] = useState('cash');
  const [tip, setTip] = useState('');
  const [roundUp, setRoundUp] = useState(false);
  const [loading, setLoading] = useState(false);

  const totalFare = fare || ride?.fare || ride?.totalFare || 0;
  const tipAmount = parseFloat(tip) || 0;
  const roundedFare = roundUp ? Math.ceil(totalFare / 100) * 100 : totalFare;
  const roundUpAmount = roundUp ? roundedFare - totalFare : 0;
  const grandTotal = roundedFare + tipAmount;

  const handlePay = async () => {
    setLoading(true);
    try {
      await paymentsService.chargeRide(ride?._id || ride?.id || 'current', {
        paymentMethod: selectedMethod,
        tip: tipAmount,
        roundUp,
        total: grandTotal,
      });
      Alert.alert('Payment Successful', t('paymentSuccess'), [
        { text: 'Done', onPress: () => navigation.navigate('Home') },
      ]);
    } catch (err) {
      Alert.alert('Payment Failed', err.message || t('paymentError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
      {loading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Processing payment...</Text>
          </View>
        </View>
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
          {roundUp && roundUpAmount > 0 && (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, styles.loyaltyLabel]}>Round-up (loyalty)</Text>
              <Text style={[styles.summaryValue, styles.loyaltyValue]}>+{formatFare(roundUpAmount)}</Text>
            </View>
          )}
        </View>

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
              {roundUp && roundUpAmount > 0 && (
                <Text style={styles.roundUpSub}>
                  +{Math.round(roundUpAmount).toLocaleString()} XAF → loyalty points
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
          style={[styles.payBtn, loading && styles.payBtnDisabled]}
          onPress={handlePay}
          disabled={loading}
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
  summaryLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  loyaltyLabel: { color: colors.warning },
  loyaltyValue: { color: colors.warning },
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
  quickTipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  quickTipTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
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
  roundUpLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  roundUpSub: {
    fontSize: 12,
    color: colors.warning,
    marginTop: 2,
  },
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
  payBtnLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.white,
  },
  payBtnAmountWrap: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
  },
  payBtnAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.white,
  },
});

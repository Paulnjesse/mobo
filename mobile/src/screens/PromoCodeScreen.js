import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadows } from '../theme';

const ACTIVE_PROMOS = [
  {
    id: 'p1',
    code: 'WELCOME500',
    description: '500 XAF off your next ride',
    discount: 500,
    expiry: 'Mar 31, 2026',
    isAutoApply: true,
    used: false,
  },
  {
    id: 'p2',
    code: 'MOBOMONTH',
    description: '20% off all rides this month',
    discountPercent: 20,
    maxDiscount: 2000,
    expiry: 'Mar 31, 2026',
    isAutoApply: false,
    used: false,
  },
  {
    id: 'p3',
    code: 'REFERRAL250',
    description: '250 XAF off when a friend joins',
    discount: 250,
    expiry: 'Apr 15, 2026',
    isAutoApply: true,
    used: false,
  },
];

export default function PromoCodeScreen({ navigation }) {
  const [inputCode, setInputCode] = useState('');
  const [applying, setApplying] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [promos, setPromos] = useState(ACTIVE_PROMOS);
  const [error, setError] = useState('');

  const VALID_CODES = {
    'RIDE10': { description: '10% off your next ride', discountPercent: 10, maxDiscount: 1500, expiry: 'Apr 30, 2026', isAutoApply: false },
    'YAOUNDÉ100': { description: '100 XAF off in Yaoundé', discount: 100, expiry: 'Mar 25, 2026', isAutoApply: false },
    'FIRSTRIDE': { description: 'First ride free up to 3000 XAF', discount: 3000, expiry: 'Dec 31, 2026', isAutoApply: false },
  };

  const handleApply = () => {
    const code = inputCode.trim().toUpperCase();
    if (!code) {
      setError('Please enter a promo code.');
      return;
    }
    setError('');
    setApplying(true);

    setTimeout(() => {
      setApplying(false);

      // Check if already have code
      const alreadyHave = promos.find((p) => p.code === code);
      if (alreadyHave) {
        setError('You already have this promo code.');
        return;
      }

      const promo = VALID_CODES[code];
      if (promo) {
        const newPromo = { id: `custom-${Date.now()}`, code, ...promo, used: false };
        setPromos((prev) => [newPromo, ...prev]);
        setAppliedPromo(newPromo);
        setInputCode('');
        Alert.alert('Promo Applied!', `${promo.description} has been added to your account.`);
      } else {
        setError('Invalid or expired promo code. Please try again.');
      }
    }, 1200);
  };

  const handleAutoApply = (promo) => {
    Alert.alert(
      'Apply Promo',
      `Apply "${promo.code}" to your next ride?\n${promo.description}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Apply',
          onPress: () => setAppliedPromo(promo),
        },
      ]
    );
  };

  const formatDiscount = (promo) => {
    if (promo.discount) return `${promo.discount.toLocaleString()} XAF off`;
    if (promo.discountPercent) return `${promo.discountPercent}% off${promo.maxDiscount ? ` (up to ${promo.maxDiscount.toLocaleString()} XAF)` : ''}`;
    return 'Discount';
  };

  const daysUntilExpiry = (expiryStr) => {
    const now = new Date();
    const exp = new Date(expiryStr);
    const diff = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
    if (diff <= 0) return 'Expired';
    if (diff === 1) return '1 day left';
    return `${diff} days left`;
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Promo Codes</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* Applied Badge */}
        {appliedPromo && (
          <View style={styles.appliedBanner}>
            <Ionicons name="pricetag" size={18} color={colors.success} />
            <Text style={styles.appliedText}>
              "{appliedPromo.code}" applied — {formatDiscount(appliedPromo)}
            </Text>
            <TouchableOpacity onPress={() => setAppliedPromo(null)}>
              <Ionicons name="close-circle" size={18} color={colors.success} />
            </TouchableOpacity>
          </View>
        )}

        {/* Enter Code */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Enter Promo Code</Text>
          <View style={styles.codeInputRow}>
            <TextInput
              style={[styles.codeInput, error ? styles.codeInputError : null]}
              placeholder="e.g. RIDE10"
              placeholderTextColor={colors.textLight}
              value={inputCode}
              onChangeText={(t) => {
                setInputCode(t.toUpperCase());
                setError('');
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleApply}
            />
            <TouchableOpacity
              style={[styles.applyBtn, (!inputCode.trim() || applying) && styles.applyBtnDisabled]}
              onPress={handleApply}
              disabled={!inputCode.trim() || applying}
              activeOpacity={0.85}
            >
              {applying ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.applyBtnText}>Apply</Text>
              )}
            </TouchableOpacity>
          </View>
          {error ? (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          <Text style={styles.codeHint}>Try: FIRSTRIDE, RIDE10, or YAOUNDÉ100</Text>
        </View>

        {/* Active Promos */}
        {promos.length > 0 && (
          <View style={{ marginTop: spacing.md }}>
            <Text style={styles.sectionTitle}>Your Promos ({promos.length})</Text>
            {promos.map((promo) => {
              const isApplied = appliedPromo?.id === promo.id;
              const expStr = daysUntilExpiry(promo.expiry);
              const isExpired = expStr === 'Expired';
              return (
                <View key={promo.id} style={[styles.promoCard, isApplied && styles.promoCardApplied, isExpired && styles.promoCardExpired]}>
                  {/* Top row */}
                  <View style={styles.promoTopRow}>
                    <View style={styles.promoCodeBadge}>
                      <Ionicons name="pricetag-outline" size={14} color={colors.primary} />
                      <Text style={styles.promoCode}>{promo.code}</Text>
                    </View>
                    {isApplied && (
                      <View style={styles.appliedTag}>
                        <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                        <Text style={styles.appliedTagText}>Applied</Text>
                      </View>
                    )}
                    {promo.isAutoApply && !isApplied && !isExpired && (
                      <View style={styles.autoApplyTag}>
                        <Text style={styles.autoApplyTagText}>Auto-apply</Text>
                      </View>
                    )}
                  </View>

                  {/* Description */}
                  <Text style={styles.promoDescription}>{promo.description}</Text>

                  {/* Savings */}
                  <View style={styles.promoSavingsRow}>
                    <View style={styles.savingsChip}>
                      <Text style={styles.savingsAmount}>{formatDiscount(promo)}</Text>
                    </View>
                    <View style={[styles.expiryChip, isExpired && styles.expiryChipExpired]}>
                      <Ionicons
                        name="calendar-outline"
                        size={11}
                        color={isExpired ? colors.danger : colors.textSecondary}
                      />
                      <Text style={[styles.expiryText, isExpired && styles.expiryTextExpired]}>
                        {expStr}
                      </Text>
                    </View>
                  </View>

                  {/* Apply button */}
                  {!isApplied && !isExpired && (
                    <TouchableOpacity
                      style={styles.promoApplyBtn}
                      onPress={() => handleAutoApply(promo)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.promoApplyBtnText}>Apply to next ride</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {promos.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="pricetag-outline" size={48} color={colors.gray300} />
            <Text style={styles.emptyTitle}>No promo codes yet</Text>
            <Text style={styles.emptySubtitle}>Enter a code above to start saving</Text>
          </View>
        )}

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  scrollContent: { padding: spacing.md },
  appliedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(0,166,81,0.1)',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  appliedText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.success },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadows.sm,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  codeInputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  codeInput: {
    flex: 1,
    height: 48,
    borderWidth: 1.5,
    borderColor: colors.gray200,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 1,
    backgroundColor: colors.white,
  },
  codeInputError: {
    borderColor: colors.danger,
  },
  applyBtn: {
    height: 48,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
  },
  applyBtnDisabled: { opacity: 0.5 },
  applyBtnText: { fontSize: 15, fontWeight: '800', color: colors.white },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
  errorText: { fontSize: 12, fontWeight: '500', color: colors.danger },
  codeHint: {
    fontSize: 11,
    fontWeight: '400',
    color: colors.textLight,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.md,
    letterSpacing: -0.3,
  },
  promoCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.gray200,
    ...shadows.sm,
  },
  promoCardApplied: {
    borderColor: colors.success,
    backgroundColor: 'rgba(0,166,81,0.03)',
  },
  promoCardExpired: {
    opacity: 0.5,
  },
  promoTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  promoCodeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,0,191,0.08)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  promoCode: { fontSize: 14, fontWeight: '900', color: colors.primary, letterSpacing: 0.5 },
  appliedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,166,81,0.12)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  appliedTagText: { fontSize: 11, fontWeight: '700', color: colors.success },
  autoApplyTag: {
    backgroundColor: colors.gray100,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  autoApplyTagText: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  promoDescription: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  promoSavingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  savingsChip: {
    backgroundColor: 'rgba(255,0,191,0.08)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  savingsAmount: { fontSize: 13, fontWeight: '800', color: colors.primary },
  expiryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.gray100,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  expiryChipExpired: { backgroundColor: 'rgba(227,24,55,0.08)' },
  expiryText: { fontSize: 11, fontWeight: '500', color: colors.textSecondary },
  expiryTextExpired: { color: colors.danger },
  promoApplyBtn: {
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
  },
  promoApplyBtnText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  emptySubtitle: { fontSize: 14, fontWeight: '400', color: colors.textSecondary },
});

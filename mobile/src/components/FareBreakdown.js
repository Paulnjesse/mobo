import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, shadows } from '../theme';

/**
 * Fare breakdown card component.
 * Props: fareData = { base, distance, time, bookingFee, serviceFee, surge, discount, total }
 * Itemized list with XAF amounts, surge badge, subscription discount badge, large bold total.
 */
export default function FareBreakdown({ fareData = {} }) {
  const {
    base = 0,
    distance = 0,
    time = 0,
    bookingFee = 0,
    serviceFee = 0,
    surge = 0,
    surgeMultiplier = null,
    discount = 0,
    discountLabel = 'Subscription discount',
    total = 0,
  } = fareData;

  const fmt = (val) => Math.round(val).toLocaleString();

  const lineItems = [
    { label: 'Base fare', amount: base },
    { label: 'Distance fare', amount: distance },
    { label: 'Time fare', amount: time },
    bookingFee > 0 && { label: 'Booking fee', amount: bookingFee },
    serviceFee > 0 && { label: 'Service fee', amount: serviceFee },
    surge > 0 && { label: 'Surge pricing', amount: surge, isSurge: true },
    discount > 0 && { label: discountLabel, amount: -discount, isDiscount: true },
  ].filter(Boolean);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Fare breakdown</Text>

      {surgeMultiplier && surgeMultiplier > 1 && (
        <View style={styles.surgeBanner}>
          <Text style={styles.surgeText}>
            {surgeMultiplier}x surge pricing active
          </Text>
        </View>
      )}

      {lineItems.map((item, index) => (
        <View
          key={index}
          style={[styles.row, index < lineItems.length - 1 && styles.rowBorder]}
        >
          <View style={styles.rowLeft}>
            <Text
              style={[
                styles.label,
                item.isSurge && styles.surgeLabel,
                item.isDiscount && styles.discountLabel,
              ]}
            >
              {item.label}
            </Text>
            {item.isSurge && (
              <View style={styles.surgeBadge}>
                <Text style={styles.surgeBadgeText}>SURGE</Text>
              </View>
            )}
            {item.isDiscount && (
              <View style={styles.discountBadge}>
                <Text style={styles.discountBadgeText}>SAVED</Text>
              </View>
            )}
          </View>
          <Text
            style={[
              styles.amount,
              item.isSurge && styles.surgeAmount,
              item.isDiscount && styles.discountAmount,
            ]}
          >
            {item.isDiscount ? `- ${fmt(Math.abs(item.amount))} XAF` : `${fmt(item.amount)} XAF`}
          </Text>
        </View>
      ))}

      {/* Divider */}
      <View style={styles.totalDivider} />

      {/* Total */}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalAmount}>{fmt(total)} XAF</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadows.md,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
    letterSpacing: -0.2,
  },
  surgeBanner: {
    backgroundColor: colors.surgeBg,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
    alignSelf: 'flex-start',
  },
  surgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.surge,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.textSecondary,
  },
  surgeLabel: {
    color: colors.surge,
    fontWeight: '500',
  },
  discountLabel: {
    color: colors.success,
    fontWeight: '500',
  },
  amount: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  surgeAmount: {
    color: colors.surge,
  },
  discountAmount: {
    color: colors.success,
  },
  surgeBadge: {
    backgroundColor: colors.surgeBg,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  surgeBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.surge,
    letterSpacing: 0.5,
  },
  discountBadge: {
    backgroundColor: 'rgba(0,166,81,0.12)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  discountBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.success,
    letterSpacing: 0.5,
  },
  totalDivider: {
    height: 1.5,
    backgroundColor: colors.gray200,
    marginVertical: spacing.sm,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  totalAmount: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: -0.5,
  },
});

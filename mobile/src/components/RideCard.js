import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { colors, spacing, radius, shadows } from '../theme';

const STATUS_COLORS = {
  completed: colors.success,
  cancelled: colors.danger,
  ongoing: colors.warning,
  pending: colors.warning,
  accepted: colors.primary,
};

const STATUS_BG = {
  completed: 'rgba(0,166,81,0.1)',
  cancelled: 'rgba(227,24,55,0.1)',
  ongoing: 'rgba(255,140,0,0.12)',
  pending: 'rgba(255,140,0,0.12)',
  accepted: 'rgba(255,0,191,0.1)',
};

export default function RideCard({ ride, onPress }) {
  const status = ride?.status || 'pending';
  const statusColor = STATUS_COLORS[status] || colors.gray400;
  const statusBg = STATUS_BG[status] || colors.surface;

  const formatFare = (amount) => {
    if (!amount && amount !== 0) return '–';
    return `${Number(amount).toLocaleString()} XAF`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '–';
    try {
      return format(new Date(dateStr), 'dd MMM yyyy, HH:mm');
    } catch {
      return dateStr;
    }
  };

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      {/* Top row: status badge + date */}
      <View style={styles.topRow}>
        <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Text>
        </View>
        <Text style={styles.date}>{formatDate(ride?.createdAt)}</Text>
      </View>

      {/* Route */}
      <View style={styles.routeContainer}>
        {/* Pickup */}
        <View style={styles.routeRow}>
          <View style={styles.dotPickup} />
          <Text style={styles.routeText} numberOfLines={1}>
            {ride?.pickup?.address || ride?.pickupAddress || 'Pickup location'}
          </Text>
        </View>
        {/* Connecting line */}
        <View style={styles.routeLineWrap}>
          <View style={styles.routeLineDot} />
          <View style={styles.routeLineDot} />
          <View style={styles.routeLineDot} />
        </View>
        {/* Dropoff */}
        <View style={styles.routeRow}>
          <View style={styles.dotDropoff} />
          <Text style={styles.routeText} numberOfLines={1}>
            {ride?.dropoff?.address || ride?.dropoffAddress || 'Dropoff location'}
          </Text>
        </View>
      </View>

      {/* Footer: driver info + fare */}
      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          {ride?.driver && (
            <View style={styles.driverInfo}>
              <Ionicons name="person-circle-outline" size={15} color={colors.gray400} />
              <Text style={styles.driverName}>{ride.driver.name}</Text>
            </View>
          )}
          {ride?.rating && (
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={12} color={colors.warning} />
              <Text style={styles.ratingText}>{ride.rating}</Text>
            </View>
          )}
        </View>
        <Text style={styles.fare}>{formatFare(ride?.fare || ride?.totalFare)}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.gray200,
    ...shadows.sm,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: 100,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  date: {
    fontSize: 12,
    color: colors.textLight,
  },
  routeContainer: {
    marginBottom: spacing.md,
    paddingLeft: spacing.xs,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dotPickup: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    marginRight: spacing.sm,
    flexShrink: 0,
  },
  dotDropoff: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: colors.text,
    marginRight: spacing.sm,
    flexShrink: 0,
  },
  routeLineWrap: {
    paddingLeft: 3.5,
    paddingVertical: 3,
    gap: 3,
    flexDirection: 'column',
  },
  routeLineDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.gray300,
  },
  routeText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    fontWeight: '400',
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.gray200,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  driverName: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  ratingText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  fare: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
});

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadows } from '../theme';

export default function DriverCard({ driver, onSelect, selected }) {
  const rideType = driver?.rideType || 'standard';

  return (
    <TouchableOpacity
      style={[styles.card, selected && styles.selectedCard]}
      onPress={onSelect}
      activeOpacity={0.85}
    >
      <View style={styles.row}>
        {/* Driver avatar */}
        <View style={styles.avatarWrap}>
          {driver?.photo ? (
            <Image source={{ uri: driver.photo }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>
                {(driver?.name || 'D').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={[styles.onlineDot, { backgroundColor: driver?.isOnline ? colors.online : colors.offline }]} />
        </View>

        {/* Driver info */}
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{driver?.name || 'Driver'}</Text>
            <View style={styles.typeBadge}>
              <Text style={styles.typeText}>
                {rideType.charAt(0).toUpperCase() + rideType.slice(1)}
              </Text>
            </View>
          </View>

          <View style={styles.ratingRow}>
            <Ionicons name="star" size={13} color={colors.warning} />
            <Text style={styles.rating}>{driver?.rating?.toFixed(1) || '–'}</Text>
            <Text style={styles.ratingCount}>({driver?.ratingCount || 0})</Text>
          </View>

          <View style={styles.vehicleRow}>
            <Ionicons name="car-outline" size={13} color={colors.gray400} />
            <Text style={styles.vehicle}>
              {driver?.vehicle?.make} {driver?.vehicle?.model} · {driver?.vehicle?.color}
            </Text>
          </View>

          <Text style={styles.plate}>{driver?.vehicle?.plate}</Text>
        </View>

        {/* ETA */}
        <View style={styles.metaCol}>
          <View style={styles.etaBox}>
            <Text style={styles.etaLabel}>ETA</Text>
            <Text style={styles.etaValue}>{driver?.eta || '–'} min</Text>
          </View>
          {driver?.distance && (
            <Text style={styles.distance}>{driver.distance} km</Text>
          )}
        </View>
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
    borderWidth: 2,
    borderColor: 'transparent',
    ...shadows.sm,
  },
  selectedCard: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(255,0,191,0.03)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrap: {
    position: 'relative',
    marginRight: spacing.md,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 2,
    borderColor: colors.gray200,
  },
  avatarPlaceholder: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.white,
  },
  onlineDot: {
    width: 13,
    height: 13,
    borderRadius: 6.5,
    borderWidth: 2,
    borderColor: colors.white,
    position: 'absolute',
    bottom: 1,
    right: 1,
  },
  info: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    marginBottom: 3,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  typeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 100,
    backgroundColor: 'rgba(255,0,191,0.1)',
  },
  typeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 3,
  },
  rating: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  ratingCount: {
    fontSize: 11,
    color: colors.textLight,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  vehicle: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  plate: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  metaCol: {
    alignItems: 'center',
    marginLeft: spacing.sm,
  },
  etaBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,0,191,0.08)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 1,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
    minWidth: 60,
  },
  etaLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  etaValue: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.primary,
  },
  distance: {
    fontSize: 11,
    color: colors.textSecondary,
  },
});

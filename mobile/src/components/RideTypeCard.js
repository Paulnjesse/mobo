import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadows } from '../theme';

const RIDE_TYPE_ICONS = {
  Standard: 'car-outline',
  Comfort: 'car-sport-outline',
  Luxury: 'diamond-outline',
  Shared: 'people-outline',
  Delivery: 'cube-outline',
  Scheduled: 'calendar-outline',
};

/**
 * Ride type selection card (like Lyft's ride selector)
 * Props: type, icon, name, price, eta, isSelected, onSelect
 * Types: Standard, Comfort, Luxury, Shared, Delivery, Scheduled
 * Pink border when selected. Price in XAF.
 */
export default function RideTypeCard({
  type = 'Standard',
  icon,
  name,
  price,
  eta,
  isSelected = false,
  onSelect,
}) {
  const iconName = icon || RIDE_TYPE_ICONS[type] || 'car-outline';
  const displayName = name || type;

  return (
    <TouchableOpacity
      style={[styles.card, isSelected && styles.cardSelected]}
      onPress={onSelect}
      activeOpacity={0.85}
    >
      {/* Selected checkmark */}
      {isSelected && (
        <View style={styles.selectedBadge}>
          <Ionicons name="checkmark" size={12} color={colors.white} />
        </View>
      )}

      {/* Icon */}
      <View style={[styles.iconWrap, isSelected && styles.iconWrapSelected]}>
        <Ionicons
          name={iconName}
          size={28}
          color={isSelected ? colors.white : colors.text}
        />
      </View>

      {/* Name */}
      <Text style={[styles.name, isSelected && styles.nameSelected]} numberOfLines={1}>
        {displayName}
      </Text>

      {/* ETA */}
      {eta !== undefined && (
        <Text style={styles.eta}>{eta} min</Text>
      )}

      {/* Price */}
      {price !== undefined && (
        <Text style={[styles.price, isSelected && styles.priceSelected]}>
          {typeof price === 'number' ? `${price.toLocaleString()} XAF` : price}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 100,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.gray200,
    alignItems: 'center',
    marginRight: spacing.sm,
    ...shadows.sm,
    position: 'relative',
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(255,0,191,0.04)',
  },
  selectedBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  iconWrapSelected: {
    backgroundColor: colors.primary,
  },
  name: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 2,
  },
  nameSelected: {
    color: colors.primary,
  },
  eta: {
    fontSize: 11,
    fontWeight: '400',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  price: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  priceSelected: {
    color: colors.primary,
  },
});

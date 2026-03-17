import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../theme';

/**
 * Interactive star rating (1-5).
 * Filled stars: pink (#FF00BF). Empty stars: light gray.
 * Tap to set rating. Optional half-star support.
 * Props: rating, onRate, size, readonly, halfStars
 */
export default function StarRating({
  rating = 0,
  onRate,
  size = 32,
  readonly = false,
  halfStars = false,
}) {
  const [hoveredRating, setHoveredRating] = useState(null);

  const displayRating = hoveredRating !== null ? hoveredRating : rating;

  const getStarType = (starIndex) => {
    const starValue = starIndex + 1;
    if (halfStars) {
      if (displayRating >= starValue) return 'full';
      if (displayRating >= starValue - 0.5) return 'half';
      return 'empty';
    }
    return displayRating >= starValue ? 'full' : 'empty';
  };

  const getIconName = (type) => {
    switch (type) {
      case 'full': return 'star';
      case 'half': return 'star-half';
      default: return 'star-outline';
    }
  };

  const getIconColor = (type) => {
    return type === 'empty' ? colors.gray300 : colors.primary;
  };

  const handlePress = (starIndex) => {
    if (readonly) return;
    const newRating = starIndex + 1;
    onRate && onRate(newRating);
  };

  return (
    <View style={styles.container}>
      {Array.from({ length: 5 }, (_, i) => {
        const starType = getStarType(i);
        return (
          <TouchableOpacity
            key={i}
            onPress={() => handlePress(i)}
            disabled={readonly}
            activeOpacity={0.7}
            style={styles.star}
          >
            <Ionicons
              name={getIconName(starType)}
              size={size}
              color={getIconColor(starType)}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  star: {
    padding: 2,
  },
});

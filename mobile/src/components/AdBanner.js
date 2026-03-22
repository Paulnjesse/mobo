/**
 * AdBanner — sliding promotional banner.
 * Supports two ad types:
 *   • 'internal' — MOBO promos (ride discounts, new features)
 *   • 'business' — local business sponsored ads (restaurants, shops, services)
 *
 * Props:
 *   onCtaPress(ad)  — called when CTA button is tapped
 *   dark            — use dark background (for WelcomeScreen / LoginScreen)
 *   context         — 'home' | 'ride' | 'auth' (controls which ads show)
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, Dimensions, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius } from '../theme';
import api from '../services/api';

const { width } = Dimensions.get('window');

// ── Internal MOBO promos ─────────────────────────────────────────────────────
const INTERNAL_ADS = [
  {
    id: 'i1', type: 'internal', icon: 'flash-outline', color: '#FF6B00',
    title: 'Ride 5x, Save 20%',
    subtitle: 'Complete 5 trips this week — get 20% off your next ride.',
    cta: 'Activate',
  },
  {
    id: 'i2', type: 'internal', icon: 'leaf-outline', color: '#00A651',
    title: 'Go Green — Try EV Rides',
    subtitle: 'Zero-emission rides now available in Yaoundé & Douala.',
    cta: 'Try Green',
  },
  {
    id: 'i3', type: 'internal', icon: 'train-outline', color: '#FF00BF',
    title: 'Commuter Pass — Save 25%',
    subtitle: 'Buy a 40-ride pack and save 25% on your daily commute.',
    cta: 'Get Pass',
  },
  {
    id: 'i4', type: 'internal', icon: 'people-outline', color: '#0077CC',
    title: 'Refer & Earn 1,000 FCFA',
    subtitle: 'Invite friends to MOBO — you both get ride credits.',
    cta: 'Share Now',
  },
  {
    id: 'i5', type: 'internal', icon: 'bicycle-outline', color: '#8B4513',
    title: 'Benskin — Fastest in Town!',
    subtitle: 'Beat traffic with our moto taxi. From 500 FCFA.',
    cta: 'Book Moto',
  },
];

// ── Local business sponsored ads ─────────────────────────────────────────────
// In production, fetch these from GET /ads?context=home|ride|auth
const BUSINESS_ADS = [
  {
    id: 'b1', type: 'business', icon: 'restaurant-outline', color: '#E74C3C',
    title: 'La Belle Époque — 15% Off',
    subtitle: 'Fine dining in Bastos, Yaoundé. Show your MOBO receipt.',
    cta: 'View Menu',
    url: null, // replace with real URL in production
    sponsor: 'La Belle Époque',
  },
  {
    id: 'b2', type: 'business', icon: 'bag-handle-outline', color: '#8E44AD',
    title: 'ModeAfrica Boutique',
    subtitle: 'Fashion & accessories — Akwa, Douala. Free delivery on orders 10k+.',
    cta: 'Shop Now',
    url: null,
    sponsor: 'ModeAfrica',
  },
  {
    id: 'b3', type: 'business', icon: 'fitness-outline', color: '#1ABC9C',
    title: 'FitCam Gym — Free Trial',
    subtitle: '3-day free pass for MOBO riders. Clubs in Yaoundé & Douala.',
    cta: 'Claim Pass',
    url: null,
    sponsor: 'FitCam',
  },
  {
    id: 'b4', type: 'business', icon: 'cafe-outline', color: '#F39C12',
    title: 'Café Terrasse — Happy Hour',
    subtitle: 'Coffee & pastries, Hippodrome. 10% off with MOBO code RIDE10.',
    cta: 'Get Code',
    url: null,
    sponsor: 'Café Terrasse',
  },
  {
    id: 'b5', type: 'business', icon: 'medkit-outline', color: '#2980B9',
    title: 'PharmaCam — Home Delivery',
    subtitle: 'Medicines delivered in 30 min. Yaoundé & Douala.',
    cta: 'Order Now',
    url: null,
    sponsor: 'PharmaCam',
  },
];

// Local fallback playlist (used when API is unavailable)
function buildFallback(context) {
  if (context === 'auth') return [...INTERNAL_ADS.slice(0, 3), BUSINESS_ADS[0], BUSINESS_ADS[1]];
  if (context === 'ride') return [BUSINESS_ADS[0], BUSINESS_ADS[2], INTERNAL_ADS[0], BUSINESS_ADS[1], INTERNAL_ADS[3]];
  const mixed = [];
  const biz = [...BUSINESS_ADS];
  const int = [...INTERNAL_ADS];
  while (int.length || biz.length) {
    if (int.length) mixed.push(int.shift());
    if (int.length) mixed.push(int.shift());
    if (biz.length) mixed.push(biz.shift());
  }
  return mixed;
}

export default function AdBanner({ onCtaPress, dark = false, context = 'home' }) {
  const { colors } = useTheme();
  const [playlist, setPlaylist] = useState(buildFallback(context));
  const [currentIdx, setCurrentIdx] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Fetch ads from backend; silently fall back to local data on error
  useEffect(() => {
    api.get(`/ads?context=${context}`)
      .then(({ data }) => {
        if (data.ads && data.ads.length > 0) {
          setPlaylist(data.ads);
          setCurrentIdx(0);
        }
      })
      .catch(() => { /* keep fallback */ });
  }, [context]);

  useEffect(() => {
    const timer = setInterval(() => {
      // Slide + fade out, then swap, then slide + fade in
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: -20, duration: 250, useNativeDriver: true }),
      ]).start(() => {
        setCurrentIdx((i) => (i + 1) % playlist.length);
        slideAnim.setValue(20);
        Animated.parallel([
          Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
          Animated.timing(slideAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
        ]).start();
      });
    }, 6000);
    return () => clearInterval(timer);
  }, [fadeAnim, slideAnim, playlist.length]);

  if (dismissed) return null;

  const ad = playlist[currentIdx];
  const bg = dark
    ? 'rgba(255,255,255,0.10)'
    : colors.white;
  const textColor = dark ? '#FFFFFF' : colors.text;
  const subColor = dark ? 'rgba(255,255,255,0.65)' : colors.textSecondary;

  // Record impression when ad becomes visible
  useEffect(() => {
    if (ad?.id && !dismissed) {
      api.post(`/ads/${ad.id}/impression`).catch(() => {});
    }
  }, [currentIdx, dismissed]);

  const handleCta = () => {
    if (ad.url) Linking.openURL(ad.url).catch(() => {});
    if (ad?.id) api.post(`/ads/${ad.id}/click`).catch(() => {});
    onCtaPress?.(ad);
  };

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: bg, opacity: fadeAnim, transform: [{ translateX: slideAnim }] },
        dark && styles.containerDark,
      ]}
    >
      {/* Sponsored label for business ads */}
      {ad.type === 'business' && (
        <View style={styles.sponsoredBadge}>
          <Text style={[styles.sponsoredText, dark && { color: 'rgba(255,255,255,0.45)' }]}>Sponsored</Text>
        </View>
      )}

      <View style={[styles.iconWrap, { backgroundColor: ad.color + '22' }]}>
        <Ionicons name={ad.icon} size={20} color={ad.color} />
      </View>

      <View style={styles.textWrap}>
        <Text style={[styles.title, { color: textColor }]} numberOfLines={1}>{ad.title}</Text>
        <Text style={[styles.subtitle, { color: subColor }]} numberOfLines={1}>{ad.subtitle}</Text>
      </View>

      <TouchableOpacity
        style={[styles.cta, { backgroundColor: ad.color }]}
        onPress={handleCta}
        activeOpacity={0.85}
      >
        <Text style={styles.ctaText}>{ad.cta}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => setDismissed(true)} style={styles.close}>
        <Ionicons name="close" size={14} color={dark ? 'rgba(255,255,255,0.5)' : colors.gray400} />
      </TouchableOpacity>

      {/* Pagination dots */}
      <View style={styles.dots}>
        {playlist.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: i === currentIdx
                  ? ad.color
                  : dark ? 'rgba(255,255,255,0.25)' : colors.gray200,
                width: i === currentIdx ? 12 : 4,
              },
            ]}
          />
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    padding: spacing.sm + 2,
    paddingBottom: spacing.sm + 8, // space for dots
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  containerDark: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowOpacity: 0,
    elevation: 0,
  },
  sponsoredBadge: {
    position: 'absolute',
    top: 5,
    right: 30,
  },
  sponsoredText: {
    fontSize: 9,
    color: '#999',
    fontStyle: 'italic',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: { flex: 1 },
  title: { fontSize: 12, fontWeight: '800', marginBottom: 1 },
  subtitle: { fontSize: 10 },
  cta: {
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  ctaText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  close: { padding: 4 },
  dots: {
    position: 'absolute',
    bottom: 4,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 3,
  },
  dot: {
    height: 4,
    borderRadius: 2,
  },
});

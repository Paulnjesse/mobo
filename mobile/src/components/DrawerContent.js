/**
 * Custom Drawer Content — slides in from the left
 * Full navigation menu with user profile, ride history, settings, etc.
 */
import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius } from '../theme';

const RIDER_LINKS = [
  { icon: 'home-outline',           label: 'Home',              screen: 'HomeTab' },
  { icon: 'time-outline',           label: 'Ride History',      screen: 'ActivityTab' },
  { icon: 'person-outline',         label: 'Profile',           screen: 'AccountTab' },
  { icon: 'bookmark-outline',       label: 'Saved Places',      screen: 'SavedPlaces' },
  { icon: 'repeat-outline',         label: 'Recurring Rides',   screen: 'RecurringRide' },
  { icon: 'logo-whatsapp',          label: 'WhatsApp Booking',  screen: 'WhatsAppBooking' },
  { icon: 'card-outline',           label: 'Payment Methods',   screen: 'PaymentMethods' },
  { icon: 'train-outline',          label: 'Commuter Pass',     screen: 'CommuterPass' },
  { icon: 'star-outline',           label: 'Loyalty Points',    screen: 'Loyalty' },
  { icon: 'pricetag-outline',       label: 'Promo Codes',       screen: 'PromoCode' },
  { icon: 'shield-checkmark-outline', label: 'Safety',          screen: 'Safety' },
  { icon: 'chatbubbles-outline',    label: 'Support Chat',      screen: 'SupportChat' },
  { icon: 'settings-outline',       label: 'Settings',          screen: 'Settings' },
  { icon: 'fast-food-outline',       label: 'Food Delivery',     screen: 'FoodDelivery' },
  { icon: 'globe-outline',          label: 'Currency & Country', screen: 'CurrencyPicker' },
  { icon: 'code-slash-outline',     label: 'Developer Portal',  screen: 'DeveloperPortal' },
  { icon: 'watch-outline',          label: 'Watch Companion',   screen: 'WatchCompanion' },
];

const DRIVER_LINKS = [
  { icon: 'map-outline',            label: 'Demand Heat Map',   screen: 'DriverHeatMap' },
  { icon: 'radar-outline',          label: 'Trip Radar',        screen: 'TripRadar' },
  { icon: 'trophy-outline',         label: 'Driver Tier',       screen: 'DriverTier' },
  { icon: 'cash-outline',           label: 'Earnings',          screen: 'DriverEarnings' },
  { icon: 'shield-outline',         label: 'Earnings Guarantee',screen: 'EarningsGuarantee' },
  { icon: 'flash-outline',          label: 'Fuel Card',         screen: 'FuelCard' },
  { icon: 'build-outline',          label: 'Vehicle Maintenance',screen: 'MaintenanceTracker' },
  { icon: 'airplane-outline',       label: 'Airport Mode',      screen: 'AirportMode' },
  { icon: 'settings-outline',       label: 'Settings',          screen: 'Settings' },
  { icon: 'globe-outline',          label: 'Currency & Country', screen: 'CurrencyPicker' },
  { icon: 'watch-outline',          label: 'Watch Companion',   screen: 'WatchCompanion' },
];

export default function DrawerContent({ navigation }) {
  const { user, logout } = useAuth();
  const { colors } = useTheme();
  const s = makeStyles(colors);

  const isDriver = user?.role === 'driver';
  const links = isDriver ? DRIVER_LINKS : RIDER_LINKS;
  const name = user?.name || user?.full_name || 'User';
  const initial = name.charAt(0).toUpperCase();

  const nav = (screen) => {
    navigation.closeDrawer();
    setTimeout(() => navigation.navigate(screen), 150);
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <StatusBar barStyle={colors.text === '#FFFFFF' ? 'light-content' : 'dark-content'} />

      {/* Profile header */}
      <View style={s.profileHeader}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{initial}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.name} numberOfLines={1}>{name}</Text>
          <Text style={s.phone} numberOfLines={1}>{user?.phone || user?.email || ''}</Text>
          {isDriver && (
            <View style={s.tierBadge}>
              <Ionicons name="trophy" size={11} color="#FFD700" />
              <Text style={s.tierText}>{user?.driver_tier || 'Bronze'} Driver</Text>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={() => nav('AccountTab')} activeOpacity={0.7}>
          <Ionicons name="chevron-forward" size={18} color={colors.gray400} />
        </TouchableOpacity>
      </View>

      <View style={s.divider} />

      {/* USSD quick-access banner */}
      <TouchableOpacity style={[s.ussdBanner, { backgroundColor: colors.primary + '15' }]} onPress={() => nav('USSDBooking')} activeOpacity={0.8}>
        <Ionicons name="keypad-outline" size={18} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[s.ussdTitle, { color: colors.primary }]}>Book via USSD</Text>
          <Text style={[s.ussdSub, { color: colors.textSecondary }]}>No internet? Dial *126#</Text>
        </View>
        <Ionicons name="arrow-forward" size={14} color={colors.primary} />
      </TouchableOpacity>

      {/* Nav links */}
      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
        {links.map((link) => (
          <TouchableOpacity key={link.screen} style={s.navRow} onPress={() => nav(link.screen)} activeOpacity={0.75}>
            <View style={[s.navIcon, { backgroundColor: colors.gray100 }]}>
              <Ionicons name={link.icon} size={18} color={colors.text} />
            </View>
            <Text style={s.navLabel}>{link.label}</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.gray300} />
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={s.divider} />

      {/* Footer */}
      <TouchableOpacity style={s.logoutRow} onPress={logout} activeOpacity={0.8}>
        <Ionicons name="log-out-outline" size={20} color="#CC0000" />
        <Text style={s.logoutText}>Log Out</Text>
      </TouchableOpacity>
      <Text style={s.version}>MOBO v1.0.0</Text>
    </SafeAreaView>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.white },
    profileHeader: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
      padding: spacing.md, paddingTop: spacing.sm,
    },
    avatar: {
      width: 52, height: 52, borderRadius: 26,
      backgroundColor: colors.primary + '20',
      alignItems: 'center', justifyContent: 'center',
    },
    avatarText: { fontSize: 22, fontWeight: '800', color: colors.primary },
    name: { fontSize: 15, fontWeight: '800', color: colors.text },
    phone: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
    tierBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4,
      backgroundColor: '#FFD70020', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start',
    },
    tierText: { fontSize: 10, fontWeight: '700', color: '#B8860B' },
    divider: { height: 1, backgroundColor: colors.gray100, marginHorizontal: spacing.md },
    ussdBanner: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      margin: spacing.sm, borderRadius: radius.md, padding: spacing.sm + 2,
    },
    ussdTitle: { fontSize: 13, fontWeight: '700' },
    ussdSub: { fontSize: 11, marginTop: 1 },
    navRow: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      paddingHorizontal: spacing.md, paddingVertical: 12,
    },
    navIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    navLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
    logoutRow: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      padding: spacing.md,
    },
    logoutText: { fontSize: 14, fontWeight: '700', color: '#CC0000' },
    version: { fontSize: 10, color: colors.gray300, textAlign: 'center', paddingBottom: spacing.sm },
  });
}

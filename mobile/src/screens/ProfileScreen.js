import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { colors, spacing, radius, shadows } from '../theme';

export default function ProfileScreen({ navigation }) {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const [loggingOut, setLoggingOut] = useState(false);

  const firstName = user?.name?.split(' ')[0] || 'Rider';
  const initial = firstName.charAt(0).toUpperCase();

  const handleLogout = () => {
    Alert.alert('Log Out', t('logoutConfirm'), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          setLoggingOut(true);
          try { await logout(); } catch (e) { /* ignore */ } finally { setLoggingOut(false); }
        },
      },
    ]);
  };

  const MENU_ITEMS = [
    { icon: 'card-outline', label: t('paymentMethods') || 'Payment Methods', screen: 'PaymentMethods', color: colors.primary },
    { icon: 'star-outline', label: 'Subscriptions', screen: 'Subscription', color: colors.warning },
    { icon: 'shield-checkmark-outline', label: 'Safety', screen: 'Safety', color: colors.success },
    { icon: 'pricetag-outline', label: 'Promo Codes', screen: 'PromoCode', color: colors.primary },
    { icon: 'calendar-outline', label: 'Scheduled Rides', screen: 'ScheduledRide', color: colors.primary },
    { icon: 'briefcase-outline', label: 'Corporate Account', screen: 'Corporate', color: colors.text },
    { icon: 'people-outline', label: 'Teen Accounts', screen: 'TeenAccounts', color: colors.primary },
    { icon: 'diamond-outline', label: 'Loyalty Points', screen: 'Loyalty', color: colors.primaryDark || colors.primary },
    { icon: 'notifications-outline', label: t('notifications'), screen: 'Notifications', color: colors.text },
    { icon: 'settings-outline', label: t('settings'), screen: 'Settings', color: colors.text },
    { icon: 'help-circle-outline', label: t('helpSupport') || 'Help & Support', screen: 'Help', color: colors.text },
  ];

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('profile')}</Text>
        <TouchableOpacity
          style={styles.editBtn}
          onPress={() => {}}
          activeOpacity={0.7}
        >
          <Text style={styles.editBtnText}>{t('editProfile')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Avatar + name */}
        <View style={styles.profileSection}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarLetter}>{initial}</Text>
            </View>
            <TouchableOpacity style={styles.editAvatarBtn} activeOpacity={0.8}>
              <Ionicons name="camera-outline" size={16} color={colors.white} />
            </TouchableOpacity>
          </View>
          <Text style={styles.userName}>{user?.name || 'Rider'}</Text>
          <Text style={styles.userPhone}>{user?.phone || user?.email || ''}</Text>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{user?.totalRides || 0}</Text>
            <Text style={styles.statLabel}>Rides</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{user?.rating?.toFixed(1) || '5.0'}</Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{user?.loyaltyPoints || 0}</Text>
            <Text style={styles.statLabel}>Points</Text>
          </View>
        </View>

        {/* Menu list */}
        <View style={styles.menuSection}>
          {MENU_ITEMS.map((item, idx) => (
            <TouchableOpacity
              key={idx}
              style={[styles.menuRow, idx < MENU_ITEMS.length - 1 && styles.menuRowBorder]}
              onPress={() => item.screen && navigation.navigate(item.screen)}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconWrap, { backgroundColor: item.color + '15' }]}>
                <Ionicons name={item.icon} size={20} color={item.color} />
              </View>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.gray300} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Log out */}
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={handleLogout}
          disabled={loggingOut}
          activeOpacity={0.8}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={styles.logoutText}>{t('logout')}</Text>
        </TouchableOpacity>

        <Text style={styles.version}>MOBO v1.0.0</Text>
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
  headerTitle: { fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  editBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,0,191,0.1)',
  },
  editBtnText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  profileSection: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  avatarWrap: { position: 'relative', marginBottom: spacing.md },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  avatarLetter: { fontSize: 40, fontWeight: '900', color: colors.white },
  editAvatarBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  userName: { fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: spacing.xs, letterSpacing: -0.3 },
  userPhone: { fontSize: 15, color: colors.textSecondary },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.gray200,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  statItem: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm },
  statValue: { fontSize: 24, fontWeight: '900', color: colors.text, letterSpacing: -0.5 },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  statDivider: { width: 1, backgroundColor: colors.gray200, marginVertical: spacing.xs },
  menuSection: {
    backgroundColor: colors.white,
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.gray200,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 2,
    gap: spacing.md,
  },
  menuRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  menuIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: colors.text },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginHorizontal: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    borderWidth: 1.5,
    borderColor: 'rgba(227,24,55,0.2)',
  },
  logoutText: { fontSize: 15, fontWeight: '700', color: colors.danger },
  version: {
    textAlign: 'center',
    fontSize: 12,
    color: colors.textLight,
    paddingVertical: spacing.lg,
  },
});

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../context/LanguageContext';
import { colors, spacing, radius, shadows } from '../theme';

const ICON_MAP = {
  ride: { icon: 'car-outline', color: colors.primary, bg: 'rgba(255,0,191,0.1)' },
  payment: { icon: 'card-outline', color: colors.success, bg: 'rgba(0,166,81,0.1)' },
  promo: { icon: 'gift-outline', color: colors.warning, bg: 'rgba(255,140,0,0.1)' },
  alert: { icon: 'warning-outline', color: colors.danger, bg: 'rgba(227,24,55,0.1)' },
  info: { icon: 'information-circle-outline', color: colors.textSecondary, bg: colors.surface },
};

const MOCK_NOTIFICATIONS = [
  { id: '1', type: 'ride', title: 'Ride Completed', body: 'Your ride to Aéroport International has been completed. Fare: 3,500 XAF', time: '2 min ago', read: false },
  { id: '2', type: 'payment', title: 'Payment Successful', body: 'Payment of 3,500 XAF via MTN Mobile Money was processed.', time: '5 min ago', read: false },
  { id: '3', type: 'promo', title: '20% Off This Weekend!', body: 'Use code WEEKEND20 for 20% off all rides this Saturday and Sunday.', time: '1 hr ago', read: false },
  { id: '4', type: 'ride', title: 'Driver Assigned', body: 'Jean-Pierre is on his way. ETA: 4 minutes.', time: '2 hrs ago', read: true },
  { id: '5', type: 'info', title: 'Rate Your Last Ride', body: 'How was your experience with Jean-Pierre? Tap to leave a rating.', time: '3 hrs ago', read: true },
  { id: '6', type: 'promo', title: 'New: Teen Accounts', body: 'Set up monitored rides for your teenager. Try Teen Accounts today.', time: '1 day ago', read: true },
];

export default function NotificationsScreen({ navigation }) {
  const { t } = useLanguage();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTimeout(() => {
      setNotifications(MOCK_NOTIFICATIONS);
      setLoading(false);
    }, 400);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const markRead = (id) => {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  };

  const renderItem = ({ item }) => {
    const meta = ICON_MAP[item.type] || ICON_MAP.info;
    return (
      <TouchableOpacity
        style={[styles.notifCard, !item.read && styles.notifCardUnread]}
        onPress={() => markRead(item.id)}
        activeOpacity={0.85}
      >
        <View style={[styles.notifIcon, { backgroundColor: meta.bg }]}>
          <Ionicons name={meta.icon} size={22} color={meta.color} />
        </View>
        <View style={styles.notifContent}>
          <View style={styles.notifTitleRow}>
            <Text style={styles.notifTitle}>{item.title}</Text>
            {!item.read && <View style={styles.unreadDot} />}
          </View>
          <Text style={styles.notifBody} numberOfLines={2}>{item.body}</Text>
          <Text style={styles.notifTime}>{item.time}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('notifications')}</Text>
        {unreadCount > 0 ? (
          <TouchableOpacity onPress={markAllRead} activeOpacity={0.7}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIcon}>
                <Ionicons name="notifications-off-outline" size={40} color={colors.gray400} />
              </View>
              <Text style={styles.emptyTitle}>No notifications</Text>
              <Text style={styles.emptySubtitle}>You're all caught up!</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray200,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: colors.text },
  markAllText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  headerSpacer: { width: 70 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: spacing.md, paddingBottom: 40, flexGrow: 1 },
  notifCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md,
    backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md,
    marginBottom: spacing.sm, ...shadows.sm,
  },
  notifCardUnread: { borderLeftWidth: 3, borderLeftColor: colors.primary },
  notifIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  notifContent: { flex: 1 },
  notifTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  notifTitle: { fontSize: 14, fontWeight: '700', color: colors.text, flex: 1 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginLeft: spacing.xs },
  notifBody: { fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginBottom: 4 },
  notifTime: { fontSize: 11, color: colors.textLight, fontWeight: '500' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md, ...shadows.sm },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  emptySubtitle: { fontSize: 14, color: colors.textSecondary },
});

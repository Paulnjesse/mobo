import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { colors, spacing, radius, shadows } from '../theme';

const HOW_TO_EARN = [
  { icon: 'car-outline', title: 'Complete a ride', points: '+10 pts', color: colors.primary },
  { icon: 'arrow-up-circle-outline', title: 'Round up fare', points: '+5 pts', color: colors.warning },
  { icon: 'person-add-outline', title: 'Refer a friend', points: '+100 pts', color: colors.success },
  { icon: 'star-outline', title: 'Rate your driver', points: '+2 pts', color: colors.primary },
];

export default function LoyaltyScreen({ navigation }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const points = user?.loyaltyPoints || 0;
  const tier = points >= 500 ? 'Gold' : points >= 200 ? 'Silver' : 'Bronze';
  const tierColor = tier === 'Gold' ? '#FFB800' : tier === 'Silver' ? '#9E9E9E' : '#CD7F32';
  const nextTierPoints = tier === 'Bronze' ? 200 : tier === 'Silver' ? 500 : 1000;
  const progress = Math.min(points / nextTierPoints, 1);

  useEffect(() => {
    // Load loyalty history — stub for now
    setTimeout(() => {
      setHistory([
        { id: '1', type: 'earn', description: 'Completed ride', points: 10, date: '2024-01-15' },
        { id: '2', type: 'earn', description: 'Referred a friend', points: 100, date: '2024-01-10' },
        { id: '3', type: 'redeem', description: 'Redeemed for discount', points: -50, date: '2024-01-05' },
      ]);
      setLoading(false);
    }, 500);
  }, []);

  const handleRedeem = () => {
    if (points < 100) {
      Alert.alert('Not enough points', 'You need at least 100 points to redeem.');
      return;
    }
    Alert.alert('Redeem Points', `Redeem ${points} points for a ride discount?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Redeem', onPress: () => Alert.alert('Success', 'Points redeemed! Discount applied to your next ride.') },
    ]);
  };

  const renderHistoryItem = ({ item }) => (
    <View style={styles.historyItem}>
      <View style={[styles.historyIcon, { backgroundColor: item.points > 0 ? 'rgba(0,166,81,0.12)' : 'rgba(227,24,55,0.12)' }]}>
        <Ionicons name={item.points > 0 ? 'add-circle-outline' : 'remove-circle-outline'} size={20} color={item.points > 0 ? colors.success : colors.danger} />
      </View>
      <View style={styles.historyTexts}>
        <Text style={styles.historyDesc}>{item.description}</Text>
        <Text style={styles.historyDate}>{item.date}</Text>
      </View>
      <Text style={[styles.historyPoints, { color: item.points > 0 ? colors.success : colors.danger }]}>
        {item.points > 0 ? '+' : ''}{item.points} pts
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Loyalty Points</Text>
        <View style={styles.headerSpacer} />
      </View>

      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        renderItem={renderHistoryItem}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {/* Hero balance card */}
            <View style={styles.heroCard}>
              <View style={styles.heroTop}>
                <View style={[styles.tierBadge, { backgroundColor: tierColor + '20', borderColor: tierColor }]}>
                  <Ionicons name="diamond-outline" size={14} color={tierColor} />
                  <Text style={[styles.tierBadgeText, { color: tierColor }]}>{tier}</Text>
                </View>
              </View>
              <Text style={styles.pointsValue}>{points.toLocaleString()}</Text>
              <Text style={styles.pointsLabel}>loyalty points</Text>

              {/* Progress bar */}
              <View style={styles.progressSection}>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
                </View>
                <Text style={styles.progressLabel}>
                  {nextTierPoints - points > 0
                    ? `${(nextTierPoints - points).toLocaleString()} pts to ${tier === 'Bronze' ? 'Silver' : tier === 'Silver' ? 'Gold' : 'Platinum'}`
                    : 'Max tier reached'}
                </Text>
              </View>
            </View>

            {/* Redeem button */}
            <TouchableOpacity style={styles.redeemBtn} onPress={handleRedeem} activeOpacity={0.88}>
              <Ionicons name="gift-outline" size={20} color={colors.white} />
              <Text style={styles.redeemBtnText}>Redeem Points</Text>
            </TouchableOpacity>

            {/* How to earn */}
            <Text style={styles.sectionTitle}>How to Earn</Text>
            <View style={styles.earnGrid}>
              {HOW_TO_EARN.map((item, idx) => (
                <View key={idx} style={styles.earnCard}>
                  <View style={[styles.earnIcon, { backgroundColor: item.color + '15' }]}>
                    <Ionicons name={item.icon} size={22} color={item.color} />
                  </View>
                  <Text style={styles.earnTitle}>{item.title}</Text>
                  <Text style={[styles.earnPoints, { color: item.color }]}>{item.points}</Text>
                </View>
              ))}
            </View>

            {/* History header */}
            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : (
              <Text style={styles.sectionTitle}>Points History</Text>
            )}
          </>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="time-outline" size={32} color={colors.gray400} />
              <Text style={styles.emptyText}>No history yet</Text>
            </View>
          ) : null
        }
        contentContainerStyle={styles.listContent}
      />
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
  headerSpacer: { width: 40 },
  listContent: { padding: spacing.md, paddingBottom: 40 },
  heroCard: {
    backgroundColor: colors.primary, borderRadius: radius.xl, padding: spacing.lg,
    marginBottom: spacing.md, alignItems: 'center',
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 20, elevation: 10,
  },
  heroTop: { alignSelf: 'flex-end', marginBottom: spacing.sm },
  tierBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.sm + 2, paddingVertical: 4,
    borderRadius: radius.round, borderWidth: 1.5,
  },
  tierBadgeText: { fontSize: 12, fontWeight: '700' },
  pointsValue: { fontSize: 64, fontWeight: '900', color: colors.white, letterSpacing: -2 },
  pointsLabel: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.75)', marginBottom: spacing.lg },
  progressSection: { width: '100%' },
  progressTrack: { height: 6, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 3, overflow: 'hidden', marginBottom: spacing.xs },
  progressFill: { height: '100%', backgroundColor: colors.white, borderRadius: 3 },
  progressLabel: { fontSize: 12, color: 'rgba(255,255,255,0.8)', textAlign: 'center', fontWeight: '500' },
  redeemBtn: {
    backgroundColor: colors.text, borderRadius: radius.pill, height: 52,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    marginBottom: spacing.lg,
    shadowColor: colors.text, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 6,
  },
  redeemBtnText: { fontSize: 16, fontWeight: '700', color: colors.white },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: spacing.sm },
  earnGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  earnCard: {
    flex: 1, minWidth: '45%', backgroundColor: colors.white, borderRadius: radius.lg,
    padding: spacing.md, alignItems: 'center', gap: spacing.xs, ...shadows.sm,
  },
  earnIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  earnTitle: { fontSize: 13, fontWeight: '600', color: colors.text, textAlign: 'center' },
  earnPoints: { fontSize: 14, fontWeight: '800' },
  loadingWrap: { paddingVertical: spacing.lg, alignItems: 'center' },
  historyItem: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md,
    marginBottom: spacing.sm, ...shadows.sm,
  },
  historyIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  historyTexts: { flex: 1 },
  historyDesc: { fontSize: 14, fontWeight: '600', color: colors.text },
  historyDate: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  historyPoints: { fontSize: 15, fontWeight: '800' },
  emptyWrap: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  emptyText: { fontSize: 14, color: colors.textSecondary },
});

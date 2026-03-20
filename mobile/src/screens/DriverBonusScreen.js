import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

const DriverBonusScreen = ({ navigation }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadBonuses(); }, []);

  const loadBonuses = async () => {
    try {
      const res = await api.get('/location/bonuses');
      setData(res.data);
    } catch (e) {
      Alert.alert('Error', 'Failed to load bonuses');
    } finally {
      setLoading(false);
    }
  };

  const progress = (current, target) => Math.min((current || 0) / target, 1);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#FF00BF" /></View>;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.title}>Bonuses & Streaks</Text>
      </View>

      {/* Streak Card */}
      <View style={styles.streakCard}>
        <View style={styles.streakIcon}>
          <Text style={styles.streakEmoji}>🔥</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.streakNum}>{data?.streak?.current || 0} ride streak</Text>
          <Text style={styles.streakSub}>Longest: {data?.streak?.longest || 0} rides</Text>
        </View>
        <View style={styles.totalBonus}>
          <Text style={styles.totalBonusAmt}>{(data?.total_bonuses_earned || 0).toLocaleString()}</Text>
          <Text style={styles.totalBonusLabel}>XAF earned</Text>
        </View>
      </View>

      {/* Challenges */}
      <Text style={styles.sectionTitle}>Active Challenges</Text>
      {data?.challenges?.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="trophy-outline" size={48} color="#ddd" />
          <Text style={styles.emptyText}>No active challenges right now</Text>
        </View>
      ) : (
        data?.challenges?.map(ch => {
          const pct = progress(ch.current_value, ch.target_value);
          const daysLeft = Math.ceil((new Date(ch.ends_at) - new Date()) / (1000*60*60*24));
          return (
            <View key={ch.id} style={[styles.challengeCard, ch.completed && styles.challengeCompleted]}>
              <View style={styles.challengeTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.challengeName}>{ch.name}</Text>
                  <Text style={styles.challengeDesc}>{ch.description}</Text>
                </View>
                <View style={styles.bonusBadge}>
                  <Text style={styles.bonusAmt}>+{ch.bonus_amount?.toLocaleString()}</Text>
                  <Text style={styles.bonusCur}>XAF</Text>
                </View>
              </View>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${pct * 100}%` }, ch.completed && styles.progressDone]} />
              </View>
              <View style={styles.challengeBottom}>
                <Text style={styles.progressText}>{ch.current_value || 0}/{ch.target_value}</Text>
                {ch.completed ? (
                  <Text style={styles.completedText}>✓ Completed{ch.bonus_paid ? ' · Paid' : ' · Pending payment'}</Text>
                ) : (
                  <Text style={styles.daysLeft}>{daysLeft > 0 ? `${daysLeft}d left` : 'Ended'}</Text>
                )}
              </View>
            </View>
          );
        })
      )}

      {/* Streak Tips */}
      <View style={styles.tipsCard}>
        <Text style={styles.tipsTitle}>How Streaks Work</Text>
        <Text style={styles.tip}>• Complete rides in a row to build your streak</Text>
        <Text style={styles.tip}>• Cancelling a ride resets your streak to 0</Text>
        <Text style={styles.tip}>• Longer streaks unlock better bonus challenges</Text>
        <Text style={styles.tip}>• Streak resets after 6 hours of inactivity</Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 50, gap: 12 },
  title: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  streakCard: { margin: 16, padding: 20, backgroundColor: '#1A1A1A', borderRadius: 16, flexDirection: 'row', alignItems: 'center' },
  streakIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  streakEmoji: { fontSize: 24 },
  streakNum: { fontSize: 20, fontWeight: '800', color: '#fff' },
  streakSub: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  totalBonus: { alignItems: 'flex-end' },
  totalBonusAmt: { fontSize: 20, fontWeight: '800', color: '#FF00BF' },
  totalBonusLabel: { fontSize: 11, color: 'rgba(255,255,255,0.6)' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', marginHorizontal: 16, marginBottom: 12 },
  empty: { alignItems: 'center', padding: 32 },
  emptyText: { fontSize: 14, color: '#999', marginTop: 8 },
  challengeCard: { margin: 12, marginBottom: 0, padding: 16, backgroundColor: '#F6F6F6', borderRadius: 14 },
  challengeCompleted: { backgroundColor: '#F0FFF4', borderWidth: 1, borderColor: '#4CAF50' },
  challengeTop: { flexDirection: 'row', marginBottom: 12 },
  challengeName: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  challengeDesc: { fontSize: 13, color: '#666', marginTop: 2 },
  bonusBadge: { backgroundColor: '#FF00BF', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', justifyContent: 'center' },
  bonusAmt: { fontSize: 16, fontWeight: '800', color: '#fff' },
  bonusCur: { fontSize: 10, color: 'rgba(255,255,255,0.8)' },
  progressBar: { height: 6, backgroundColor: '#ddd', borderRadius: 3, marginBottom: 8 },
  progressFill: { height: '100%', backgroundColor: '#FF00BF', borderRadius: 3 },
  progressDone: { backgroundColor: '#4CAF50' },
  challengeBottom: { flexDirection: 'row', justifyContent: 'space-between' },
  progressText: { fontSize: 12, color: '#666' },
  completedText: { fontSize: 12, color: '#4CAF50', fontWeight: '600' },
  daysLeft: { fontSize: 12, color: '#999' },
  tipsCard: { margin: 16, marginTop: 24, padding: 16, backgroundColor: '#F6F6F6', borderRadius: 14 },
  tipsTitle: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', marginBottom: 10 },
  tip: { fontSize: 13, color: '#555', marginBottom: 6 },
});

export default DriverBonusScreen;

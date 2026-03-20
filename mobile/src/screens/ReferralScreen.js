import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Share, Clipboard, Alert, ActivityIndicator, TextInput
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

const ReferralScreen = ({ navigation }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [inputCode, setInputCode] = useState('');
  const [showInput, setShowInput] = useState(false);

  useEffect(() => { loadReferrals(); }, []);

  const loadReferrals = async () => {
    try {
      const res = await api.get('/social/referrals');
      setData(res.data);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to load referrals');
    } finally {
      setLoading(false);
    }
  };

  const shareCode = async () => {
    await Share.share({
      message: `Use my MOBO referral code ${data?.referral_code} to get 500 XAF off your first ride! Download MOBO now.`,
    });
  };

  const copyCode = () => {
    Clipboard.setString(data?.referral_code || '');
    Alert.alert('Copied!', 'Referral code copied to clipboard');
  };

  const applyCode = async () => {
    if (!inputCode.trim()) return;
    setApplying(true);
    try {
      const res = await api.post('/social/referrals/apply', { code: inputCode.trim().toUpperCase() });
      Alert.alert('Success!', res.data.message);
      setShowInput(false);
      loadReferrals();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to apply code');
    } finally {
      setApplying(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#FF00BF" /></View>;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.title}>Referrals</Text>
      </View>

      {/* Hero */}
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Give 500, Get 1,000</Text>
        <Text style={styles.heroSub}>Friends get 500 XAF off. You earn 1,000 XAF after their first ride.</Text>
      </View>

      {/* Referral Code */}
      <View style={styles.codeCard}>
        <Text style={styles.codeLabel}>Your referral code</Text>
        <Text style={styles.code}>{data?.referral_code}</Text>
        <View style={styles.codeActions}>
          <TouchableOpacity style={styles.codeBtn} onPress={copyCode}>
            <Ionicons name="copy-outline" size={18} color="#FF00BF" />
            <Text style={styles.codeBtnText}>Copy</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.codeBtn, styles.codeBtnPrimary]} onPress={shareCode}>
            <Ionicons name="share-outline" size={18} color="#fff" />
            <Text style={[styles.codeBtnText, { color: '#fff' }]}>Share</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Credits */}
      <View style={styles.creditsRow}>
        <View style={styles.creditBox}>
          <Text style={styles.creditAmount}>{data?.referral_credits || 0} XAF</Text>
          <Text style={styles.creditLabel}>Referral Credits</Text>
        </View>
        <View style={styles.creditBox}>
          <Text style={styles.creditAmount}>{data?.referrals?.length || 0}</Text>
          <Text style={styles.creditLabel}>Friends Invited</Text>
        </View>
        <View style={styles.creditBox}>
          <Text style={styles.creditAmount}>{data?.referrals?.filter(r => r.status === 'paid').length || 0}</Text>
          <Text style={styles.creditLabel}>Qualified</Text>
        </View>
      </View>

      {/* Apply a code */}
      <TouchableOpacity style={styles.applyBtn} onPress={() => setShowInput(!showInput)}>
        <Text style={styles.applyBtnText}>Have a friend's code? Apply it</Text>
      </TouchableOpacity>

      {showInput && (
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={inputCode}
            onChangeText={setInputCode}
            placeholder="Enter referral code"
            autoCapitalize="characters"
          />
          <TouchableOpacity style={styles.applyActionBtn} onPress={applyCode} disabled={applying}>
            {applying ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Apply</Text>}
          </TouchableOpacity>
        </View>
      )}

      {/* Referral history */}
      {data?.referrals?.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Invited Friends</Text>
          {data.referrals.map(r => (
            <View key={r.id} style={styles.referralRow}>
              <View style={styles.referralAvatar}>
                <Text style={styles.avatarText}>{r.referred_name?.[0] || '?'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.referralName}>{r.referred_name}</Text>
                <Text style={styles.referralDate}>{new Date(r.created_at).toLocaleDateString()}</Text>
              </View>
              <View style={[styles.statusBadge, r.status === 'paid' ? styles.statusPaid : styles.statusPending]}>
                <Text style={styles.statusText}>{r.status === 'paid' ? 'Earned 1,000 XAF' : 'Pending'}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 50 },
  back: { marginRight: 12 },
  title: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  hero: { backgroundColor: '#FF00BF', padding: 24, margin: 16, borderRadius: 16 },
  heroTitle: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 6 },
  heroSub: { fontSize: 14, color: 'rgba(255,255,255,0.85)' },
  codeCard: { margin: 16, padding: 20, backgroundColor: '#F6F6F6', borderRadius: 16, alignItems: 'center' },
  codeLabel: { fontSize: 13, color: '#666', marginBottom: 8 },
  code: { fontSize: 32, fontWeight: '800', color: '#1A1A1A', letterSpacing: 4, marginBottom: 16 },
  codeActions: { flexDirection: 'row', gap: 12 },
  codeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#FF00BF' },
  codeBtnPrimary: { backgroundColor: '#FF00BF', borderColor: '#FF00BF' },
  codeBtnText: { color: '#FF00BF', fontWeight: '600' },
  creditsRow: { flexDirection: 'row', marginHorizontal: 16, gap: 8, marginBottom: 16 },
  creditBox: { flex: 1, backgroundColor: '#F6F6F6', borderRadius: 12, padding: 12, alignItems: 'center' },
  creditAmount: { fontSize: 18, fontWeight: '800', color: '#FF00BF' },
  creditLabel: { fontSize: 11, color: '#666', marginTop: 4, textAlign: 'center' },
  applyBtn: { marginHorizontal: 16, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#ddd', alignItems: 'center', marginBottom: 8 },
  applyBtnText: { color: '#666', fontWeight: '600' },
  inputRow: { flexDirection: 'row', marginHorizontal: 16, gap: 8, marginBottom: 16 },
  input: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, fontSize: 16, fontWeight: '700', letterSpacing: 2 },
  applyActionBtn: { backgroundColor: '#FF00BF', paddingHorizontal: 20, borderRadius: 10, justifyContent: 'center' },
  section: { margin: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', marginBottom: 12 },
  referralRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  referralAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FF00BF', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  referralName: { fontSize: 14, fontWeight: '600', color: '#1A1A1A' },
  referralDate: { fontSize: 12, color: '#666' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusPaid: { backgroundColor: '#E8F5E9' },
  statusPending: { backgroundColor: '#FFF3E0' },
  statusText: { fontSize: 11, fontWeight: '600', color: '#333' },
});

export default ReferralScreen;

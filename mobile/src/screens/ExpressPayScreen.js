import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

const ExpressPayScreen = ({ navigation }) => {
  const [earnings, setEarnings] = useState(0);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [setupAccount, setSetupAccount] = useState('');
  const [showSetup, setShowSetup] = useState(false);
  const [showPayout, setShowPayout] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [processing, setProcessing] = useState(false);
  const [isSetup, setIsSetup] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [histRes] = await Promise.all([
        api.get('/location/express-pay/history')
      ]);
      setHistory(histRes.data.transactions);
      setIsSetup(histRes.data.transactions.length > 0 || false);
    } catch (e) {
      console.log(e.response?.data);
    } finally {
      setLoading(false);
    }
  };

  const setupExpressPay = async () => {
    if (!setupAccount.trim()) return Alert.alert('Required', 'Enter your mobile money number');
    setProcessing(true);
    try {
      await api.post('/location/express-pay/setup', { express_pay_account: setupAccount });
      Alert.alert('Setup Complete', 'Express Pay is now enabled on your account');
      setShowSetup(false);
      setIsSetup(true);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Setup failed');
    } finally {
      setProcessing(false);
    }
  };

  const requestPayout = async () => {
    const amount = parseInt(payoutAmount);
    if (!amount || amount < 1000) return Alert.alert('Minimum', 'Minimum payout is 1,000 XAF');
    setProcessing(true);
    try {
      const res = await api.post('/location/express-pay/payout', { amount });
      Alert.alert('Payout Requested', res.data.message);
      setShowPayout(false);
      setPayoutAmount('');
      loadData();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Payout failed');
    } finally {
      setProcessing(false);
    }
  };

  const statusColor = s => ({ completed: '#4CAF50', processing: '#FF9800', failed: '#F44336', pending: '#999' }[s] || '#999');

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#FF00BF" /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.title}>Express Pay</Text>
      </View>

      <ScrollView>
        {/* Hero Card */}
        <View style={styles.heroCard}>
          <Ionicons name="flash" size={28} color="#FF00BF" />
          <Text style={styles.heroTitle}>Instant Payouts</Text>
          <Text style={styles.heroSub}>Get your earnings sent to your mobile money in minutes. 1.5% fee applies.</Text>
        </View>

        {!isSetup ? (
          <View style={styles.setupContainer}>
            <Ionicons name="phone-portrait-outline" size={48} color="#ddd" />
            <Text style={styles.setupTitle}>Set Up Express Pay</Text>
            <Text style={styles.setupSub}>Connect your MTN or Orange Money number to enable instant payouts.</Text>
            <TouchableOpacity style={styles.setupBtn} onPress={() => setShowSetup(true)}>
              <Text style={styles.setupBtnText}>Set Up Now</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <TouchableOpacity style={styles.payoutCard} onPress={() => setShowPayout(true)}>
              <View>
                <Text style={styles.payoutLabel}>Ready to Withdraw</Text>
                <Text style={styles.payoutHint}>Tap to request instant payout</Text>
              </View>
              <View style={styles.payoutBtnSmall}>
                <Ionicons name="flash" size={16} color="#fff" />
                <Text style={styles.payoutBtnText}>Withdraw</Text>
              </View>
            </TouchableOpacity>

            {history.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Payout History</Text>
                {history.map(tx => (
                  <View key={tx.id} style={styles.txRow}>
                    <View style={[styles.txIcon, { backgroundColor: statusColor(tx.status) + '20' }]}>
                      <Ionicons name="flash" size={18} color={statusColor(tx.status)} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.txAmt}>{tx.net_amount?.toLocaleString()} XAF</Text>
                      <Text style={styles.txFee}>Fee: {tx.fee} XAF</Text>
                      <Text style={styles.txDate}>{new Date(tx.created_at).toLocaleString()}</Text>
                    </View>
                    <Text style={[styles.txStatus, { color: statusColor(tx.status) }]}>
                      {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Setup Modal */}
      <Modal visible={showSetup} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Set Up Express Pay</Text>
            <Text style={styles.modalSub}>Enter your MTN Mobile Money or Orange Money number</Text>
            <TextInput
              style={styles.input}
              value={setupAccount}
              onChangeText={setSetupAccount}
              placeholder="+237 6XX XXX XXX"
              keyboardType="phone-pad"
            />
            <TouchableOpacity style={styles.actionBtn} onPress={setupExpressPay} disabled={processing}>
              {processing ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionBtnText}>Enable Express Pay</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowSetup(false)} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Payout Modal */}
      <Modal visible={showPayout} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Request Payout</Text>
            <Text style={styles.modalSub}>Minimum 1,000 XAF · 1.5% fee</Text>
            <TextInput
              style={styles.input}
              value={payoutAmount}
              onChangeText={setPayoutAmount}
              placeholder="Amount in XAF"
              keyboardType="numeric"
            />
            {payoutAmount ? (
              <Text style={styles.feePreview}>
                Fee: {Math.round(parseInt(payoutAmount||0) * 0.015)} XAF ·
                You receive: {Math.round(parseInt(payoutAmount||0) * 0.985).toLocaleString()} XAF
              </Text>
            ) : null}
            <TouchableOpacity style={styles.actionBtn} onPress={requestPayout} disabled={processing}>
              {processing ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionBtnText}>Request Payout</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowPayout(false)} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 50, gap: 12 },
  title: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  heroCard: { margin: 16, padding: 20, backgroundColor: '#1A1A1A', borderRadius: 16, alignItems: 'center' },
  heroTitle: { fontSize: 20, fontWeight: '800', color: '#fff', marginTop: 8 },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginTop: 6 },
  setupContainer: { alignItems: 'center', padding: 32 },
  setupTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A', marginTop: 16 },
  setupSub: { fontSize: 14, color: '#666', textAlign: 'center', marginTop: 8, marginBottom: 20 },
  setupBtn: { backgroundColor: '#FF00BF', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12 },
  setupBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  payoutCard: { margin: 16, padding: 16, backgroundColor: '#FFF0FA', borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  payoutLabel: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  payoutHint: { fontSize: 13, color: '#666', marginTop: 2 },
  payoutBtnSmall: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FF00BF', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10 },
  payoutBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  section: { margin: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', marginBottom: 12 },
  txRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  txIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  txAmt: { fontSize: 14, fontWeight: '700', color: '#1A1A1A' },
  txFee: { fontSize: 12, color: '#999' },
  txDate: { fontSize: 11, color: '#bbb' },
  txStatus: { fontSize: 12, fontWeight: '600' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', borderRadius: 20, padding: 20, margin: 12 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  modalSub: { fontSize: 13, color: '#666', marginBottom: 14 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, marginBottom: 8, fontSize: 15 },
  feePreview: { fontSize: 13, color: '#666', marginBottom: 12, textAlign: 'center' },
  actionBtn: { backgroundColor: '#FF00BF', padding: 14, borderRadius: 12, alignItems: 'center', marginBottom: 8 },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelBtn: { padding: 10, alignItems: 'center' },
  cancelText: { color: '#666', fontWeight: '600' },
});

export default ExpressPayScreen;

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import api from '../services/api';

const XAF = (n) => `${Number(n || 0).toLocaleString()} XAF`;

const PACK_COLORS = {
  Starter:  { bg: '#F0F4FF', border: '#3B82F6', badge: '#3B82F6' },
  Silver:   { bg: '#F5F5F5', border: '#9E9E9E', badge: '#757575' },
  Gold:     { bg: '#FFFBEA', border: '#F59E0B', badge: '#D97706' },
  Platinum: { bg: '#F3E8FF', border: '#8B5CF6', badge: '#7C3AED' },
};
const defaultColor = { bg: '#F0FDF4', border: '#22C55E', badge: '#16A34A' };

export default function WalletPacksScreen({ navigation }) {
  const [packs, setPacks]           = useState([]);
  const [purchases, setPurchases]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab]               = useState('packs'); // 'packs' | 'history'
  const [buying, setBuying]         = useState(null);    // packId being purchased

  const load = async () => {
    try {
      const [packsRes, histRes] = await Promise.all([
        api.get('/payments/wallet-packs'),
        api.get('/payments/wallet-packs/purchases'),
      ]);
      setPacks(packsRes.data.packs || []);
      setPurchases(histRes.data.purchases || []);
    } catch (err) {
      Alert.alert('Error', 'Could not load wallet packs');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleBuy = (pack) => {
    Alert.alert(
      `Buy ${pack.name}`,
      `Pay ${XAF(pack.price_xaf)} and receive ${XAF(pack.total_credit_xaf || pack.credit_xaf + (pack.bonus_xaf || 0))} in your wallet.\n\n${pack.bonus_percent > 0 ? `Includes ${pack.bonus_percent}% bonus!` : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Purchase',
          onPress: async () => {
            setBuying(pack.id);
            try {
              const res = await api.post(`/payments/wallet-packs/${pack.id}/buy`, {
                payment_method: 'wallet',
              });
              Alert.alert(
                'Purchase Successful!',
                `${XAF(res.data.total_credited)} added to your wallet.\n\nNew balance: ${XAF(res.data.wallet_balance)}`,
                [{ text: 'OK', onPress: load }]
              );
            } catch (err) {
              Alert.alert('Purchase Failed', err.response?.data?.error || 'Please try again');
            } finally {
              setBuying(null);
            }
          },
        },
      ]
    );
  };

  const getColors = (name) => {
    const key = Object.keys(PACK_COLORS).find(k => name?.includes(k));
    return key ? PACK_COLORS[key] : defaultColor;
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#E31837" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Wallet Packs</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {['packs', 'history'].map(t => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'packs' ? 'Available Packs' : 'My Purchases'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {tab === 'packs' && (
          <>
            {/* Loyalty bonus notice */}
            <View style={styles.loyaltyBanner}>
              <MaterialIcons name="stars" size={20} color="#D97706" />
              <Text style={styles.loyaltyText}>
                Earn <Text style={styles.loyaltyBold}>400 XAF bonus</Text> for every 20,000 XAF you spend on rides!
              </Text>
            </View>

            {packs.length === 0 ? (
              <Text style={styles.empty}>No packs available right now</Text>
            ) : (
              packs.map(pack => {
                const colors = getColors(pack.name);
                const bonusXAF = Math.round(pack.credit_xaf * pack.bonus_percent / 100);
                const totalCredit = pack.credit_xaf + bonusXAF;
                const isBuying = buying === pack.id;
                return (
                  <View key={pack.id} style={[styles.packCard, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                    {pack.bonus_percent > 0 && (
                      <View style={[styles.bonusBadge, { backgroundColor: colors.badge }]}>
                        <Text style={styles.bonusBadgeText}>+{pack.bonus_percent}% BONUS</Text>
                      </View>
                    )}
                    <Text style={styles.packName}>{pack.name}</Text>
                    {pack.description ? (
                      <Text style={styles.packDesc}>{pack.description}</Text>
                    ) : null}

                    <View style={styles.packAmounts}>
                      <View style={styles.amountRow}>
                        <Text style={styles.amountLabel}>You pay</Text>
                        <Text style={styles.amountValue}>{XAF(pack.price_xaf)}</Text>
                      </View>
                      <View style={styles.amountRow}>
                        <Text style={styles.amountLabel}>Credits</Text>
                        <Text style={styles.amountValue}>{XAF(pack.credit_xaf)}</Text>
                      </View>
                      {bonusXAF > 0 && (
                        <View style={styles.amountRow}>
                          <Text style={[styles.amountLabel, { color: '#16A34A' }]}>Bonus</Text>
                          <Text style={[styles.amountValue, { color: '#16A34A' }]}>+{XAF(bonusXAF)}</Text>
                        </View>
                      )}
                      <View style={[styles.amountRow, styles.totalRow]}>
                        <Text style={styles.totalLabel}>Total credited</Text>
                        <Text style={styles.totalValue}>{XAF(totalCredit)}</Text>
                      </View>
                    </View>

                    {pack.valid_days && (
                      <Text style={styles.validity}>Valid for {pack.valid_days} days</Text>
                    )}

                    <TouchableOpacity
                      style={[styles.buyBtn, { backgroundColor: colors.badge }, isBuying && styles.buyBtnDisabled]}
                      onPress={() => handleBuy({ ...pack, bonus_xaf: bonusXAF, total_credit_xaf: totalCredit })}
                      disabled={isBuying}
                    >
                      {isBuying
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={styles.buyBtnText}>Buy Now — {XAF(pack.price_xaf)}</Text>}
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </>
        )}

        {tab === 'history' && (
          <>
            {purchases.length === 0 ? (
              <Text style={styles.empty}>No purchases yet. Buy a pack to top up your wallet!</Text>
            ) : (
              purchases.map(p => (
                <View key={p.id} style={styles.historyItem}>
                  <View style={styles.historyLeft}>
                    <Text style={styles.historyPack}>{p.pack_name}</Text>
                    <Text style={styles.historyDate}>{new Date(p.created_at).toLocaleDateString()}</Text>
                  </View>
                  <View style={styles.historyRight}>
                    <Text style={styles.historyCredit}>+{XAF(p.total_credited_xaf)}</Text>
                    {p.bonus_xaf > 0 && (
                      <Text style={styles.historyBonus}>incl. {XAF(p.bonus_xaf)} bonus</Text>
                    )}
                    <View style={[styles.statusBadge,
                      { backgroundColor: p.status === 'completed' ? '#DCFCE7' : '#FEE2E2' }]}>
                      <Text style={[styles.statusText,
                        { color: p.status === 'completed' ? '#16A34A' : '#DC2626' }]}>
                        {p.status}
                      </Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  centered:  { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 52, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  backBtn:     { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  tabs:        { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#EEE' },
  tab:         { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive:   { borderBottomWidth: 2, borderBottomColor: '#E31837' },
  tabText:     { fontSize: 14, color: '#666' },
  tabTextActive: { fontWeight: '700', color: '#E31837' },
  scroll:      { flex: 1, padding: 16 },
  loyaltyBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFFBEA', borderRadius: 10, padding: 12,
    marginBottom: 16, borderWidth: 1, borderColor: '#F59E0B',
  },
  loyaltyText: { flex: 1, fontSize: 13, color: '#92400E' },
  loyaltyBold: { fontWeight: '700' },
  packCard: {
    borderRadius: 14, borderWidth: 1.5, padding: 16,
    marginBottom: 16, position: 'relative', overflow: 'hidden',
  },
  bonusBadge: {
    position: 'absolute', top: 12, right: 12,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
  },
  bonusBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  packName:    { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  packDesc:    { fontSize: 13, color: '#666', marginBottom: 12 },
  packAmounts: { backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 10, padding: 12, marginBottom: 12 },
  amountRow:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  amountLabel: { fontSize: 13, color: '#666' },
  amountValue: { fontSize: 13, fontWeight: '600' },
  totalRow:    { borderTopWidth: 1, borderTopColor: '#E5E7EB', marginTop: 6, paddingTop: 6 },
  totalLabel:  { fontSize: 14, fontWeight: '700' },
  totalValue:  { fontSize: 15, fontWeight: '800' },
  validity:    { fontSize: 12, color: '#888', marginBottom: 12 },
  buyBtn:      { borderRadius: 30, paddingVertical: 14, alignItems: 'center' },
  buyBtnDisabled: { opacity: 0.6 },
  buyBtnText:  { color: '#fff', fontWeight: '800', fontSize: 15 },
  empty:       { textAlign: 'center', color: '#888', marginTop: 40, fontSize: 15 },
  historyItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#F0F0F0',
  },
  historyLeft:   { flex: 1 },
  historyPack:   { fontWeight: '700', fontSize: 14 },
  historyDate:   { color: '#888', fontSize: 12, marginTop: 2 },
  historyRight:  { alignItems: 'flex-end' },
  historyCredit: { fontWeight: '800', fontSize: 15, color: '#16A34A' },
  historyBonus:  { fontSize: 11, color: '#16A34A', marginTop: 2 },
  statusBadge:   { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  statusText:    { fontSize: 11, fontWeight: '700' },
});

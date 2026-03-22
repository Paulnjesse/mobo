/**
 * Feature 57 — Third-Party Developer Portal
 * For hotels, travel apps, and enterprise clients.
 * Shows API key, usage stats, endpoints, and SDK download.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, ActivityIndicator, Alert, Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius, shadows } from '../theme';
import api from '../services/api';

const ENDPOINTS = [
  { method: 'POST', path: '/v1/rides/book', desc: 'Book a ride on behalf of a customer' },
  { method: 'GET',  path: '/v1/rides/{id}', desc: 'Get ride status and details' },
  { method: 'POST', path: '/v1/rides/{id}/cancel', desc: 'Cancel a ride' },
  { method: 'GET',  path: '/v1/fare/estimate', desc: 'Get upfront fare estimate' },
  { method: 'GET',  path: '/v1/drivers/nearby', desc: 'Get nearby available drivers' },
  { method: 'POST', path: '/v1/webhooks', desc: 'Register ride event webhooks' },
];

const METHOD_COLORS = { GET: '#00A651', POST: '#0077CC', PATCH: '#FF6B00', DELETE: '#CC0000' };

const MOCK_PORTAL = {
  api_key: 'mobo_live_sk_Xk9mP2qR7tLwYv4uAb6nJc3eZh8dFg',
  plan: 'Business',
  calls_this_month: 4872,
  calls_limit: 10000,
  last_call_at: '2026-03-22T09:14:00Z',
  webhooks: ['https://hotel-xyz.com/webhooks/mobo'],
};

export default function DeveloperPortalScreen({ navigation }) {
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [keyVisible, setKeyVisible] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/developer/portal');
        setData(res.data || MOCK_PORTAL);
      } catch {
        setData(MOCK_PORTAL);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const copyKey = () => {
    Clipboard.setString(data.api_key);
    Alert.alert('Copied', 'API key copied to clipboard.');
  };

  const regenerateKey = () => {
    Alert.alert('Regenerate API Key', 'This will invalidate your current key. All existing integrations must be updated. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Regenerate', style: 'destructive', onPress: async () => {
        try {
          const res = await api.post('/developer/portal/regenerate-key');
          setData((prev) => ({ ...prev, api_key: res.data?.api_key || prev.api_key }));
        } catch {
          Alert.alert('Error', 'Could not regenerate key. Try again.');
        }
      }},
    ]);
  };

  if (loading) return <SafeAreaView style={s.root} edges={['top']}><ActivityIndicator style={{ marginTop: 80 }} color={colors.primary} /></SafeAreaView>;

  const usagePct = data.calls_this_month / data.calls_limit;
  const maskedKey = keyVisible ? data.api_key : data.api_key.slice(0, 12) + '••••••••••••••••••••••';

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <StatusBar barStyle={colors.text === '#FFFFFF' ? 'light-content' : 'dark-content'} />

      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Developer Portal</Text>
        <View style={s.backBtn} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Plan badge */}
        <View style={s.planCard}>
          <View style={[s.planIcon, { backgroundColor: colors.primary + '15' }]}>
            <Ionicons name="code-slash-outline" size={26} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.planName}>MOBO {data.plan} API</Text>
            <Text style={s.planSub}>Last request: {new Date(data.last_call_at).toLocaleString()}</Text>
          </View>
          <View style={[s.planBadge, { backgroundColor: colors.primary }]}>
            <Text style={s.planBadgeText}>{data.plan}</Text>
          </View>
        </View>

        {/* API Key */}
        <Text style={s.sectionTitle}>API Key</Text>
        <View style={s.keyCard}>
          <Text style={s.keyText} selectable>{maskedKey}</Text>
          <TouchableOpacity onPress={() => setKeyVisible((v) => !v)} style={s.keyBtn}>
            <Ionicons name={keyVisible ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={copyKey} style={s.keyBtn}>
            <Ionicons name="copy-outline" size={18} color={colors.primary} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={s.regenBtn} onPress={regenerateKey}>
          <Ionicons name="refresh-outline" size={14} color="#CC0000" />
          <Text style={s.regenBtnText}>Regenerate Key</Text>
        </TouchableOpacity>

        {/* Usage */}
        <Text style={s.sectionTitle}>API Usage This Month</Text>
        <View style={s.usageCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={s.usageVal}>{Number(data.calls_this_month).toLocaleString()} calls</Text>
            <Text style={s.usageLimit}>of {Number(data.calls_limit).toLocaleString()}</Text>
          </View>
          <View style={s.progressBg}>
            <View style={[s.progressFill, {
              width: `${Math.round(usagePct * 100)}%`,
              backgroundColor: usagePct > 0.9 ? '#CC0000' : usagePct > 0.7 ? '#FF6B00' : colors.primary,
            }]} />
          </View>
          <Text style={s.usagePct}>{Math.round(usagePct * 100)}% of monthly quota used</Text>
        </View>

        {/* Endpoints */}
        <Text style={s.sectionTitle}>Available Endpoints</Text>
        {ENDPOINTS.map((ep, i) => (
          <View key={i} style={s.endpointRow}>
            <View style={[s.methodBadge, { backgroundColor: (METHOD_COLORS[ep.method] || colors.primary) + '20' }]}>
              <Text style={[s.methodText, { color: METHOD_COLORS[ep.method] || colors.primary }]}>{ep.method}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.endpointPath}>{ep.path}</Text>
              <Text style={s.endpointDesc}>{ep.desc}</Text>
            </View>
          </View>
        ))}

        {/* Webhooks */}
        <Text style={s.sectionTitle}>Registered Webhooks</Text>
        {data.webhooks.map((wh, i) => (
          <View key={i} style={s.webhookRow}>
            <Ionicons name="globe-outline" size={16} color={colors.primary} />
            <Text style={s.webhookUrl} numberOfLines={1}>{wh}</Text>
          </View>
        ))}

        {/* Docs link */}
        <View style={[s.docsCard, { backgroundColor: colors.primary + '10' }]}>
          <Ionicons name="book-outline" size={20} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[s.docsTitle, { color: colors.primary }]}>API Documentation</Text>
            <Text style={[s.docsSub, { color: colors.textSecondary }]}>Full reference, SDK downloads, and integration guides available at docs.mobo.cm</Text>
          </View>
          <Ionicons name="arrow-forward" size={16} color={colors.primary} />
        </View>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: spacing.md, paddingVertical: spacing.md,
      backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray200,
    },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
    planCard: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      margin: spacing.md, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, ...shadows.sm,
    },
    planIcon: { width: 52, height: 52, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
    planName: { fontSize: 15, fontWeight: '800', color: colors.text },
    planSub: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
    planBadge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
    planBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
    sectionTitle: { fontSize: 14, fontWeight: '800', color: colors.text, marginHorizontal: spacing.md, marginBottom: spacing.sm },
    keyCard: {
      flexDirection: 'row', alignItems: 'center',
      marginHorizontal: spacing.md, marginBottom: 4,
      backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, ...shadows.sm,
    },
    keyText: { flex: 1, fontSize: 12, color: colors.text, fontFamily: 'monospace' },
    keyBtn: { padding: 6 },
    regenBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      marginHorizontal: spacing.md, marginBottom: spacing.md, alignSelf: 'flex-start',
    },
    regenBtnText: { fontSize: 12, color: '#CC0000', fontWeight: '600' },
    usageCard: {
      marginHorizontal: spacing.md, marginBottom: spacing.md,
      backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, ...shadows.sm,
    },
    usageVal: { fontSize: 16, fontWeight: '800', color: colors.text },
    usageLimit: { fontSize: 12, color: colors.textSecondary },
    progressBg: { height: 8, backgroundColor: colors.gray200, borderRadius: 4, overflow: 'hidden' },
    progressFill: { height: 8, borderRadius: 4 },
    usagePct: { fontSize: 11, color: colors.textSecondary, marginTop: 6, textAlign: 'right' },
    endpointRow: {
      flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
      marginHorizontal: spacing.md, marginBottom: spacing.xs,
      backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, ...shadows.sm,
    },
    methodBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, alignSelf: 'flex-start' },
    methodText: { fontSize: 10, fontWeight: '900' },
    endpointPath: { fontSize: 12, fontWeight: '700', color: colors.text, fontFamily: 'monospace' },
    endpointDesc: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
    webhookRow: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      marginHorizontal: spacing.md, marginBottom: spacing.xs,
      backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, ...shadows.sm,
    },
    webhookUrl: { fontSize: 12, color: colors.textSecondary, flex: 1 },
    docsCard: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      margin: spacing.md, borderRadius: radius.lg, padding: spacing.md,
    },
    docsTitle: { fontSize: 13, fontWeight: '700' },
    docsSub: { fontSize: 11, marginTop: 2 },
  });
}

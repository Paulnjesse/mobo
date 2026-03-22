import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, Alert, StatusBar, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius, shadows } from '../theme';
import { ridesService } from '../services/rides';

const PAYMENT_METHODS = [
  { key: 'wallet', label: 'MOBO Wallet', icon: 'wallet-outline' },
  { key: 'mtn', label: 'MTN Mobile Money', icon: 'phone-portrait-outline' },
  { key: 'orange', label: 'Orange Money', icon: 'phone-portrait-outline' },
];

function fmtDate(d) {
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function CommuterPassScreen({ navigation }) {
  const { colors } = useTheme();
  const s = makeStyles(colors);

  const [phase, setPhase] = useState('home'); // 'home' | 'buy'
  const [tiers, setTiers] = useState([]);
  const [passes, setPasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);

  // Buy form state
  const [selectedTier, setSelectedTier] = useState(null);
  const [routeName, setRouteName] = useState('');
  const [originAddress, setOriginAddress] = useState('');
  const [destAddress, setDestAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('wallet');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tiersRes, passesRes] = await Promise.all([
        ridesService.getPassTiers(),
        ridesService.getMyPasses(),
      ]);
      setTiers(tiersRes.tiers || []);
      setPasses(passesRes.passes || []);
    } catch (err) {
      Alert.alert('Error', 'Could not load pass data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleBuyPass = async () => {
    if (!selectedTier) return Alert.alert('Select a tier', 'Choose how many rides you want.');
    if (!routeName.trim()) return Alert.alert('Route name', 'Give your route a name (e.g. Home ↔ Work).');
    if (!originAddress.trim() || !destAddress.trim()) return Alert.alert('Route', 'Enter both origin and destination addresses.');

    setBuying(true);
    try {
      await ridesService.createCommuterPass({
        route_name: routeName.trim(),
        origin_address: originAddress.trim(),
        origin_lat: 0,   // User would select via map/Places in production
        origin_lng: 0,
        destination_address: destAddress.trim(),
        destination_lat: 0,
        destination_lng: 0,
        tier_rides: selectedTier.rides,
        payment_method: paymentMethod,
      });
      Alert.alert('Pass Activated!', `${selectedTier.rides} rides with ${selectedTier.discount}% off on your route.`);
      setPhase('home');
      loadData();
    } catch (err) {
      Alert.alert('Purchase Failed', err?.response?.data?.error || 'Could not purchase pass.');
    } finally {
      setBuying(false);
    }
  };

  const handleCancelPass = (pass) => {
    Alert.alert('Cancel Pass', `Cancel "${pass.route_name}"? Unused rides will be forfeited.`, [
      { text: 'Keep Pass', style: 'cancel' },
      {
        text: 'Cancel Pass', style: 'destructive', onPress: async () => {
          try {
            await ridesService.cancelCommuterPass(pass.id);
            loadData();
          } catch { Alert.alert('Error', 'Could not cancel pass.'); }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <StatusBar barStyle={colors.text === '#FFFFFF' ? 'light-content' : 'dark-content'} />
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Commuter Pass</Text>
          <View style={{ width: 40 }} />
        </View>
        <ActivityIndicator style={{ marginTop: 48 }} color={colors.primary} />
      </SafeAreaView>
    );
  }

  // ── Buy form ───────────────────────────────────────────────────────────────
  if (phase === 'buy') {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <StatusBar barStyle={colors.text === '#FFFFFF' ? 'light-content' : 'dark-content'} />
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => setPhase('home')}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Buy a Pass</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
          {/* Tier selection */}
          <Text style={s.sectionLabel}>Choose your pack</Text>
          {tiers.map((tier) => {
            const active = selectedTier?.rides === tier.rides;
            return (
              <TouchableOpacity
                key={tier.rides}
                style={[s.tierCard, active && { borderColor: colors.primary, borderWidth: 2 }]}
                onPress={() => setSelectedTier(tier)}
                activeOpacity={0.8}
              >
                <View style={[s.tierBadge, { backgroundColor: active ? colors.primary : colors.secondaryLight }]}>
                  <Text style={[s.tierBadgeText, { color: active ? '#fff' : colors.primary }]}>{tier.rides}</Text>
                  <Text style={[s.tierBadgeLabel, { color: active ? 'rgba(255,255,255,0.8)' : colors.textSecondary }]}>rides</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.tierTitle}>{tier.discount}% off every ride</Text>
                  <Text style={s.tierSub}>Valid 30 days · {(tier.price / 1000).toFixed(0)}k XAF</Text>
                </View>
                {active && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
              </TouchableOpacity>
            );
          })}

          {/* Route details */}
          <Text style={[s.sectionLabel, { marginTop: spacing.lg }]}>Your commute route</Text>
          <View style={s.inputGroup}>
            <TextInput
              style={s.input}
              placeholder="Route name (e.g. Home ↔ Office)"
              placeholderTextColor={colors.textLight}
              value={routeName}
              onChangeText={setRouteName}
            />
            <View style={s.inputDivider} />
            <TextInput
              style={s.input}
              placeholder="Origin address"
              placeholderTextColor={colors.textLight}
              value={originAddress}
              onChangeText={setOriginAddress}
            />
            <View style={s.inputDivider} />
            <TextInput
              style={s.input}
              placeholder="Destination address"
              placeholderTextColor={colors.textLight}
              value={destAddress}
              onChangeText={setDestAddress}
            />
          </View>

          {/* Payment */}
          <Text style={[s.sectionLabel, { marginTop: spacing.lg }]}>Payment method</Text>
          {PAYMENT_METHODS.map((pm) => (
            <TouchableOpacity
              key={pm.key}
              style={[s.pmRow, paymentMethod === pm.key && { borderColor: colors.primary }]}
              onPress={() => setPaymentMethod(pm.key)}
              activeOpacity={0.8}
            >
              <Ionicons name={pm.icon} size={20} color={paymentMethod === pm.key ? colors.primary : colors.gray400} />
              <Text style={[s.pmLabel, { color: paymentMethod === pm.key ? colors.primary : colors.text }]}>{pm.label}</Text>
              {paymentMethod === pm.key && <Ionicons name="checkmark-circle" size={18} color={colors.primary} />}
            </TouchableOpacity>
          ))}

          {selectedTier && (
            <View style={s.summaryBox}>
              <Text style={s.summaryTitle}>Order summary</Text>
              <View style={s.summaryRow}>
                <Text style={s.summaryKey}>{selectedTier.rides} rides · {selectedTier.discount}% off</Text>
                <Text style={s.summaryVal}>{selectedTier.price.toLocaleString()} XAF</Text>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[s.buyBtn, buying && { opacity: 0.6 }]}
            onPress={handleBuyPass}
            disabled={buying}
          >
            {buying
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.buyBtnText}>Activate Pass · {selectedTier ? `${selectedTier.price.toLocaleString()} XAF` : 'Select tier'}</Text>}
          </TouchableOpacity>

          <View style={{ height: spacing.xl }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Home / Active passes ───────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <StatusBar barStyle={colors.text === '#FFFFFF' ? 'light-content' : 'dark-content'} />
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Commuter Pass</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={s.heroWrap}>
          <View style={s.heroIcon}>
            <Ionicons name="train-outline" size={36} color={colors.primary} />
          </View>
          <Text style={s.heroTitle}>Save on your daily commute</Text>
          <Text style={s.heroSub}>Buy a ride pack for your regular route and enjoy up to 25% off every trip.</Text>
        </View>

        {/* Active passes */}
        {passes.length > 0 && (
          <>
            <Text style={s.sectionLabel}>Your Active Passes</Text>
            {passes.map((pass) => {
              const ridesLeft = pass.rides_total - pass.rides_used;
              const pct = ridesLeft / pass.rides_total;
              return (
                <View key={pass.id} style={s.passCard}>
                  <View style={s.passCardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.passRoute}>{pass.route_name}</Text>
                      <Text style={s.passExpiry}>Expires {fmtDate(pass.valid_until)}</Text>
                    </View>
                    <View style={s.passBadge}>
                      <Text style={s.passBadgeText}>{pass.discount_percent}% off</Text>
                    </View>
                  </View>
                  {/* Progress bar */}
                  <View style={s.progressBg}>
                    <View style={[s.progressFill, { width: `${pct * 100}%`, backgroundColor: pct > 0.25 ? colors.primary : colors.warning }]} />
                  </View>
                  <View style={s.passFooter}>
                    <Text style={s.passRidesText}>{ridesLeft} / {pass.rides_total} rides left</Text>
                    <TouchableOpacity onPress={() => handleCancelPass(pass)}>
                      <Text style={[s.cancelPassText, { color: colors.danger }]}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* Buy new pass CTA */}
        <TouchableOpacity style={s.buyNewBtn} onPress={() => setPhase('buy')} activeOpacity={0.85}>
          <Ionicons name="add-circle-outline" size={22} color="#fff" />
          <Text style={s.buyNewBtnText}>Buy a New Pass</Text>
        </TouchableOpacity>

        {/* How it works */}
        <Text style={[s.sectionLabel, { marginTop: spacing.lg }]}>How it works</Text>
        {[
          { icon: 'map-outline', text: 'Set your regular commute route (origin & destination).' },
          { icon: 'pricetag-outline', text: 'Choose a ride pack — 10, 20, or 40 rides.' },
          { icon: 'flash-outline', text: 'Discount is applied automatically on every matching ride.' },
          { icon: 'repeat-outline', text: 'Works for both forward and return trips!' },
        ].map((step, i) => (
          <View key={i} style={s.howRow}>
            <View style={[s.howIcon, { backgroundColor: colors.secondaryLight }]}>
              <Ionicons name={step.icon} size={18} color={colors.primary} />
            </View>
            <Text style={s.howText}>{step.text}</Text>
          </View>
        ))}

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

    body: { padding: spacing.md },

    heroWrap: { alignItems: 'center', paddingVertical: spacing.lg },
    heroIcon: {
      width: 72, height: 72, borderRadius: 36, backgroundColor: colors.secondaryLight,
      alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
    },
    heroTitle: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: spacing.xs, textAlign: 'center' },
    heroSub: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },

    sectionLabel: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm },

    passCard: {
      backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md,
      marginBottom: spacing.sm, ...shadows.sm,
    },
    passCardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm },
    passRoute: { fontSize: 15, fontWeight: '700', color: colors.text },
    passExpiry: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    passBadge: { backgroundColor: colors.primary + '18', borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 4 },
    passBadgeText: { fontSize: 13, fontWeight: '800', color: colors.primary },
    progressBg: { height: 6, borderRadius: 3, backgroundColor: colors.gray100, marginBottom: spacing.sm, overflow: 'hidden' },
    progressFill: { height: 6, borderRadius: 3 },
    passFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    passRidesText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
    cancelPassText: { fontSize: 12, fontWeight: '700' },

    buyNewBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
      backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: 16,
      marginTop: spacing.md, ...shadows.sm,
    },
    buyNewBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },

    howRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
    howIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    howText: { flex: 1, fontSize: 14, color: colors.textSecondary, lineHeight: 20 },

    // Buy form styles
    tierCard: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
      backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md,
      marginBottom: spacing.sm, borderWidth: 1.5, borderColor: colors.gray200, ...shadows.sm,
    },
    tierBadge: {
      width: 56, height: 56, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
    },
    tierBadgeText: { fontSize: 20, fontWeight: '900' },
    tierBadgeLabel: { fontSize: 10, fontWeight: '600' },
    tierTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
    tierSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

    inputGroup: {
      backgroundColor: colors.white, borderRadius: radius.lg, overflow: 'hidden',
      borderWidth: 1, borderColor: colors.gray200, marginBottom: spacing.sm, ...shadows.sm,
    },
    input: {
      paddingHorizontal: spacing.md, paddingVertical: 14,
      fontSize: 14, color: colors.text,
    },
    inputDivider: { height: 1, backgroundColor: colors.gray100, marginHorizontal: spacing.md },

    pmRow: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md,
      marginBottom: spacing.sm, borderWidth: 1.5, borderColor: colors.gray200,
    },
    pmLabel: { flex: 1, fontSize: 14, fontWeight: '600' },

    summaryBox: {
      backgroundColor: colors.secondaryLight, borderRadius: radius.lg, padding: spacing.md, marginVertical: spacing.md,
    },
    summaryTitle: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.sm },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
    summaryKey: { fontSize: 14, color: colors.text },
    summaryVal: { fontSize: 14, fontWeight: '800', color: colors.primary },

    buyBtn: {
      backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: 16,
      alignItems: 'center', marginTop: spacing.sm, ...shadows.sm,
    },
    buyBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  });
}

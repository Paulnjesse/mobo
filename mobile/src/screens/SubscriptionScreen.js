import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius, shadows } from '../theme';

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    period: '',
    color: colors.textSecondary,
    features: [
      'Standard ride booking',
      'Cash & mobile money',
      'Basic ride history',
      'Standard support',
    ],
    cta: 'Current Free Plan',
  },
  {
    id: 'basic',
    name: 'Basic',
    price: 5000,
    period: '/mo',
    color: colors.primary,
    popular: false,
    features: [
      'Everything in Free',
      '10% discount on rides',
      'Priority booking',
      'Saved payment methods',
      'Priority support',
    ],
    cta: 'Subscribe · 5,000 XAF/mo',
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 10000,
    period: '/mo',
    color: '#FFB800',
    popular: true,
    features: [
      'Everything in Basic',
      '20% discount on all rides',
      'Dedicated ride type',
      'No surge pricing',
      'Family account (3 members)',
      '24/7 dedicated support',
    ],
    cta: 'Subscribe · 10,000 XAF/mo',
  },
];

export default function SubscriptionScreen({ navigation }) {
  const { user } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState('free');
  const [loading, setLoading] = useState(false);

  const currentPlan = user?.subscription || 'free';

  const handleSubscribe = (plan) => {
    if (plan.id === 'free') return;
    if (plan.id === currentPlan) {
      Alert.alert('Already Subscribed', `You are already on the ${plan.name} plan.`);
      return;
    }
    Alert.alert(
      `Subscribe to ${plan.name}`,
      `You will be charged ${plan.price.toLocaleString()} XAF per month. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Subscribe',
          onPress: async () => {
            setLoading(true);
            // In production: call subscriptionService.subscribe(plan.id)
            await new Promise((r) => setTimeout(r, 1500));
            setLoading(false);
            Alert.alert('Subscribed!', `Welcome to MOBO ${plan.name}!`);
          },
        },
      ]
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
        <Text style={styles.headerTitle}>Subscriptions</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={styles.subtitle}>Choose the plan that works for you</Text>

        {PLANS.map((plan) => {
          const isCurrentPlan = plan.id === currentPlan;
          const isSelected = selectedPlan === plan.id;
          return (
            <TouchableOpacity
              key={plan.id}
              style={[
                styles.planCard,
                isSelected && styles.planCardSelected,
                isSelected && { borderColor: plan.color },
                plan.popular && styles.planCardPopular,
              ]}
              onPress={() => setSelectedPlan(plan.id)}
              activeOpacity={0.85}
            >
              {plan.popular && (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularBadgeText}>Most Popular</Text>
                </View>
              )}
              {isCurrentPlan && (
                <View style={[styles.currentBadge, { backgroundColor: plan.color + '20', borderColor: plan.color }]}>
                  <Text style={[styles.currentBadgeText, { color: plan.color }]}>Current</Text>
                </View>
              )}

              <View style={styles.planHeader}>
                <View>
                  <Text style={[styles.planName, { color: plan.color }]}>{plan.name}</Text>
                  <View style={styles.planPriceRow}>
                    <Text style={styles.planPrice}>
                      {plan.price === 0 ? 'Free' : `${plan.price.toLocaleString()} XAF`}
                    </Text>
                    {plan.period ? <Text style={styles.planPeriod}>{plan.period}</Text> : null}
                  </View>
                </View>
                <View style={[styles.planRadio, isSelected && { borderColor: plan.color }]}>
                  {isSelected && <View style={[styles.planRadioInner, { backgroundColor: plan.color }]} />}
                </View>
              </View>

              <View style={styles.featuresList}>
                {plan.features.map((feature, idx) => (
                  <View key={idx} style={styles.featureRow}>
                    <Ionicons name="checkmark-circle" size={16} color={plan.color} />
                    <Text style={styles.featureText}>{feature}</Text>
                  </View>
                ))}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Footer CTA */}
      <View style={styles.footer}>
        {loading ? (
          <View style={styles.loadingBtn}>
            <ActivityIndicator color={colors.white} />
          </View>
        ) : (
          <TouchableOpacity
            style={[
              styles.ctaBtn,
              selectedPlan === 'free' && styles.ctaBtnDisabled,
            ]}
            onPress={() => {
              const plan = PLANS.find((p) => p.id === selectedPlan);
              if (plan) handleSubscribe(plan);
            }}
            disabled={selectedPlan === 'free'}
            activeOpacity={0.88}
          >
            <Text style={styles.ctaBtnText}>
              {PLANS.find((p) => p.id === selectedPlan)?.cta || 'Select a plan'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
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
  scroll: { padding: spacing.md, paddingBottom: 100 },
  subtitle: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg },
  planCard: {
    backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.lg,
    marginBottom: spacing.md, borderWidth: 2, borderColor: colors.gray200,
    ...shadows.sm, position: 'relative', overflow: 'hidden',
  },
  planCardSelected: { borderWidth: 2 },
  planCardPopular: { borderColor: '#FFB800' },
  popularBadge: {
    position: 'absolute', top: 0, right: 0,
    backgroundColor: '#FFB800', paddingHorizontal: spacing.md, paddingVertical: 5,
    borderBottomLeftRadius: radius.md,
  },
  popularBadgeText: { fontSize: 11, fontWeight: '800', color: colors.white },
  currentBadge: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.sm, paddingVertical: 3,
    borderRadius: radius.round, borderWidth: 1.5, marginBottom: spacing.sm,
  },
  currentBadgeText: { fontSize: 11, fontWeight: '700' },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md },
  planName: { fontSize: 18, fontWeight: '800', marginBottom: 4 },
  planPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  planPrice: { fontSize: 28, fontWeight: '900', color: colors.text },
  planPeriod: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  planRadio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.gray300, alignItems: 'center', justifyContent: 'center' },
  planRadioInner: { width: 12, height: 12, borderRadius: 6 },
  featuresList: { gap: spacing.sm - 2 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  featureText: { fontSize: 14, color: colors.text, flex: 1 },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.white, padding: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.gray200,
  },
  ctaBtn: {
    backgroundColor: colors.primary, borderRadius: radius.pill, height: 56,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  ctaBtnDisabled: { backgroundColor: colors.gray300, shadowOpacity: 0 },
  ctaBtnText: { fontSize: 16, fontWeight: '700', color: colors.white },
  loadingBtn: {
    backgroundColor: colors.primary, borderRadius: radius.pill, height: 56,
    alignItems: 'center', justifyContent: 'center',
  },
});

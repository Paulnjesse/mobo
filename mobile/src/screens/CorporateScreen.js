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
import { colors, spacing, radius, shadows } from '../theme';

const MOCK_CORPORATE = {
  companyName: 'Cameroon Tech Solutions SARL',
  plan: 'Business Pro',
  activeUsers: 12,
  maxUsers: 25,
  monthlyBudget: 500000,
  currentSpend: 312450,
  lastBillingDate: 'Feb 28, 2026',
  nextBillingDate: 'Mar 31, 2026',
  department: 'All Departments',
  expenseApproval: true,
};

const MOCK_TEAM = [
  { id: '1', name: 'Alice Ngo', role: 'Manager', rides: 14, spend: 45000 },
  { id: '2', name: 'Bob Mbe', role: 'Employee', rides: 8, spend: 28000 },
  { id: '3', name: 'Carla Fon', role: 'Employee', rides: 11, spend: 36500 },
  { id: '4', name: 'David Kang', role: 'Employee', rides: 6, spend: 19200 },
];

const BUSINESS_FEATURES = [
  { icon: 'receipt-outline', title: 'Automated Expense Reports', description: 'All rides auto-tagged with project codes and sent to accounting.' },
  { icon: 'people-outline', title: 'Team Management', description: 'Add or remove employees, set spending limits per person.' },
  { icon: 'analytics-outline', title: 'Spend Analytics', description: 'Monthly reports with cost breakdown by team and trip type.' },
  { icon: 'card-outline', title: 'Monthly Billing', description: 'One consolidated invoice per month. Pay by bank transfer or card.' },
  { icon: 'shield-checkmark-outline', title: 'Priority Support', description: 'Dedicated account manager and 24/7 priority customer service.' },
  { icon: 'star-outline', title: 'Priority Matching', description: 'Business accounts get first access to Comfort and Luxury rides.' },
];

export default function CorporateScreen({ navigation }) {
  const [corporate] = useState(MOCK_CORPORATE);
  const [team] = useState(MOCK_TEAM);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'team' | 'expenses'
  const hasCorporate = true; // Set to false to show upgrade CTA

  const budgetUsedPct = Math.round((corporate.currentSpend / corporate.monthlyBudget) * 100);

  const handleUpgrade = () => {
    Alert.alert(
      'Upgrade to Corporate',
      'Contact our business sales team to set up your corporate account.\n\nsales@mobo.cm\n+237 677 000 000',
      [
        { text: 'Close', style: 'cancel' },
        { text: 'Email Sales', onPress: () => {} },
      ]
    );
  };

  const handleAddEmployee = () => {
    Alert.alert('Add Employee', 'Enter the employee\'s phone number to invite them to your corporate account.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send Invite', onPress: () => Alert.alert('Invite Sent!', 'An invitation has been sent.') },
    ]);
  };

  const renderOverview = () => (
    <>
      {/* Company Info */}
      <View style={styles.companyCard}>
        <View style={styles.companyHeader}>
          <View style={styles.companyLogo}>
            <Ionicons name="business" size={28} color={colors.white} />
          </View>
          <View style={styles.companyInfo}>
            <Text style={styles.companyName}>{corporate.companyName}</Text>
            <View style={styles.planBadge}>
              <Ionicons name="star" size={12} color={colors.white} />
              <Text style={styles.planText}>{corporate.plan}</Text>
            </View>
          </View>
        </View>

        <View style={styles.companyStats}>
          <View style={styles.companyStat}>
            <Text style={styles.companyStatValue}>{corporate.activeUsers}</Text>
            <Text style={styles.companyStatLabel}>Active Users</Text>
          </View>
          <View style={styles.companyStatDivider} />
          <View style={styles.companyStat}>
            <Text style={styles.companyStatValue}>{corporate.maxUsers}</Text>
            <Text style={styles.companyStatLabel}>Max Users</Text>
          </View>
          <View style={styles.companyStatDivider} />
          <View style={styles.companyStat}>
            <Text style={styles.companyStatValue}>{budgetUsedPct}%</Text>
            <Text style={styles.companyStatLabel}>Budget Used</Text>
          </View>
        </View>
      </View>

      {/* Monthly Budget */}
      <View style={styles.card}>
        <View style={styles.budgetHeader}>
          <Text style={styles.cardTitle}>Monthly Billing</Text>
          <Text style={styles.billingDate}>Next: {corporate.nextBillingDate}</Text>
        </View>

        <View style={styles.budgetAmounts}>
          <View>
            <Text style={styles.budgetSpent}>{corporate.currentSpend.toLocaleString()} XAF</Text>
            <Text style={styles.budgetLabel}>Spent this month</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.budgetTotal}>{corporate.monthlyBudget.toLocaleString()} XAF</Text>
            <Text style={styles.budgetLabel}>Budget</Text>
          </View>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${Math.min(budgetUsedPct, 100)}%`, backgroundColor: budgetUsedPct > 85 ? colors.danger : colors.primary }]} />
        </View>
        <Text style={styles.budgetRemaining}>
          {(corporate.monthlyBudget - corporate.currentSpend).toLocaleString()} XAF remaining
        </Text>
      </View>

      {/* Business Features */}
      <Text style={styles.sectionTitle}>Business Features</Text>
      <View style={styles.featuresCard}>
        {BUSINESS_FEATURES.map((feat, index) => (
          <View key={index} style={[styles.featureRow, index < BUSINESS_FEATURES.length - 1 && styles.featureRowBorder]}>
            <View style={styles.featureIcon}>
              <Ionicons name={feat.icon} size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.featureTitle}>{feat.title}</Text>
              <Text style={styles.featureDesc}>{feat.description}</Text>
            </View>
          </View>
        ))}
      </View>
    </>
  );

  const renderTeam = () => (
    <>
      <View style={styles.teamHeaderRow}>
        <Text style={styles.teamCount}>{team.length} members</Text>
        <TouchableOpacity style={styles.addMemberBtn} onPress={handleAddEmployee} activeOpacity={0.8}>
          <Ionicons name="person-add-outline" size={16} color={colors.primary} />
          <Text style={styles.addMemberBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      {team.map((member, index) => (
        <View key={member.id} style={[styles.memberCard, { marginBottom: index < team.length - 1 ? spacing.sm : 0 }]}>
          <View style={styles.memberAvatar}>
            <Text style={styles.memberInitial}>{member.name.charAt(0)}</Text>
          </View>
          <View style={styles.memberInfo}>
            <Text style={styles.memberName}>{member.name}</Text>
            <Text style={styles.memberRole}>{member.role}</Text>
          </View>
          <View style={styles.memberStats}>
            <Text style={styles.memberRides}>{member.rides} rides</Text>
            <Text style={styles.memberSpend}>{member.spend.toLocaleString()} XAF</Text>
          </View>
        </View>
      ))}
    </>
  );

  const renderExpenses = () => (
    <>
      <View style={styles.expenseSummaryCard}>
        <Text style={styles.expenseSummaryTitle}>This Month's Expenses</Text>
        <Text style={styles.expenseSummaryAmount}>{corporate.currentSpend.toLocaleString()} XAF</Text>
        <Text style={styles.expenseSummaryLabel}>across {team.reduce((s, m) => s + m.rides, 0)} rides</Text>
      </View>

      <Text style={styles.subsectionLabel}>By Team Member</Text>
      {team.map((member, index) => (
        <View key={member.id} style={styles.expenseRow}>
          <Text style={styles.expenseEmployee}>{member.name}</Text>
          <View style={styles.expenseBarWrap}>
            <View
              style={[styles.expenseBar, { width: `${Math.round((member.spend / corporate.currentSpend) * 100)}%` }]}
            />
          </View>
          <Text style={styles.expenseAmount}>{member.spend.toLocaleString()} XAF</Text>
        </View>
      ))}

      <TouchableOpacity style={styles.exportBtn} activeOpacity={0.8}
        onPress={() => Alert.alert('Export', 'Expense report will be sent to the registered company email.')}>
        <Ionicons name="download-outline" size={18} color={colors.primary} />
        <Text style={styles.exportBtnText}>Export Report (PDF)</Text>
      </TouchableOpacity>
    </>
  );

  if (!hasCorporate) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Corporate Account</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView contentContainerStyle={styles.upgradeContent}>
          <View style={styles.upgradePinkCircle}>
            <Ionicons name="business" size={48} color={colors.white} />
          </View>
          <Text style={styles.upgradeTitle}>MOBO for Business</Text>
          <Text style={styles.upgradeSubtitle}>
            Manage business travel for your entire team with one account
          </Text>
          {BUSINESS_FEATURES.map((feat, i) => (
            <View key={i} style={styles.upgradeFeatureRow}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <Text style={styles.upgradeFeatureText}>{feat.title}</Text>
            </View>
          ))}
          <TouchableOpacity style={styles.upgradeBtn} onPress={handleUpgrade} activeOpacity={0.85}>
            <Text style={styles.upgradeBtnText}>Get Corporate Account</Text>
          </TouchableOpacity>
          <Text style={styles.upgradeContact}>Contact sales@mobo.cm for pricing</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Corporate Account</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {[
          { key: 'overview', label: 'Overview', icon: 'grid-outline' },
          { key: 'team', label: 'Team', icon: 'people-outline' },
          { key: 'expenses', label: 'Expenses', icon: 'receipt-outline' },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
            activeOpacity={0.8}
          >
            <Ionicons name={tab.icon} size={16} color={activeTab === tab.key ? colors.primary : colors.textSecondary} />
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'team' && renderTeam()}
        {activeTab === 'expenses' && renderExpenses()}
        <View style={{ height: spacing.xl }} />
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
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  tabTextActive: { color: colors.primary },
  scrollContent: { padding: spacing.md },
  companyCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.md,
  },
  companyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  companyLogo: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  companyInfo: { flex: 1 },
  companyName: { fontSize: 16, fontWeight: '800', color: colors.white, letterSpacing: -0.2 },
  planBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  planText: { fontSize: 11, fontWeight: '700', color: colors.white },
  companyStats: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  companyStat: { flex: 1, alignItems: 'center' },
  companyStatValue: { fontSize: 22, fontWeight: '900', color: colors.white },
  companyStatLabel: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 2 },
  companyStatDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.25)' },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  budgetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  billingDate: { fontSize: 12, fontWeight: '400', color: colors.textSecondary },
  budgetAmounts: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  budgetSpent: { fontSize: 22, fontWeight: '900', color: colors.text },
  budgetTotal: { fontSize: 18, fontWeight: '700', color: colors.textSecondary },
  budgetLabel: { fontSize: 11, fontWeight: '500', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 2 },
  progressBar: {
    height: 8,
    backgroundColor: colors.gray100,
    borderRadius: 4,
    marginBottom: spacing.xs,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  budgetRemaining: { fontSize: 12, fontWeight: '500', color: colors.textSecondary },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: spacing.sm, marginTop: spacing.sm, letterSpacing: -0.3 },
  featuresCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
  },
  featureRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.gray100 },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,0,191,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  featureTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 2 },
  featureDesc: { fontSize: 12, fontWeight: '400', color: colors.textSecondary, lineHeight: 16 },
  teamHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  teamCount: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  addMemberBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  addMemberBtnText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadows.sm,
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInitial: { fontSize: 18, fontWeight: '800', color: colors.white },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 14, fontWeight: '700', color: colors.text },
  memberRole: { fontSize: 12, fontWeight: '400', color: colors.textSecondary, marginTop: 1 },
  memberStats: { alignItems: 'flex-end' },
  memberRides: { fontSize: 13, fontWeight: '600', color: colors.text },
  memberSpend: { fontSize: 12, fontWeight: '500', color: colors.primary, marginTop: 1 },
  expenseSummaryCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
    ...shadows.md,
  },
  expenseSummaryTitle: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: 0.5 },
  expenseSummaryAmount: { fontSize: 36, fontWeight: '900', color: colors.white, letterSpacing: -1, marginVertical: 4 },
  expenseSummaryLabel: { fontSize: 13, fontWeight: '400', color: 'rgba(255,255,255,0.8)' },
  subsectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.xs,
    ...shadows.sm,
  },
  expenseEmployee: { fontSize: 13, fontWeight: '600', color: colors.text, width: 80 },
  expenseBarWrap: {
    flex: 1,
    height: 8,
    backgroundColor: colors.gray100,
    borderRadius: 4,
    overflow: 'hidden',
  },
  expenseBar: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  expenseAmount: { fontSize: 12, fontWeight: '700', color: colors.text, width: 90, textAlign: 'right' },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: 14,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.white,
  },
  exportBtnText: { fontSize: 15, fontWeight: '700', color: colors.primary },
  // Upgrade screen
  upgradeContent: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  upgradePinkCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    ...shadows.lg,
  },
  upgradeTitle: { fontSize: 28, fontWeight: '900', color: colors.text, textAlign: 'center', letterSpacing: -0.5, marginBottom: spacing.sm },
  upgradeSubtitle: { fontSize: 15, fontWeight: '400', color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg, lineHeight: 22 },
  upgradeFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    width: '100%',
    paddingVertical: 8,
  },
  upgradeFeatureText: { fontSize: 14, fontWeight: '500', color: colors.text },
  upgradeBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 16,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.lg,
    ...shadows.md,
  },
  upgradeBtnText: { fontSize: 16, fontWeight: '800', color: colors.white },
  upgradeContact: { fontSize: 12, fontWeight: '400', color: colors.textSecondary, marginTop: spacing.md },
});

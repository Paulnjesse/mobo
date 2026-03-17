import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  StatusBar,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadows } from '../theme';

const FAQ_TOPICS = [
  {
    category: 'Payment',
    icon: 'card-outline',
    color: colors.primary,
    items: [
      {
        question: 'How do I add a payment method?',
        answer: 'Go to Account → Payment Methods to add Mobile Money (MTN, Orange), bank cards, or cash. You can have multiple methods and set a default.',
      },
      {
        question: 'Why was I charged more than the estimate?',
        answer: 'Fare estimates can change if your route changes, traffic delays occur, or surge pricing activates. The final fare is based on actual trip distance and duration.',
      },
      {
        question: 'How do I get a refund?',
        answer: 'If you believe a charge is incorrect, contact support within 48 hours. Refunds for eligible disputes are processed within 3-5 business days.',
      },
    ],
  },
  {
    category: 'Cancellation',
    icon: 'close-circle-outline',
    color: colors.danger,
    items: [
      {
        question: 'What is the cancellation policy?',
        answer: 'You can cancel a ride for free within 2 minutes of booking. After 2 minutes, a cancellation fee of 500 XAF may apply if a driver has already been assigned.',
      },
      {
        question: 'Why did my driver cancel?',
        answer: 'Drivers may cancel due to emergencies, traffic, or difficulty finding you. If this happens, MOBO will help find you a new driver at no extra charge.',
      },
      {
        question: 'Will I be charged for a cancelled ride?',
        answer: 'Only if you cancel after the free cancellation window. Drivers who cancel are not charged, and you will not be charged for driver cancellations.',
      },
    ],
  },
  {
    category: 'Lost Items',
    icon: 'briefcase-outline',
    color: colors.warning,
    items: [
      {
        question: 'I left something in the car. What do I do?',
        answer: 'Go to your ride history, find the trip, and tap "Report lost item". We will connect you with your driver. MOBO charges a 1,000 XAF retrieval fee if found.',
      },
      {
        question: 'How long does the driver keep lost items?',
        answer: 'Drivers are asked to hold items for 24 hours. If unclaimed, items may be turned in to MOBO lost & found at our Yaoundé office.',
      },
    ],
  },
  {
    category: 'Account',
    icon: 'person-circle-outline',
    color: colors.success,
    items: [
      {
        question: 'How do I change my phone number?',
        answer: 'Go to Account → Settings → Edit Profile. Enter your new number and verify it via OTP. Your account data will be migrated automatically.',
      },
      {
        question: 'Can I have multiple MOBO accounts?',
        answer: 'No. MOBO allows one account per phone number. Contact support if you need to merge accounts.',
      },
      {
        question: 'How do I delete my account?',
        answer: 'Go to Settings → Account → Delete Account. This is permanent and will remove all your data. Pending payments must be settled first.',
      },
    ],
  },
];

const FAQ_ITEM = ({ question, answer }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <TouchableOpacity
      style={styles.faqItem}
      onPress={() => setExpanded(!expanded)}
      activeOpacity={0.8}
    >
      <View style={styles.faqQuestion}>
        <Text style={styles.faqQuestionText}>{question}</Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.textSecondary}
        />
      </View>
      {expanded && (
        <Text style={styles.faqAnswer}>{answer}</Text>
      )}
    </TouchableOpacity>
  );
};

export default function HelpScreen({ navigation }) {
  const [activeCategory, setActiveCategory] = useState(null);
  const [problemText, setProblemText] = useState('');
  const [submittingProblem, setSubmittingProblem] = useState(false);
  const [problemSubmitted, setProblemSubmitted] = useState(false);

  const handleSubmitProblem = () => {
    if (!problemText.trim()) {
      Alert.alert('Empty report', 'Please describe your problem.');
      return;
    }
    setSubmittingProblem(true);
    setTimeout(() => {
      setSubmittingProblem(false);
      setProblemSubmitted(true);
      setProblemText('');
      Alert.alert('Report Submitted', 'Our support team will respond within 24 hours via the Messages tab.');
    }, 1500);
  };

  const handleRateApp = () => {
    // In production: use react-native-rate or Linking to App Store / Play Store
    Alert.alert(
      'Rate MOBO',
      'Thank you for using MOBO! We would love your feedback.',
      [
        { text: 'Later', style: 'cancel' },
        {
          text: 'Rate Now',
          onPress: () => Linking.openURL('https://play.google.com/store/apps/details?id=com.mobo.mobile'),
        },
      ]
    );
  };

  const displayedTopics = activeCategory
    ? FAQ_TOPICS.filter((t) => t.category === activeCategory)
    : FAQ_TOPICS;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Help & Support</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* Contact Options */}
        <Text style={styles.sectionTitle}>Contact Support</Text>
        <View style={styles.contactRow}>
          <TouchableOpacity
            style={styles.contactCard}
            onPress={() => navigation.navigate('Messages')}
            activeOpacity={0.8}
          >
            <View style={[styles.contactIcon, { backgroundColor: 'rgba(255,0,191,0.1)' }]}>
              <Ionicons name="chatbubble-outline" size={22} color={colors.primary} />
            </View>
            <Text style={styles.contactLabel}>Chat</Text>
            <Text style={styles.contactSub}>Instant</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.contactCard}
            onPress={() => Linking.openURL('mailto:support@mobo.cm')}
            activeOpacity={0.8}
          >
            <View style={[styles.contactIcon, { backgroundColor: 'rgba(0,166,81,0.1)' }]}>
              <Ionicons name="mail-outline" size={22} color={colors.success} />
            </View>
            <Text style={styles.contactLabel}>Email</Text>
            <Text style={styles.contactSub}>24h reply</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.contactCard}
            onPress={() => Linking.openURL('tel:+237677000000')}
            activeOpacity={0.8}
          >
            <View style={[styles.contactIcon, { backgroundColor: 'rgba(255,140,0,0.12)' }]}>
              <Ionicons name="call-outline" size={22} color={colors.warning} />
            </View>
            <Text style={styles.contactLabel}>Phone</Text>
            <Text style={styles.contactSub}>Mon-Fri</Text>
          </TouchableOpacity>
        </View>

        {/* FAQ Category Filter */}
        <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryScrollContent}
        >
          <TouchableOpacity
            style={[styles.categoryChip, activeCategory === null && styles.categoryChipActive]}
            onPress={() => setActiveCategory(null)}
            activeOpacity={0.8}
          >
            <Text style={[styles.categoryChipText, activeCategory === null && styles.categoryChipTextActive]}>
              All
            </Text>
          </TouchableOpacity>
          {FAQ_TOPICS.map((topic) => (
            <TouchableOpacity
              key={topic.category}
              style={[styles.categoryChip, activeCategory === topic.category && styles.categoryChipActive]}
              onPress={() => setActiveCategory(activeCategory === topic.category ? null : topic.category)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={topic.icon}
                size={14}
                color={activeCategory === topic.category ? colors.white : topic.color}
              />
              <Text style={[styles.categoryChipText, activeCategory === topic.category && styles.categoryChipTextActive]}>
                {topic.category}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* FAQ Accordion */}
        {displayedTopics.map((topic) => (
          <View key={topic.category} style={styles.faqSection}>
            <View style={styles.faqSectionHeader}>
              <View style={[styles.faqSectionIcon, { backgroundColor: topic.color + '15' }]}>
                <Ionicons name={topic.icon} size={18} color={topic.color} />
              </View>
              <Text style={styles.faqSectionTitle}>{topic.category}</Text>
            </View>
            <View style={styles.faqCard}>
              {topic.items.map((item, index) => (
                <View key={index}>
                  <FAQ_ITEM question={item.question} answer={item.answer} />
                  {index < topic.items.length - 1 && <View style={styles.faqDivider} />}
                </View>
              ))}
            </View>
          </View>
        ))}

        {/* Report a Problem */}
        <Text style={styles.sectionTitle}>Report a Problem</Text>
        <View style={styles.reportCard}>
          {problemSubmitted ? (
            <View style={styles.reportSuccess}>
              <Ionicons name="checkmark-circle" size={32} color={colors.success} />
              <Text style={styles.reportSuccessText}>Report submitted! We'll respond within 24 hours.</Text>
              <TouchableOpacity onPress={() => setProblemSubmitted(false)} activeOpacity={0.7}>
                <Text style={styles.reportAnotherText}>Submit another</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TextInput
                style={styles.problemInput}
                placeholder="Describe your problem..."
                placeholderTextColor={colors.textLight}
                value={problemText}
                onChangeText={setProblemText}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
              <TouchableOpacity
                style={[styles.submitBtn, submittingProblem && styles.submitBtnDisabled]}
                onPress={handleSubmitProblem}
                disabled={submittingProblem}
                activeOpacity={0.85}
              >
                {submittingProblem ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>Send Report</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Rate App */}
        <TouchableOpacity style={styles.rateAppBtn} onPress={handleRateApp} activeOpacity={0.8}>
          <Ionicons name="star-outline" size={20} color={colors.warning} />
          <Text style={styles.rateAppText}>Rate MOBO on the App Store</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.gray300} />
        </TouchableOpacity>

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
  scrollContent: { padding: spacing.md },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
    letterSpacing: -0.3,
  },
  contactRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  contactCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    gap: 6,
    ...shadows.sm,
  },
  contactIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
  contactSub: { fontSize: 11, fontWeight: '400', color: colors.textSecondary },
  categoryScroll: { marginBottom: spacing.md, marginHorizontal: -spacing.md },
  categoryScrollContent: { paddingHorizontal: spacing.md, gap: spacing.sm },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.gray200,
    backgroundColor: colors.white,
  },
  categoryChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  categoryChipText: { fontSize: 13, fontWeight: '600', color: colors.text },
  categoryChipTextActive: { color: colors.white },
  faqSection: { marginBottom: spacing.md },
  faqSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  faqSectionIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faqSectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  faqCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.sm,
  },
  faqItem: { padding: spacing.md },
  faqQuestion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  faqQuestionText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text, lineHeight: 20 },
  faqAnswer: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
    lineHeight: 20,
    marginTop: spacing.sm,
  },
  faqDivider: { height: 1, backgroundColor: colors.gray100, marginHorizontal: spacing.md },
  reportCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  problemInput: {
    borderWidth: 1.5,
    borderColor: colors.gray200,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    color: colors.text,
    minHeight: 120,
    marginBottom: spacing.md,
  },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { fontSize: 15, fontWeight: '800', color: colors.white },
  reportSuccess: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  reportSuccessText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.success,
    textAlign: 'center',
  },
  reportAnotherText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  rateAppBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadows.sm,
    marginBottom: spacing.sm,
  },
  rateAppText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
});

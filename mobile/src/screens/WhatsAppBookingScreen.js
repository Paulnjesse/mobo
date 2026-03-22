/**
 * WhatsAppBookingScreen
 * Guides the user through booking a ride via WhatsApp — useful for
 * users without internet data or who prefer WhatsApp over the app.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../theme';

const WHATSAPP_NUMBER = '237620000000'; // +237 6200-0000
const WHATSAPP_PRETEXT = encodeURIComponent('1'); // Sends "1" to start booking

const STEPS = [
  {
    step: 1,
    icon: 'logo-whatsapp',
    color: '#25d366',
    title: 'Start the conversation',
    desc: 'Tap "Open WhatsApp" below. A chat with MOBO will open with a pre-filled message.',
  },
  {
    step: 2,
    icon: 'send',
    color: colors.primary,
    title: 'Send your pickup location',
    desc: 'Type where you want to be picked up — any landmark or address will work (e.g. "Marché Central, Yaoundé").',
  },
  {
    step: 3,
    icon: 'location',
    color: colors.info,
    title: 'Send your destination',
    desc: 'Type where you\'re going (e.g. "Aéroport de Nsimalen").',
  },
  {
    step: 4,
    icon: 'car',
    color: '#7c3aed',
    title: 'Choose your ride type',
    desc: 'Reply with 1 (Moto), 2 (Standard), or 3 (XL) to select your vehicle.',
  },
  {
    step: 5,
    icon: 'checkmark-circle',
    color: colors.success,
    title: 'Confirm and wait',
    desc: 'Reply YES to confirm. MOBO will find a nearby driver and update you via WhatsApp.',
  },
];

const COMMANDS = [
  { cmd: '1', desc: 'Book a new ride' },
  { cmd: '2', desc: 'Check active ride status' },
  { cmd: '3', desc: 'Cancel latest ride' },
  { cmd: 'HELP', desc: 'Show all options' },
  { cmd: 'CANCEL', desc: 'Reset conversation' },
];

const FAQ = [
  {
    q: 'Do I need mobile data to use WhatsApp booking?',
    a: 'Yes, WhatsApp requires data. For truly offline booking, use our USSD service by dialling *126#.',
  },
  {
    q: 'What if my message is not understood?',
    a: 'Reply CANCEL to reset the conversation, then start again with 1.',
  },
  {
    q: 'Can I pay with Mobile Money via WhatsApp?',
    a: 'Currently WhatsApp bookings are cash on arrival. Open the app to use MoMo payment.',
  },
  {
    q: 'Can I book for someone else via WhatsApp?',
    a: 'Yes — after confirming, send the passenger\'s name and phone number and we\'ll pass it to the driver.',
  },
];

export default function WhatsAppBookingScreen({ navigation }) {
  const [openFaq, setOpenFaq] = useState(null);

  const openWhatsApp = async () => {
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_PRETEXT}`;
    const canOpen = await Linking.canOpenURL(url).catch(() => false);
    if (canOpen) {
      Linking.openURL(url);
    } else {
      Alert.alert(
        'WhatsApp Not Found',
        'Please install WhatsApp to use this feature, or dial *126# to book via USSD instead.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Dial *126#', onPress: () => Linking.openURL('tel:*126%23') },
        ]
      );
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>WhatsApp Booking</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroIconWrap}>
            <Ionicons name="logo-whatsapp" size={54} color="#25d366" />
          </View>
          <Text style={styles.heroTitle}>Book a Ride via WhatsApp</Text>
          <Text style={styles.heroSub}>
            No app? No problem. Chat with MOBO on WhatsApp to book your ride — no login required.
          </Text>
          <TouchableOpacity style={styles.openBtn} onPress={openWhatsApp} activeOpacity={0.85}>
            <Ionicons name="logo-whatsapp" size={20} color="#fff" />
            <Text style={styles.openBtnText}>Open WhatsApp</Text>
          </TouchableOpacity>
          <Text style={styles.numberHint}>MOBO WhatsApp: +237 6200-0000</Text>
        </View>

        {/* How it works */}
        <Text style={styles.sectionTitle}>How It Works</Text>
        {STEPS.map((s) => (
          <View key={s.step} style={styles.stepRow}>
            <View style={[styles.stepCircle, { backgroundColor: s.color + '18' }]}>
              <Ionicons name={s.icon} size={22} color={s.color} />
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>
                <Text style={{ color: s.color }}>Step {s.step}: </Text>{s.title}
              </Text>
              <Text style={styles.stepDesc}>{s.desc}</Text>
            </View>
          </View>
        ))}

        {/* Commands reference */}
        <Text style={styles.sectionTitle}>Quick Commands</Text>
        <View style={styles.commandsCard}>
          {COMMANDS.map((c, i) => (
            <View key={c.cmd} style={[styles.commandRow, i < COMMANDS.length - 1 && styles.commandBorder]}>
              <View style={styles.commandChip}>
                <Text style={styles.commandChipText}>{c.cmd}</Text>
              </View>
              <Text style={styles.commandDesc}>{c.desc}</Text>
            </View>
          ))}
        </View>

        {/* Alternative: USSD */}
        <TouchableOpacity
          style={styles.ussdLink}
          onPress={() => navigation.navigate('USSDBooking')}
          activeOpacity={0.8}
        >
          <Ionicons name="call-outline" size={20} color={colors.primary} />
          <View style={styles.ussdLinkText}>
            <Text style={styles.ussdLinkTitle}>No WhatsApp? Try USSD</Text>
            <Text style={styles.ussdLinkSub}>Dial *126# — works on any phone, no data needed</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.gray300} />
        </TouchableOpacity>

        {/* FAQ */}
        <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
        {FAQ.map((item, i) => (
          <TouchableOpacity
            key={i}
            style={styles.faqItem}
            onPress={() => setOpenFaq(openFaq === i ? null : i)}
            activeOpacity={0.8}
          >
            <View style={styles.faqHeader}>
              <Text style={styles.faqQ}>{item.q}</Text>
              <Ionicons
                name={openFaq === i ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.textSecondary}
              />
            </View>
            {openFaq === i && <Text style={styles.faqA}>{item.a}</Text>}
          </TouchableOpacity>
        ))}

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
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  hero: {
    backgroundColor: colors.white,
    alignItems: 'center',
    padding: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
    marginBottom: spacing.sm,
  },
  heroIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: '#25d36618',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  heroTitle: { fontSize: 22, fontWeight: '900', color: colors.text, marginBottom: spacing.xs, letterSpacing: -0.3 },
  heroSub: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: spacing.lg, paddingHorizontal: spacing.md },
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#25d366',
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.sm,
    shadowColor: '#25d366',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  openBtnText: { fontSize: 17, fontWeight: '800', color: '#fff' },
  numberHint: { fontSize: 12, color: colors.textSecondary },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
    gap: spacing.md,
  },
  stepCircle: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stepContent: { flex: 1, paddingTop: 2 },
  stepTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 4 },
  stepDesc: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  commandsCard: {
    backgroundColor: colors.white,
    marginHorizontal: spacing.md,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.gray200,
    overflow: 'hidden',
  },
  commandRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.md },
  commandBorder: { borderBottomWidth: 1, borderBottomColor: colors.gray200 },
  commandChip: {
    backgroundColor: '#25d36618',
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    minWidth: 52,
    alignItems: 'center',
  },
  commandChipText: { fontSize: 13, fontWeight: '800', color: '#25d366' },
  commandDesc: { flex: 1, fontSize: 14, color: colors.text },
  ussdLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    marginHorizontal: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  ussdLinkText: { flex: 1 },
  ussdLinkTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  ussdLinkSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  faqItem: {
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  faqHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md },
  faqQ: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text, lineHeight: 20 },
  faqA: { fontSize: 13, color: colors.textSecondary, lineHeight: 19, marginTop: spacing.sm },
});

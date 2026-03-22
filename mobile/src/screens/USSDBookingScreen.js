/**
 * Feature — USSD Booking (*126#)
 * Explains how to book a ride via USSD for users without data.
 * Also allows copying the USSD code to dial directly.
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  StatusBar, Linking, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius, shadows } from '../theme';

const USSD_CODE = '*126#';

const STEPS = [
  { step: '1', icon: 'keypad-outline', title: `Dial ${USSD_CODE}`, desc: 'From any phone — no internet required. Works on MTN, Orange, and Nexttel.' },
  { step: '2', icon: 'list-outline', title: 'Select "Book Ride"', desc: 'Press 1 on the USSD menu. You will be prompted to enter your pickup area.' },
  { step: '3', icon: 'location-outline', title: 'Enter Pickup Area', desc: 'Type the name of your area (e.g. "Mokolo") using your phone keypad.' },
  { step: '4', icon: 'navigate-outline', title: 'Enter Destination', desc: 'Enter your destination area code or name as prompted.' },
  { step: '5', icon: 'car-outline', title: 'Confirm & Wait', desc: 'A nearby driver is dispatched. You will receive an SMS with driver name, plate, and ETA.' },
];

const FAQS = [
  { q: 'Do I need mobile data?', a: 'No. USSD works on any phone and network without internet. You only need a mobile signal.' },
  { q: 'How do I pay?', a: 'Payment is via Mobile Money (MTN MoMo or Orange Money). The driver will send a payment request to your number after the ride.' },
  { q: 'Can I cancel a USSD ride?', a: `Yes. Dial ${USSD_CODE}, choose "My Rides", then "Cancel". Or call our hotline: 6200-0000.` },
  { q: 'What areas are supported?', a: 'USSD booking covers Yaoundé and Douala. More cities coming soon.' },
  { q: 'Is USSD pricing the same?', a: 'Yes. USSD rides use the same upfront pricing as the app.' },
];

export default function USSDBookingScreen({ navigation }) {
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const [openFaq, setOpenFaq] = useState(null);

  const dialUSSD = () => {
    const url = Platform.OS === 'android'
      ? `tel:${encodeURIComponent(USSD_CODE)}`
      : `tel:${USSD_CODE.replace('#', encodeURIComponent('#'))}`;
    Linking.canOpenURL(url).then((ok) => {
      if (ok) Linking.openURL(url);
      else Alert.alert('Cannot Dial', 'Please dial ' + USSD_CODE + ' manually from your phone.');
    });
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <StatusBar barStyle={colors.text === '#FFFFFF' ? 'light-content' : 'dark-content'} />

      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>USSD Booking</Text>
        <View style={s.backBtn} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={[s.hero, { backgroundColor: colors.primary }]}>
          <Ionicons name="keypad" size={48} color="#fff" />
          <Text style={s.heroCode}>{USSD_CODE}</Text>
          <Text style={s.heroSub}>Book a ride without internet</Text>
          <TouchableOpacity style={s.dialBtn} onPress={dialUSSD} activeOpacity={0.85}>
            <Ionicons name="call-outline" size={18} color={colors.primary} />
            <Text style={[s.dialBtnText, { color: colors.primary }]}>Tap to Dial Now</Text>
          </TouchableOpacity>
        </View>

        {/* Info bar */}
        <View style={[s.infoBar, { backgroundColor: colors.gray100 }]}>
          <Ionicons name="information-circle-outline" size={14} color={colors.textSecondary} />
          <Text style={s.infoText}>Works on MTN, Orange & Nexttel · No data needed · Available 24/7</Text>
        </View>

        {/* Steps */}
        <Text style={s.sectionTitle}>How It Works</Text>
        {STEPS.map((step) => (
          <View key={step.step} style={s.stepCard}>
            <View style={[s.stepBadge, { backgroundColor: colors.primary }]}>
              <Text style={s.stepBadgeText}>{step.step}</Text>
            </View>
            <View style={[s.stepIcon, { backgroundColor: colors.primary + '15' }]}>
              <Ionicons name={step.icon} size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.stepTitle}>{step.title}</Text>
              <Text style={s.stepDesc}>{step.desc}</Text>
            </View>
          </View>
        ))}

        {/* FAQs */}
        <Text style={s.sectionTitle}>FAQs</Text>
        {FAQS.map((faq, i) => (
          <TouchableOpacity
            key={i}
            style={[s.faqCard, { backgroundColor: colors.white }]}
            onPress={() => setOpenFaq(openFaq === i ? null : i)}
            activeOpacity={0.8}
          >
            <View style={s.faqHeader}>
              <Text style={[s.faqQ, { color: colors.text }]}>{faq.q}</Text>
              <Ionicons name={openFaq === i ? 'chevron-up' : 'chevron-down'} size={16} color={colors.gray400} />
            </View>
            {openFaq === i && (
              <Text style={[s.faqA, { color: colors.textSecondary }]}>{faq.a}</Text>
            )}
          </TouchableOpacity>
        ))}

        {/* Hotline */}
        <View style={[s.hotline, { backgroundColor: colors.white }]}>
          <Ionicons name="headset-outline" size={22} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[s.hotlineTitle, { color: colors.text }]}>Need Help?</Text>
            <Text style={[s.hotlineSub, { color: colors.textSecondary }]}>USSD support hotline: 6200-0000</Text>
          </View>
          <TouchableOpacity
            style={[s.callBtn, { backgroundColor: colors.primary }]}
            onPress={() => Linking.openURL('tel:62000000')}
          >
            <Text style={s.callBtnText}>Call</Text>
          </TouchableOpacity>
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
    hero: {
      alignItems: 'center', paddingVertical: spacing.xl, paddingHorizontal: spacing.md, gap: 8,
    },
    heroCode: { fontSize: 40, fontWeight: '900', color: '#fff', letterSpacing: 2 },
    heroSub: { fontSize: 14, color: 'rgba(255,255,255,0.85)' },
    dialBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: '#fff', borderRadius: radius.pill,
      paddingHorizontal: 24, paddingVertical: 10, marginTop: 8,
    },
    dialBtnText: { fontSize: 14, fontWeight: '800' },
    infoBar: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
      paddingHorizontal: spacing.md, paddingVertical: 8,
    },
    infoText: { fontSize: 11, color: colors.textSecondary, flex: 1 },
    sectionTitle: { fontSize: 14, fontWeight: '800', color: colors.text, marginHorizontal: spacing.md, marginTop: spacing.md, marginBottom: spacing.sm },
    stepCard: {
      flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
      marginHorizontal: spacing.md, marginBottom: spacing.sm,
      backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, ...shadows.sm,
    },
    stepBadge: {
      position: 'absolute', top: -6, left: -6,
      width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    },
    stepBadgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
    stepIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    stepTitle: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 3 },
    stepDesc: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
    faqCard: { marginHorizontal: spacing.md, marginBottom: spacing.xs, borderRadius: radius.lg, padding: spacing.md, ...shadows.sm },
    faqHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    faqQ: { fontSize: 13, fontWeight: '700', flex: 1, paddingRight: 8 },
    faqA: { fontSize: 12, marginTop: 8, lineHeight: 18 },
    hotline: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      margin: spacing.md, borderRadius: radius.lg, padding: spacing.md, ...shadows.sm,
    },
    hotlineTitle: { fontSize: 14, fontWeight: '700' },
    hotlineSub: { fontSize: 12, marginTop: 2 },
    callBtn: { borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 8 },
    callBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  });
}

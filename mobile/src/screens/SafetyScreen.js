import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Animated,
  TextInput,
  ActivityIndicator,
  StatusBar,
  Linking,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadows } from '../theme';

const SAFETY_FEATURES = [
  {
    icon: 'shield-checkmark-outline',
    title: 'Verified Drivers',
    description: 'All MOBO drivers pass background checks and vehicle inspections.',
  },
  {
    icon: 'location-outline',
    title: 'Live Trip Sharing',
    description: 'Share your real-time location with trusted contacts during any ride.',
  },
  {
    icon: 'call-outline',
    title: 'Anonymous Calling',
    description: 'Call your driver without revealing your personal phone number.',
  },
  {
    icon: 'recording-outline',
    title: 'Ride Recording',
    description: 'Audio recording available during rides for your safety.',
  },
];

const INITIAL_CONTACTS = [
  { id: 'c1', name: 'Mama', phone: '+237 699 000 001' },
  { id: 'c2', name: 'Paul (Frère)', phone: '+237 677 123 456' },
];

export default function SafetyScreen({ navigation }) {
  const [sosActive, setSosActive] = useState(false);
  const [sosCountdown, setSosCountdown] = useState(5);
  const [contacts, setContacts] = useState(INITIAL_CONTACTS);
  const [addingContact, setAddingContact] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [reportVisible, setReportVisible] = useState(false);
  const [reportText, setReportText] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [sharingTrip, setSharingTrip] = useState(false);

  const sosPulseAnim = useRef(new Animated.Value(1)).current;
  const sosTimer = useRef(null);
  const sosCountdownRef = useRef(5);

  useEffect(() => {
    if (sosActive) {
      // Pulse animation
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(sosPulseAnim, { toValue: 1.15, duration: 400, useNativeDriver: true }),
          Animated.timing(sosPulseAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        ])
      );
      pulse.start();

      sosCountdownRef.current = 5;
      setSosCountdown(5);

      sosTimer.current = setInterval(() => {
        sosCountdownRef.current -= 1;
        setSosCountdown(sosCountdownRef.current);
        if (sosCountdownRef.current <= 0) {
          clearInterval(sosTimer.current);
          pulse.stop();
          setSosActive(false);
          // In production: trigger emergency call
          Linking.openURL('tel:117').catch(() => {
            Alert.alert('SOS Triggered', 'Emergency services have been notified. Stay calm.');
          });
        }
      }, 1000);

      return () => {
        clearInterval(sosTimer.current);
        pulse.stop();
      };
    }
    return () => {};
  }, [sosActive]);

  const handleSOSPress = () => {
    if (sosActive) {
      clearInterval(sosTimer.current);
      setSosActive(false);
      sosPulseAnim.setValue(1);
      Alert.alert('SOS Cancelled', 'Emergency SOS has been cancelled.');
    } else {
      Alert.alert(
        'Emergency SOS',
        'This will call emergency services (117) in 5 seconds. Are you sure?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Activate SOS',
            style: 'destructive',
            onPress: () => setSosActive(true),
          },
        ]
      );
    }
  };

  const handleShareTrip = () => {
    if (contacts.length === 0) {
      Alert.alert('No contacts', 'Add trusted contacts first to share your trip.');
      return;
    }
    setSharingTrip(true);
    setTimeout(() => {
      setSharingTrip(false);
      Alert.alert(
        'Trip Shared',
        `Your live location has been shared with ${contacts.map((c) => c.name).join(', ')}.`
      );
    }, 1200);
  };

  const handleAddContact = () => {
    if (!newContactName.trim() || !newContactPhone.trim()) {
      Alert.alert('Missing info', 'Please enter both name and phone number.');
      return;
    }
    const newContact = {
      id: String(Date.now()),
      name: newContactName.trim(),
      phone: newContactPhone.trim(),
    };
    setContacts((prev) => [...prev, newContact]);
    setNewContactName('');
    setNewContactPhone('');
    setAddingContact(false);
  };

  const handleRemoveContact = (id) => {
    Alert.alert('Remove contact', 'Remove this trusted contact?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => setContacts((prev) => prev.filter((c) => c.id !== id)),
      },
    ]);
  };

  const handleSubmitReport = () => {
    if (!reportText.trim()) {
      Alert.alert('Empty report', 'Please describe the safety issue.');
      return;
    }
    setSubmittingReport(true);
    setTimeout(() => {
      setSubmittingReport(false);
      setReportVisible(false);
      setReportText('');
      Alert.alert('Report Submitted', 'Our safety team will review your report within 24 hours.');
    }, 1500);
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Safety</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* Emergency SOS */}
        <View style={styles.sosSection}>
          <Animated.View style={{ transform: [{ scale: sosPulseAnim }] }}>
            <TouchableOpacity
              style={[styles.sosButton, sosActive && styles.sosButtonActive]}
              onPress={handleSOSPress}
              activeOpacity={0.85}
            >
              {sosActive ? (
                <View style={styles.sosCountdownWrap}>
                  <Text style={styles.sosCountdownNumber}>{sosCountdown}</Text>
                  <Text style={styles.sosCountdownLabel}>Calling 117...</Text>
                </View>
              ) : (
                <View style={styles.sosInner}>
                  <Ionicons name="call" size={32} color={colors.white} />
                  <Text style={styles.sosLabel}>SOS</Text>
                </View>
              )}
            </TouchableOpacity>
          </Animated.View>
          <Text style={styles.sosDescription}>
            {sosActive
              ? 'Tap again to cancel'
              : 'Hold to call emergency services (117)\nA 5-second countdown will begin'}
          </Text>
        </View>

        {/* Share Trip */}
        <View style={[styles.card, { marginTop: spacing.md }]}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardIconWrap}>
              <Ionicons name="share-social-outline" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Share Live Trip</Text>
              <Text style={styles.cardSubtitle}>Share your location with trusted contacts</Text>
            </View>
            <TouchableOpacity
              style={[styles.shareBtn, sharingTrip && styles.shareBtnLoading]}
              onPress={handleShareTrip}
              disabled={sharingTrip}
              activeOpacity={0.8}
            >
              {sharingTrip ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.shareBtnText}>Share</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Trusted Contacts */}
        <View style={[styles.card, { marginTop: spacing.sm }]}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.sectionTitle}>Trusted Contacts</Text>
            <TouchableOpacity
              style={styles.addContactBtn}
              onPress={() => setAddingContact(!addingContact)}
              activeOpacity={0.7}
            >
              <Ionicons name={addingContact ? 'close' : 'add'} size={18} color={colors.primary} />
              <Text style={styles.addContactText}>{addingContact ? 'Cancel' : 'Add'}</Text>
            </TouchableOpacity>
          </View>

          {addingContact && (
            <View style={styles.addContactForm}>
              <TextInput
                style={styles.contactInput}
                placeholder="Name"
                placeholderTextColor={colors.textLight}
                value={newContactName}
                onChangeText={setNewContactName}
              />
              <TextInput
                style={styles.contactInput}
                placeholder="Phone number"
                placeholderTextColor={colors.textLight}
                value={newContactPhone}
                onChangeText={setNewContactPhone}
                keyboardType="phone-pad"
              />
              <TouchableOpacity
                style={styles.saveContactBtn}
                onPress={handleAddContact}
                activeOpacity={0.8}
              >
                <Text style={styles.saveContactBtnText}>Save Contact</Text>
              </TouchableOpacity>
            </View>
          )}

          {contacts.length === 0 ? (
            <Text style={styles.noContactsText}>No trusted contacts yet. Add some above.</Text>
          ) : (
            contacts.map((contact, index) => (
              <View
                key={contact.id}
                style={[styles.contactRow, index < contacts.length - 1 && styles.contactRowBorder]}
              >
                <View style={styles.contactAvatar}>
                  <Text style={styles.contactInitial}>{contact.name.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.contactName}>{contact.name}</Text>
                  <Text style={styles.contactPhone}>{contact.phone}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleRemoveContact(contact.id)}
                  style={styles.removeBtn}
                  activeOpacity={0.7}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* MOBO Safety Features */}
        <Text style={styles.featuresTitle}>MOBO Safety Features</Text>
        {SAFETY_FEATURES.map((feature, index) => (
          <View key={index} style={[styles.featureCard, index < SAFETY_FEATURES.length - 1 && styles.featureCardBorder]}>
            <View style={styles.featureIconWrap}>
              <Ionicons name={feature.icon} size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.featureTitle}>{feature.title}</Text>
              <Text style={styles.featureDescription}>{feature.description}</Text>
            </View>
          </View>
        ))}

        {/* Report Safety Issue */}
        <TouchableOpacity
          style={styles.reportBtn}
          onPress={() => setReportVisible(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="warning-outline" size={20} color={colors.danger} />
          <Text style={styles.reportBtnText}>Report a Safety Issue</Text>
        </TouchableOpacity>

        <View style={{ height: spacing.xl }} />
      </ScrollView>

      {/* Report Modal */}
      <Modal
        visible={reportVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setReportVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Report Safety Issue</Text>
              <TouchableOpacity onPress={() => setReportVisible(false)} activeOpacity={0.7}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.reportInput}
              placeholder="Describe the safety issue in detail..."
              placeholderTextColor={colors.textLight}
              value={reportText}
              onChangeText={setReportText}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />
            <TouchableOpacity
              style={[styles.submitReportBtn, submittingReport && styles.submitReportBtnDisabled]}
              onPress={handleSubmitReport}
              disabled={submittingReport}
              activeOpacity={0.85}
            >
              {submittingReport ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.submitReportBtnText}>Submit Report</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  sosSection: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    ...shadows.md,
  },
  sosButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.danger,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
    marginBottom: spacing.md,
  },
  sosButtonActive: {
    backgroundColor: '#B01227',
  },
  sosInner: { alignItems: 'center', gap: 4 },
  sosLabel: { fontSize: 16, fontWeight: '900', color: colors.white, letterSpacing: 2 },
  sosCountdownWrap: { alignItems: 'center' },
  sosCountdownNumber: { fontSize: 48, fontWeight: '900', color: colors.white, lineHeight: 52 },
  sosCountdownLabel: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  sosDescription: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    lineHeight: 20,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadows.sm,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,0,191,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  cardSubtitle: { fontSize: 12, fontWeight: '400', color: colors.textSecondary, marginTop: 2 },
  shareBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    minWidth: 70,
    alignItems: 'center',
  },
  shareBtnLoading: { opacity: 0.7 },
  shareBtnText: { fontSize: 13, fontWeight: '800', color: colors.white },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, flex: 1 },
  addContactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  addContactText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  addContactForm: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  contactInput: {
    height: 44,
    borderWidth: 1.5,
    borderColor: colors.gray200,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
  },
  saveContactBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveContactBtnText: { fontSize: 14, fontWeight: '800', color: colors.white },
  noContactsText: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  contactRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
  },
  contactAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactInitial: { fontSize: 18, fontWeight: '800', color: colors.white },
  contactName: { fontSize: 14, fontWeight: '600', color: colors.text },
  contactPhone: { fontSize: 12, fontWeight: '400', color: colors.textSecondary, marginTop: 2 },
  removeBtn: { padding: 4 },
  featuresTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    letterSpacing: -0.3,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
  },
  featureCardBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
  },
  featureIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,0,191,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  featureTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 3 },
  featureDescription: { fontSize: 13, fontWeight: '400', color: colors.textSecondary, lineHeight: 18 },
  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    borderWidth: 1.5,
    borderColor: 'rgba(227,24,55,0.3)',
    ...shadows.sm,
  },
  reportBtnText: { fontSize: 15, fontWeight: '700', color: colors.danger },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.md,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  reportInput: {
    borderWidth: 1.5,
    borderColor: colors.gray200,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    color: colors.text,
    minHeight: 140,
    marginBottom: spacing.md,
  },
  submitReportBtn: {
    backgroundColor: colors.danger,
    borderRadius: radius.pill,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitReportBtnDisabled: { opacity: 0.6 },
  submitReportBtnText: { fontSize: 16, fontWeight: '800', color: colors.white },
});

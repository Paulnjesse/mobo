import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
  ActivityIndicator,
  StatusBar,
  Modal,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadows } from '../theme';
import api from '../services/api';

const MAX_CONTACTS = 5;

export default function TrustedContactsScreen({ navigation }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    fetchContacts();
  }, []);

  const fetchContacts = async () => {
    setLoading(true);
    try {
      const res = await api.get('/users/me/trusted-contacts');
      setContacts(res.data?.contacts || res.data || []);
    } catch (err) {
      // Graceful fallback — stay with empty list
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const errors = {};
    if (!form.name.trim()) errors.name = 'Name is required';
    if (!form.phone.trim()) errors.phone = 'Phone number is required';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddContact = async () => {
    if (!validateForm()) return;
    setSaving(true);
    try {
      const res = await api.post('/users/me/trusted-contacts', {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        notify_on_trip_start: true,
        notify_on_sos: true,
      });
      const newContact = res.data?.contact || res.data;
      setContacts((prev) => [...prev, newContact]);
      setForm({ name: '', phone: '', email: '' });
      setFormErrors({});
      setModalVisible(false);
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not add contact. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (contact, field, value) => {
    // Optimistic update
    setContacts((prev) =>
      prev.map((c) => (c.id === contact.id ? { ...c, [field]: value } : c))
    );
    try {
      await api.patch(`/users/me/trusted-contacts/${contact.id}`, { [field]: value });
    } catch {
      // Revert on error
      setContacts((prev) =>
        prev.map((c) => (c.id === contact.id ? { ...c, [field]: !value } : c))
      );
      Alert.alert('Error', 'Could not update notification setting.');
    }
  };

  const handleDelete = (contact) => {
    Alert.alert(
      'Remove Contact',
      `Remove ${contact.name} from your trusted contacts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setContacts((prev) => prev.filter((c) => c.id !== contact.id));
            try {
              await api.delete(`/users/me/trusted-contacts/${contact.id}`);
            } catch {
              // Re-fetch to restore state
              fetchContacts();
            }
          },
        },
      ]
    );
  };

  const openModal = () => {
    if (contacts.length >= MAX_CONTACTS) {
      Alert.alert(
        'Maximum Reached',
        `You can only have up to ${MAX_CONTACTS} trusted contacts.`
      );
      return;
    }
    setForm({ name: '', phone: '', email: '' });
    setFormErrors({});
    setModalVisible(true);
  };

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name="people-outline" size={56} color={colors.gray300} />
      </View>
      <Text style={styles.emptyTitle}>No Trusted Contacts Yet</Text>
      <Text style={styles.emptySubtitle}>
        Add people who should be notified when your trip starts or when you trigger an SOS alert.
      </Text>
      <TouchableOpacity style={styles.emptyAddBtn} onPress={openModal} activeOpacity={0.8}>
        <Ionicons name="add-circle-outline" size={18} color={colors.white} />
        <Text style={styles.emptyAddBtnText}>Add Your First Contact</Text>
      </TouchableOpacity>
    </View>
  );

  const renderContact = (contact, index) => (
    <View
      key={contact.id || index}
      style={[styles.contactCard, index < contacts.length - 1 && styles.contactCardBorder]}
    >
      <View style={styles.contactAvatarWrap}>
        <Text style={styles.contactInitial}>
          {(contact.name || '?').charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.contactInfo}>
        <Text style={styles.contactName}>{contact.name}</Text>
        <Text style={styles.contactPhone}>{contact.phone}</Text>
        {contact.email ? (
          <Text style={styles.contactEmail}>{contact.email}</Text>
        ) : null}

        <View style={styles.toggleRow}>
          <View style={styles.toggleItem}>
            <Text style={styles.toggleLabel}>Trip Start</Text>
            <Switch
              value={!!contact.notify_on_trip_start}
              onValueChange={(val) => handleToggle(contact, 'notify_on_trip_start', val)}
              trackColor={{ false: colors.gray200, true: 'rgba(59,130,246,0.3)' }}
              thumbColor={contact.notify_on_trip_start ? '#3B82F6' : colors.gray300}
              ios_backgroundColor={colors.gray200}
            />
          </View>
          <View style={styles.toggleDivider} />
          <View style={styles.toggleItem}>
            <Text style={styles.toggleLabel}>SOS Alert</Text>
            <Switch
              value={!!contact.notify_on_sos}
              onValueChange={(val) => handleToggle(contact, 'notify_on_sos', val)}
              trackColor={{ false: colors.gray200, true: 'rgba(227,24,55,0.3)' }}
              thumbColor={contact.notify_on_sos ? colors.danger : colors.gray300}
              ios_backgroundColor={colors.gray200}
            />
          </View>
        </View>
      </View>
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={() => handleDelete(contact)}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="trash-outline" size={20} color={colors.danger} />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trusted Contacts</Text>
        {contacts.length < MAX_CONTACTS ? (
          <TouchableOpacity style={styles.addBtn} onPress={openModal} activeOpacity={0.7}>
            <Ionicons name="add" size={22} color="#3B82F6" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {/* Counter */}
      <View style={styles.counterBanner}>
        <Ionicons name="shield-checkmark-outline" size={16} color="#3B82F6" />
        <Text style={styles.counterText}>
          {contacts.length} / {MAX_CONTACTS} contacts
          {contacts.length >= MAX_CONTACTS ? ' — Maximum reached' : ''}
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading contacts...</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            contacts.length === 0 && styles.scrollContentEmpty,
          ]}
        >
          {contacts.length === 0 ? (
            renderEmpty()
          ) : (
            <>
              <View style={styles.contactsList}>
                {contacts.map((c, i) => renderContact(c, i))}
              </View>

              {contacts.length < MAX_CONTACTS && (
                <TouchableOpacity style={styles.addMoreBtn} onPress={openModal} activeOpacity={0.8}>
                  <Ionicons name="add-circle-outline" size={18} color="#3B82F6" />
                  <Text style={styles.addMoreBtnText}>Add Another Contact</Text>
                </TouchableOpacity>
              )}

              <View style={styles.infoBox}>
                <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
                <Text style={styles.infoText}>
                  Trusted contacts receive a notification with a trip tracking link when your ride starts
                  (if enabled) and an emergency alert if you press SOS.
                </Text>
              </View>
            </>
          )}
        </ScrollView>
      )}

      {/* Add Contact Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              {/* Sheet handle */}
              <View style={styles.sheetHandle} />

              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Add Trusted Contact</Text>
                <TouchableOpacity
                  onPress={() => setModalVisible(false)}
                  activeOpacity={0.7}
                  style={styles.modalCloseBtn}
                >
                  <Ionicons name="close" size={22} color={colors.text} />
                </TouchableOpacity>
              </View>

              {/* Name field */}
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Full Name *</Text>
                <TextInput
                  style={[styles.input, formErrors.name && styles.inputError]}
                  placeholder="e.g. Mama Nkomo"
                  placeholderTextColor={colors.textLight}
                  value={form.name}
                  onChangeText={(t) => {
                    setForm((p) => ({ ...p, name: t }));
                    if (formErrors.name) setFormErrors((p) => ({ ...p, name: null }));
                  }}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
                {formErrors.name ? (
                  <Text style={styles.fieldError}>{formErrors.name}</Text>
                ) : null}
              </View>

              {/* Phone field */}
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Phone Number *</Text>
                <TextInput
                  style={[styles.input, formErrors.phone && styles.inputError]}
                  placeholder="+237 6XX XXX XXX"
                  placeholderTextColor={colors.textLight}
                  value={form.phone}
                  onChangeText={(t) => {
                    setForm((p) => ({ ...p, phone: t }));
                    if (formErrors.phone) setFormErrors((p) => ({ ...p, phone: null }));
                  }}
                  keyboardType="phone-pad"
                  returnKeyType="next"
                />
                {formErrors.phone ? (
                  <Text style={styles.fieldError}>{formErrors.phone}</Text>
                ) : null}
              </View>

              {/* Email field */}
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Email (optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="contact@email.com"
                  placeholderTextColor={colors.textLight}
                  value={form.email}
                  onChangeText={(t) => setForm((p) => ({ ...p, email: t }))}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  returnKeyType="done"
                />
              </View>

              {/* Save button */}
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleAddContact}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <>
                    <Ionicons name="person-add-outline" size={18} color={colors.white} />
                    <Text style={styles.saveBtnText}>Save Contact</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
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
  addBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  counterBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(59,130,246,0.06)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(59,130,246,0.1)',
  },
  counterText: { fontSize: 13, fontWeight: '600', color: '#3B82F6' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  loadingText: { fontSize: 14, color: colors.textSecondary, fontWeight: '500' },
  scrollContent: { padding: spacing.md, paddingBottom: spacing.xxl },
  scrollContentEmpty: { flex: 1 },
  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  emptyIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  emptySubtitle: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.xl,
  },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#3B82F6',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  emptyAddBtnText: { fontSize: 15, fontWeight: '800', color: colors.white },
  // Contact card
  contactsList: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    ...shadows.sm,
    marginBottom: spacing.md,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  contactCardBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
  },
  contactAvatarWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  contactInitial: { fontSize: 18, fontWeight: '800', color: colors.white },
  contactInfo: { flex: 1 },
  contactName: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 2 },
  contactPhone: { fontSize: 13, fontWeight: '400', color: colors.textSecondary },
  contactEmail: { fontSize: 12, fontWeight: '400', color: colors.textLight, marginTop: 1 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  toggleItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  toggleDivider: { width: 1, height: 28, backgroundColor: colors.gray200 },
  toggleLabel: { fontSize: 11, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  deleteBtn: { paddingTop: 2 },
  // Add more / info
  addMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    borderWidth: 1.5,
    borderColor: 'rgba(59,130,246,0.3)',
    borderStyle: 'dashed',
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  addMoreBtnText: { fontSize: 14, fontWeight: '700', color: '#3B82F6' },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  infoText: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  modalSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.md,
    paddingBottom: Platform.OS === 'ios' ? 40 : spacing.xl,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gray300,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  modalCloseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.gray100, alignItems: 'center', justifyContent: 'center' },
  // Form
  fieldWrap: { marginBottom: spacing.md },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    height: 48,
    borderWidth: 1.5,
    borderColor: colors.gray200,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
    backgroundColor: colors.white,
  },
  inputError: { borderColor: colors.danger },
  fieldError: { fontSize: 12, color: colors.danger, marginTop: 4, fontWeight: '500' },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: '#3B82F6',
    borderRadius: radius.pill,
    paddingVertical: 14,
    marginTop: spacing.sm,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 16, fontWeight: '800', color: colors.white },
});

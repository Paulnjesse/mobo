import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  StatusBar,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadows } from '../theme';
import api from '../services/api';

const CATEGORIES = [
  { value: 'overcharge', label: 'Overcharge / Wrong Fare' },
  { value: 'wrong_route', label: 'Wrong Route Taken' },
  { value: 'driver_behavior', label: 'Driver Behavior' },
  { value: 'rider_behavior', label: 'Rider Behavior' },
  { value: 'vehicle_condition', label: 'Vehicle Condition' },
  { value: 'item_damage', label: 'Lost or Damaged Item' },
  { value: 'safety', label: 'Safety Concern' },
  { value: 'other', label: 'Other' },
];

const STATUS_META = {
  open: { label: 'Open', color: colors.warning, bg: 'rgba(255,140,0,0.12)' },
  under_review: { label: 'Under Review', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
  resolved: { label: 'Resolved', color: colors.success, bg: 'rgba(0,166,81,0.12)' },
  dismissed: { label: 'Dismissed', color: colors.gray400, bg: colors.gray100 },
};

const MIN_DESCRIPTION = 20;
const MAX_DESCRIPTION = 500;

export default function DisputeScreen({ navigation, route }) {
  const { rideId, rideInfo } = route.params || {};

  const [activeTab, setActiveTab] = useState('new'); // 'new' | 'history'

  // New dispute form
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // History tab
  const [disputes, setDisputes] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (activeTab === 'history') fetchDisputes();
  }, [activeTab]);

  const fetchDisputes = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await api.get('/rides/disputes/mine');
      setDisputes(res.data?.disputes || res.data || []);
    } catch {
      setDisputes([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const selectedCategory = CATEGORIES.find((c) => c.value === category);

  const handleSubmit = async () => {
    if (!category) {
      Alert.alert('Missing Category', 'Please select a dispute category.');
      return;
    }
    if (description.trim().length < MIN_DESCRIPTION) {
      Alert.alert(
        'Description Too Short',
        `Please provide at least ${MIN_DESCRIPTION} characters describing the issue.`
      );
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/rides/disputes', {
        ride_id: rideId,
        category,
        description: description.trim(),
      });
      setSubmitted(true);
    } catch (err) {
      Alert.alert('Submission Failed', err.message || 'Could not submit dispute. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const descLen = description.length;
  const descValid = descLen >= MIN_DESCRIPTION;

  const renderStatusChip = (status) => {
    const meta = STATUS_META[status] || STATUS_META.open;
    return (
      <View style={[styles.statusChip, { backgroundColor: meta.bg }]}>
        <Text style={[styles.statusChipText, { color: meta.color }]}>{meta.label}</Text>
      </View>
    );
  };

  const renderSuccessState = () => (
    <View style={styles.successWrap}>
      <View style={styles.successIconWrap}>
        <Ionicons name="checkmark-circle" size={64} color={colors.success} />
      </View>
      <Text style={styles.successTitle}>Dispute Submitted</Text>
      <Text style={styles.successBody}>
        Your dispute has been submitted. Our team will review it within 24 hours and follow up via your registered contact.
      </Text>
      <TouchableOpacity
        style={styles.successHistoryBtn}
        onPress={() => {
          setSubmitted(false);
          setActiveTab('history');
        }}
        activeOpacity={0.8}
      >
        <Ionicons name="list-outline" size={18} color="#3B82F6" />
        <Text style={styles.successHistoryBtnText}>View My Disputes</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.successDoneBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
        <Text style={styles.successDoneBtnText}>Done</Text>
      </TouchableOpacity>
    </View>
  );

  const renderNewForm = () => {
    if (submitted) return renderSuccessState();

    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.formContent}>
        {/* Ride info banner */}
        {rideInfo && (
          <View style={styles.rideBanner}>
            <Ionicons name="car-outline" size={16} color="#3B82F6" />
            <Text style={styles.rideBannerText} numberOfLines={1}>
              {rideInfo.pickup || 'Pickup'} → {rideInfo.dropoff || 'Dropoff'}
            </Text>
          </View>
        )}

        {/* Category picker */}
        <Text style={styles.fieldLabel}>Issue Category *</Text>
        <TouchableOpacity
          style={[styles.pickerBtn, !category && styles.pickerBtnEmpty]}
          onPress={() => setCategoryPickerVisible(true)}
          activeOpacity={0.8}
        >
          <Text style={[styles.pickerBtnText, !category && styles.pickerBtnPlaceholder]}>
            {selectedCategory ? selectedCategory.label : 'Select a category...'}
          </Text>
          <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Description */}
        <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>Description *</Text>
        <TextInput
          style={styles.descInput}
          placeholder="Describe what happened in detail. Include as much context as possible to help our team investigate..."
          placeholderTextColor={colors.textLight}
          value={description}
          onChangeText={setDescription}
          multiline
          textAlignVertical="top"
          maxLength={MAX_DESCRIPTION}
        />
        <View style={styles.descMeta}>
          <Text style={[styles.descCount, !descValid && descLen > 0 && styles.descCountWarn]}>
            {descLen}/{MAX_DESCRIPTION}
          </Text>
          {descLen > 0 && !descValid && (
            <Text style={styles.descHint}>
              {MIN_DESCRIPTION - descLen} more characters needed
            </Text>
          )}
        </View>

        {/* Submit button */}
        <TouchableOpacity
          style={[styles.submitBtn, (submitting || !category || !descValid) && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting || !category || !descValid}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <>
              <Ionicons name="send-outline" size={18} color={colors.white} />
              <Text style={styles.submitBtnText}>Submit Dispute</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.disclaimer}>
          <Ionicons name="information-circle-outline" size={15} color={colors.textLight} />
          <Text style={styles.disclaimerText}>
            False disputes may affect your account standing. Please only submit if you have a genuine concern.
          </Text>
        </View>
      </ScrollView>
    );
  };

  const renderHistory = () => {
    if (loadingHistory) {
      return (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading disputes...</Text>
        </View>
      );
    }
    if (disputes.length === 0) {
      return (
        <View style={styles.emptyWrap}>
          <Ionicons name="document-outline" size={48} color={colors.gray300} />
          <Text style={styles.emptyText}>No disputes yet</Text>
          <Text style={styles.emptySubText}>Your submitted disputes will appear here.</Text>
        </View>
      );
    }
    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}>
        {disputes.map((d, i) => {
          const cat = CATEGORIES.find((c) => c.value === d.category);
          const dateStr = d.created_at
            ? new Date(d.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
            : '—';
          return (
            <View key={d.id || i} style={styles.historyCard}>
              <View style={styles.historyCardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyCategory}>{cat?.label || d.category || 'Unknown'}</Text>
                  <Text style={styles.historyDate}>{dateStr} · Ride {String(d.ride_id || '').slice(-6) || rideId}</Text>
                </View>
                {renderStatusChip(d.status)}
              </View>
              <Text style={styles.historyDesc} numberOfLines={3}>
                {d.description}
              </Text>
              {d.resolution && (
                <View style={styles.resolutionBox}>
                  <Text style={styles.resolutionLabel}>Resolution:</Text>
                  <Text style={styles.resolutionText}>{d.resolution}</Text>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dispute a Ride</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'new' && styles.tabActive]}
          onPress={() => setActiveTab('new')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, activeTab === 'new' && styles.tabTextActive]}>
            New Dispute
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'history' && styles.tabActive]}
          onPress={() => setActiveTab('history')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>
            My Disputes
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'new' ? renderNewForm() : renderHistory()}

      {/* Category picker modal */}
      <Modal
        visible={categoryPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCategoryPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.pickerSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.pickerSheetHeader}>
              <Text style={styles.pickerSheetTitle}>Select Category</Text>
              <TouchableOpacity onPress={() => setCategoryPickerVisible(false)} activeOpacity={0.7}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.value}
                style={[styles.pickerOption, category === cat.value && styles.pickerOptionSelected]}
                onPress={() => {
                  setCategory(cat.value);
                  setCategoryPickerVisible(false);
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.pickerOptionText, category === cat.value && styles.pickerOptionTextSelected]}>
                  {cat.label}
                </Text>
                {category === cat.value && (
                  <Ionicons name="checkmark-circle" size={20} color="#3B82F6" />
                )}
              </TouchableOpacity>
            ))}
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
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: '#3B82F6' },
  tabText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  tabTextActive: { color: '#3B82F6', fontWeight: '800' },
  formContent: { padding: spacing.md, paddingBottom: spacing.xxl },
  rideBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.15)',
  },
  rideBannerText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#3B82F6' },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 50,
    borderWidth: 1.5,
    borderColor: colors.gray200,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.white,
  },
  pickerBtnEmpty: { borderColor: colors.gray200 },
  pickerBtnText: { fontSize: 15, fontWeight: '500', color: colors.text },
  pickerBtnPlaceholder: { color: colors.textLight },
  descInput: {
    borderWidth: 1.5,
    borderColor: colors.gray200,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 14,
    color: colors.text,
    minHeight: 160,
    backgroundColor: colors.white,
    lineHeight: 22,
  },
  descMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  descCount: { fontSize: 12, fontWeight: '500', color: colors.textLight },
  descCountWarn: { color: colors.warning },
  descHint: { fontSize: 11, color: colors.warning, fontWeight: '600' },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: '#3B82F6',
    borderRadius: radius.pill,
    paddingVertical: 15,
    ...shadows.md,
  },
  submitBtnDisabled: { opacity: 0.45 },
  submitBtnText: { fontSize: 16, fontWeight: '800', color: colors.white },
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.lg,
  },
  disclaimerText: { flex: 1, fontSize: 12, color: colors.textLight, lineHeight: 16 },
  // Success state
  successWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  successIconWrap: { marginBottom: spacing.lg },
  successTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3,
    marginBottom: spacing.sm,
  },
  successBody: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: spacing.xl,
  },
  successHistoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: '#3B82F6',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    marginBottom: spacing.sm,
    width: '100%',
    justifyContent: 'center',
  },
  successHistoryBtnText: { fontSize: 15, fontWeight: '700', color: '#3B82F6' },
  successDoneBtn: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.text,
    borderRadius: radius.pill,
    paddingVertical: 14,
  },
  successDoneBtnText: { fontSize: 16, fontWeight: '800', color: colors.white },
  // History tab
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  loadingText: { fontSize: 14, color: colors.textSecondary },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
  emptyText: { fontSize: 18, fontWeight: '700', color: colors.text },
  emptySubText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
  historyCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  historyCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  historyCategory: { fontSize: 14, fontWeight: '700', color: colors.text },
  historyDate: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  historyDesc: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  resolutionBox: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    backgroundColor: 'rgba(0,166,81,0.07)',
    borderRadius: radius.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.success,
  },
  resolutionLabel: { fontSize: 11, fontWeight: '700', color: colors.success, textTransform: 'uppercase', letterSpacing: 0.5 },
  resolutionText: { fontSize: 13, color: colors.text, marginTop: 2 },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    flexShrink: 0,
  },
  statusChipText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  // Category picker modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  pickerSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.md,
    paddingBottom: 40,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gray300,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  pickerSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  pickerSheetTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  pickerOptionSelected: { backgroundColor: 'rgba(59,130,246,0.08)' },
  pickerOptionText: { fontSize: 15, fontWeight: '500', color: colors.text },
  pickerOptionTextSelected: { fontWeight: '700', color: '#3B82F6' },
});

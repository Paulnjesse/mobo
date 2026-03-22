import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, Alert, FlatList, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadows } from '../theme';
import { ridesService } from '../services/rides';

export default function FareSplitScreen({ navigation, route }) {
  const { rideId, totalFare, driverName } = route?.params || {};

  const [participants, setParticipants] = useState([{ id: 1, name: '', phone: '' }]);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [splitResult, setSplitResult] = useState(null);

  const splitCount = participants.length + 1; // +1 for the current user
  const amountPerPerson = totalFare ? Math.ceil(totalFare / splitCount) : 0;

  const addParticipant = () => {
    if (participants.length >= 9) return;
    setParticipants((prev) => [...prev, { id: Date.now(), name: '', phone: '' }]);
  };

  const removeParticipant = (id) => {
    if (participants.length <= 1) return;
    setParticipants((prev) => prev.filter((p) => p.id !== id));
  };

  const updateParticipant = (id, field, value) => {
    setParticipants((prev) => prev.map((p) => p.id === id ? { ...p, [field]: value } : p));
  };

  const handleSplit = async () => {
    const valid = participants.every((p) => p.phone.trim().length >= 8);
    if (!valid) {
      Alert.alert('Missing info', 'Please enter a valid phone number for each person.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await ridesService.createFareSplit(
        rideId,
        participants.map((p) => ({ name: p.name, phone: p.phone })),
        note
      );
      setSplitResult(result);
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.error || 'Could not create fare split.');
    } finally {
      setSubmitting(false);
    }
  };

  if (splitResult) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Split Sent!</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.successHero}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark-circle" size={52} color={colors.success} />
            </View>
            <Text style={styles.successTitle}>Fare split created</Text>
            <Text style={styles.successSub}>Payment requests sent to {participants.length} person{participants.length > 1 ? 's' : ''}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Split Summary</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total fare</Text>
              <Text style={styles.summaryValue}>{(totalFare || 0).toLocaleString()} XAF</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Split {splitCount} ways</Text>
              <Text style={styles.summaryHighlight}>{splitResult.amount_per_person.toLocaleString()} XAF each</Text>
            </View>

            <View style={styles.divider} />

            {splitResult.participants?.map((p, idx) => (
              <View key={p.id} style={styles.participantRow}>
                <View style={styles.participantAvatar}>
                  <Text style={styles.participantAvatarText}>{(p.name || p.phone)[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.participantName}>{p.name || `Person ${idx + 1}`}</Text>
                  <Text style={styles.participantPhone}>{p.phone}</Text>
                </View>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusBadgeText}>Pending</Text>
                </View>
              </View>
            ))}
          </View>

          <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.goBack()} activeOpacity={0.85}>
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Split Fare</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Fare summary */}
        <View style={styles.fareHero}>
          <Text style={styles.fareHeroLabel}>Total fare</Text>
          <Text style={styles.fareHeroAmount}>{(totalFare || 0).toLocaleString()} XAF</Text>
          {driverName && <Text style={styles.fareHeroSub}>Ride with {driverName}</Text>}
        </View>

        {/* Per person */}
        <View style={styles.perPersonCard}>
          <View style={styles.splitCountRow}>
            <TouchableOpacity
              style={styles.countBtn}
              onPress={removeParticipant.bind(null, participants[participants.length - 1]?.id)}
              disabled={participants.length <= 1}
            >
              <Ionicons name="remove" size={20} color={participants.length <= 1 ? colors.gray300 : colors.text} />
            </TouchableOpacity>
            <View style={styles.splitCountInfo}>
              <Text style={styles.splitCountNum}>{splitCount}</Text>
              <Text style={styles.splitCountLabel}>people</Text>
            </View>
            <TouchableOpacity
              style={styles.countBtn}
              onPress={addParticipant}
              disabled={participants.length >= 9}
            >
              <Ionicons name="add" size={20} color={participants.length >= 9 ? colors.gray300 : colors.text} />
            </TouchableOpacity>
          </View>
          <Text style={styles.perPersonAmount}>{amountPerPerson.toLocaleString()} XAF</Text>
          <Text style={styles.perPersonLabel}>per person</Text>
        </View>

        {/* Participants */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Who's splitting with you?</Text>
          {participants.map((p, idx) => (
            <View key={p.id} style={styles.participantInput}>
              <View style={styles.participantAvatar}>
                <Text style={styles.participantAvatarText}>{idx + 1}</Text>
              </View>
              <View style={styles.inputsCol}>
                <TextInput
                  style={styles.input}
                  value={p.name}
                  onChangeText={(v) => updateParticipant(p.id, 'name', v)}
                  placeholder={`Person ${idx + 1} name (optional)`}
                  placeholderTextColor={colors.textLight}
                />
                <TextInput
                  style={[styles.input, { marginTop: 6 }]}
                  value={p.phone}
                  onChangeText={(v) => updateParticipant(p.id, 'phone', v)}
                  placeholder="Phone number *"
                  placeholderTextColor={colors.textLight}
                  keyboardType="phone-pad"
                />
              </View>
              {participants.length > 1 && (
                <TouchableOpacity onPress={() => removeParticipant(p.id)} style={styles.removeBtn}>
                  <Ionicons name="close-circle" size={22} color={colors.gray400} />
                </TouchableOpacity>
              )}
            </View>
          ))}

          {participants.length < 9 && (
            <TouchableOpacity style={styles.addPersonBtn} onPress={addParticipant} activeOpacity={0.8}>
              <Ionicons name="person-add-outline" size={18} color={colors.primary} />
              <Text style={styles.addPersonText}>Add another person</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Note */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Note (optional)</Text>
          <TextInput
            style={[styles.input, { minHeight: 60 }]}
            value={note}
            onChangeText={setNote}
            placeholder="e.g. 'Pay me via MTN Money'"
            placeholderTextColor={colors.textLight}
            multiline
          />
        </View>

        <TouchableOpacity
          style={[styles.splitBtn, submitting && { opacity: 0.6 }]}
          onPress={handleSplit}
          disabled={submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Ionicons name="people" size={20} color={colors.white} />
              <Text style={styles.splitBtnText}>Send Split Requests</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray200,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  scroll: { padding: spacing.md },

  fareHero: {
    backgroundColor: colors.white, borderRadius: radius.xl,
    padding: spacing.lg, alignItems: 'center', marginBottom: spacing.sm,
    ...shadows.md,
  },
  fareHeroLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  fareHeroAmount: { fontSize: 40, fontWeight: '900', color: colors.text, letterSpacing: -1.5, marginVertical: 4 },
  fareHeroSub: { fontSize: 13, color: colors.textSecondary },

  perPersonCard: {
    backgroundColor: colors.white, borderRadius: radius.xl,
    padding: spacing.lg, alignItems: 'center', marginBottom: spacing.sm,
    ...shadows.sm,
  },
  splitCountRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl, marginBottom: spacing.md },
  countBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.gray200,
  },
  splitCountInfo: { alignItems: 'center' },
  splitCountNum: { fontSize: 32, fontWeight: '900', color: colors.text },
  splitCountLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },
  perPersonAmount: { fontSize: 28, fontWeight: '900', color: colors.primary, letterSpacing: -1 },
  perPersonLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '500', marginTop: 2 },

  card: {
    backgroundColor: colors.white, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.sm, ...shadows.sm,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: spacing.md },

  participantInput: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.md },
  participantAvatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', marginTop: 6,
  },
  participantAvatarText: { fontSize: 14, fontWeight: '800', color: colors.white },
  inputsCol: { flex: 1 },
  input: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 10,
    fontSize: 14, color: colors.text, borderWidth: 1, borderColor: colors.gray200,
  },
  removeBtn: { paddingTop: 8 },

  addPersonBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, justifyContent: 'center',
    borderTopWidth: 1, borderTopColor: colors.gray100, marginTop: spacing.xs,
  },
  addPersonText: { fontSize: 14, fontWeight: '600', color: colors.primary },

  splitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, borderRadius: radius.pill,
    paddingVertical: 16, marginTop: spacing.sm,
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  splitBtnText: { fontSize: 16, fontWeight: '800', color: colors.white },

  // Success state
  successHero: { alignItems: 'center', paddingVertical: spacing.xl },
  successIcon: { marginBottom: spacing.md },
  successTitle: { fontSize: 22, fontWeight: '900', color: colors.text, marginBottom: 6 },
  successSub: { fontSize: 14, color: colors.textSecondary },

  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  summaryLabel: { fontSize: 14, color: colors.textSecondary },
  summaryValue: { fontSize: 14, fontWeight: '600', color: colors.text },
  summaryHighlight: { fontSize: 15, fontWeight: '800', color: colors.primary },
  divider: { height: 1, backgroundColor: colors.gray200, marginVertical: spacing.sm },

  participantRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  participantName: { fontSize: 14, fontWeight: '600', color: colors.text },
  participantPhone: { fontSize: 12, color: colors.textSecondary },
  statusBadge: {
    backgroundColor: 'rgba(255,165,0,0.12)', borderRadius: radius.pill,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
  },
  statusBadgeText: { fontSize: 11, fontWeight: '700', color: '#E88A00' },

  doneBtn: {
    backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: 16,
    alignItems: 'center', marginTop: spacing.md,
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  doneBtnText: { fontSize: 16, fontWeight: '800', color: colors.white },
});

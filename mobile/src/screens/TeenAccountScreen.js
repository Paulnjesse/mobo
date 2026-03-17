import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../context/LanguageContext';
import Input from '../components/Input';
import { colors, spacing, radius, shadows } from '../theme';

const MOCK_TEENS = [
  {
    id: '1',
    name: 'Marie Dupont',
    phone: '+237 691 234 567',
    age: 15,
    restrictions: ['No night rides'],
    ridesThisMonth: 8,
    active: true,
  },
];

export default function TeenAccountScreen({ navigation }) {
  const { t } = useLanguage();
  const [teens, setTeens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [adding, setAdding] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState('');

  useEffect(() => {
    setTimeout(() => { setTeens(MOCK_TEENS); setLoading(false); }, 400);
  }, []);

  const resetForm = () => { setName(''); setPhone(''); setAge(''); };

  const handleAdd = async () => {
    if (!name.trim() || !phone.trim() || !age.trim()) {
      Alert.alert('Required', 'Please fill in all fields.');
      return;
    }
    const ageNum = parseInt(age, 10);
    if (isNaN(ageNum) || ageNum < 10 || ageNum > 17) {
      Alert.alert('Invalid Age', 'Teen must be between 10 and 17 years old.');
      return;
    }
    setAdding(true);
    await new Promise((r) => setTimeout(r, 800));
    const newTeen = {
      id: String(Date.now()),
      name: name.trim(),
      phone: phone.trim(),
      age: ageNum,
      restrictions: [],
      ridesThisMonth: 0,
      active: true,
    };
    setTeens((prev) => [...prev, newTeen]);
    setAdding(false);
    setShowModal(false);
    resetForm();
  };

  const handleRemove = (id, teenName) => {
    Alert.alert('Remove Teen Account', `Remove ${teenName}'s account?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: () => setTeens((prev) => prev.filter((t) => t.id !== id)),
      },
    ]);
  };

  const renderTeen = ({ item }) => (
    <View style={styles.teenCard}>
      <View style={styles.teenAvatar}>
        <Text style={styles.teenAvatarText}>{item.name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.teenInfo}>
        <View style={styles.teenNameRow}>
          <Text style={styles.teenName}>{item.name}</Text>
          <View style={[styles.activeBadge, !item.active && styles.inactiveBadge]}>
            <Text style={[styles.activeBadgeText, !item.active && styles.inactiveBadgeText]}>
              {item.active ? 'Active' : 'Inactive'}
            </Text>
          </View>
        </View>
        <Text style={styles.teenPhone}>{item.phone} · Age {item.age}</Text>
        <Text style={styles.teenRides}>{item.ridesThisMonth} rides this month</Text>
        {item.restrictions?.length > 0 && (
          <View style={styles.restrictionsRow}>
            {item.restrictions.map((r, i) => (
              <View key={i} style={styles.restrictionChip}>
                <Ionicons name="lock-closed-outline" size={10} color={colors.warning} />
                <Text style={styles.restrictionText}>{r}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
      <TouchableOpacity
        style={styles.removeBtn}
        onPress={() => handleRemove(item.id, item.name)}
        activeOpacity={0.7}
      >
        <Ionicons name="trash-outline" size={18} color={colors.danger} />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Teen Accounts</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={teens}
          keyExtractor={(item) => item.id}
          renderItem={renderTeen}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.infoCard}>
              <View style={styles.infoIcon}>
                <Ionicons name="people-outline" size={24} color={colors.primary} />
              </View>
              <View style={styles.infoTexts}>
                <Text style={styles.infoTitle}>Monitored Rides for Teens</Text>
                <Text style={styles.infoDesc}>Add teen accounts to monitor their rides, set time restrictions, and view trip history.</Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="person-add-outline" size={40} color={colors.gray400} />
              </View>
              <Text style={styles.emptyTitle}>No teen accounts</Text>
              <Text style={styles.emptySubtitle}>Add a teen account to get started</Text>
            </View>
          }
        />
      )}

      {/* Add button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setShowModal(true)}
          activeOpacity={0.88}
        >
          <Ionicons name="person-add-outline" size={20} color={colors.white} />
          <Text style={styles.addBtnText}>Add Teen Account</Text>
        </TouchableOpacity>
      </View>

      {/* Add Modal */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Teen Account</Text>
              <TouchableOpacity style={styles.modalClose} onPress={() => { setShowModal(false); resetForm(); }}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalForm}>
              <Input
                label="Full Name"
                placeholder="Teen's full name"
                value={name}
                onChangeText={setName}
                icon={<Ionicons name="person-outline" size={18} color={colors.gray400} />}
              />
              <Input
                label="Phone Number"
                placeholder="+237 6XX XXX XXX"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                icon={<Ionicons name="call-outline" size={18} color={colors.gray400} />}
              />
              <Input
                label="Age"
                placeholder="e.g. 15"
                value={age}
                onChangeText={setAge}
                keyboardType="number-pad"
                icon={<Ionicons name="calendar-outline" size={18} color={colors.gray400} />}
              />
            </View>

            <TouchableOpacity
              style={[styles.confirmBtn, adding && styles.confirmBtnDisabled]}
              onPress={handleAdd}
              disabled={adding}
              activeOpacity={0.88}
            >
              {adding ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.confirmBtnText}>Add Account</Text>
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
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray200,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: colors.text },
  headerSpacer: { width: 40 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: spacing.md, paddingBottom: 100, flexGrow: 1 },
  infoCard: {
    flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start',
    backgroundColor: 'rgba(255,0,191,0.07)', borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: 'rgba(255,0,191,0.15)',
  },
  infoIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,0,191,0.1)', alignItems: 'center', justifyContent: 'center' },
  infoTexts: { flex: 1 },
  infoTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 4 },
  infoDesc: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  teenCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md,
    backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md,
    marginBottom: spacing.sm, ...shadows.sm,
  },
  teenAvatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  teenAvatarText: { fontSize: 20, fontWeight: '900', color: colors.white },
  teenInfo: { flex: 1 },
  teenNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 3 },
  teenName: { fontSize: 15, fontWeight: '700', color: colors.text },
  activeBadge: { backgroundColor: 'rgba(0,166,81,0.12)', borderRadius: radius.round, paddingHorizontal: 8, paddingVertical: 2 },
  inactiveBadge: { backgroundColor: colors.surface },
  activeBadgeText: { fontSize: 11, fontWeight: '700', color: colors.success },
  inactiveBadgeText: { color: colors.textSecondary },
  teenPhone: { fontSize: 13, color: colors.textSecondary, marginBottom: 2 },
  teenRides: { fontSize: 12, color: colors.textLight },
  restrictionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 4 },
  restrictionChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,140,0,0.1)', borderRadius: radius.round, paddingHorizontal: 7, paddingVertical: 2 },
  restrictionText: { fontSize: 10, fontWeight: '600', color: colors.warning },
  removeBtn: { padding: spacing.xs },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md, ...shadows.sm },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  emptySubtitle: { fontSize: 14, color: colors.textSecondary },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.white, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.gray200 },
  addBtn: {
    backgroundColor: colors.primary, borderRadius: radius.pill, height: 56,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  addBtnText: { fontSize: 16, fontWeight: '700', color: colors.white },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: spacing.xl },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.gray300, alignSelf: 'center', marginTop: spacing.sm },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.gray200,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  modalClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  modalForm: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  confirmBtn: {
    backgroundColor: colors.primary, borderRadius: radius.pill, height: 52,
    alignItems: 'center', justifyContent: 'center',
    marginHorizontal: spacing.lg, marginTop: spacing.md,
  },
  confirmBtnDisabled: { opacity: 0.7 },
  confirmBtnText: { fontSize: 16, fontWeight: '700', color: colors.white },
});

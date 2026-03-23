import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  Modal,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../context/LanguageContext';
import { paymentsService } from '../services/payments';
import Input from '../components/Input';
import { colors, spacing, radius, shadows } from '../theme';

const METHOD_ICONS = {
  mtn: { icon: 'phone-portrait-outline', color: '#FFCB00', label: 'MTN Mobile Money' },
  orange: { icon: 'phone-portrait-outline', color: '#FF6600', label: 'Orange Money' },
  wave: { icon: 'wallet-outline', color: '#0A4BF0', label: 'Wave' },
  card: { icon: 'card-outline', color: colors.text, label: 'Card' },
  cash: { icon: 'cash-outline', color: colors.success, label: 'Cash' },
  apple: { icon: 'logo-apple', color: '#000000', label: 'Apple Pay' },
  google: { icon: 'logo-google', color: '#DB4437', label: 'Google Pay' },
};

const ADD_TYPES = [
  { id: 'mtn', label: 'MTN Mobile Money', icon: 'phone-portrait-outline', color: '#FFCB00' },
  { id: 'orange', label: 'Orange Money', icon: 'phone-portrait-outline', color: '#FF6600' },
  { id: 'wave', label: 'Wave', icon: 'wallet-outline', color: '#0A4BF0' },
  { id: 'card', label: 'Card', icon: 'card-outline', color: colors.text },
  { id: 'apple', label: 'Apple', icon: 'logo-apple', color: '#000000' },
  { id: 'google', label: 'Google', icon: 'logo-google', color: '#DB4437' },
];

export default function PaymentMethodsScreen({ navigation }) {
  const { t } = useLanguage();
  const [methods, setMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addType, setAddType] = useState('mtn');
  const [addPhone, setAddPhone] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => { loadMethods(); }, []);

  const loadMethods = async () => {
    setLoading(true);
    try {
      const result = await paymentsService.listMethods();
      setMethods(result.methods || result.data || result || []);
    } catch (err) {
      setMethods([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSetDefault = async (id) => {
    try {
      await paymentsService.setDefaultMethod(id);
      loadMethods();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to update default');
    }
  };

  const handleDelete = (id) => {
    Alert.alert('Remove Method', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          try {
            await paymentsService.deleteMethod(id);
            loadMethods();
          } catch (err) {
            Alert.alert('Error', err.message || 'Failed to remove');
          }
        },
      },
    ]);
  };

  const handleAdd = async () => {
    if (!addPhone.trim()) { Alert.alert('Required', 'Please enter a phone number'); return; }
    setAdding(true);
    try {
      await paymentsService.addPaymentMethod({ type: addType, phone: addPhone.trim() });
      setShowAddModal(false);
      setAddPhone('');
      loadMethods();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to add method');
    } finally {
      setAdding(false);
    }
  };

  const renderItem = ({ item }) => {
    const meta = METHOD_ICONS[item.type] || { icon: 'card-outline', color: colors.text, label: item.type };
    return (
      <View style={styles.methodCard}>
        <View style={[styles.methodIcon, { backgroundColor: meta.color + '18' }]}>
          <Ionicons name={meta.icon} size={22} color={meta.color} />
        </View>
        <View style={styles.methodInfo}>
          <Text style={styles.methodLabel}>{meta.label}</Text>
          <Text style={styles.methodDetail}>{item.phone || item.last4 ? `•••• ${item.last4 || item.phone?.slice(-4)}` : 'Added'}</Text>
        </View>
        {item.isDefault ? (
          <View style={styles.defaultBadge}>
            <Text style={styles.defaultBadgeText}>Default</Text>
          </View>
        ) : (
          <TouchableOpacity onPress={() => handleSetDefault(item._id || item.id)} activeOpacity={0.7}>
            <Text style={styles.setDefaultText}>Set default</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => handleDelete(item._id || item.id)}
          activeOpacity={0.7}
        >
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
        </TouchableOpacity>
      </View>
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
        <Text style={styles.headerTitle}>{t('paymentMethods')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={methods}
          keyExtractor={(item, idx) => item._id || item.id || String(idx)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIcon}>
                <Ionicons name="card-outline" size={40} color={colors.gray400} />
              </View>
              <Text style={styles.emptyTitle}>{t('noPaymentMethods')}</Text>
              <Text style={styles.emptySubtitle}>{t('addFirstMethod')}</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Add button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setShowAddModal(true)}
          activeOpacity={0.88}
        >
          <Ionicons name="add" size={22} color={colors.white} />
          <Text style={styles.addBtnText}>{t('addPaymentMethod')}</Text>
        </TouchableOpacity>
      </View>

      {/* Add Method Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('addPaymentMethod')}</Text>
              <TouchableOpacity style={styles.modalClose} onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Type selector */}
            <View style={styles.typeRow}>
              {ADD_TYPES.map((type) => (
                <TouchableOpacity
                  key={type.id}
                  style={[styles.typeBtn, addType === type.id && styles.typeBtnActive]}
                  onPress={() => setAddType(type.id)}
                  activeOpacity={0.8}
                >
                  <Ionicons name={type.icon} size={18} color={addType === type.id ? colors.white : type.color} />
                  <Text style={[styles.typeBtnText, addType === type.id && styles.typeBtnTextActive]}>
                    {type.label.split(' ')[0]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalForm}>
              <Input
                label={t('mobileMoneyPhone')}
                placeholder="+237 6XX XXX XXX"
                value={addPhone}
                onChangeText={setAddPhone}
                keyboardType="phone-pad"
                icon={<Ionicons name="call-outline" size={18} color={colors.gray400} />}
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
                <Text style={styles.confirmBtnText}>Add Method</Text>
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
  methodCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md,
    marginBottom: spacing.sm, ...shadows.sm,
  },
  methodIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  methodInfo: { flex: 1 },
  methodLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  methodDetail: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  defaultBadge: {
    backgroundColor: 'rgba(255,0,191,0.1)', borderRadius: radius.round,
    paddingHorizontal: spacing.sm, paddingVertical: 3,
  },
  defaultBadgeText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  setDefaultText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  deleteBtn: { padding: spacing.xs },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
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
  typeRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  typeBtn: {
    flex: 1, alignItems: 'center', paddingVertical: spacing.sm,
    borderRadius: radius.md, borderWidth: 2, borderColor: colors.gray200,
    backgroundColor: colors.surface, gap: spacing.xs,
  },
  typeBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeBtnText: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  typeBtnTextActive: { color: colors.white },
  modalForm: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  confirmBtn: {
    backgroundColor: colors.primary, borderRadius: radius.pill, height: 52,
    alignItems: 'center', justifyContent: 'center', marginHorizontal: spacing.lg, marginTop: spacing.sm,
  },
  confirmBtnDisabled: { opacity: 0.7 },
  confirmBtnText: { fontSize: 16, fontWeight: '700', color: colors.white },
});

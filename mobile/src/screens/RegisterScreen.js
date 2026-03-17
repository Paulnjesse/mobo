import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import Input from '../components/Input';
import { colors, spacing, radius, shadows } from '../theme';

const COUNTRIES = [
  { code: 'CM', name: 'Cameroon', emoji: '🇨🇲' },
  { code: 'NG', name: 'Nigeria', emoji: '🇳🇬' },
  { code: 'SN', name: 'Senegal', emoji: '🇸🇳' },
  { code: 'CI', name: "Côte d'Ivoire", emoji: '🇨🇮' },
  { code: 'GH', name: 'Ghana', emoji: '🇬🇭' },
  { code: 'KE', name: 'Kenya', emoji: '🇰🇪' },
  { code: 'TZ', name: 'Tanzania', emoji: '🇹🇿' },
  { code: 'UG', name: 'Uganda', emoji: '🇺🇬' },
  { code: 'ET', name: 'Ethiopia', emoji: '🇪🇹' },
  { code: 'ZA', name: 'South Africa', emoji: '🇿🇦' },
  { code: 'EG', name: 'Egypt', emoji: '🇪🇬' },
  { code: 'MA', name: 'Morocco', emoji: '🇲🇦' },
  { code: 'DZ', name: 'Algeria', emoji: '🇩🇿' },
  { code: 'TN', name: 'Tunisia', emoji: '🇹🇳' },
  { code: 'ML', name: 'Mali', emoji: '🇲🇱' },
  { code: 'BF', name: 'Burkina Faso', emoji: '🇧🇫' },
  { code: 'NE', name: 'Niger', emoji: '🇳🇪' },
  { code: 'TD', name: 'Chad', emoji: '🇹🇩' },
  { code: 'CD', name: 'DR Congo', emoji: '🇨🇩' },
  { code: 'RW', name: 'Rwanda', emoji: '🇷🇼' },
];

export default function RegisterScreen({ navigation }) {
  const { t } = useLanguage();
  const { register } = useAuth();

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
    country: null,
    role: 'rider',
    termsAccepted: false,
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [countryModal, setCountryModal] = useState(false);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = t('nameRequired');
    if (!form.phone.trim()) e.phone = t('phoneRequired');
    if (!form.email.trim()) e.email = t('emailRequired');
    if (!form.password) e.password = t('passwordRequired');
    else if (form.password.length < 6) e.password = t('passwordMinLength');
    if (!form.country) e.country = t('countryRequired');
    if (!form.termsAccepted) e.terms = t('termsRequired');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleRegister = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      await register({
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        password: form.password,
        country: form.country.code,
        role: form.role,
      });
      navigation.navigate('Verification', { phone: form.phone.trim() });
    } catch (err) {
      Alert.alert('Registration Failed', err.message || t('registrationError'));
    } finally {
      setLoading(false);
    }
  };

  const selectedCountry = COUNTRIES.find((c) => c.code === form.country?.code);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back */}
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>{t('registerTitle')}</Text>
            <Text style={styles.subtitle}>{t('registerSubtitle')}</Text>
          </View>

          {/* Role Selector — pill toggle */}
          <View style={styles.roleRow}>
            <TouchableOpacity
              style={[styles.roleBtn, form.role === 'rider' && styles.roleBtnActive]}
              onPress={() => set('role', 'rider')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="person-outline"
                size={17}
                color={form.role === 'rider' ? colors.white : colors.textSecondary}
              />
              <Text style={[styles.roleBtnText, form.role === 'rider' && styles.roleBtnTextActive]}>
                {t('rideAsPassenger')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.roleBtn, form.role === 'driver' && styles.roleBtnActive]}
              onPress={() => set('role', 'driver')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="car-outline"
                size={17}
                color={form.role === 'driver' ? colors.white : colors.textSecondary}
              />
              <Text style={[styles.roleBtnText, form.role === 'driver' && styles.roleBtnTextActive]}>
                {t('driveWithMobo')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Form fields */}
          <Input
            label={t('fullName')}
            placeholder="John Doe"
            value={form.name}
            onChangeText={(v) => set('name', v)}
            error={errors.name}
            icon={<Ionicons name="person-outline" size={18} color={colors.gray400} />}
          />

          <Input
            label={t('phone')}
            placeholder="+237 6XX XXX XXX"
            value={form.phone}
            onChangeText={(v) => set('phone', v)}
            keyboardType="phone-pad"
            error={errors.phone}
            icon={<Ionicons name="call-outline" size={18} color={colors.gray400} />}
          />

          <Input
            label={t('email')}
            placeholder="you@example.com"
            value={form.email}
            onChangeText={(v) => set('email', v)}
            keyboardType="email-address"
            autoCapitalize="none"
            error={errors.email}
            icon={<Ionicons name="mail-outline" size={18} color={colors.gray400} />}
          />

          <Input
            label={t('password')}
            placeholder="Min. 6 characters"
            value={form.password}
            onChangeText={(v) => set('password', v)}
            secureTextEntry
            error={errors.password}
            icon={<Ionicons name="lock-closed-outline" size={18} color={colors.gray400} />}
          />

          {/* Country picker */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>{t('country')}</Text>
            <TouchableOpacity
              style={[styles.countryPicker, errors.country && styles.pickerError]}
              onPress={() => setCountryModal(true)}
              activeOpacity={0.8}
            >
              {selectedCountry ? (
                <View style={styles.countrySelected}>
                  <Text style={styles.countryEmoji}>{selectedCountry.emoji}</Text>
                  <Text style={styles.countryName}>{selectedCountry.name}</Text>
                </View>
              ) : (
                <Text style={styles.countryPlaceholder}>{t('selectCountry')}</Text>
              )}
              <Ionicons name="chevron-down" size={18} color={colors.gray400} />
            </TouchableOpacity>
            {errors.country && <Text style={styles.errorText}>{errors.country}</Text>}
          </View>

          {/* Terms checkbox */}
          <TouchableOpacity
            style={styles.termsRow}
            onPress={() => set('termsAccepted', !form.termsAccepted)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, form.termsAccepted && styles.checkboxChecked]}>
              {form.termsAccepted && <Ionicons name="checkmark" size={13} color={colors.white} />}
            </View>
            <Text style={styles.termsText}>
              {t('termsAgree')}{' '}
              <Text style={styles.termsLink}>{t('termsLink')}</Text>{' '}
              {t('andPrivacy')}{' '}
              <Text style={styles.termsLink}>{t('privacyLink')}</Text>
            </Text>
          </TouchableOpacity>
          {errors.terms && <Text style={[styles.errorText, styles.errorBottom]}>{errors.terms}</Text>}

          {/* Register button */}
          <TouchableOpacity
            style={[styles.registerBtn, loading && styles.registerBtnDisabled]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.88}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <Text style={styles.registerBtnText}>{t('registerBtn')}</Text>
            )}
          </TouchableOpacity>

          {/* Login link */}
          <View style={styles.loginRow}>
            <Text style={styles.loginText}>{t('alreadyMember')} </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')} activeOpacity={0.7}>
              <Text style={styles.loginLink}>{t('login')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Country Modal */}
      <Modal visible={countryModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('selectCountry')}</Text>
              <TouchableOpacity
                onPress={() => setCountryModal(false)}
                style={styles.modalClose}
              >
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={COUNTRIES}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.countryItem,
                    form.country?.code === item.code && styles.countryItemSelected,
                  ]}
                  onPress={() => {
                    set('country', item);
                    setCountryModal(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.countryEmoji}>{item.emoji}</Text>
                  <Text style={styles.countryItemName}>{item.name}</Text>
                  {form.country?.code === item.code && (
                    <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                  )}
                </TouchableOpacity>
              )}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.white,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    flexGrow: 1,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  header: {
    paddingBottom: spacing.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.xs,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  roleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  roleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.gray200,
    backgroundColor: colors.surface,
  },
  roleBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  roleBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  roleBtnTextActive: {
    color: colors.white,
  },
  fieldContainer: {
    marginBottom: spacing.md,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  countryPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 2,
    minHeight: 52,
  },
  pickerError: {
    borderWidth: 1.5,
    borderColor: colors.danger,
  },
  countrySelected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  countryEmoji: {
    fontSize: 22,
  },
  countryName: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '500',
  },
  countryPlaceholder: {
    fontSize: 15,
    color: colors.textLight,
  },
  errorText: {
    fontSize: 12,
    color: colors.danger,
    marginTop: spacing.xs,
  },
  errorBottom: {
    marginBottom: spacing.sm,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.gray300,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  termsText: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  termsLink: {
    color: colors.primary,
    fontWeight: '600',
  },
  registerBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  registerBtnDisabled: {
    opacity: 0.7,
  },
  registerBtnText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '700',
  },
  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  loginText: {
    fontSize: 15,
    color: colors.textSecondary,
  },
  loginLink: {
    fontSize: 15,
    color: colors.primary,
    fontWeight: '700',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '78%',
    paddingBottom: spacing.xl,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gray300,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md - 2,
  },
  countryItemSelected: {
    backgroundColor: 'rgba(255,0,191,0.05)',
  },
  countryItemName: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    fontWeight: '400',
  },
});

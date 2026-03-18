import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing } from '../../theme';

const COUNTRY_CODES = [
  { code: '+237', country: 'CM', flag: '🇨🇲', name: 'Cameroon' },
  { code: '+234', country: 'NG', flag: '🇳🇬', name: 'Nigeria' },
  { code: '+254', country: 'KE', flag: '🇰🇪', name: 'Kenya' },
  { code: '+233', country: 'GH', flag: '🇬🇭', name: 'Ghana' },
  { code: '+225', country: 'CI', flag: '🇨🇮', name: 'Ivory Coast' },
  { code: '+241', country: 'GA', flag: '🇬🇦', name: 'Gabon' },
  { code: '+229', country: 'BJ', flag: '🇧🇯', name: 'Benin' },
  { code: '+227', country: 'NE', flag: '🇳🇪', name: 'Niger' },
  { code: '+27',  country: 'ZA', flag: '🇿🇦', name: 'South Africa' },
];

const COUNTRIES = [
  'Cameroon', 'Nigeria', 'Kenya', 'Ghana', 'Ivory Coast',
  'Gabon', 'Benin', 'Niger', 'South Africa',
];

const TOTAL_STEPS = 3;

function ProgressBar({ step, total }) {
  return (
    <View style={styles.progressContainer}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${(step / total) * 100}%` }]} />
      </View>
      <Text style={styles.progressLabel}>Step {step} of {total}</Text>
    </View>
  );
}

function StepIndicator({ current, total }) {
  return (
    <View style={styles.stepIndicator}>
      {Array.from({ length: total }).map((_, i) => {
        const stepNum = i + 1;
        const done = stepNum < current;
        const active = stepNum === current;
        return (
          <View key={stepNum} style={styles.stepDotWrap}>
            <View
              style={[
                styles.stepDot,
                done && styles.stepDotDone,
                active && styles.stepDotActive,
              ]}
            >
              {done ? (
                <Ionicons name="checkmark" size={10} color="#fff" />
              ) : (
                <Text style={[styles.stepDotText, active && styles.stepDotTextActive]}>
                  {stepNum}
                </Text>
              )}
            </View>
            {i < total - 1 && (
              <View style={[styles.stepLine, done && styles.stepLineDone]} />
            )}
          </View>
        );
      })}
    </View>
  );
}

export default function FleetOwnerRegisterScreen({ navigation }) {
  const { registerFleetOwner } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [form, setForm] = useState({
    countryCode: '+237',
    phone: '',
    full_name: '',
    email: '',
    password: '',
    confirmPassword: '',
    company_name: '',
    business_reg_number: '',
    city: '',
    country: 'Cameroon',
  });

  const [errors, setErrors] = useState({});

  const update = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: null }));
  };

  const validateStep = (s) => {
    const newErrors = {};
    if (s === 1) {
      if (!form.phone || form.phone.length < 8) newErrors.phone = 'Enter a valid phone number';
      if (!form.full_name || form.full_name.trim().length < 2) newErrors.full_name = 'Enter your full name';
      if (!form.password || form.password.length < 6) newErrors.password = 'Password must be at least 6 characters';
      if (form.password !== form.confirmPassword) newErrors.confirmPassword = 'Passwords do not match';
      if (!form.company_name || form.company_name.trim().length < 2) newErrors.company_name = 'Fleet / company name is required';
    }
    if (s === 3) {
      if (!termsAccepted) newErrors.terms = 'You must accept the terms to continue';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () => {
    if (validateStep(step)) setStep((s) => s + 1);
  };

  const handleSubmit = async () => {
    if (!validateStep(3)) return;
    setLoading(true);
    try {
      const fullPhone = form.countryCode + form.phone.replace(/^0/, '');
      await registerFleetOwner({
        full_name: form.full_name.trim(),
        phone: fullPhone,
        email: form.email.trim() || undefined,
        password: form.password,
        role: 'fleet_owner',
        company_name: form.company_name.trim(),
        business_reg_number: form.business_reg_number || undefined,
        city: form.city || undefined,
        country: form.country,
      });
      navigation.navigate('Verification', { phone: fullPhone, role: 'fleet_owner' });
    } catch (err) {
      Alert.alert('Registration Failed', err?.message || 'Please try again');
    } finally {
      setLoading(false);
    }
  };

  const selectedCountry = COUNTRY_CODES.find((c) => c.code === form.countryCode) || COUNTRY_CODES[0];

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <View>
            <Text style={styles.stepTitle}>Personal Information</Text>
            <Text style={styles.stepSubtitle}>Your contact details and fleet name</Text>

            <Text style={styles.label}>Phone Number</Text>
            <View style={[styles.phoneRow, errors.phone && styles.inputError]}>
              <TouchableOpacity
                style={styles.countryCodeBtn}
                onPress={() => setShowCountryPicker(!showCountryPicker)}
                activeOpacity={0.7}
              >
                <Text style={styles.flagText}>{selectedCountry.flag}</Text>
                <Text style={styles.countryCodeText}>{selectedCountry.code}</Text>
                <Ionicons name="chevron-down" size={14} color="#888" />
              </TouchableOpacity>
              <TextInput
                style={styles.phoneInput}
                value={form.phone}
                onChangeText={(v) => update('phone', v)}
                placeholder="6XX XXX XXX"
                keyboardType="phone-pad"
                placeholderTextColor="#C0C0C0"
              />
            </View>
            {errors.phone && <Text style={styles.errorText}>{errors.phone}</Text>}

            {showCountryPicker && (
              <View style={styles.countryDropdown}>
                {COUNTRY_CODES.map((c) => (
                  <TouchableOpacity
                    key={c.code}
                    style={[styles.countryOption, form.countryCode === c.code && styles.countryOptionSelected]}
                    onPress={() => { update('countryCode', c.code); setShowCountryPicker(false); }}
                  >
                    <Text style={styles.flagText}>{c.flag}</Text>
                    <Text style={styles.countryName}>{c.name}</Text>
                    <Text style={styles.countryCodeLabel}>{c.code}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={styles.label}>Full Name</Text>
            <TextInput
              style={[styles.input, errors.full_name && styles.inputError]}
              value={form.full_name}
              onChangeText={(v) => update('full_name', v)}
              placeholder="Your full name"
              placeholderTextColor="#C0C0C0"
              autoCapitalize="words"
            />
            {errors.full_name && <Text style={styles.errorText}>{errors.full_name}</Text>}

            <Text style={styles.label}>Email <Text style={styles.optional}>(optional)</Text></Text>
            <TextInput
              style={styles.input}
              value={form.email}
              onChangeText={(v) => update('email', v)}
              placeholder="you@example.com"
              placeholderTextColor="#C0C0C0"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.label}>Password</Text>
            <View style={[styles.passwordRow, errors.password && styles.inputError]}>
              <TextInput
                style={styles.passwordInput}
                value={form.password}
                onChangeText={(v) => update('password', v)}
                placeholder="At least 6 characters"
                placeholderTextColor="#C0C0C0"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} activeOpacity={0.7}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#888" />
              </TouchableOpacity>
            </View>
            {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}

            <Text style={styles.label}>Confirm Password</Text>
            <View style={[styles.passwordRow, errors.confirmPassword && styles.inputError]}>
              <TextInput
                style={styles.passwordInput}
                value={form.confirmPassword}
                onChangeText={(v) => update('confirmPassword', v)}
                placeholder="Repeat password"
                placeholderTextColor="#C0C0C0"
                secureTextEntry={true}
                autoCapitalize="none"
              />
            </View>
            {errors.confirmPassword && <Text style={styles.errorText}>{errors.confirmPassword}</Text>}

            <Text style={styles.label}>Fleet / Company Name</Text>
            <TextInput
              style={[styles.input, errors.company_name && styles.inputError]}
              value={form.company_name}
              onChangeText={(v) => update('company_name', v)}
              placeholder="e.g. Alpha Transport, City Rides"
              placeholderTextColor="#C0C0C0"
              autoCapitalize="words"
            />
            {errors.company_name && <Text style={styles.errorText}>{errors.company_name}</Text>}

            <Text style={styles.label}>Business Registration Number <Text style={styles.optional}>(optional)</Text></Text>
            <TextInput
              style={styles.input}
              value={form.business_reg_number}
              onChangeText={(v) => update('business_reg_number', v)}
              placeholder="RC123456"
              placeholderTextColor="#C0C0C0"
              autoCapitalize="characters"
            />

            <Text style={styles.label}>City</Text>
            <TextInput
              style={styles.input}
              value={form.city}
              onChangeText={(v) => update('city', v)}
              placeholder="Douala, Yaoundé..."
              placeholderTextColor="#C0C0C0"
              autoCapitalize="words"
            />

            <Text style={styles.label}>Country</Text>
            <View style={styles.countrySelectGrid}>
              {COUNTRIES.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.countrySelectPill, form.country === c && styles.countrySelectPillSelected]}
                  onPress={() => update('country', c)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.countrySelectText, form.country === c && styles.countrySelectTextSelected]}>
                    {c}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );

      case 2:
        return (
          <View>
            <Text style={styles.stepTitle}>Identity Verification</Text>
            <Text style={styles.stepSubtitle}>We need to verify your identity to activate your fleet account</Text>

            {/* Selfie */}
            <View style={styles.selfieSection}>
              <TouchableOpacity style={styles.selfieCircle} activeOpacity={0.75}>
                <Ionicons name="person-outline" size={36} color="#C0C0C0" />
                <View style={styles.cameraIconBadge}>
                  <Ionicons name="camera" size={14} color="#fff" />
                </View>
              </TouchableOpacity>
              <Text style={styles.selfieLabel}>Take a selfie for verification</Text>
            </View>

            <TouchableOpacity style={styles.uploadButton} activeOpacity={0.75}>
              <Ionicons name="card-outline" size={22} color="#888" />
              <Text style={styles.uploadButtonText}>Upload Government ID (National ID / Passport)</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.uploadButton} activeOpacity={0.75}>
              <Ionicons name="business-outline" size={22} color="#888" />
              <Text style={styles.uploadButtonText}>Upload Business Registration Document <Text style={styles.optional}>(optional)</Text></Text>
            </TouchableOpacity>

            <View style={styles.verificationNote}>
              <Ionicons name="time-outline" size={18} color="#888" />
              <Text style={styles.verificationNoteText}>
                Your account will be verified within 24 hours. You'll be notified via SMS once approved.
              </Text>
            </View>
          </View>
        );

      case 3:
        return (
          <View>
            <Text style={styles.stepTitle}>Review & Submit</Text>
            <Text style={styles.stepSubtitle}>Confirm your fleet account details</Text>

            {/* Summary */}
            <View style={styles.summaryCard}>
              <SummaryRow label="Name" value={form.full_name} />
              <SummaryRow label="Phone" value={form.countryCode + form.phone} />
              {form.email ? <SummaryRow label="Email" value={form.email} /> : null}
              <SummaryRow label="Fleet Name" value={form.company_name} />
              {form.business_reg_number ? <SummaryRow label="Business Reg." value={form.business_reg_number} /> : null}
              <SummaryRow label="City" value={form.city || 'Not specified'} />
              <SummaryRow label="Country" value={form.country} />
            </View>

            {/* Fleet info card */}
            <View style={styles.infoCard}>
              <View style={styles.infoCardHeader}>
                <Text style={styles.infoCardEmoji}>🚙🚙🚙</Text>
                <Text style={styles.infoCardTitle}>How Fleet Accounts Work</Text>
              </View>
              <Text style={styles.infoCardText}>
                After registration, you'll add your first fleet of 5–15 vehicles.
                Your fleet becomes active once you reach 5 vehicles.
                When a fleet reaches 15 vehicles, you can create an additional fleet.
              </Text>
            </View>

            {/* Terms */}
            <TouchableOpacity
              style={styles.termsRow}
              onPress={() => setTermsAccepted(!termsAccepted)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
                {termsAccepted && <Ionicons name="checkmark" size={12} color="#fff" />}
              </View>
              <Text style={styles.termsText}>
                I agree to the{' '}
                <Text style={styles.termsLink}>Terms of Service</Text>
                {' '}and{' '}
                <Text style={styles.termsLink}>Privacy Policy</Text>
                {' '}for MOBO Fleet Owners
              </Text>
            </TouchableOpacity>
            {errors.terms && <Text style={styles.errorText}>{errors.terms}</Text>}
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => (step > 1 ? setStep(step - 1) : navigation.goBack())}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={22} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Fleet Owner Registration</Text>
          <View style={{ width: 40 }} />
        </View>

        <ProgressBar step={step} total={TOTAL_STEPS} />
        <StepIndicator current={step} total={TOTAL_STEPS} />

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {renderStep()}
        </ScrollView>

        <View style={styles.footer}>
          {step < TOTAL_STEPS ? (
            <TouchableOpacity style={styles.primaryButton} onPress={nextStep} activeOpacity={0.88}>
              <Text style={styles.primaryButtonText}>Continue</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
              onPress={handleSubmit}
              activeOpacity={0.88}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>Create Fleet Account</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SummaryRow({ label, value }) {
  if (!value) return null;
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F6F6F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  progressContainer: { paddingHorizontal: spacing.lg, marginBottom: spacing.xs },
  progressTrack: {
    height: 4,
    backgroundColor: '#F0F0F0',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 2 },
  progressLabel: { fontSize: 12, color: '#888', fontWeight: '500', textAlign: 'right' },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  stepDotWrap: { flexDirection: 'row', alignItems: 'center' },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  stepDotDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  stepDotActive: { borderColor: colors.primary, backgroundColor: '#fff' },
  stepDotText: { fontSize: 11, fontWeight: '600', color: '#AAA' },
  stepDotTextActive: { color: colors.primary },
  stepLine: { width: 48, height: 2, backgroundColor: '#E0E0E0', marginHorizontal: 4 },
  stepLineDone: { backgroundColor: colors.primary },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  stepTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1A1A1A',
    marginBottom: spacing.xs,
    letterSpacing: -0.3,
  },
  stepSubtitle: { fontSize: 14, color: '#888', marginBottom: spacing.xl, lineHeight: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#444', marginBottom: 8, marginTop: spacing.md },
  optional: { color: '#AAA', fontWeight: '400' },
  input: {
    backgroundColor: '#F6F6F6',
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1A1A1A',
  },
  inputError: { borderWidth: 1.5, borderColor: '#FF4444' },
  phoneRow: {
    flexDirection: 'row',
    backgroundColor: '#F6F6F6',
    borderRadius: 12,
  },
  countryCodeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRightWidth: 1,
    borderRightColor: '#E8E8E8',
    gap: 4,
  },
  flagText: { fontSize: 18 },
  countryCodeText: { fontSize: 15, fontWeight: '600', color: '#1A1A1A', marginHorizontal: 2 },
  phoneInput: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1A1A1A',
  },
  countryDropdown: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 100,
    maxHeight: 240,
  },
  countryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F8F8F8',
  },
  countryOptionSelected: { backgroundColor: 'rgba(255,0,191,0.05)' },
  countryName: { flex: 1, fontSize: 14, color: '#1A1A1A', marginLeft: 10, fontWeight: '500' },
  countryCodeLabel: { fontSize: 13, color: '#888', fontWeight: '500' },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F6F6F6',
    borderRadius: 12,
    paddingRight: 14,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1A1A1A',
  },
  countrySelectGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  countrySelectPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#F6F6F6',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  countrySelectPillSelected: {
    backgroundColor: 'rgba(255,0,191,0.08)',
    borderColor: colors.primary,
  },
  countrySelectText: { fontSize: 13, fontWeight: '500', color: '#888' },
  countrySelectTextSelected: { color: colors.primary, fontWeight: '600' },
  selfieSection: { alignItems: 'center', marginVertical: spacing.xl },
  selfieCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#F6F6F6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
  },
  cameraIconBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selfieLabel: { fontSize: 13, color: '#888', marginTop: 8 },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#D0D0D0',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: spacing.md,
    gap: 8,
    backgroundColor: '#FAFAFA',
  },
  uploadButtonText: { fontSize: 14, color: '#888', fontWeight: '500', textAlign: 'center', flex: 1 },
  verificationNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    padding: spacing.md,
    marginTop: spacing.lg,
    gap: 8,
  },
  verificationNoteText: { flex: 1, fontSize: 13, color: '#666', lineHeight: 20 },
  summaryCard: {
    backgroundColor: '#F8F8F8',
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  summaryLabel: { fontSize: 13, color: '#888', fontWeight: '500' },
  summaryValue: { fontSize: 13, color: '#1A1A1A', fontWeight: '600', maxWidth: '60%', textAlign: 'right' },
  infoCard: {
    backgroundColor: 'rgba(255,0,191,0.05)',
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,0,191,0.15)',
    marginBottom: spacing.lg,
  },
  infoCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.sm,
  },
  infoCardEmoji: { fontSize: 20 },
  infoCardTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  infoCardText: { fontSize: 13, color: '#555', lineHeight: 20 },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#D0D0D0',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  termsText: { flex: 1, fontSize: 13, color: '#666', lineHeight: 20 },
  termsLink: { color: colors.primary, fontWeight: '600' },
  errorText: { fontSize: 12, color: '#FF4444', marginTop: 4, marginLeft: 4 },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    backgroundColor: '#fff',
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  primaryButtonDisabled: { opacity: 0.7 },
  primaryButtonText: { fontSize: 17, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },
});

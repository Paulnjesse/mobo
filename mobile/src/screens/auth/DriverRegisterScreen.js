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
  Switch,
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

const VEHICLE_TYPES = ['standard', 'comfort', 'luxury', 'van'];
const SEAT_OPTIONS = [2, 4, 5, 7];
const VEHICLE_COLORS = [
  { label: 'White', hex: '#FFFFFF' },
  { label: 'Black', hex: '#1A1A1A' },
  { label: 'Silver', hex: '#C0C0C0' },
  { label: 'Gray', hex: '#808080' },
  { label: 'Red', hex: '#E53935' },
  { label: 'Blue', hex: '#1E88E5' },
  { label: 'Green', hex: '#43A047' },
  { label: 'Yellow', hex: '#FDD835' },
  { label: 'Orange', hex: '#FB8C00' },
  { label: 'Brown', hex: '#6D4C41' },
];
const VEHICLE_MAKES = [
  'Toyota', 'Honda', 'Hyundai', 'Kia', 'Renault', 'Peugeot',
  'Mercedes', 'BMW', 'Ford', 'Nissan', 'Mitsubishi', 'Suzuki', 'Other',
];

const TOTAL_STEPS = 4;

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

function SectionLabel({ children }) {
  return <Text style={styles.label}>{children}</Text>;
}

function PillOption({ label, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.pill, selected && styles.pillSelected]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[styles.pillText, selected && styles.pillTextSelected]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function DriverRegisterScreen({ navigation }) {
  const { registerDriver } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);

  const [form, setForm] = useState({
    // Step 1
    countryCode: '+237',
    phone: '',
    full_name: '',
    email: '',
    password: '',
    confirmPassword: '',
    // Step 2
    license_number: '',
    license_expiry: '',
    national_id: '',
    date_of_birth: '',
    gender: '',
    // Step 3 — Vehicle
    vehicle_make: '',
    vehicle_model: '',
    vehicle_year: '',
    vehicle_plate: '',
    vehicle_color: '#FFFFFF',
    vehicle_type: 'standard',
    seats: 4,
    is_wheelchair_accessible: false,
    insurance_expiry: '',
    // Step 4
    profile_photo: null,
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
      if (!form.password || form.password.length < 6) newErrors['password'] = 'Min. 6 characters required';
      if (form.password !== form.confirmPassword) newErrors.confirmPassword = 'Passwords do not match';
    }
    if (s === 2) {
      if (!form.license_number) newErrors.license_number = 'License number is required';
      if (!form.license_expiry) newErrors.license_expiry = 'License expiry date is required';
    }
    if (s === 3) {
      if (!form.vehicle_make) newErrors.vehicle_make = 'Vehicle make is required';
      if (!form.vehicle_model) newErrors.vehicle_model = 'Vehicle model is required';
      if (!form.vehicle_year) newErrors.vehicle_year = 'Vehicle year is required';
      if (!form.vehicle_plate) newErrors.vehicle_plate = 'Plate number is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () => {
    if (validateStep(step)) setStep((s) => s + 1);
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const fullPhone = form.countryCode + form.phone.replace(/^0/, '');
      await registerDriver({
        full_name: form.full_name.trim(),
        phone: fullPhone,
        email: form.email.trim() || undefined,
        password: form.password,
        role: 'driver',
        country: COUNTRY_CODES.find((c) => c.code === form.countryCode)?.name || 'Cameroon',
        license_number: form.license_number,
        license_expiry: form.license_expiry,
        national_id: form.national_id || undefined,
        vehicle_make: form.vehicle_make,
        vehicle_model: form.vehicle_model,
        vehicle_year: form.vehicle_year,
        vehicle_plate: form.vehicle_plate.toUpperCase(),
        vehicle_color: VEHICLE_COLORS.find((c) => c.hex === form.vehicle_color)?.label || 'White',
        vehicle_type: form.vehicle_type,
        seats: form.seats,
        is_wheelchair_accessible: form.is_wheelchair_accessible,
        insurance_expiry: form.insurance_expiry || undefined,
      });
      navigation.navigate('Verification', { phone: fullPhone, role: 'driver' });
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
            <Text style={styles.stepSubtitle}>Your basic account details</Text>

            <SectionLabel>Phone Number</SectionLabel>
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

            <SectionLabel>Full Name</SectionLabel>
            <TextInput
              style={[styles.input, errors.full_name && styles.inputError]}
              value={form.full_name}
              onChangeText={(v) => update('full_name', v)}
              placeholder="Jean Dupont"
              placeholderTextColor="#C0C0C0"
              autoCapitalize="words"
            />
            {errors.full_name && <Text style={styles.errorText}>{errors.full_name}</Text>}

            <SectionLabel>Email <Text style={styles.optional}>(optional)</Text></SectionLabel>
            <TextInput
              style={styles.input}
              value={form.email}
              onChangeText={(v) => update('email', v)}
              placeholder="you@example.com"
              placeholderTextColor="#C0C0C0"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <SectionLabel>Password</SectionLabel>
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

            <SectionLabel>Confirm Password</SectionLabel>
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
          </View>
        );

      case 2:
        return (
          <View>
            <Text style={styles.stepTitle}>Driver Documents</Text>
            <Text style={styles.stepSubtitle}>We need to verify your identity</Text>

            {/* Upload Driver's License */}
            <SectionLabel>Driver's License</SectionLabel>
            <TouchableOpacity style={styles.uploadButton} activeOpacity={0.75}>
              <Ionicons name="cloud-upload-outline" size={22} color="#888" />
              <Text style={styles.uploadButtonText}>Upload Driver's License Photo</Text>
            </TouchableOpacity>

            <SectionLabel>License Number</SectionLabel>
            <TextInput
              style={[styles.input, errors.license_number && styles.inputError]}
              value={form.license_number}
              onChangeText={(v) => update('license_number', v)}
              placeholder="License number"
              placeholderTextColor="#C0C0C0"
              autoCapitalize="characters"
            />
            {errors.license_number && <Text style={styles.errorText}>{errors.license_number}</Text>}

            <SectionLabel>License Expiry Date</SectionLabel>
            <TextInput
              style={[styles.input, errors.license_expiry && styles.inputError]}
              value={form.license_expiry}
              onChangeText={(v) => update('license_expiry', v)}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#C0C0C0"
              keyboardType="numbers-and-punctuation"
            />
            {errors.license_expiry && <Text style={styles.errorText}>{errors.license_expiry}</Text>}

            <TouchableOpacity style={styles.uploadButton} activeOpacity={0.75}>
              <Ionicons name="card-outline" size={22} color="#888" />
              <Text style={styles.uploadButtonText}>Upload National ID</Text>
            </TouchableOpacity>

            <SectionLabel>National ID Number</SectionLabel>
            <TextInput
              style={styles.input}
              value={form.national_id}
              onChangeText={(v) => update('national_id', v)}
              placeholder="National ID number"
              placeholderTextColor="#C0C0C0"
            />

            <SectionLabel>Date of Birth</SectionLabel>
            <TextInput
              style={styles.input}
              value={form.date_of_birth}
              onChangeText={(v) => update('date_of_birth', v)}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#C0C0C0"
              keyboardType="numbers-and-punctuation"
            />

            <SectionLabel>Gender</SectionLabel>
            <View style={styles.pillRow}>
              {['Male', 'Female', 'Other'].map((g) => (
                <PillOption
                  key={g}
                  label={g}
                  selected={form.gender === g}
                  onPress={() => update('gender', g)}
                />
              ))}
            </View>
          </View>
        );

      case 3:
        return (
          <View>
            <Text style={styles.stepTitle}>Your Vehicle</Text>
            <Text style={styles.stepSubtitle}>Tell us about the car you'll be driving</Text>

            <SectionLabel>Vehicle Make</SectionLabel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.makeScroll}>
              {VEHICLE_MAKES.map((make) => (
                <PillOption
                  key={make}
                  label={make}
                  selected={form.vehicle_make === make}
                  onPress={() => update('vehicle_make', make)}
                />
              ))}
            </ScrollView>
            {errors.vehicle_make && <Text style={styles.errorText}>{errors.vehicle_make}</Text>}

            <SectionLabel>Vehicle Model</SectionLabel>
            <TextInput
              style={[styles.input, errors.vehicle_model && styles.inputError]}
              value={form.vehicle_model}
              onChangeText={(v) => update('vehicle_model', v)}
              placeholder="e.g. Corolla, Civic, Elantra"
              placeholderTextColor="#C0C0C0"
            />
            {errors.vehicle_model && <Text style={styles.errorText}>{errors.vehicle_model}</Text>}

            <SectionLabel>Year</SectionLabel>
            <TextInput
              style={[styles.input, errors.vehicle_year && styles.inputError]}
              value={form.vehicle_year}
              onChangeText={(v) => update('vehicle_year', v)}
              placeholder="2015"
              placeholderTextColor="#C0C0C0"
              keyboardType="number-pad"
              maxLength={4}
            />
            {errors.vehicle_year && <Text style={styles.errorText}>{errors.vehicle_year}</Text>}

            <SectionLabel>Plate Number</SectionLabel>
            <TextInput
              style={[styles.input, errors.vehicle_plate && styles.inputError]}
              value={form.vehicle_plate}
              onChangeText={(v) => update('vehicle_plate', v.toUpperCase())}
              placeholder="LT 1234 A"
              placeholderTextColor="#C0C0C0"
              autoCapitalize="characters"
            />
            {errors.vehicle_plate && <Text style={styles.errorText}>{errors.vehicle_plate}</Text>}

            <SectionLabel>Color</SectionLabel>
            <View style={styles.colorGrid}>
              {VEHICLE_COLORS.map((c) => (
                <TouchableOpacity
                  key={c.hex}
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: c.hex },
                    form.vehicle_color === c.hex && styles.colorSwatchSelected,
                    c.hex === '#FFFFFF' && styles.colorSwatchWhite,
                  ]}
                  onPress={() => update('vehicle_color', c.hex)}
                  activeOpacity={0.8}
                >
                  {form.vehicle_color === c.hex && (
                    <Ionicons name="checkmark" size={14} color={c.hex === '#FFFFFF' ? '#333' : '#fff'} />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <SectionLabel>Vehicle Type</SectionLabel>
            <View style={styles.pillRow}>
              {VEHICLE_TYPES.map((type) => (
                <PillOption
                  key={type}
                  label={type.charAt(0).toUpperCase() + type.slice(1)}
                  selected={form.vehicle_type === type}
                  onPress={() => update('vehicle_type', type)}
                />
              ))}
            </View>

            <SectionLabel>Number of Seats</SectionLabel>
            <View style={styles.pillRow}>
              {SEAT_OPTIONS.map((s) => (
                <PillOption
                  key={s}
                  label={`${s}`}
                  selected={form.seats === s}
                  onPress={() => update('seats', s)}
                />
              ))}
            </View>

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Wheelchair Accessible</Text>
              <Switch
                value={form.is_wheelchair_accessible}
                onValueChange={(v) => update('is_wheelchair_accessible', v)}
                trackColor={{ false: '#E0E0E0', true: colors.primary }}
                thumbColor="#fff"
              />
            </View>

            <TouchableOpacity style={styles.uploadButton} activeOpacity={0.75}>
              <Ionicons name="camera-outline" size={22} color="#888" />
              <Text style={styles.uploadButtonText}>Upload Vehicle Photos (up to 4)</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.uploadButton} activeOpacity={0.75}>
              <Ionicons name="document-outline" size={22} color="#888" />
              <Text style={styles.uploadButtonText}>Upload Insurance Document</Text>
            </TouchableOpacity>

            <SectionLabel>Insurance Expiry</SectionLabel>
            <TextInput
              style={styles.input}
              value={form.insurance_expiry}
              onChangeText={(v) => update('insurance_expiry', v)}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#C0C0C0"
              keyboardType="numbers-and-punctuation"
            />
          </View>
        );

      case 4:
        return (
          <View>
            <Text style={styles.stepTitle}>Review & Submit</Text>
            <Text style={styles.stepSubtitle}>Check your details before submitting</Text>

            {/* Profile photo */}
            <View style={styles.profilePhotoSection}>
              <TouchableOpacity style={styles.profilePhotoCircle} activeOpacity={0.75}>
                <Ionicons name="person-outline" size={36} color="#C0C0C0" />
                <View style={styles.cameraIconBadge}>
                  <Ionicons name="camera" size={14} color="#fff" />
                </View>
              </TouchableOpacity>
              <Text style={styles.profilePhotoLabel}>Tap to add profile photo</Text>
            </View>

            {/* Summary */}
            <View style={styles.summaryCard}>
              <SummaryRow label="Name" value={form.full_name} />
              <SummaryRow label="Phone" value={form.countryCode + form.phone} />
              {form.email ? <SummaryRow label="Email" value={form.email} /> : null}
              <SummaryRow label="License #" value={form.license_number} />
              <SummaryRow label="License Expiry" value={form.license_expiry} />
              <SummaryRow label="Vehicle" value={`${form.vehicle_make} ${form.vehicle_model} ${form.vehicle_year}`} />
              <SummaryRow label="Plate" value={form.vehicle_plate} />
              <SummaryRow label="Type" value={form.vehicle_type} />
              <SummaryRow label="Seats" value={`${form.seats}`} />
            </View>

            <View style={styles.noteCard}>
              <Ionicons name="information-circle-outline" size={18} color="#888" />
              <Text style={styles.noteText}>
                Your application will be reviewed within 24 hours. You'll receive an SMS once approved.
              </Text>
            </View>
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
          <Text style={styles.headerTitle}>Driver Registration</Text>
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
                <Text style={styles.primaryButtonText}>Submit Application</Text>
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
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  stepDotDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  stepDotActive: { borderColor: colors.primary, backgroundColor: '#fff' },
  stepDotText: { fontSize: 10, fontWeight: '600', color: '#AAA' },
  stepDotTextActive: { color: colors.primary },
  stepLine: { width: 24, height: 2, backgroundColor: '#E0E0E0', marginHorizontal: 3 },
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
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pill: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#F6F6F6',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  pillSelected: {
    backgroundColor: 'rgba(255,0,191,0.08)',
    borderColor: colors.primary,
  },
  pillText: { fontSize: 14, fontWeight: '600', color: '#888' },
  pillTextSelected: { color: colors.primary },
  makeScroll: { marginBottom: spacing.sm },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  colorSwatch: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSwatchSelected: {
    borderColor: colors.primary,
    transform: [{ scale: 1.15 }],
  },
  colorSwatchWhite: {
    borderColor: '#E0E0E0',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#F6F6F6',
  },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: '#444' },
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
  uploadButtonText: { fontSize: 14, color: '#888', fontWeight: '500' },
  profilePhotoSection: { alignItems: 'center', marginBottom: spacing.xl },
  profilePhotoCircle: {
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
  profilePhotoLabel: { fontSize: 13, color: '#888', marginTop: 8 },
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
  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFF8F0',
    borderRadius: 12,
    padding: spacing.md,
    gap: 8,
  },
  noteText: { flex: 1, fontSize: 13, color: '#666', lineHeight: 20 },
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

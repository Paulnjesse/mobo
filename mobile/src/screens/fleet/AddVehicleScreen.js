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
import { fleetService } from '../../services/fleet';
import { colors, spacing, shadows } from '../../theme';

const PRIMARY = '#FF00BF';

const VEHICLE_MAKES = [
  'Toyota', 'Honda', 'Hyundai', 'Kia', 'Renault', 'Peugeot',
  'Mercedes', 'BMW', 'Ford', 'Nissan', 'Mitsubishi', 'Suzuki',
  'Volkswagen', 'Chevrolet', 'Mazda', 'Other',
];

const VEHICLE_MODELS = {
  Toyota:     ['Corolla', 'Camry', 'RAV4', 'Hilux', 'Yaris', 'Land Cruiser', 'Fortuner', 'Prius'],
  Honda:      ['Civic', 'Accord', 'CR-V', 'HR-V', 'Pilot', 'Jazz / Fit'],
  Hyundai:    ['Elantra', 'Sonata', 'Tucson', 'Santa Fe', 'i10', 'i20', 'i30'],
  Kia:        ['Rio', 'Cerato', 'Sportage', 'Sorento', 'Picanto', 'Stinger'],
  Renault:    ['Clio', 'Megane', 'Logan', 'Sandero', 'Duster', 'Kwid'],
  Peugeot:    ['208', '308', '2008', '3008', '508', '408'],
  Mercedes:   ['C-Class', 'E-Class', 'A-Class', 'GLC', 'GLE', 'Sprinter'],
  BMW:        ['3 Series', '5 Series', 'X3', 'X5', '1 Series', '7 Series'],
  Ford:       ['Focus', 'Ranger', 'Mustang', 'Escape', 'Explorer', 'EcoSport'],
  Nissan:     ['Sentra', 'Altima', 'X-Trail', 'Qashqai', 'Micra', 'Navara'],
  Mitsubishi: ['Outlander', 'Eclipse Cross', 'ASX', 'Pajero', 'L200'],
  Suzuki:     ['Swift', 'Vitara', 'Baleno', 'Jimny', 'Grand Vitara'],
  Volkswagen: ['Golf', 'Polo', 'Passat', 'Tiguan', 'Touareg'],
  Chevrolet:  ['Cruze', 'Malibu', 'Trax', 'Captiva', 'Spark'],
  Mazda:      ['Mazda3', 'Mazda6', 'CX-5', 'CX-3', 'MX-5'],
  Other:      ['Other'],
};

const VEHICLE_TYPES = [
  { key: 'standard', label: 'Standard' },
  { key: 'comfort',  label: 'Comfort'  },
  { key: 'luxury',   label: 'Luxury'   },
  { key: 'van',      label: 'Van'      },
];

const SEAT_OPTIONS = [2, 4, 5, 7];

const COLOR_SWATCHES = [
  { label: 'White',  hex: '#FFFFFF' },
  { label: 'Black',  hex: '#1A1A1A' },
  { label: 'Silver', hex: '#C0C0C0' },
  { label: 'Gray',   hex: '#808080' },
  { label: 'Red',    hex: '#E53935' },
  { label: 'Blue',   hex: '#1E88E5' },
  { label: 'Green',  hex: '#43A047' },
  { label: 'Yellow', hex: '#FDD835' },
  { label: 'Orange', hex: '#FB8C00' },
  { label: 'Brown',  hex: '#6D4C41' },
  { label: 'Beige',  hex: '#F5F0DC' },
  { label: 'Purple', hex: '#8E24AA' },
];

const YEARS = Array.from({ length: 26 }, (_, i) => String(2025 - i));

function Label({ children }) {
  return <Text style={styles.label}>{children}</Text>;
}

function PillRow({ options, selected, onSelect, keyField = 'key', labelField = 'label' }) {
  return (
    <View style={styles.pillRow}>
      {options.map((opt) => {
        const k = typeof opt === 'object' ? opt[keyField] : opt;
        const l = typeof opt === 'object' ? opt[labelField] : String(opt);
        const isSelected = selected === k;
        return (
          <TouchableOpacity
            key={k}
            style={[styles.pill, isSelected && styles.pillSelected]}
            onPress={() => onSelect(k)}
            activeOpacity={0.75}
          >
            <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>{l}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function AddVehicleScreen({ route, navigation }) {
  const { fleetId, fleetName, maxVehicles = 15, vehicleCount = 0 } = route.params || {};
  const remaining = maxVehicles - vehicleCount;

  const [loading, setLoading] = useState(false);
  const [showMakePicker, setShowMakePicker] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);

  const [form, setForm] = useState({
    make: '',
    model: '',
    year: '',
    plate: '',
    color: '#FFFFFF',
    vehicle_type: 'standard',
    seats: 4,
    is_wheelchair_accessible: false,
    insurance_expiry: '',
  });

  const [errors, setErrors] = useState({});

  const update = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: null }));
  };

  const validate = () => {
    const e = {};
    if (!form.make)  e.make  = 'Vehicle make is required';
    if (!form.model) e.model = 'Vehicle model is required';
    if (!form.year)  e.year  = 'Year is required';
    if (!form.plate || form.plate.trim().length < 3) e.plate = 'Valid plate number is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    if (remaining <= 0) {
      Alert.alert('Fleet Full', 'This fleet already has the maximum number of vehicles.');
      return;
    }
    setLoading(true);
    try {
      const colorLabel = COLOR_SWATCHES.find((c) => c.hex === form.color)?.label || 'White';
      await fleetService.addVehicle(fleetId, {
        make: form.make,
        model: form.model,
        year: parseInt(form.year, 10),
        plate: form.plate.toUpperCase().trim(),
        color: colorLabel,
        vehicle_type: form.vehicle_type,
        seats: form.seats,
        is_wheelchair_accessible: form.is_wheelchair_accessible,
        insurance_expiry: form.insurance_expiry || undefined,
      });
      Alert.alert(
        'Vehicle Added',
        `${form.make} ${form.model} has been added to ${fleetName}.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err) {
      Alert.alert('Failed', err?.message || 'Could not add vehicle. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const availableModels = form.make ? (VEHICLE_MODELS[form.make] || ['Other']) : [];

  if (remaining <= 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={22} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Vehicle</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.fullStateWrap}>
          <Text style={styles.fullEmoji}>🚫</Text>
          <Text style={styles.fullTitle}>Fleet is Full</Text>
          <Text style={styles.fullSubtitle}>
            This fleet has reached the maximum of {maxVehicles} vehicles.
            Create a new fleet to add more vehicles.
          </Text>
          <TouchableOpacity style={styles.createFleetBtn} onPress={() => navigation.navigate('CreateFleet')} activeOpacity={0.85}>
            <Text style={styles.createFleetBtnText}>Create New Fleet</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={22} color="#1A1A1A" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Add Vehicle</Text>
            <Text style={styles.headerSubtitle}>{fleetName}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        {/* Remaining slots banner */}
        <View style={styles.remainingBanner}>
          <Ionicons name="information-circle-outline" size={15} color="#555" />
          <Text style={styles.remainingText}>
            You can add {remaining} more vehicle{remaining !== 1 ? 's' : ''} to this fleet
          </Text>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Make */}
          <Label>Vehicle Make</Label>
          <TouchableOpacity
            style={[styles.selectBtn, errors.make && styles.inputError]}
            onPress={() => setShowMakePicker(!showMakePicker)}
            activeOpacity={0.8}
          >
            <Text style={[styles.selectBtnText, !form.make && styles.placeholderText]}>
              {form.make || 'Select make...'}
            </Text>
            <Ionicons name={showMakePicker ? 'chevron-up' : 'chevron-down'} size={16} color="#888" />
          </TouchableOpacity>
          {errors.make && <Text style={styles.errorText}>{errors.make}</Text>}
          {showMakePicker && (
            <View style={styles.dropdown}>
              <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                {VEHICLE_MAKES.map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.dropdownItem, form.make === m && styles.dropdownItemSelected]}
                    onPress={() => { update('make', m); update('model', ''); setShowMakePicker(false); }}
                  >
                    <Text style={[styles.dropdownItemText, form.make === m && { color: PRIMARY, fontWeight: '700' }]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Model */}
          <Label>Vehicle Model</Label>
          <TouchableOpacity
            style={[styles.selectBtn, errors.model && styles.inputError]}
            onPress={() => { if (!form.make) { Alert.alert('Select Make First'); return; } setShowModelPicker(!showModelPicker); }}
            activeOpacity={0.8}
          >
            <Text style={[styles.selectBtnText, !form.model && styles.placeholderText]}>
              {form.model || 'Select model...'}
            </Text>
            <Ionicons name={showModelPicker ? 'chevron-up' : 'chevron-down'} size={16} color="#888" />
          </TouchableOpacity>
          {errors.model && <Text style={styles.errorText}>{errors.model}</Text>}
          {showModelPicker && availableModels.length > 0 && (
            <View style={styles.dropdown}>
              <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                {availableModels.map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.dropdownItem, form.model === m && styles.dropdownItemSelected]}
                    onPress={() => { update('model', m); setShowModelPicker(false); }}
                  >
                    <Text style={[styles.dropdownItemText, form.model === m && { color: PRIMARY, fontWeight: '700' }]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Year */}
          <Label>Year</Label>
          <TouchableOpacity
            style={[styles.selectBtn, errors.year && styles.inputError]}
            onPress={() => setShowYearPicker(!showYearPicker)}
            activeOpacity={0.8}
          >
            <Text style={[styles.selectBtnText, !form.year && styles.placeholderText]}>
              {form.year || 'Select year...'}
            </Text>
            <Ionicons name={showYearPicker ? 'chevron-up' : 'chevron-down'} size={16} color="#888" />
          </TouchableOpacity>
          {errors.year && <Text style={styles.errorText}>{errors.year}</Text>}
          {showYearPicker && (
            <View style={styles.dropdown}>
              <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                {YEARS.map((y) => (
                  <TouchableOpacity
                    key={y}
                    style={[styles.dropdownItem, form.year === y && styles.dropdownItemSelected]}
                    onPress={() => { update('year', y); setShowYearPicker(false); }}
                  >
                    <Text style={[styles.dropdownItemText, form.year === y && { color: PRIMARY, fontWeight: '700' }]}>{y}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Plate */}
          <Label>Plate Number</Label>
          <TextInput
            style={[styles.input, errors.plate && styles.inputError]}
            value={form.plate}
            onChangeText={(v) => update('plate', v.toUpperCase())}
            placeholder="e.g. LT 1234 A"
            placeholderTextColor="#C0C0C0"
            autoCapitalize="characters"
          />
          {errors.plate && <Text style={styles.errorText}>{errors.plate}</Text>}

          {/* Color */}
          <Label>Color</Label>
          <View style={styles.colorGrid}>
            {COLOR_SWATCHES.map((c) => (
              <TouchableOpacity
                key={c.hex}
                style={[
                  styles.colorSwatch,
                  { backgroundColor: c.hex },
                  form.color === c.hex && styles.colorSwatchSelected,
                  c.hex === '#FFFFFF' && styles.colorSwatchWhiteBorder,
                ]}
                onPress={() => update('color', c.hex)}
                activeOpacity={0.8}
              >
                {form.color === c.hex && (
                  <Ionicons name="checkmark" size={14} color={c.hex === '#FFFFFF' || c.hex === '#F5F0DC' ? '#333' : '#fff'} />
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Vehicle Type */}
          <Label>Vehicle Type</Label>
          <PillRow options={VEHICLE_TYPES} selected={form.vehicle_type} onSelect={(v) => update('vehicle_type', v)} />

          {/* Seats */}
          <Label>Number of Seats</Label>
          <PillRow options={SEAT_OPTIONS} selected={form.seats} onSelect={(v) => update('seats', v)} />

          {/* Wheelchair */}
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Wheelchair Accessible</Text>
            <Switch
              value={form.is_wheelchair_accessible}
              onValueChange={(v) => update('is_wheelchair_accessible', v)}
              trackColor={{ false: '#E0E0E0', true: PRIMARY }}
              thumbColor="#fff"
            />
          </View>

          {/* Photo upload placeholders */}
          <Label>Vehicle Photos</Label>
          <View style={styles.photoGrid}>
            {[0, 1, 2, 3].map((i) => (
              <TouchableOpacity key={i} style={styles.photoSlot} activeOpacity={0.75}>
                <Ionicons name="camera-outline" size={22} color="#C0C0C0" />
                <Text style={styles.photoSlotText}>Photo {i + 1}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Insurance doc */}
          <TouchableOpacity style={styles.uploadBtn} activeOpacity={0.75}>
            <Ionicons name="document-outline" size={20} color="#888" />
            <Text style={styles.uploadBtnText}>Upload Insurance Document</Text>
          </TouchableOpacity>

          {/* Insurance expiry */}
          <Label>Insurance Expiry Date</Label>
          <TextInput
            style={styles.input}
            value={form.insurance_expiry}
            onChangeText={(v) => update('insurance_expiry', v)}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#C0C0C0"
            keyboardType="numbers-and-punctuation"
          />

          <View style={{ height: 20 }} />
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            activeOpacity={0.88}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>Add to Fleet</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F6F6F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#1A1A1A' },
  headerSubtitle: { fontSize: 12, color: '#888', marginTop: 1 },
  remainingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F6F6F6',
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFEF',
  },
  remainingText: { fontSize: 13, color: '#555', fontWeight: '500' },
  content: { padding: spacing.lg, paddingBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#444', marginBottom: 8, marginTop: spacing.md },
  input: {
    backgroundColor: '#F6F6F6',
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1A1A1A',
  },
  inputError: { borderWidth: 1.5, borderColor: '#FF4444' },
  errorText: { fontSize: 12, color: '#FF4444', marginTop: 4, marginLeft: 4 },
  selectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F6F6F6',
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  selectBtnText: { fontSize: 16, color: '#1A1A1A', fontWeight: '500' },
  placeholderText: { color: '#C0C0C0', fontWeight: '400' },
  dropdown: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    ...shadows.md,
    zIndex: 999,
  },
  dropdownItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F8F8F8',
  },
  dropdownItemSelected: { backgroundColor: 'rgba(255,0,191,0.05)' },
  dropdownItemText: { fontSize: 15, color: '#1A1A1A', fontWeight: '400' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  pill: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#F6F6F6',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  pillSelected: { backgroundColor: 'rgba(255,0,191,0.08)', borderColor: PRIMARY },
  pillText: { fontSize: 14, fontWeight: '600', color: '#888' },
  pillTextSelected: { color: PRIMARY },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  colorSwatch: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSwatchSelected: { borderColor: PRIMARY, transform: [{ scale: 1.15 }] },
  colorSwatchWhiteBorder: { borderColor: '#E0E0E0' },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#F6F6F6',
  },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: '#444' },
  photoGrid: { flexDirection: 'row', gap: 10, marginTop: 4 },
  photoSlot: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  photoSlotText: { fontSize: 11, color: '#C0C0C0', fontWeight: '500' },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#D0D0D0',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: spacing.md,
    gap: 8,
    backgroundColor: '#FAFAFA',
  },
  uploadBtnText: { fontSize: 14, color: '#888', fontWeight: '500' },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    backgroundColor: '#fff',
  },
  submitBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { fontSize: 17, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },

  // Full state
  fullStateWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  fullEmoji: { fontSize: 48, marginBottom: 16 },
  fullTitle: { fontSize: 20, fontWeight: '800', color: '#1A1A1A', marginBottom: 8 },
  fullSubtitle: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  createFleetBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 28,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  createFleetBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});

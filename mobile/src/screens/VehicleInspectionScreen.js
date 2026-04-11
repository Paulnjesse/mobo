/**
 * VehicleInspectionScreen — Driver pre-shift vehicle inspection
 * Inspired by FREE NOW and Uber vehicle compliance workflows.
 *
 * Flow:
 *   1. Driver opens screen (prompted before going online if inspection expired)
 *   2. Completes safety checklist (10 items)
 *   3. Takes 6 photos (guided)
 *   4. Submits → "Pending review" state shown
 *   5. Admin approves/rejects (driver notified via push)
 */
import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, TextInput, Alert, ActivityIndicator, Image,
  StatusBar, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ridesService } from '../services/rides';

const BRAND_RED   = '#E31837';
const BLACK       = '#000000';
const WHITE       = '#FFFFFF';
const GRAY_BG     = '#F7F7F7';
const GRAY_BORDER = 'rgba(0,0,0,0.10)';
const { width: SCREEN_W } = Dimensions.get('window');

const CHECKLIST = [
  { key: 'exterior_ok',   label: 'Exterior',          desc: 'Body clean, no major damage or cracks',    icon: '🚗' },
  { key: 'interior_ok',   label: 'Interior',           desc: 'Clean, no offensive odors, seats intact',  icon: '💺' },
  { key: 'tires_ok',      label: 'Tires & Wheels',     desc: 'Adequate tread depth, no visible damage',  icon: '🛞' },
  { key: 'brakes_ok',     label: 'Brakes',             desc: 'Brakes respond normally, no grinding',     icon: '🔴' },
  { key: 'lights_ok',     label: 'Lights',             desc: 'Headlights, taillights, indicators work',  icon: '💡' },
  { key: 'windshield_ok', label: 'Windshield & Wipers',desc: 'No cracks obstructing view, wipers work',  icon: '🪟' },
  { key: 'seatbelts_ok',  label: 'Seat Belts',         desc: 'All seat belts function and retract',       icon: '🪢' },
  { key: 'airbags_ok',    label: 'Airbag Indicators',  desc: 'No airbag warning lights on dashboard',    icon: '⚠️' },
  { key: 'first_aid_ok',  label: 'First Aid Kit',      desc: 'Kit present and within expiry date',       icon: '🩺' },
  { key: 'fire_ext_ok',   label: 'Fire Extinguisher',  desc: 'Present, charged, and accessible',         icon: '🧯' },
];

const PHOTO_SLOTS = [
  { key: 'photo_front',          label: 'Front',          icon: 'car-front' },
  { key: 'photo_rear',           label: 'Rear',           icon: 'car-back' },
  { key: 'photo_driver_side',    label: 'Driver Side',    icon: 'car-side' },
  { key: 'photo_passenger_side', label: 'Passenger Side', icon: 'car-side' },
  { key: 'photo_interior',       label: 'Interior',       icon: 'car' },
  { key: 'photo_dashboard',      label: 'Dashboard',      icon: 'speedometer' },
];

export default function VehicleInspectionScreen({ navigation, route }) {
  const { onComplete } = route.params || {};

  const [checklist, setChecklist] = useState(
    Object.fromEntries(CHECKLIST.map((c) => [c.key, null]))
  );
  const [photos, setPhotos]             = useState({});
  const [odometer, setOdometer]         = useState('');
  const [notes, setNotes]               = useState('');
  const [submitting, setSubmitting]     = useState(false);
  const [submitted, setSubmitted]       = useState(false);
  const [currentStep, setCurrentStep]   = useState(0); // 0=checklist, 1=photos, 2=details
  const scrollRef = useRef(null);

  const toggleCheck = (key, value) => setChecklist((prev) => ({ ...prev, [key]: value }));

  const pickPhoto = async (slotKey) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera required', 'Please allow camera access to take inspection photos.');
      return;
    }

    Alert.alert('Add Photo', `Take a photo of the ${slotKey.replace(/_/g, ' ')}`, [
      {
        text: 'Camera',
        onPress: async () => {
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.75,
            allowsEditing: true,
            aspect: [4, 3],
          });
          if (!result.canceled && result.assets?.[0]) {
            setPhotos((prev) => ({ ...prev, [slotKey]: result.assets[0].uri }));
          }
        },
      },
      {
        text: 'Library',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.75,
          });
          if (!result.canceled && result.assets?.[0]) {
            setPhotos((prev) => ({ ...prev, [slotKey]: result.assets[0].uri }));
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const validateChecklist = () => CHECKLIST.every((c) => checklist[c.key] !== null);
  const validatePhotos    = () => photos.photo_front && photos.photo_interior;

  const handleSubmit = async () => {
    if (!validateChecklist()) {
      Alert.alert('Incomplete checklist', 'Please answer all 10 safety checklist items.');
      return;
    }
    if (!validatePhotos()) {
      Alert.alert('Photos required', 'At minimum, a front photo and interior photo are required.');
      return;
    }

    setSubmitting(true);
    try {
      await ridesService.submitVehicleInspection({
        ...checklist,
        ...photos,
        odometer_km: odometer ? parseInt(odometer, 10) : undefined,
        driver_notes: notes || undefined,
        inspection_type: 'routine',
      });
      setSubmitted(true);
    } catch (err) {
      Alert.alert('Submission failed', err?.response?.data?.error || 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={WHITE} />
        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={64} color={BRAND_RED} />
          </View>
          <Text style={styles.successTitle}>Inspection Submitted</Text>
          <Text style={styles.successSub}>
            Our team will review your vehicle inspection within 24 hours. You will be notified once approved.
          </Text>
          <TouchableOpacity style={styles.confirmBtn} onPress={() => {
            if (onComplete) onComplete();
            navigation.goBack();
          }}>
            <Text style={styles.confirmBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const steps = ['Checklist', 'Photos', 'Details'];

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={WHITE} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={BLACK} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Vehicle Inspection</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Step tabs */}
      <View style={styles.stepRow}>
        {steps.map((step, i) => (
          <TouchableOpacity key={step} style={styles.stepTab} onPress={() => setCurrentStep(i)}>
            <View style={[styles.stepDot, currentStep >= i && styles.stepDotActive]}>
              <Text style={[styles.stepDotText, currentStep >= i && styles.stepDotTextActive]}>{i + 1}</Text>
            </View>
            <Text style={[styles.stepLabel, currentStep === i && styles.stepLabelActive]}>{step}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Step 0: Safety Checklist ── */}
        {currentStep === 0 && (
          <>
            <Text style={styles.sectionTitle}>Safety Checklist</Text>
            <Text style={styles.sectionSub}>Check each item on your vehicle before starting your shift.</Text>
            {CHECKLIST.map((item) => (
              <View key={item.key} style={styles.checkItem}>
                <View style={styles.checkLeft}>
                  <Text style={styles.checkIcon}>{item.icon}</Text>
                  <View style={styles.checkText}>
                    <Text style={styles.checkLabel}>{item.label}</Text>
                    <Text style={styles.checkDesc}>{item.desc}</Text>
                  </View>
                </View>
                <View style={styles.checkActions}>
                  <TouchableOpacity
                    style={[styles.passBtn, checklist[item.key] === true && styles.passBtnActive]}
                    onPress={() => toggleCheck(item.key, true)}
                  >
                    <Ionicons name="checkmark" size={16} color={checklist[item.key] === true ? WHITE : 'rgba(0,0,0,0.35)'} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.failBtn, checklist[item.key] === false && styles.failBtnActive]}
                    onPress={() => toggleCheck(item.key, false)}
                  >
                    <Ionicons name="close" size={16} color={checklist[item.key] === false ? WHITE : 'rgba(0,0,0,0.35)'} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            <TouchableOpacity
              style={[styles.nextBtn, !validateChecklist() && styles.nextBtnDisabled]}
              onPress={() => { setCurrentStep(1); scrollRef.current?.scrollTo({ y: 0 }); }}
              disabled={!validateChecklist()}
            >
              <Text style={styles.nextBtnText}>Next: Photos</Text>
              <Ionicons name="arrow-forward" size={18} color={WHITE} />
            </TouchableOpacity>
          </>
        )}

        {/* ── Step 1: Photos ── */}
        {currentStep === 1 && (
          <>
            <Text style={styles.sectionTitle}>Vehicle Photos</Text>
            <Text style={styles.sectionSub}>Take clear photos of each section. Front and interior are required.</Text>
            <View style={styles.photoGrid}>
              {PHOTO_SLOTS.map((slot) => (
                <TouchableOpacity key={slot.key} style={styles.photoSlot} onPress={() => pickPhoto(slot.key)}>
                  {photos[slot.key] ? (
                    <Image source={{ uri: photos[slot.key] }} style={styles.photoPreview} />
                  ) : (
                    <View style={styles.photoEmpty}>
                      <Ionicons name="camera" size={28} color={BRAND_RED} />
                    </View>
                  )}
                  <View style={styles.photoLabelRow}>
                    <Text style={styles.photoLabel}>{slot.label}</Text>
                    {(slot.key === 'photo_front' || slot.key === 'photo_interior') && (
                      <Text style={styles.requiredStar}>*</Text>
                    )}
                    {photos[slot.key] && (
                      <Ionicons name="checkmark-circle" size={14} color="#4CAF50" style={{ marginLeft: 4 }} />
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.backStepBtn} onPress={() => setCurrentStep(0)}>
                <Ionicons name="arrow-back" size={18} color={BLACK} />
                <Text style={styles.backStepText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.nextBtn, { flex: 1 }, !validatePhotos() && styles.nextBtnDisabled]}
                onPress={() => { setCurrentStep(2); scrollRef.current?.scrollTo({ y: 0 }); }}
                disabled={!validatePhotos()}
              >
                <Text style={styles.nextBtnText}>Next: Details</Text>
                <Ionicons name="arrow-forward" size={18} color={WHITE} />
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ── Step 2: Details & Submit ── */}
        {currentStep === 2 && (
          <>
            <Text style={styles.sectionTitle}>Additional Details</Text>
            <Text style={styles.inputLabel}>Odometer reading (km)</Text>
            <TextInput
              style={styles.input}
              value={odometer}
              onChangeText={setOdometer}
              placeholder="e.g. 45000"
              keyboardType="numeric"
              placeholderTextColor="rgba(0,0,0,0.3)"
            />
            <Text style={styles.inputLabel}>Notes for reviewer (optional)</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Any issues to flag for the review team…"
              multiline
              numberOfLines={4}
              placeholderTextColor="rgba(0,0,0,0.3)"
            />

            {/* Summary */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Inspection Summary</Text>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryKey}>Checklist items</Text>
                <Text style={styles.summaryVal}>{CHECKLIST.length} / {CHECKLIST.length}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryKey}>Photos provided</Text>
                <Text style={styles.summaryVal}>{Object.keys(photos).length} / {PHOTO_SLOTS.length}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryKey}>Issues flagged</Text>
                <Text style={[styles.summaryVal, Object.values(checklist).filter(v => v === false).length > 0 && { color: BRAND_RED }]}>
                  {Object.values(checklist).filter(v => v === false).length}
                </Text>
              </View>
            </View>

            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.backStepBtn} onPress={() => setCurrentStep(1)}>
                <Ionicons name="arrow-back" size={18} color={BLACK} />
                <Text style={styles.backStepText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, submitting && styles.nextBtnDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting ? <ActivityIndicator size="small" color={WHITE} /> : (
                  <>
                    <Ionicons name="cloud-upload" size={18} color={WHITE} />
                    <Text style={styles.nextBtnText}>Submit Inspection</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: WHITE },
  header:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: GRAY_BORDER },
  backBtn:       { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle:   { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: BLACK },

  stepRow:       { flexDirection: 'row', paddingHorizontal: 24, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: GRAY_BORDER },
  stepTab:       { flex: 1, alignItems: 'center', gap: 4 },
  stepDot:       { width: 28, height: 28, borderRadius: 14, backgroundColor: GRAY_BG, borderWidth: 1.5, borderColor: GRAY_BORDER, alignItems: 'center', justifyContent: 'center' },
  stepDotActive: { backgroundColor: BRAND_RED, borderColor: BRAND_RED },
  stepDotText:   { fontSize: 12, fontWeight: '700', color: 'rgba(0,0,0,0.4)' },
  stepDotTextActive: { color: WHITE },
  stepLabel:     { fontSize: 11, color: 'rgba(0,0,0,0.4)', fontWeight: '500' },
  stepLabelActive: { color: BRAND_RED, fontWeight: '700' },

  scroll:        { padding: 16, paddingBottom: 40 },
  sectionTitle:  { fontSize: 18, fontWeight: '800', color: BLACK, marginBottom: 4 },
  sectionSub:    { fontSize: 13, color: 'rgba(0,0,0,0.45)', marginBottom: 16, lineHeight: 18 },

  checkItem:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  checkLeft:     { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  checkIcon:     { fontSize: 22, marginTop: 1 },
  checkText:     { flex: 1 },
  checkLabel:    { fontSize: 14, fontWeight: '600', color: BLACK, marginBottom: 2 },
  checkDesc:     { fontSize: 12, color: 'rgba(0,0,0,0.45)', lineHeight: 16 },
  checkActions:  { flexDirection: 'row', gap: 8, marginLeft: 8 },
  passBtn:       { width: 34, height: 34, borderRadius: 17, backgroundColor: GRAY_BG, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: GRAY_BORDER },
  passBtnActive: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  failBtn:       { width: 34, height: 34, borderRadius: 17, backgroundColor: GRAY_BG, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: GRAY_BORDER },
  failBtnActive: { backgroundColor: BRAND_RED, borderColor: BRAND_RED },

  photoGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  photoSlot:     { width: (SCREEN_W - 52) / 3, alignItems: 'center' },
  photoPreview:  { width: '100%', aspectRatio: 4/3, borderRadius: 10, backgroundColor: GRAY_BG },
  photoEmpty:    { width: '100%', aspectRatio: 4/3, borderRadius: 10, backgroundColor: GRAY_BG, borderWidth: 1.5, borderColor: BRAND_RED, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  photoLabelRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  photoLabel:    { fontSize: 11, color: 'rgba(0,0,0,0.55)', fontWeight: '500' },
  requiredStar:  { fontSize: 12, color: BRAND_RED, marginLeft: 2, fontWeight: '700' },

  inputLabel:    { fontSize: 13, fontWeight: '600', color: BLACK, marginBottom: 6, marginTop: 12 },
  input:         { backgroundColor: GRAY_BG, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: BLACK, borderWidth: 1, borderColor: GRAY_BORDER },
  inputMulti:    { height: 90, textAlignVertical: 'top' },

  summaryCard:   { backgroundColor: GRAY_BG, borderRadius: 12, padding: 16, marginTop: 20, marginBottom: 20, borderWidth: 1, borderColor: GRAY_BORDER },
  summaryTitle:  { fontSize: 14, fontWeight: '700', color: BLACK, marginBottom: 10 },
  summaryRow:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  summaryKey:    { fontSize: 13, color: 'rgba(0,0,0,0.55)' },
  summaryVal:    { fontSize: 13, fontWeight: '700', color: BLACK },

  btnRow:        { flexDirection: 'row', gap: 10, marginTop: 8 },
  backStepBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 15, borderRadius: 50, borderWidth: 1.5, borderColor: GRAY_BORDER },
  backStepText:  { fontSize: 14, fontWeight: '600', color: BLACK },
  nextBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: BRAND_RED, borderRadius: 50, paddingVertical: 15, marginTop: 24 },
  nextBtnText:   { fontSize: 15, fontWeight: '800', color: WHITE },
  nextBtnDisabled: { backgroundColor: 'rgba(0,0,0,0.15)' },
  submitBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: BLACK, borderRadius: 50, paddingVertical: 15 },

  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  successIcon:      { marginBottom: 20 },
  successTitle:     { fontSize: 22, fontWeight: '800', color: BLACK, marginBottom: 10, textAlign: 'center' },
  successSub:       { fontSize: 14, color: 'rgba(0,0,0,0.5)', lineHeight: 20, textAlign: 'center', marginBottom: 32 },
  confirmBtn:       { backgroundColor: BRAND_RED, borderRadius: 50, paddingVertical: 15, paddingHorizontal: 40 },
  confirmBtnText:   { color: WHITE, fontSize: 15, fontWeight: '800' },
});

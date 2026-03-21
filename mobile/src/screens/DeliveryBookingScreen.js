import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ActivityIndicator,
  Switch,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, radius, shadows } from '../theme';
import api from '../services/api';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const TOTAL_STEPS = 4;

const PACKAGE_SIZES = [
  { id: 'envelope',  label: 'Envelope',   icon: '📄', limit: '<0.5kg',  maxKg: 0.5 },
  { id: 'small',     label: 'Small',      icon: '📦', limit: '<5kg',    maxKg: 5 },
  { id: 'medium',    label: 'Medium',     icon: '📦', limit: '<15kg',   maxKg: 15 },
  { id: 'large',     label: 'Large',      icon: '🗳️', limit: '<30kg',   maxKg: 30 },
  { id: 'extra_large', label: 'Extra Large', icon: '🏗️', limit: '30kg+', maxKg: null },
];

const PAYMENT_METHODS = [
  { id: 'cash',         label: 'Cash',          icon: 'cash-outline' },
  { id: 'mobile_money', label: 'Mobile Money',  icon: 'phone-portrait-outline' },
  { id: 'card',         label: 'Card',          icon: 'card-outline' },
  { id: 'wallet',       label: 'Wallet',        icon: 'wallet-outline' },
];

const COUNTRY_CODES = [
  { code: '+237', flag: '🇨🇲', country: 'CM' },
  { code: '+225', flag: '🇨🇮', country: 'CI' },
  { code: '+221', flag: '🇸🇳', country: 'SN' },
  { code: '+234', flag: '🇳🇬', country: 'NG' },
  { code: '+254', flag: '🇰🇪', country: 'KE' },
  { code: '+1',   flag: '🇺🇸', country: 'US' },
  { code: '+33',  flag: '🇫🇷', country: 'FR' },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Step progress indicator */
function StepIndicator({ currentStep }) {
  return (
    <View style={stepStyles.row}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => {
        const step = i + 1;
        const active = step === currentStep;
        const done = step < currentStep;
        return (
          <React.Fragment key={step}>
            <View style={[stepStyles.circle, done && stepStyles.circleDone, active && stepStyles.circleActive]}>
              {done ? (
                <Ionicons name="checkmark" size={12} color={colors.white} />
              ) : (
                <Text style={[stepStyles.circleText, active && stepStyles.circleTextActive]}>{step}</Text>
              )}
            </View>
            {step < TOTAL_STEPS && (
              <View style={[stepStyles.line, done && stepStyles.lineDone]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const stepStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  circle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.gray200,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.gray300,
  },
  circleDone: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  circleActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  circleText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  circleTextActive: {
    color: colors.white,
  },
  line: {
    flex: 1,
    height: 2,
    backgroundColor: colors.gray300,
    marginHorizontal: 4,
  },
  lineDone: {
    backgroundColor: colors.success,
  },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function DeliveryBookingScreen({ navigation }) {
  const [step, setStep] = useState(1);

  // Step 1 — addresses
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');

  // Step 2 — package details
  const [packageSize, setPackageSize] = useState('small');
  const [weight, setWeight] = useState('');
  const [isFragile, setIsFragile] = useState(false);
  const [signatureRequired, setSignatureRequired] = useState(false);
  const [description, setDescription] = useState('');
  const [packagePhoto, setPackagePhoto] = useState(null);
  const [senderNote, setSenderNote] = useState('');

  // Step 3 — recipient
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+237');
  const [showCountryPicker, setShowCountryPicker] = useState(false);

  // Step 4 — review & pay
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [scheduleForLater, setScheduleForLater] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [fareEstimate, setFareEstimate] = useState(null);
  const [loadingEstimate, setLoadingEstimate] = useState(false);
  const [booking, setBooking] = useState(false);

  // ---------------------------------------------------------------------------
  // Navigation helpers
  // ---------------------------------------------------------------------------
  const goBack = () => {
    if (step > 1) setStep(step - 1);
    else navigation.goBack();
  };

  const goNext = () => setStep(step + 1);

  // ---------------------------------------------------------------------------
  // Step 1 validation
  // ---------------------------------------------------------------------------
  const validateStep1 = () => {
    if (!pickup.trim()) {
      Alert.alert('Missing Info', 'Please enter a pickup address.');
      return false;
    }
    if (!dropoff.trim()) {
      Alert.alert('Missing Info', 'Please enter a drop-off address.');
      return false;
    }
    return true;
  };

  // ---------------------------------------------------------------------------
  // Step 2 validation
  // ---------------------------------------------------------------------------
  const validateStep2 = () => {
    if (!description.trim()) {
      Alert.alert('Missing Info', 'Please describe what\'s inside the package.');
      return false;
    }
    return true;
  };

  // ---------------------------------------------------------------------------
  // Step 3 validation
  // ---------------------------------------------------------------------------
  const validateStep3 = () => {
    if (!recipientName.trim()) {
      Alert.alert('Missing Info', 'Please enter the recipient\'s name.');
      return false;
    }
    if (!recipientPhone.trim() || recipientPhone.trim().length < 6) {
      Alert.alert('Missing Info', 'Please enter a valid recipient phone number.');
      return false;
    }
    return true;
  };

  // ---------------------------------------------------------------------------
  // Fetch estimate when reaching step 4
  // ---------------------------------------------------------------------------
  const fetchEstimate = async () => {
    setLoadingEstimate(true);
    try {
      const res = await api.get('/deliveries/estimate', {
        params: {
          pickup,
          dropoff,
          package_size: packageSize,
          weight: weight ? parseFloat(weight) : undefined,
          fragile: isFragile,
          signature_required: signatureRequired,
        },
      });
      setFareEstimate(res.data?.fare || res.data?.estimate || null);
    } catch (err) {
      console.warn('[DeliveryBooking] Estimate failed:', err.message);
      setFareEstimate(null);
    } finally {
      setLoadingEstimate(false);
    }
  };

  const handleStepNext = () => {
    if (step === 1) {
      if (!validateStep1()) return;
      goNext();
    } else if (step === 2) {
      if (!validateStep2()) return;
      goNext();
    } else if (step === 3) {
      if (!validateStep3()) return;
      fetchEstimate();
      goNext();
    }
  };

  // ---------------------------------------------------------------------------
  // Photo picker
  // ---------------------------------------------------------------------------
  const handlePickPhoto = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
        if (!cameraPermission.granted) {
          Alert.alert('Permission Required', 'Camera or gallery access is needed to add a photo.');
          return;
        }
      }

      Alert.alert('Add Package Photo', 'Choose a source', [
        {
          text: 'Take Photo',
          onPress: async () => {
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              quality: 0.7,
            });
            if (!result.canceled && result.assets?.[0]) {
              setPackagePhoto(result.assets[0].uri);
            }
          },
        },
        {
          text: 'Choose from Gallery',
          onPress: async () => {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              quality: 0.7,
            });
            if (!result.canceled && result.assets?.[0]) {
              setPackagePhoto(result.assets[0].uri);
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } catch (err) {
      Alert.alert('Error', 'Could not open photo picker.');
    }
  };

  // ---------------------------------------------------------------------------
  // Book delivery
  // ---------------------------------------------------------------------------
  const handleBookDelivery = async () => {
    setBooking(true);
    try {
      const payload = {
        pickup_address: pickup,
        dropoff_address: dropoff,
        package_size: packageSize,
        weight: weight ? parseFloat(weight) : undefined,
        fragile: isFragile,
        signature_required: signatureRequired,
        description,
        package_photo_url: packagePhoto,
        sender_note: senderNote,
        recipient_name: recipientName,
        recipient_phone: `${countryCode}${recipientPhone}`,
        payment_method: paymentMethod,
        scheduled_at: scheduleForLater && scheduledDate ? scheduledDate : undefined,
      };

      const res = await api.post('/deliveries', payload);
      const deliveryId = res.data?.delivery?._id || res.data?._id || res.data?.id;

      navigation.replace('DeliveryTracking', { deliveryId });
    } catch (err) {
      Alert.alert('Booking Failed', err.message || 'Unable to book delivery. Please try again.');
    } finally {
      setBooking(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render steps
  // ---------------------------------------------------------------------------
  const renderStep1 = () => (
    <ScrollView style={styles.stepScroll} contentContainerStyle={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.stepTitle}>Pickup & Drop-off</Text>
      <Text style={styles.stepSubtitle}>Where should we pick up and deliver the package?</Text>

      {/* Pickup */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Pickup Location</Text>
        <View style={styles.inputRow}>
          <View style={styles.locationDot} />
          <TextInput
            style={styles.textInput}
            placeholder="Enter pickup address"
            placeholderTextColor={colors.textLight}
            value={pickup}
            onChangeText={setPickup}
            returnKeyType="next"
          />
        </View>
      </View>

      {/* Drop-off */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Drop-off Location</Text>
        <View style={styles.inputRow}>
          <Ionicons name="location" size={18} color={colors.danger} style={styles.locationIcon} />
          <TextInput
            style={styles.textInput}
            placeholder="Enter drop-off address"
            placeholderTextColor={colors.textLight}
            value={dropoff}
            onChangeText={setDropoff}
            returnKeyType="done"
          />
        </View>
      </View>

      <View style={styles.footerSpacer} />
    </ScrollView>
  );

  const renderStep2 = () => {
    const selectedSize = PACKAGE_SIZES.find((s) => s.id === packageSize);
    return (
      <ScrollView style={styles.stepScroll} contentContainerStyle={styles.stepContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.stepTitle}>Package Details</Text>
        <Text style={styles.stepSubtitle}>Tell us about what you're sending.</Text>

        {/* Package size selector */}
        <Text style={styles.inputLabel}>Package Size</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sizePillsScroll}
        >
          {PACKAGE_SIZES.map((size) => {
            const selected = packageSize === size.id;
            return (
              <TouchableOpacity
                key={size.id}
                style={[styles.sizePill, selected && styles.sizePillSelected]}
                onPress={() => setPackageSize(size.id)}
                activeOpacity={0.75}
              >
                <Text style={styles.sizePillIcon}>{size.icon}</Text>
                <Text style={[styles.sizePillLabel, selected && styles.sizePillLabelSelected]}>
                  {size.label}
                </Text>
                <Text style={[styles.sizePillLimit, selected && styles.sizePillLimitSelected]}>
                  {size.limit}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Weight */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Estimated Weight (kg) — Optional</Text>
          <View style={styles.inputRow}>
            <Ionicons name="scale-outline" size={18} color={colors.gray400} style={styles.locationIcon} />
            <TextInput
              style={styles.textInput}
              placeholder="e.g. 2.5"
              placeholderTextColor={colors.textLight}
              value={weight}
              onChangeText={setWeight}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        {/* Fragile toggle */}
        <View style={styles.toggleRow}>
          <View style={styles.toggleLeft}>
            <Text style={styles.toggleIcon}>⚠️</Text>
            <View>
              <Text style={styles.toggleLabel}>Fragile?</Text>
              <Text style={styles.toggleSub}>Adds a fragile handling surcharge</Text>
            </View>
          </View>
          <Switch
            value={isFragile}
            onValueChange={setIsFragile}
            trackColor={{ false: colors.gray300, true: colors.primary + '88' }}
            thumbColor={isFragile ? colors.primary : colors.gray400}
          />
        </View>

        {/* Signature required toggle */}
        <View style={styles.toggleRow}>
          <View style={styles.toggleLeft}>
            <Ionicons name="create-outline" size={20} color={colors.textSecondary} style={{ marginRight: spacing.sm }} />
            <View>
              <Text style={styles.toggleLabel}>Signature Required?</Text>
              <Text style={styles.toggleSub}>Recipient must sign on delivery</Text>
            </View>
          </View>
          <Switch
            value={signatureRequired}
            onValueChange={setSignatureRequired}
            trackColor={{ false: colors.gray300, true: colors.primary + '88' }}
            thumbColor={signatureRequired ? colors.primary : colors.gray400}
          />
        </View>

        {/* Description (required) */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Package Description <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            placeholder="Describe what's inside (e.g. 'documents, clothing, electronics')"
            placeholderTextColor={colors.textLight}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {/* Package photo */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Package Photo — Optional</Text>
          {packagePhoto ? (
            <View style={styles.photoPreviewWrap}>
              <Image source={{ uri: packagePhoto }} style={styles.photoPreview} />
              <TouchableOpacity
                style={styles.removePhotoBtn}
                onPress={() => setPackagePhoto(null)}
              >
                <Ionicons name="close-circle" size={24} color={colors.danger} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.photoBtn} onPress={handlePickPhoto} activeOpacity={0.75}>
              <Ionicons name="camera-outline" size={22} color={colors.primary} />
              <Text style={styles.photoBtnText}>Add package photo</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Sender note */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Special Instructions — Optional</Text>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            placeholder="Any special instructions for the driver?"
            placeholderTextColor={colors.textLight}
            value={senderNote}
            onChangeText={setSenderNote}
            multiline
            numberOfLines={2}
            textAlignVertical="top"
          />
        </View>

        <View style={styles.footerSpacer} />
      </ScrollView>
    );
  };

  const renderStep3 = () => (
    <ScrollView style={styles.stepScroll} contentContainerStyle={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.stepTitle}>Recipient Details</Text>
      <Text style={styles.stepSubtitle}>Who will receive the package?</Text>

      {/* Recipient Name */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Recipient Name <Text style={styles.required}>*</Text></Text>
        <View style={styles.inputRow}>
          <Ionicons name="person-outline" size={18} color={colors.gray400} style={styles.locationIcon} />
          <TextInput
            style={styles.textInput}
            placeholder="Full name"
            placeholderTextColor={colors.textLight}
            value={recipientName}
            onChangeText={setRecipientName}
            returnKeyType="next"
          />
        </View>
      </View>

      {/* Recipient Phone */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Recipient Phone <Text style={styles.required}>*</Text></Text>
        <View style={styles.phoneRow}>
          <TouchableOpacity
            style={styles.countryCodeBtn}
            onPress={() => setShowCountryPicker(!showCountryPicker)}
            activeOpacity={0.75}
          >
            <Text style={styles.countryCodeText}>{countryCode}</Text>
            <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
          </TouchableOpacity>
          <TextInput
            style={[styles.textInput, styles.phoneInput]}
            placeholder="Phone number"
            placeholderTextColor={colors.textLight}
            value={recipientPhone}
            onChangeText={setRecipientPhone}
            keyboardType="phone-pad"
          />
        </View>

        {/* Country code picker */}
        {showCountryPicker && (
          <View style={styles.countryPickerDropdown}>
            {COUNTRY_CODES.map((cc) => (
              <TouchableOpacity
                key={cc.code}
                style={styles.countryPickerItem}
                onPress={() => { setCountryCode(cc.code); setShowCountryPicker(false); }}
                activeOpacity={0.75}
              >
                <Text style={styles.countryPickerFlag}>{cc.flag}</Text>
                <Text style={styles.countryPickerCode}>{cc.code}</Text>
                <Text style={styles.countryPickerCountry}>{cc.country}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Info box */}
      <View style={styles.infoBox}>
        <Ionicons name="information-circle-outline" size={20} color="#3B82F6" style={{ marginRight: spacing.sm }} />
        <Text style={styles.infoBoxText}>
          We'll generate a pickup code for your recipient. Share it with them so the driver can verify the delivery.
        </Text>
      </View>

      <View style={styles.footerSpacer} />
    </ScrollView>
  );

  const renderStep4 = () => {
    const selectedSize = PACKAGE_SIZES.find((s) => s.id === packageSize);
    return (
      <ScrollView style={styles.stepScroll} contentContainerStyle={styles.stepContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.stepTitle}>Review & Pay</Text>
        <Text style={styles.stepSubtitle}>Confirm your delivery details.</Text>

        {/* Summary card */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryCardTitle}>Delivery Summary</Text>

          <View style={styles.summaryRoute}>
            <View style={styles.summaryDots}>
              <View style={styles.summaryDotPickup} />
              <View style={styles.summaryDotLine} />
              <View style={styles.summaryDotDropoff} />
            </View>
            <View style={styles.summaryAddresses}>
              <Text style={styles.summaryAddress} numberOfLines={2}>{pickup}</Text>
              <Text style={styles.summaryAddress} numberOfLines={2}>{dropoff}</Text>
            </View>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryChips}>
            <View style={styles.summaryChip}>
              <Text style={styles.summaryChipText}>{selectedSize?.icon} {selectedSize?.label}</Text>
            </View>
            {isFragile && (
              <View style={[styles.summaryChip, styles.summaryChipWarning]}>
                <Text style={styles.summaryChipText}>⚠️ Fragile</Text>
              </View>
            )}
            {signatureRequired && (
              <View style={[styles.summaryChip, styles.summaryChipInfo]}>
                <Text style={styles.summaryChipText}>✍️ Signature</Text>
              </View>
            )}
          </View>
        </View>

        {/* Fare estimate */}
        <View style={styles.fareCard}>
          <Text style={styles.fareCardLabel}>Estimated Fare</Text>
          {loadingEstimate ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 8 }} />
          ) : fareEstimate != null ? (
            <Text style={styles.fareCardValue}>{Number(fareEstimate).toLocaleString()} XAF</Text>
          ) : (
            <Text style={styles.fareCardNoValue}>— Unavailable —</Text>
          )}
        </View>

        {/* Payment method */}
        <Text style={styles.inputLabel}>Payment Method</Text>
        <View style={styles.paymentGrid}>
          {PAYMENT_METHODS.map((pm) => {
            const selected = paymentMethod === pm.id;
            return (
              <TouchableOpacity
                key={pm.id}
                style={[styles.paymentCard, selected && styles.paymentCardSelected]}
                onPress={() => setPaymentMethod(pm.id)}
                activeOpacity={0.75}
              >
                <Ionicons
                  name={pm.icon}
                  size={22}
                  color={selected ? colors.primary : colors.gray500}
                />
                <Text style={[styles.paymentLabel, selected && styles.paymentLabelSelected]}>
                  {pm.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Schedule for later */}
        <View style={styles.toggleRow}>
          <View style={styles.toggleLeft}>
            <Ionicons name="calendar-outline" size={20} color={colors.textSecondary} style={{ marginRight: spacing.sm }} />
            <View>
              <Text style={styles.toggleLabel}>Schedule for Later?</Text>
              <Text style={styles.toggleSub}>Pick a future date and time</Text>
            </View>
          </View>
          <Switch
            value={scheduleForLater}
            onValueChange={setScheduleForLater}
            trackColor={{ false: colors.gray300, true: colors.primary + '88' }}
            thumbColor={scheduleForLater ? colors.primary : colors.gray400}
          />
        </View>

        {scheduleForLater && (
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Date & Time (YYYY-MM-DD HH:MM)</Text>
            <View style={styles.inputRow}>
              <Ionicons name="time-outline" size={18} color={colors.gray400} style={styles.locationIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="e.g. 2026-03-25 14:30"
                placeholderTextColor={colors.textLight}
                value={scheduledDate}
                onChangeText={setScheduledDate}
              />
            </View>
          </View>
        )}

        <View style={styles.footerSpacer} />
      </ScrollView>
    );
  };

  // ---------------------------------------------------------------------------
  // Step labels
  // ---------------------------------------------------------------------------
  const STEP_LABELS = ['Addresses', 'Package', 'Recipient', 'Review'];

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.flex}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backBtn} onPress={goBack} activeOpacity={0.7}>
              <Ionicons name="arrow-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Book Delivery</Text>
            <View style={styles.headerSpacer} />
          </View>

          {/* Step progress indicator */}
          <StepIndicator currentStep={step} />

          {/* Step label row */}
          <View style={styles.stepLabelRow}>
            {STEP_LABELS.map((label, i) => (
              <Text
                key={label}
                style={[styles.stepLabelText, (i + 1) === step && styles.stepLabelTextActive]}
              >
                {label}
              </Text>
            ))}
          </View>

          {/* Step content */}
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}

          {/* Footer button */}
          <View style={styles.footer}>
            {step < 4 ? (
              <TouchableOpacity
                style={styles.nextBtn}
                onPress={handleStepNext}
                activeOpacity={0.88}
              >
                <Text style={styles.nextBtnText}>Next</Text>
                <Ionicons name="arrow-forward" size={18} color={colors.white} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.nextBtn, booking && styles.nextBtnDisabled]}
                onPress={handleBookDelivery}
                disabled={booking}
                activeOpacity={0.88}
              >
                {booking ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <>
                    <Ionicons name="cube-outline" size={18} color={colors.white} />
                    <Text style={styles.nextBtnText}>Book Delivery</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.white,
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  headerSpacer: {
    width: 40,
  },
  stepLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.sm,
  },
  stepLabelText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textLight,
    textAlign: 'center',
  },
  stepLabelTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  stepScroll: {
    flex: 1,
  },
  stepContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  stepSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  inputGroup: {
    marginBottom: spacing.md,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  required: {
    color: colors.danger,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.gray200,
    minHeight: 50,
  },
  locationDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    marginRight: spacing.sm,
  },
  locationIcon: {
    marginRight: spacing.sm,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    paddingVertical: spacing.sm + 2,
  },
  textArea: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.gray200,
    minHeight: 80,
    flex: 0,
  },
  sizePillsScroll: {
    paddingBottom: spacing.sm,
    gap: spacing.sm,
    paddingRight: spacing.md,
    marginBottom: spacing.md,
  },
  sizePill: {
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.gray200,
    backgroundColor: colors.white,
    minWidth: 80,
    gap: 3,
    ...shadows.sm,
  },
  sizePillSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(255,0,191,0.05)',
  },
  sizePillIcon: {
    fontSize: 20,
  },
  sizePillLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  sizePillLabelSelected: {
    color: colors.primary,
    fontWeight: '700',
  },
  sizePillLimit: {
    fontSize: 10,
    color: colors.textLight,
  },
  sizePillLimitSelected: {
    color: colors.primaryDark,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm + 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
    marginBottom: spacing.md,
  },
  toggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  toggleIcon: {
    fontSize: 18,
    marginRight: spacing.sm,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  toggleSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255,0,191,0.07)',
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: 'rgba(255,0,191,0.2)',
    borderStyle: 'dashed',
  },
  photoBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  photoPreviewWrap: {
    position: 'relative',
    alignSelf: 'flex-start',
  },
  photoPreview: {
    width: 120,
    height: 120,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.gray200,
  },
  removePhotoBtn: {
    position: 'absolute',
    top: -10,
    right: -10,
    backgroundColor: colors.white,
    borderRadius: 12,
  },
  phoneRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  countryCodeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm + 4,
    borderWidth: 1.5,
    borderColor: colors.gray200,
    minWidth: 72,
    justifyContent: 'center',
  },
  countryCodeText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  phoneInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.gray200,
    minHeight: 50,
  },
  countryPickerDropdown: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.gray200,
    marginTop: spacing.xs,
    ...shadows.md,
    overflow: 'hidden',
    zIndex: 100,
  },
  countryPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  countryPickerFlag: {
    fontSize: 18,
  },
  countryPickerCode: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  countryPickerCountry: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.2)',
    marginTop: spacing.md,
  },
  infoBoxText: {
    flex: 1,
    fontSize: 13,
    color: '#3B82F6',
    lineHeight: 20,
    fontWeight: '500',
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.gray200,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  summaryCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  summaryRoute: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  summaryDots: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 4,
  },
  summaryDotPickup: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#3B82F6',
    borderWidth: 2,
    borderColor: 'rgba(59,130,246,0.3)',
  },
  summaryDotLine: {
    width: 2,
    height: 28,
    backgroundColor: colors.gray300,
  },
  summaryDotDropoff: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: colors.danger,
  },
  summaryAddresses: {
    flex: 1,
    justifyContent: 'space-between',
  },
  summaryAddress: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    paddingVertical: 3,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: colors.gray200,
    marginBottom: spacing.sm,
  },
  summaryChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  summaryChip: {
    backgroundColor: colors.gray200,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  summaryChipWarning: {
    backgroundColor: 'rgba(255,140,0,0.15)',
  },
  summaryChipInfo: {
    backgroundColor: 'rgba(59,130,246,0.12)',
  },
  summaryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  fareCard: {
    backgroundColor: 'rgba(255,0,191,0.06)',
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,0,191,0.2)',
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  fareCardLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  fareCardValue: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.primary,
    letterSpacing: -0.5,
  },
  fareCardNoValue: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 4,
  },
  paymentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  paymentCard: {
    flex: 1,
    minWidth: '45%',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.gray200,
    backgroundColor: colors.white,
    gap: spacing.xs,
    ...shadows.sm,
  },
  paymentCardSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(255,0,191,0.05)',
  },
  paymentLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  paymentLabelSelected: {
    color: colors.primary,
    fontWeight: '700',
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.gray200,
  },
  nextBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  nextBtnDisabled: {
    backgroundColor: colors.gray300,
    shadowOpacity: 0,
    elevation: 0,
  },
  nextBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.white,
  },
  footerSpacer: {
    height: spacing.xxl,
  },
});

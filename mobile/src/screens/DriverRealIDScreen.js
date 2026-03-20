import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  StatusBar,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, radius, shadows } from '../theme';
import api from '../services/api';

export default function DriverRealIDScreen({ navigation, route }) {
  const { onSuccess } = route.params || {};

  const [photo, setPhoto] = useState(null); // { uri }
  const [submitting, setSubmitting] = useState(false);

  const handleTakeSelfie = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Camera Permission Required',
          'Please allow camera access in your device settings to take a verification selfie.',
          [{ text: 'OK' }]
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.75,
        cameraType: ImagePicker.CameraType.front,
      });

      if (!result.canceled && result.assets?.length > 0) {
        setPhoto(result.assets[0]);
      }
    } catch (err) {
      Alert.alert('Camera Error', err.message || 'Could not open camera. Please try again.');
    }
  };

  const handleSubmit = async () => {
    if (!photo) {
      Alert.alert('No Photo', 'Please take a selfie first.');
      return;
    }

    setSubmitting(true);
    try {
      // In a full implementation, upload photo to cloud storage first.
      // For now, simulate with a placeholder URL containing timestamp.
      const timestamp = Date.now();
      const selfieUrl = `realid://local/${timestamp}`;

      await api.post('/safety/realid', { selfie_url: selfieUrl });

      // Notify calling screen and navigate back
      if (typeof onSuccess === 'function') {
        onSuccess();
      }
      navigation.goBack();
    } catch (err) {
      Alert.alert(
        'Verification Failed',
        err.message || 'Could not submit your selfie. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    Alert.alert(
      'Skip Verification?',
      'You will not be able to go online without completing identity verification. Skip for now?',
      [
        { text: 'Complete Verification', style: 'cancel' },
        { text: 'Skip for now', style: 'destructive', onPress: () => navigation.goBack() },
      ]
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
        <Text style={styles.headerTitle}>Identity Check</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Hero section */}
        {!photo ? (
          <View style={styles.heroSection}>
            <View style={styles.cameraIconWrap}>
              <Ionicons name="camera" size={64} color="#3B82F6" />
            </View>
            <Text style={styles.heroTitle}>Verify Your Identity</Text>
            <Text style={styles.heroSubtitle}>
              To keep riders safe, we verify your identity before each shift. Please take a clear selfie to confirm it's you.
            </Text>

            {/* Steps */}
            <View style={styles.stepList}>
              {[
                { icon: 'sunny-outline', text: 'Find good lighting — face clearly visible' },
                { icon: 'remove-circle-outline', text: 'Remove sunglasses or hats' },
                { icon: 'checkmark-circle-outline', text: 'Look directly at the front camera' },
              ].map((step, i) => (
                <View key={i} style={styles.stepRow}>
                  <View style={styles.stepIconWrap}>
                    <Ionicons name={step.icon} size={18} color="#3B82F6" />
                  </View>
                  <Text style={styles.stepText}>{step.text}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : (
          /* Photo preview */
          <View style={styles.previewSection}>
            <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
            <View style={styles.photoOverlayBadge}>
              <Ionicons name="checkmark-circle" size={24} color={colors.success} />
              <Text style={styles.photoOverlayText}>Photo captured</Text>
            </View>
            <TouchableOpacity style={styles.retakeBtn} onPress={handleTakeSelfie} activeOpacity={0.8}>
              <Ionicons name="camera-outline" size={16} color="#3B82F6" />
              <Text style={styles.retakeBtnText}>Retake Photo</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Take selfie button */}
        {!photo && (
          <TouchableOpacity style={styles.cameraBtn} onPress={handleTakeSelfie} activeOpacity={0.85}>
            <Ionicons name="camera-outline" size={22} color={colors.white} />
            <Text style={styles.cameraBtnText}>Take Selfie</Text>
          </TouchableOpacity>
        )}

        {/* Submit button — shown after photo is taken */}
        {photo && (
          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <>
                <Ionicons name="shield-checkmark-outline" size={20} color={colors.white} />
                <Text style={styles.submitBtnText}>Submit & Go Online</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Privacy note */}
        <View style={styles.privacyNote}>
          <Ionicons name="lock-closed-outline" size={15} color={colors.textSecondary} />
          <Text style={styles.privacyText}>
            Your photo is kept private and only used for verification. It is never shared with riders.
          </Text>
        </View>

        {/* Skip link */}
        <TouchableOpacity style={styles.skipBtn} onPress={handleSkip} activeOpacity={0.7}>
          <Text style={styles.skipBtnText}>Skip for now</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, alignItems: 'center' },
  // Hero section
  heroSection: { alignItems: 'center', width: '100%', marginBottom: spacing.xl },
  cameraIconWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(59,130,246,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    borderWidth: 2,
    borderColor: 'rgba(59,130,246,0.2)',
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.4,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  stepList: { width: '100%', gap: spacing.md },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  stepIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(59,130,246,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { flex: 1, fontSize: 14, fontWeight: '500', color: colors.text, lineHeight: 20 },
  // Preview section
  previewSection: { alignItems: 'center', width: '100%', marginBottom: spacing.xl },
  photoPreview: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 4,
    borderColor: colors.success,
    marginBottom: spacing.md,
  },
  photoOverlayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  photoOverlayText: { fontSize: 14, fontWeight: '700', color: colors.success },
  retakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: '#3B82F6',
  },
  retakeBtnText: { fontSize: 14, fontWeight: '700', color: '#3B82F6' },
  // Buttons
  cameraBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: '#3B82F6',
    borderRadius: radius.pill,
    paddingVertical: 15,
    width: '100%',
    marginBottom: spacing.lg,
    ...shadows.md,
  },
  cameraBtnText: { fontSize: 16, fontWeight: '800', color: colors.white },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.success,
    borderRadius: radius.pill,
    paddingVertical: 15,
    width: '100%',
    marginBottom: spacing.lg,
    ...shadows.md,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { fontSize: 16, fontWeight: '800', color: colors.white },
  // Privacy & skip
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    width: '100%',
  },
  privacyText: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  skipBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  skipBtnText: { fontSize: 13, color: colors.textLight, fontWeight: '500', textDecorationLine: 'underline' },
});

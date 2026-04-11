/**
 * DriverSelfieCheckScreen — Uber Real-Time ID Check equivalent
 *
 * Before going online each shift, drivers must take a selfie.
 * It's compared against their profile photo using Smile ID liveness API.
 *
 * Flow:
 *   DriverHomeScreen (go online) → DriverSelfieCheckScreen → (passed) → online
 *
 * On pass: navigates back and signals driver is clear to go online.
 * On fail: shows reason, option to retry (max 3 attempts before manual review queue).
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  ActivityIndicator, Alert, StatusBar, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { userService } from '../services/users';

const BRAND_RED = '#E31837';
const BLACK     = '#000000';
const WHITE     = '#FFFFFF';
const GRAY_BG   = '#F7F7F7';

export default function DriverSelfieCheckScreen({ navigation, route }) {
  const { onPassed } = route.params || {};

  const [permission, requestPermission] = useCameraPermissions();
  const [capturedUri,  setCapturedUri]  = useState(null);
  const [submitting,   setSubmitting]   = useState(false);
  const [result,       setResult]       = useState(null); // { status, message, match_score }
  const [attempts,     setAttempts]     = useState(0);
  const cameraRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 1200, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const takeSelfie = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: false,
        skipProcessing: true,
      });
      setCapturedUri(photo.uri);
    } catch (err) {
      Alert.alert('Camera error', 'Could not take photo. Please try again.');
    }
  };

  const retake = () => {
    setCapturedUri(null);
    setResult(null);
  };

  const submitSelfie = async () => {
    if (!capturedUri) return;
    setSubmitting(true);
    try {
      const res = await userService.submitSelfieCheck({ selfie_url: capturedUri });
      setResult(res);
      setAttempts((a) => a + 1);
      if (res.passed) {
        // Short delay for UX — let the success state show before navigating
        setTimeout(() => {
          if (onPassed) onPassed();
          navigation.goBack();
        }, 1800);
      }
    } catch (err) {
      setResult({
        status: 'failed',
        passed: false,
        message: err?.response?.data?.message || 'Verification failed. Please try again.',
      });
      setAttempts((a) => a + 1);
    } finally {
      setSubmitting(false);
    }
  };

  // No camera permission
  if (!permission) return <View style={styles.root} />;
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.permContainer}>
          <Ionicons name="camera-outline" size={64} color={BRAND_RED} />
          <Text style={styles.permTitle}>Camera access required</Text>
          <Text style={styles.permSub}>
            MOBO needs camera access for the identity selfie check before you can go online.
          </Text>
          <TouchableOpacity style={styles.confirmBtn} onPress={requestPermission}>
            <Text style={styles.confirmBtnText}>Allow camera access</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Success state
  if (result?.passed) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.resultContainer}>
          <View style={[styles.resultIcon, { backgroundColor: '#E8F5E9' }]}>
            <Ionicons name="checkmark-circle" size={56} color="#4CAF50" />
          </View>
          <Text style={styles.resultTitle}>Identity Verified</Text>
          <Text style={styles.resultSub}>You're all set — going online now.</Text>
          {result.match_score && (
            <Text style={styles.scoreText}>Match confidence: {(result.match_score * 100).toFixed(0)}%</Text>
          )}
          <ActivityIndicator size="small" color={BRAND_RED} style={{ marginTop: 20 }} />
        </View>
      </SafeAreaView>
    );
  }

  // Manual review state
  if (result?.status === 'manual_review' || attempts >= 3) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.resultContainer}>
          <View style={[styles.resultIcon, { backgroundColor: '#FFF3E0' }]}>
            <Ionicons name="time" size={56} color="#FF9800" />
          </View>
          <Text style={styles.resultTitle}>Under Review</Text>
          <Text style={styles.resultSub}>
            Your selfie has been sent to MOBO safety for manual review.{'\n'}
            This typically takes under 30 minutes.
          </Text>
          <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: '#FF9800', marginTop: 32 }]}
            onPress={() => navigation.goBack()}>
            <Text style={styles.confirmBtnText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={BLACK} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={24} color={WHITE} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ID Check</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Camera / Preview */}
      <View style={styles.cameraContainer}>
        {!capturedUri ? (
          <>
            <CameraView ref={cameraRef} style={styles.camera} facing="front" />
            {/* Oval face guide */}
            <View style={styles.ovalOverlay} pointerEvents="none">
              <Animated.View style={[styles.oval, { transform: [{ scale: pulseAnim }] }]} />
            </View>
            <View style={styles.cameraHint}>
              <Text style={styles.cameraHintText}>Position your face within the oval</Text>
            </View>
          </>
        ) : (
          <Image source={{ uri: capturedUri }} style={styles.preview} />
        )}
      </View>

      {/* Instructions */}
      <View style={styles.infoBox}>
        <Ionicons name="shield-checkmark" size={20} color={BRAND_RED} />
        <Text style={styles.infoText}>
          MOBO requires a daily selfie before you go online to verify your identity and protect riders.
        </Text>
      </View>

      {/* Failed state message */}
      {result?.status === 'failed' && !result.passed && (
        <View style={styles.errorBox}>
          <Ionicons name="warning" size={18} color={BRAND_RED} />
          <Text style={styles.errorText}>{result.message}</Text>
        </View>
      )}

      {/* Attempt counter */}
      {attempts > 0 && !result?.passed && (
        <Text style={styles.attemptText}>Attempt {attempts} of 3</Text>
      )}

      {/* Action buttons */}
      <View style={styles.actions}>
        {!capturedUri ? (
          <TouchableOpacity style={styles.captureBtn} onPress={takeSelfie}>
            <View style={styles.captureRing}>
              <View style={styles.captureInner} />
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.reviewActions}>
            <TouchableOpacity style={styles.retakeBtn} onPress={retake}>
              <Ionicons name="refresh" size={20} color={BLACK} />
              <Text style={styles.retakeBtnText}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, submitting && { backgroundColor: 'rgba(0,0,0,0.3)' }]}
              onPress={submitSelfie}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={WHITE} />
              ) : (
                <>
                  <Ionicons name="checkmark" size={18} color={WHITE} />
                  <Text style={styles.confirmBtnText}>Use this photo</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:           { flex: 1, backgroundColor: BLACK },
  permContainer:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: WHITE },
  permTitle:      { fontSize: 20, fontWeight: '800', color: BLACK, marginTop: 16, marginBottom: 8, textAlign: 'center' },
  permSub:        { fontSize: 14, color: 'rgba(0,0,0,0.5)', textAlign: 'center', lineHeight: 20, marginBottom: 28 },

  header:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: BLACK },
  backBtn:        { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle:    { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: WHITE },

  cameraContainer: { flex: 1, position: 'relative', overflow: 'hidden' },
  camera:         { flex: 1 },
  preview:        { flex: 1, resizeMode: 'cover' },
  ovalOverlay:    { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  oval: {
    width: 220, height: 280, borderRadius: 120,
    borderWidth: 2.5, borderColor: WHITE,
    backgroundColor: 'transparent',
    shadowColor: WHITE, shadowOpacity: 0.3, shadowRadius: 8,
  },
  cameraHint:     { position: 'absolute', bottom: 20, left: 0, right: 0, alignItems: 'center' },
  cameraHintText: { color: WHITE, fontSize: 13, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },

  infoBox:        { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 14, backgroundColor: '#1a1a1a', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  infoText:       { flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 17 },

  errorBox:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 8, padding: 12, backgroundColor: 'rgba(227,24,55,0.12)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(227,24,55,0.3)' },
  errorText:      { flex: 1, fontSize: 13, color: '#ff6b6b' },
  attemptText:    { textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 6 },

  actions:        { paddingHorizontal: 24, paddingVertical: 20, backgroundColor: BLACK },
  captureBtn:     { alignSelf: 'center' },
  captureRing:    { width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: WHITE, alignItems: 'center', justifyContent: 'center' },
  captureInner:   { width: 56, height: 56, borderRadius: 28, backgroundColor: WHITE },

  reviewActions:  { flexDirection: 'row', gap: 12 },
  retakeBtn:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 15, borderRadius: 50, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)' },
  retakeBtnText:  { fontSize: 15, fontWeight: '600', color: WHITE },
  confirmBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: BRAND_RED, borderRadius: 50, paddingVertical: 15 },
  confirmBtnText: { fontSize: 15, fontWeight: '800', color: WHITE },

  resultContainer: { flex: 1, backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center', padding: 32 },
  resultIcon:      { width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  resultTitle:     { fontSize: 22, fontWeight: '800', color: BLACK, marginBottom: 8, textAlign: 'center' },
  resultSub:       { fontSize: 14, color: 'rgba(0,0,0,0.5)', textAlign: 'center', lineHeight: 20 },
  scoreText:       { fontSize: 12, color: 'rgba(0,0,0,0.35)', marginTop: 6 },
});

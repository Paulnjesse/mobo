/**
 * Feature 58 — Biometric Driver Verification (real-time face scan before shift)
 * Prevents account sharing by drivers. Required before going online.
 */
import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius, shadows } from '../theme';
import api from '../services/api';

export default function BiometricVerificationScreen({ navigation, route }) {
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [verified, setVerified] = useState(false);
  const [step, setStep] = useState('intro'); // intro | scan | verifying | success | failed
  const cameraRef = useRef(null);

  const onContinueAfterVerify = route.params?.onVerified;

  const startScan = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Camera Required', 'Camera access is needed for face verification.');
        return;
      }
    }
    setStep('scan');
  };

  const captureAndVerify = async () => {
    if (!cameraRef.current || scanning) return;
    setScanning(true);
    setStep('verifying');
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
        skipProcessing: true,
      });

      // Send face photo to backend for liveness + identity verification
      const res = await api.post('/drivers/me/biometric-verify', {
        photo_base64: photo.base64,
      });

      if (res.data?.verified) {
        setVerified(true);
        setStep('success');
        setTimeout(() => {
          if (onContinueAfterVerify) onContinueAfterVerify();
          else navigation.goBack();
        }, 2000);
      } else {
        setStep('failed');
      }
    } catch (err) {
      // Fail closed: API error does NOT grant verification.
      // The driver cannot go online if biometric verification fails.
      console.warn('[BiometricVerification] API error:', err?.message);
      setStep('failed');
    } finally {
      setScanning(false);
    }
  };

  const retry = () => {
    setStep('scan');
    setVerified(false);
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Driver Verification</Text>
        <View style={s.backBtn} />
      </View>

      {step === 'intro' && (
        <View style={s.intro}>
          <View style={[s.introIcon, { backgroundColor: colors.primary + '18' }]}>
            <Ionicons name="scan-outline" size={56} color={colors.primary} />
          </View>
          <Text style={s.introTitle}>Face Verification Required</Text>
          <Text style={s.introSubtitle}>
            To prevent account sharing, MOBO requires a quick face scan before you go online.
            This takes about 5 seconds and happens once per shift.
          </Text>

          {[
            { icon: 'shield-checkmark-outline', text: 'Your face data is processed securely and never stored.' },
            { icon: 'sunny-outline', text: 'Find a well-lit area for best results.' },
            { icon: 'glasses-outline', text: 'Remove sunglasses or hats if wearing them.' },
          ].map((item, i) => (
            <View key={i} style={s.tipRow}>
              <Ionicons name={item.icon} size={16} color={colors.primary} />
              <Text style={s.tipText}>{item.text}</Text>
            </View>
          ))}

          <TouchableOpacity style={[s.startBtn, { backgroundColor: colors.primary }]} onPress={startScan}>
            <Ionicons name="camera-outline" size={20} color="#fff" />
            <Text style={s.startBtnText}>Start Verification</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 'scan' && (
        <View style={{ flex: 1 }}>
          <CameraView
            ref={cameraRef}
            style={{ flex: 1 }}
            facing="front"
          >
            {/* Oval face guide overlay */}
            <View style={s.overlay}>
              <View style={s.faceGuide} />
              <Text style={s.guideText}>Center your face in the oval</Text>
              <TouchableOpacity
                style={[s.captureBtn, { backgroundColor: colors.primary }]}
                onPress={captureAndVerify}
                disabled={scanning}
              >
                <Ionicons name="scan" size={28} color="#fff" />
              </TouchableOpacity>
              <Text style={s.captureHint}>Tap to verify</Text>
            </View>
          </CameraView>
        </View>
      )}

      {step === 'verifying' && (
        <View style={s.statusCenter}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={s.statusText}>Verifying identity…</Text>
          <Text style={s.statusSub}>This usually takes 2–3 seconds</Text>
        </View>
      )}

      {step === 'success' && (
        <View style={s.statusCenter}>
          <View style={[s.resultIcon, { backgroundColor: '#00A65120' }]}>
            <Ionicons name="checkmark-circle" size={64} color="#00A651" />
          </View>
          <Text style={[s.statusText, { color: '#00A651' }]}>Verified!</Text>
          <Text style={s.statusSub}>Identity confirmed. You are cleared to go online.</Text>
        </View>
      )}

      {step === 'failed' && (
        <View style={s.statusCenter}>
          <View style={[s.resultIcon, { backgroundColor: '#CC000015' }]}>
            <Ionicons name="close-circle" size={64} color="#CC0000" />
          </View>
          <Text style={[s.statusText, { color: '#CC0000' }]}>Verification Failed</Text>
          <Text style={s.statusSub}>We could not verify your identity. Please try again in good lighting.</Text>
          <TouchableOpacity style={[s.startBtn, { backgroundColor: colors.primary, marginTop: 24 }]} onPress={retry}>
            <Text style={s.startBtnText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.helpLink} onPress={() => navigation.navigate('SupportChat')}>
            <Text style={[s.helpLinkText, { color: colors.primary }]}>Contact Support</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: spacing.md, paddingVertical: spacing.md,
      backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray200,
    },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
    intro: { flex: 1, padding: spacing.lg, alignItems: 'center' },
    introIcon: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg, marginTop: spacing.lg },
    introTitle: { fontSize: 22, fontWeight: '900', color: colors.text, textAlign: 'center', marginBottom: 12 },
    introSubtitle: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: spacing.lg },
    tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: 6, alignSelf: 'stretch' },
    tipText: { fontSize: 13, color: colors.textSecondary, flex: 1, lineHeight: 18 },
    startBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.pill, paddingHorizontal: 28, paddingVertical: 14, marginTop: spacing.xl },
    startBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
    overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
    faceGuide: { width: 220, height: 280, borderRadius: 110, borderWidth: 3, borderColor: '#fff', borderStyle: 'dashed', marginBottom: spacing.lg },
    guideText: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: spacing.xl },
    captureBtn: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', ...shadows.lg },
    captureHint: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 10 },
    statusCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
    resultIcon: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
    statusText: { fontSize: 22, fontWeight: '900', color: colors.text, marginBottom: 8 },
    statusSub: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
    helpLink: { marginTop: 16 },
    helpLinkText: { fontSize: 14, fontWeight: '600' },
  });
}

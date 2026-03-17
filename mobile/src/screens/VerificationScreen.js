import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { colors, spacing, radius, shadows } from '../theme';

const OTP_LENGTH = 6;

export default function VerificationScreen({ navigation, route }) {
  const { phone } = route.params || {};
  const { t } = useLanguage();
  const { verifyOtp, resendOtp } = useAuth();

  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const [error, setError] = useState('');
  const inputRefs = useRef([]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setCanResend(true);
    }
  }, [countdown]);

  const handleOtpChange = (val, idx) => {
    if (!/^\d*$/.test(val)) return;
    const updated = [...otp];
    updated[idx] = val.slice(-1);
    setOtp(updated);
    setError('');
    if (val && idx < OTP_LENGTH - 1) {
      inputRefs.current[idx + 1]?.focus();
    }
    if (updated.every((d) => d !== '')) {
      handleVerify(updated.join(''));
    }
  };

  const handleKeyPress = (e, idx) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  };

  const handleVerify = async (code) => {
    const otpCode = code || otp.join('');
    if (otpCode.length < OTP_LENGTH) {
      setError('Please enter all 6 digits');
      return;
    }
    setLoading(true);
    try {
      await verifyOtp(phone, otpCode);
    } catch (err) {
      setError(err.message || t('invalidOtp'));
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!canResend) return;
    try {
      await resendOtp(phone);
      setCountdown(60);
      setCanResend(false);
      setOtp(Array(OTP_LENGTH).fill(''));
      setError('');
      Alert.alert('Code Sent', t('otpResent'));
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to resend code');
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <View style={styles.container}>
          {/* Back */}
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>

          {/* Icon + header */}
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Ionicons name="phone-portrait-outline" size={32} color={colors.primary} />
            </View>
            <Text style={styles.title}>{t('verificationTitle')}</Text>
            <Text style={styles.subtitle}>
              {t('verificationSubtitle')}{'\n'}
              <Text style={styles.phoneText}>{phone}</Text>
            </Text>
          </View>

          {/* OTP boxes */}
          <View style={styles.otpRow}>
            {otp.map((digit, idx) => (
              <TextInput
                key={idx}
                ref={(ref) => (inputRefs.current[idx] = ref)}
                style={[
                  styles.otpBox,
                  digit && styles.otpBoxFilled,
                  error && styles.otpBoxError,
                ]}
                value={digit}
                onChangeText={(val) => handleOtpChange(val, idx)}
                onKeyPress={(e) => handleKeyPress(e, idx)}
                keyboardType="numeric"
                maxLength={1}
                selectTextOnFocus
                caretHidden
              />
            ))}
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* Countdown / Resend */}
          <View style={styles.resendRow}>
            {canResend ? (
              <TouchableOpacity onPress={handleResend} activeOpacity={0.7}>
                <Text style={styles.resendLink}>{t('resendOtp')}</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.countdownText}>
                {t('otpExpires')}{' '}
                <Text style={styles.countdownNum}>
                  {String(Math.floor(countdown / 60)).padStart(2, '0')}:
                  {String(countdown % 60).padStart(2, '0')}
                </Text>
              </Text>
            )}
          </View>

          {/* Verify button */}
          <TouchableOpacity
            style={[styles.verifyBtn, loading && styles.verifyBtnDisabled]}
            onPress={() => handleVerify()}
            disabled={loading}
            activeOpacity={0.88}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <Text style={styles.verifyBtnText}>{t('verifyBtn')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
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
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,0,191,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.sm,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  phoneText: {
    fontWeight: '700',
    color: colors.text,
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginVertical: spacing.xl,
  },
  otpBox: {
    width: 48,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    textAlign: 'center',
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
  },
  otpBoxFilled: {
    backgroundColor: 'rgba(255,0,191,0.08)',
    borderWidth: 2,
    borderColor: colors.primary,
    color: colors.primary,
  },
  otpBoxError: {
    backgroundColor: 'rgba(227,24,55,0.06)',
    borderWidth: 2,
    borderColor: colors.danger,
    color: colors.danger,
  },
  errorText: {
    fontSize: 13,
    color: colors.danger,
    textAlign: 'center',
    marginBottom: spacing.md,
    fontWeight: '500',
  },
  resendRow: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  countdownText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  countdownNum: {
    fontWeight: '700',
    color: colors.text,
  },
  resendLink: {
    fontSize: 15,
    color: colors.primary,
    fontWeight: '700',
  },
  verifyBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  verifyBtnDisabled: {
    opacity: 0.7,
  },
  verifyBtnText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '700',
  },
});

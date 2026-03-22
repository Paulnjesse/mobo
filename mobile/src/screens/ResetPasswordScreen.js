import React, { useState, useRef, useEffect } from 'react';
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
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { authService } from '../services/auth';
import { colors, spacing, radius } from '../theme';

const OTP_LENGTH = 6;

export default function ResetPasswordScreen({ navigation, route }) {
  const { identifier = '', hint = '' } = route.params || {};

  const [otp, setOtp]               = useState(Array(OTP_LENGTH).fill(''));
  const [newPassword, setNewPassword] = useState('');
  const [confirmPw, setConfirmPw]   = useState('');
  const [showPw, setShowPw]         = useState(false);
  const [loading, setLoading]       = useState(false);
  const [otpError, setOtpError]     = useState('');
  const [formError, setFormError]   = useState('');
  const [countdown, setCountdown]   = useState(60);
  const [canResend, setCanResend]   = useState(false);

  const inputRefs = useRef([]);

  useEffect(() => {
    if (countdown > 0) {
      const t = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(t);
    }
    setCanResend(true);
  }, [countdown]);

  // ── OTP digit handlers ──────────────────────────────────────────────────────
  const handleOtpChange = (val, idx) => {
    if (!/^\d*$/.test(val)) return;
    const updated = [...otp];
    updated[idx] = val.slice(-1);
    setOtp(updated);
    setOtpError('');
    if (val && idx < OTP_LENGTH - 1) {
      inputRefs.current[idx + 1]?.focus();
    }
  };

  const handleKeyPress = (e, idx) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  };

  const handleResend = async () => {
    if (!canResend) return;
    try {
      await authService.forgotPassword(identifier);
      setCountdown(60);
      setCanResend(false);
      setOtp(Array(OTP_LENGTH).fill(''));
      setOtpError('');
      Alert.alert('Code Sent', 'A new reset code has been sent.');
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to resend code.');
    }
  };

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleReset = async () => {
    const otpCode = otp.join('');
    setOtpError('');
    setFormError('');

    if (otpCode.length < OTP_LENGTH) {
      setOtpError('Please enter all 6 digits of your reset code.');
      return;
    }
    if (!newPassword) {
      setFormError('Please enter a new password.');
      return;
    }
    if (newPassword.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPw) {
      setFormError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await authService.resetPassword(identifier, otpCode, newPassword);
      Alert.alert(
        'Password Reset',
        'Your password has been reset successfully. You can now log in.',
        [{ text: 'Log In', onPress: () => navigation.navigate('Login') }]
      );
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to reset password.';
      // Show OTP errors in the OTP field, others in form error
      if (msg.toLowerCase().includes('code') || msg.toLowerCase().includes('otp')) {
        setOtpError(msg);
        setOtp(Array(OTP_LENGTH).fill(''));
        inputRefs.current[0]?.focus();
      } else {
        setFormError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const maskedIdentifier = identifier.includes('@')
    ? identifier.replace(/(.{2}).+(@.+)/, '$1***$2')
    : identifier.replace(/(\+?\d{3})\d+(\d{4})/, '$1****$2');

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
            <View style={styles.iconCircle}>
              <Ionicons name="mail-open-outline" size={32} color={colors.primary} />
            </View>
            <Text style={styles.title}>Check your inbox</Text>
            <Text style={styles.subtitle}>
              We sent a 6-digit code to{'\n'}
              <Text style={styles.identifierText}>{maskedIdentifier}</Text>
            </Text>
            {hint ? <Text style={styles.hintText}>{hint}</Text> : null}
          </View>

          {/* ── OTP boxes ──────────────────────────────────────────── */}
          <Text style={styles.sectionLabel}>Enter reset code</Text>
          <View style={styles.otpRow}>
            {otp.map((digit, idx) => (
              <TextInput
                key={idx}
                ref={(r) => (inputRefs.current[idx] = r)}
                style={[
                  styles.otpBox,
                  digit     && styles.otpBoxFilled,
                  otpError  && styles.otpBoxError,
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

          {otpError ? <Text style={styles.errorText}>{otpError}</Text> : null}

          {/* Resend countdown */}
          <View style={styles.resendRow}>
            {canResend ? (
              <TouchableOpacity onPress={handleResend} activeOpacity={0.7}>
                <Text style={styles.resendLink}>Resend code</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.countdownText}>
                Resend in{' '}
                <Text style={styles.countdownNum}>
                  {String(Math.floor(countdown / 60)).padStart(2, '0')}:
                  {String(countdown % 60).padStart(2, '0')}
                </Text>
              </Text>
            )}
          </View>

          {/* ── New password ──────────────────────────────────────── */}
          <Text style={[styles.sectionLabel, { marginTop: spacing.lg }]}>New password</Text>

          <View style={styles.pwWrap}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.gray400} style={styles.pwIcon} />
            <TextInput
              style={styles.pwInput}
              value={newPassword}
              onChangeText={(v) => { setNewPassword(v); setFormError(''); }}
              placeholder="At least 6 characters"
              placeholderTextColor={colors.textLight}
              secureTextEntry={!showPw}
            />
            <TouchableOpacity onPress={() => setShowPw(!showPw)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.gray400} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.sectionLabel, { marginTop: spacing.md }]}>Confirm new password</Text>
          <View style={[styles.pwWrap, confirmPw && newPassword !== confirmPw && styles.pwWrapError]}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.gray400} style={styles.pwIcon} />
            <TextInput
              style={styles.pwInput}
              value={confirmPw}
              onChangeText={(v) => { setConfirmPw(v); setFormError(''); }}
              placeholder="Re-enter password"
              placeholderTextColor={colors.textLight}
              secureTextEntry={!showPw}
            />
            {confirmPw.length > 0 && (
              <Ionicons
                name={newPassword === confirmPw ? 'checkmark-circle' : 'close-circle'}
                size={18}
                color={newPassword === confirmPw ? colors.success : colors.danger}
              />
            )}
          </View>

          {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleReset}
            disabled={loading}
            activeOpacity={0.88}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <Text style={styles.submitBtnText}>Reset Password</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:  { flex: 1, backgroundColor: colors.white },
  flex:  { flex: 1 },
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
    alignItems: 'center',
    paddingVertical: spacing.lg,
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
  identifierText: { fontWeight: '700', color: colors.text },
  hintText: {
    fontSize: 13,
    color: colors.success,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: spacing.sm,
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
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
    marginBottom: spacing.md,
  },
  countdownText: { fontSize: 14, color: colors.textSecondary },
  countdownNum:  { fontWeight: '700', color: colors.text },
  resendLink:    { fontSize: 15, color: colors.primary, fontWeight: '700' },
  pwWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderWidth: 1.5,
    borderColor: colors.gray200,
    marginBottom: spacing.sm,
  },
  pwWrapError: { borderColor: colors.danger },
  pwIcon: { marginRight: spacing.sm },
  pwInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    fontWeight: '500',
  },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '700',
  },
});

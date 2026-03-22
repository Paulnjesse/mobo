import React, { useState } from 'react';
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
import { authService } from '../services/auth';
import { colors, spacing, radius } from '../theme';

export default function ForgotPasswordScreen({ navigation }) {
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  const isEmail = identifier.includes('@');

  const handleSend = async () => {
    const id = identifier.trim();
    if (!id) {
      setError('Please enter your email or phone number.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const result = await authService.forgotPassword(id);
      // Navigate to the OTP + new-password screen regardless of whether the
      // account exists (anti-enumeration). The server message describes the channel.
      navigation.navigate('ResetPassword', {
        identifier: id,
        hint: result.message,
      });
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to send reset code. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
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

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Ionicons name="lock-open-outline" size={32} color={colors.primary} />
            </View>
            <Text style={styles.title}>Forgot password?</Text>
            <Text style={styles.subtitle}>
              Enter the email or phone number linked to your account and we'll send you a 6-digit reset code.
            </Text>
          </View>

          {/* Input */}
          <View style={styles.inputWrap}>
            <Ionicons
              name={isEmail ? 'mail-outline' : 'phone-portrait-outline'}
              size={18}
              color={colors.gray400}
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              value={identifier}
              onChangeText={(v) => { setIdentifier(v); setError(''); }}
              placeholder="Email or phone (+237 6XX XXX XXX)"
              placeholderTextColor={colors.textLight}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
            />
          </View>

          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : null}

          {/* Send button */}
          <TouchableOpacity
            style={[styles.sendBtn, (!identifier.trim() || loading) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!identifier.trim() || loading}
            activeOpacity={0.88}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <Text style={styles.sendBtnText}>Send Reset Code</Text>
            )}
          </TouchableOpacity>

          {/* Back to login */}
          <TouchableOpacity
            style={styles.backToLogin}
            onPress={() => navigation.navigate('Login')}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={14} color={colors.primary} />
            <Text style={styles.backToLoginText}>Back to Login</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:      { flex: 1, backgroundColor: colors.white },
  flex:      { flex: 1 },
  container: { flex: 1, paddingHorizontal: spacing.lg },
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
    paddingHorizontal: spacing.sm,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.gray200,
  },
  inputIcon: { marginRight: spacing.sm },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    fontWeight: '500',
  },
  errorText: {
    fontSize: 13,
    color: colors.danger,
    marginBottom: spacing.md,
    textAlign: 'center',
    fontWeight: '500',
  },
  sendBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  sendBtnDisabled: { opacity: 0.55 },
  sendBtnText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '700',
  },
  backToLogin: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
    gap: 6,
  },
  backToLoginText: {
    fontSize: 15,
    color: colors.primary,
    fontWeight: '600',
  },
});

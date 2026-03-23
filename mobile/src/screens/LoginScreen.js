import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import Input from '../components/Input';
import AdBanner from '../components/AdBanner';
import { colors, spacing, radius, shadows } from '../theme';

// Required by expo-auth-session for web OAuth redirect
WebBrowser.maybeCompleteAuthSession();

// Google OAuth discovery doc
const GOOGLE_DISCOVERY = AuthSession.useAutoDiscovery('https://accounts.google.com');

export default function LoginScreen({ navigation }) {
  const { t } = useLanguage();
  const { login, socialLogin } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState(null); // 'face' | 'fingerprint'
  const [appleAvailable, setAppleAvailable] = useState(false);

  // Google OAuth setup (uses Expo Auth Proxy in dev, scheme redirect in prod)
  const redirectUri = AuthSession.makeRedirectUri({ useProxy: true });
  const [googleRequest, googleResponse, promptGoogleAsync] = AuthSession.useAuthRequest(
    {
      clientId:     process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '',
      scopes:       ['openid', 'profile', 'email'],
      redirectUri,
      responseType: AuthSession.ResponseType.IdToken,
    },
    GOOGLE_DISCOVERY
  );

  useEffect(() => {
    (async () => {
      // Biometric availability
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled   = await LocalAuthentication.isEnrolledAsync();
      if (compatible && enrolled) {
        setBiometricAvailable(true);
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        setBiometricType(
          types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
            ? 'face'
            : 'fingerprint'
        );
      }
      // Apple Sign-In availability (iOS 13+)
      const appleSupported = await AppleAuthentication.isAvailableAsync().catch(() => false);
      setAppleAvailable(appleSupported);
    })();
  }, []);

  // Handle Google OAuth response
  useEffect(() => {
    if (googleResponse?.type === 'success') {
      const { id_token } = googleResponse.params;
      if (id_token) {
        handleSocialLogin('google', id_token);
      }
    } else if (googleResponse?.type === 'error') {
      Alert.alert('Google Sign-In Failed', googleResponse.error?.message || 'Please try again.');
    }
  }, [googleResponse]);

  const handleGoogleLogin = async () => {
    if (!process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID) {
      Alert.alert('Not Configured', 'Google Sign-In is not configured yet. Please use phone/email login.');
      return;
    }
    await promptGoogleAsync();
  };

  const handleAppleLogin = async () => {
    try {
      setSocialLoading(true);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      // credential.identityToken is the JWT we send to the backend
      const name = [credential.fullName?.givenName, credential.fullName?.familyName]
        .filter(Boolean).join(' ');
      await handleSocialLogin('apple', credential.identityToken, {
        email: credential.email,
        name,
      });
    } catch (err) {
      if (err.code !== 'ERR_CANCELED') {
        Alert.alert('Apple Sign-In Failed', err.message || 'Please try again.');
      }
    } finally {
      setSocialLoading(false);
    }
  };

  const handleSocialLogin = async (provider, token, extra = {}) => {
    setSocialLoading(true);
    try {
      await socialLogin(provider, token, extra);
    } catch (err) {
      Alert.alert('Sign-In Failed', err.message || 'Social login failed. Please try again.');
    } finally {
      setSocialLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Login to MOBO',
        fallbackLabel: 'Use password',
        cancelLabel: 'Cancel',
      });
      if (result.success) {
        // Biometric verified — login with stored credentials
        await login(null, null, { biometric: true });
      } else if (result.error !== 'user_cancel' && result.error !== 'system_cancel') {
        Alert.alert('Authentication Failed', 'Could not verify your identity. Please use your password.');
      }
    } catch {
      Alert.alert('Biometric Error', 'Biometric authentication is not available right now.');
    }
  };

  const validate = () => {
    const e = {};
    if (!identifier.trim()) e.identifier = 'Phone or email is required';
    if (!password) e.password = 'Password is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      await login(identifier.trim(), password);
    } catch (err) {
      const msg = err.message || t('loginError');
      Alert.alert('Login Failed', msg);
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
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back button */}
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>

          {/* Logo + header */}
          <View style={styles.header}>
            <View style={styles.logoMark}>
              <Text style={styles.logoLetter}>M</Text>
            </View>
            <Text style={styles.title}>{t('loginTitle')}</Text>
            <Text style={styles.subtitle}>{t('loginSubtitle')}</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Input
              testID="phone-input"
              label={t('phoneOrEmail')}
              placeholder="+237 6XX XXX XXX or email"
              value={identifier}
              onChangeText={setIdentifier}
              autoCapitalize="none"
              keyboardType="email-address"
              error={errors.identifier}
              icon={<Ionicons name="person-outline" size={18} color={colors.gray400} />}
            />

            <Input
              label={t('password')}
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              error={errors.password}
              icon={<Ionicons name="lock-closed-outline" size={18} color={colors.gray400} />}
            />

            <TouchableOpacity
              style={styles.forgotRow}
              onPress={() => navigation.navigate('ForgotPassword')}
              activeOpacity={0.7}
            >
              <Text style={styles.forgotText}>{t('forgotPassword')}</Text>
            </TouchableOpacity>

            {/* Login button */}
            <TouchableOpacity
              testID="continue-button"
              style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.88}
            >
              {loading ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.loginBtnText}>{t('loginBtn')}</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{t('orContinueWith')}</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Google Sign-In */}
          <TouchableOpacity
            style={[styles.googleBtn, socialLoading && styles.loginBtnDisabled]}
            onPress={handleGoogleLogin}
            disabled={socialLoading}
            activeOpacity={0.85}
          >
            {socialLoading ? (
              <ActivityIndicator color={colors.text} size="small" />
            ) : (
              <>
                <Text style={styles.googleIcon}>G</Text>
                <Text style={styles.googleText}>{t('loginWithGoogle')}</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Apple Sign-In (iOS only) */}
          {appleAvailable && Platform.OS === 'ios' && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={radius.pill}
              style={{ width: '100%', height: 52, marginTop: spacing.sm }}
              onPress={handleAppleLogin}
            />
          )}

          {/* Biometric login */}
          {biometricAvailable && (
            <TouchableOpacity style={styles.biometricBtn} onPress={handleBiometricLogin} activeOpacity={0.85}>
              <Ionicons
                name={biometricType === 'face' ? 'scan-outline' : 'finger-print-outline'}
                size={22}
                color={colors.primary}
              />
              <Text style={styles.biometricText}>
                {biometricType === 'face' ? 'Login with Face ID' : 'Login with Fingerprint'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Sign up link */}
          <View style={styles.signupRow}>
            <Text style={styles.signupText}>{t('newToMobo')} </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.signupLink}>{t('signUp')}</Text>
            </TouchableOpacity>
          </View>

          {/* Sliding ad banner — local businesses + MOBO promos */}
          <AdBanner context="auth" />
        </ScrollView>
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
    marginBottom: spacing.lg,
  },
  header: {
    alignItems: 'center',
    paddingBottom: spacing.xl,
  },
  logoMark: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  logoLetter: {
    fontSize: 34,
    fontWeight: '900',
    color: colors.white,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.xs,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  form: {
    marginTop: spacing.sm,
  },
  forgotRow: {
    alignItems: 'flex-end',
    marginTop: -spacing.sm,
    marginBottom: spacing.lg,
  },
  forgotText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  loginBtn: {
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
  loginBtnDisabled: {
    opacity: 0.7,
  },
  loginBtnText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '700',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.gray200,
  },
  dividerText: {
    fontSize: 13,
    color: colors.textLight,
    paddingHorizontal: spacing.md,
    fontWeight: '500',
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.gray200,
    borderRadius: radius.pill,
    height: 52,
    backgroundColor: colors.white,
    gap: spacing.sm,
  },
  googleIcon: {
    fontSize: 18,
    fontWeight: '900',
    color: '#4285F4',
  },
  googleText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  signupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  signupText: {
    fontSize: 15,
    color: colors.textSecondary,
  },
  signupLink: {
    fontSize: 15,
    color: colors.primary,
    fontWeight: '700',
  },
  biometricBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.pill,
    height: 52,
    backgroundColor: colors.white,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  biometricText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
});

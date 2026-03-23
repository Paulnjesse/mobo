/**
 * MOBO Secure Storage Utility
 *
 * Wraps expo-secure-store (iOS Keychain / Android Keystore) for sensitive data.
 * Falls back gracefully on simulators where SecureStore is unavailable.
 *
 * Keys:
 *   SECURE  → access token, refresh token  (SecureStore — hardware-backed AES-256)
 *   UNSAFE  → non-sensitive UI prefs only  (AsyncStorage)
 */
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Key names ────────────────────────────────────────────────────────────────
export const KEYS = {
  ACCESS_TOKEN:   'mobo_access_token',
  REFRESH_TOKEN:  'mobo_refresh_token',
  USER_SAFE:      '@mobo_user_safe',      // AsyncStorage — non-PII only
};

// ─── SecureStore options ──────────────────────────────────────────────────────
// AFTER_FIRST_UNLOCK: accessible after first device unlock, survives reboot.
// Do NOT use ALWAYS — that allows access while device is locked (lower security).
const SECURE_OPTIONS = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

// ─── Token helpers ────────────────────────────────────────────────────────────

export async function saveAccessToken(token) {
  await SecureStore.setItemAsync(KEYS.ACCESS_TOKEN, token, SECURE_OPTIONS);
}

export async function getAccessToken() {
  try {
    return await SecureStore.getItemAsync(KEYS.ACCESS_TOKEN, SECURE_OPTIONS);
  } catch {
    return null;
  }
}

export async function saveRefreshToken(token) {
  await SecureStore.setItemAsync(KEYS.REFRESH_TOKEN, token, SECURE_OPTIONS);
}

export async function getRefreshToken() {
  try {
    return await SecureStore.getItemAsync(KEYS.REFRESH_TOKEN, SECURE_OPTIONS);
  } catch {
    return null;
  }
}

export async function deleteTokens() {
  await Promise.allSettled([
    SecureStore.deleteItemAsync(KEYS.ACCESS_TOKEN),
    SecureStore.deleteItemAsync(KEYS.REFRESH_TOKEN),
  ]);
}

// ─── User profile helpers (non-PII subset only) ────────────────────────────────
// NEVER store: full_name, phone, email, profile_picture, wallet_balance in
// AsyncStorage. Only store: id, role, subscription_plan for routing decisions.

export async function saveUserSafe(user) {
  const safe = {
    id:                user.id,
    role:              user.role,
    subscription_plan: user.subscription_plan ?? null,
    is_driver_online:  user.is_driver_online  ?? false,
  };
  await AsyncStorage.setItem(KEYS.USER_SAFE, JSON.stringify(safe));
}

export async function getUserSafe() {
  try {
    const raw = await AsyncStorage.getItem(KEYS.USER_SAFE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function deleteUserSafe() {
  await AsyncStorage.removeItem(KEYS.USER_SAFE);
}

// ─── Full clear on logout ─────────────────────────────────────────────────────
export async function clearAllSecureData() {
  await Promise.allSettled([
    deleteTokens(),
    deleteUserSafe(),
  ]);
}

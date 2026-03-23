/**
 * MOBO Device Security Checks
 *
 * Detects compromised devices (jailbroken iOS / rooted Android) and
 * enforces minimum OS version requirements before allowing app use.
 *
 * Called once at app startup in App.js (or root navigator).
 *
 * Threat model:
 *   - Jailbroken/rooted devices can bypass SecureStore encryption,
 *     intercept SSL, and tamper with app memory.
 *   - Old OS versions lack security patches required by our risk posture.
 *
 * Note: No client-side check is 100% tamper-proof. This is a friction layer.
 * Backend attestation (Apple DeviceCheck / Google Play Integrity) provides
 * the authoritative check — see docs for server-side implementation.
 */
import * as Device from 'expo-device';
import { Platform, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';

// ── Minimum supported OS versions ─────────────────────────────────────────────
// Below these versions, critical security features are unavailable:
//   iOS 15: App Tracking Transparency, Privacy Nutrition Labels, on-device ML
//   Android 10: Scoped storage, enhanced biometrics, improved TLS
const MIN_IOS_VERSION     = 15;
const MIN_ANDROID_VERSION = 29;  // Android 10 = API 29

// ── Jailbreak indicators ───────────────────────────────────────────────────────
// Paths/apps commonly present on jailbroken iOS devices
const IOS_JAILBREAK_PATHS = [
  '/Applications/Cydia.app',
  '/Library/MobileSubstrate/MobileSubstrate.dylib',
  '/bin/bash',
  '/usr/sbin/sshd',
  '/etc/apt',
  '/private/var/lib/apt/',
  '/usr/bin/ssh',
  '/var/jb',              // palera1n jailbreak
];

// Paths commonly present on rooted Android devices
const ANDROID_ROOT_PATHS = [
  '/system/app/Superuser.apk',
  '/system/xbin/su',
  '/system/bin/su',
  '/sbin/su',
  '/data/local/su',
  '/data/local/bin/su',
  '/data/local/xbin/su',
];

/**
 * Check if the device is jailbroken (iOS) or rooted (Android).
 * Returns { compromised: boolean, indicators: string[] }
 */
async function checkDeviceIntegrity() {
  // expo-device provides a built-in check on supported platforms
  const isRooted = await Device.isRootedExperimentalAsync().catch(() => false);
  if (isRooted) {
    return { compromised: true, indicators: ['expo-device: isRooted=true'] };
  }

  // Supplemental file-system checks
  const paths = Platform.OS === 'ios' ? IOS_JAILBREAK_PATHS : ANDROID_ROOT_PATHS;
  const indicators = [];

  await Promise.all(paths.map(async (path) => {
    try {
      const info = await FileSystem.getInfoAsync(path);
      if (info.exists) indicators.push(path);
    } catch { /* no access = likely not jailbroken */ }
  }));

  return { compromised: indicators.length > 0, indicators };
}

/**
 * Check if the OS meets our minimum version requirement.
 * Returns { supported: boolean, version: string, minRequired: number }
 */
function checkOsVersion() {
  const osVersion  = Device.osVersion || '0';
  const majorStr   = osVersion.split('.')[0];
  const major      = parseInt(majorStr, 10) || 0;
  const minVersion = Platform.OS === 'ios' ? MIN_IOS_VERSION : MIN_ANDROID_VERSION;

  return {
    supported:   major >= minVersion,
    version:     osVersion,
    minRequired: minVersion,
    platform:    Platform.OS,
  };
}

/**
 * Run all device security checks and block the user if the device is unsafe.
 *
 * @param {object}   [opts]
 * @param {boolean}  [opts.blockOnRooted=true]   - Show hard block on rooted/jailbroken
 * @param {boolean}  [opts.blockOnOldOs=true]    - Show hard block on unsupported OS
 * @param {Function} [opts.onBlocked]            - Called with reason if check fails
 * @returns {Promise<{ safe: boolean, reason?: string }>}
 */
export async function runDeviceSecurityChecks(opts = {}) {
  const {
    blockOnRooted = true,
    blockOnOldOs  = true,
    onBlocked,
  } = opts;

  // Skip checks in Expo Go / __DEV__ simulators (no filesystem access anyway)
  if (!Device.isDevice) {
    return { safe: true, skipped: true };
  }

  // ── 1. OS version check ────────────────────────────────────────────────────
  if (blockOnOldOs) {
    const osCheck = checkOsVersion();
    if (!osCheck.supported) {
      const reason = `Unsupported ${osCheck.platform === 'ios' ? 'iOS' : 'Android'} version ` +
        `${osCheck.version}. Please update to ${osCheck.platform === 'ios' ? 'iOS' : 'Android'} ` +
        `${osCheck.minRequired} or later to use MOBO securely.`;

      Alert.alert(
        'Update Required',
        reason + '\n\nYour current OS version does not meet our security requirements.',
        [{ text: 'OK' }],
        { cancelable: false }
      );
      onBlocked?.({ type: 'old_os', ...osCheck });
      return { safe: false, reason: 'old_os', details: osCheck };
    }
  }

  // ── 2. Root / jailbreak check ──────────────────────────────────────────────
  if (blockOnRooted) {
    const integrityCheck = await checkDeviceIntegrity();
    if (integrityCheck.compromised) {
      const platform = Platform.OS === 'ios' ? 'jailbroken' : 'rooted';
      Alert.alert(
        'Security Risk Detected',
        `This device appears to be ${platform}. MOBO cannot run securely on modified devices ` +
        'as your payment and personal data may be at risk.',
        [{ text: 'Close App' }],
        { cancelable: false }
      );
      onBlocked?.({ type: 'compromised_device', ...integrityCheck });
      return { safe: false, reason: 'compromised_device', details: integrityCheck };
    }
  }

  return { safe: true };
}

/**
 * Lighter check for use in DriverHomeScreen before going online.
 * Re-checks integrity without blocking the full UI.
 */
export async function quickIntegrityCheck() {
  if (!Device.isDevice) return true;
  const result = await checkDeviceIntegrity();
  return !result.compromised;
}

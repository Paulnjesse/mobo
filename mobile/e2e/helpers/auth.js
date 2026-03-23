/**
 * E2E Auth Helper
 *
 * Provides a reusable login fixture for Detox test suites.
 * Uses a dedicated test account whose OTP is always '000000' in staging
 * (controlled by a TEST_OTP_BYPASS feature flag on the backend).
 *
 * Environment variables (set in .env.e2e or EAS E2E build profile):
 *   E2E_TEST_PHONE   - Test account phone number (default: +237600000001)
 *   E2E_TEST_OTP     - Bypass OTP for staging  (default: 000000)
 */

const TEST_PHONE = process.env.E2E_TEST_PHONE || '+237600000001';
const TEST_OTP   = process.env.E2E_TEST_OTP   || '000000';
const TIMEOUT_MS = 15_000;

/**
 * Logs in as a rider from the login screen.
 * Assumes the app is freshly launched (device.launchApp called before this).
 */
async function loginAsRider() {
  // Wait for login screen
  await waitFor(element(by.id('phone-input')))
    .toBeVisible()
    .withTimeout(TIMEOUT_MS);

  // Note: LoginScreen uses identifier + password, not OTP phone flow.
  // For OTP flow (VerificationScreen), use loginWithOTP() below.
  await element(by.id('phone-input')).clearText();
  await element(by.id('phone-input')).typeText(TEST_PHONE);
  await element(by.id('continue-button')).tap();

  // Wait for home screen map to confirm successful login
  await waitFor(element(by.id('home-map-view')))
    .toBeVisible()
    .withTimeout(TIMEOUT_MS);
}

/**
 * Logs in via OTP flow (phone → VerificationScreen → home).
 * Requires TEST_OTP_BYPASS=true on the staging backend.
 */
async function loginWithOTP() {
  await waitFor(element(by.id('phone-input')))
    .toBeVisible()
    .withTimeout(TIMEOUT_MS);

  await element(by.id('phone-input')).clearText();
  await element(by.id('phone-input')).typeText(TEST_PHONE);
  await element(by.id('continue-button')).tap();

  // Wait for OTP screen
  await waitFor(element(by.id('otp-input')))
    .toBeVisible()
    .withTimeout(TIMEOUT_MS);

  // Enter bypass OTP digit by digit (Detox types into each box individually)
  for (let i = 0; i < TEST_OTP.length; i++) {
    await element(by.id(`otp-input-${i}`)).typeText(TEST_OTP[i]);
  }

  await element(by.id('verify-button')).tap();

  await waitFor(element(by.id('home-map-view')))
    .toBeVisible()
    .withTimeout(TIMEOUT_MS);
}

/**
 * Logs out from within the app (navigates to settings and taps logout).
 * Call in afterAll() to leave app in clean state.
 */
async function logout() {
  try {
    // Navigate to settings if not already there
    await element(by.id('settings-nav-btn')).tap();
    await element(by.id('logout-button')).tap();
    await element(by.text('Log Out')).tap();   // confirm alert
    await waitFor(element(by.id('phone-input'))).toBeVisible().withTimeout(TIMEOUT_MS);
  } catch {
    // Ignore if already logged out or nav state is different
  }
}

module.exports = { loginAsRider, loginWithOTP, logout };

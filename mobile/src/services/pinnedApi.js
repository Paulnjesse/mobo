/**
 * MOBO Certificate-Pinned HTTP Client
 *
 * Uses react-native-ssl-pinning to enforce TLS certificate pinning on all
 * API requests. Falls back to standard fetch if pinning is unavailable
 * (e.g. Expo Go simulator — pinning not supported without custom dev client).
 *
 * Setup:
 *   1. npx expo install react-native-ssl-pinning
 *   2. Run: npx eas build --profile development  (generates custom dev client)
 *   3. Generate SHA-256 hashes of your API gateway's TLS cert:
 *      openssl s_client -connect mobo-api-gateway.onrender.com:443 </dev/null 2>/dev/null \
 *        | openssl x509 -pubkey -noout \
 *        | openssl pkey -pubin -outform der \
 *        | openssl dgst -sha256 -binary \
 *        | base64
 *   4. Store the hash in EXPO_PUBLIC_API_CERT_SHA256 (and a backup hash for rotation)
 *
 * Pin rotation strategy:
 *   - Always pin TWO hashes: the current cert + the next cert (for zero-downtime rotation)
 *   - Ship a new app version with next cert before rotating the current cert
 *   - Remove the old hash in the subsequent release
 */

import Constants from 'expo-constants';

// SHA-256 hashes of the Subject Public Key Info (SPKI) of our TLS certificates.
// Two hashes for rotation: current + next (backup). Both are valid simultaneously.
const CERT_HASHES = [
  process.env.EXPO_PUBLIC_API_CERT_SHA256        || 'REPLACE_WITH_ACTUAL_CERT_HASH_1',
  process.env.EXPO_PUBLIC_API_CERT_SHA256_BACKUP || 'REPLACE_WITH_ACTUAL_CERT_HASH_2',
].filter(h => !h.startsWith('REPLACE'));  // remove placeholder hashes in dev

// PRODUCTION ENFORCEMENT: cert pinning is mandatory in production builds.
// __DEV__ is false in EAS production/preview builds, true in Expo Go and metro dev server.
const IS_PRODUCTION_BUILD = !__DEV__;
if (IS_PRODUCTION_BUILD && CERT_HASHES.length === 0) {
  throw new Error(
    '[Security] Certificate pinning is required in production builds. ' +
    'Set EXPO_PUBLIC_API_CERT_SHA256 in your .env.production file. ' +
    'See mobile/src/services/pinnedApi.js for setup instructions.'
  );
}

const BASE_URL =
  Constants.expoConfig?.extra?.apiUrl ??
  'https://mobo-api-gateway.onrender.com/api/v1';

/**
 * Makes a certificate-pinned HTTP request.
 * Falls back to standard fetch when:
 *   - Running in Expo Go (no native module)
 *   - No cert hashes configured (development only)
 *
 * @param {string} path     API path (e.g. '/users/profile')
 * @param {object} options  fetch-compatible options
 * @param {string} token    JWT bearer token
 */
export async function pinnedFetch(path, options = {}, token = null) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  // Use pinned fetch when native module is available and hashes are configured
  if (CERT_HASHES.length > 0) {
    try {
      const { fetch: pinnedFetchNative } = require('react-native-ssl-pinning');
      const response = await pinnedFetchNative(url, {
        method:             options.method || 'GET',
        headers,
        body:               options.body,
        sslPinning: {
          certs: CERT_HASHES,
        },
        timeoutInterval: options.timeout || 30000,
      });
      return response;
    } catch (err) {
      if (err.message?.includes('SSL pinning') || err.message?.includes('certificate')) {
        // This is a genuine pinning failure — likely MITM attack
        // Do NOT fall through — throw loudly so the caller can alert the user
        throw Object.assign(new Error('Security error: server certificate validation failed.'), {
          isPinningError: true,
        });
      }
      // Other errors (network, timeout) — re-throw as-is
      throw err;
    }
  }

  // Fallback: standard fetch — ONLY permitted in Expo Go / local dev (IS_PRODUCTION_BUILD=false)
  // This branch is unreachable in production builds (enforced by the startup check above).
  if (IS_PRODUCTION_BUILD) {
    throw new Error('[Security] Certificate pinning bypass is not allowed in production builds.');
  }
  console.warn('[pinnedFetch] Certificate pinning not active — using standard fetch (dev/Expo Go only).');
  const response = await fetch(url, { method: options.method || 'GET', headers, body: options.body });
  return response;
}

/**
 * Convenience: throw on non-2xx status and parse JSON body.
 */
export async function pinnedRequest(path, options = {}, token = null) {
  const response = await pinnedFetch(path, options, token);
  const json = await response.json();
  if (!response.ok) {
    const err = new Error(json?.message || `HTTP ${response.status}`);
    err.status = response.status;
    err.data = json;
    throw err;
  }
  return json;
}

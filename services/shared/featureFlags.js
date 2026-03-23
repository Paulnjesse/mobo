'use strict';

/**
 * featureFlags.js — MOBO Feature Flag Client
 *
 * Wraps the Unleash Node.js SDK (self-hosted Unleash instance).
 * Falls back to a simple in-process toggle map when Unleash is not
 * configured (local dev, CI) so services boot without an Unleash URL.
 *
 * Environment variables:
 *   UNLEASH_URL          — e.g. https://unleash.mobo.internal/api
 *   UNLEASH_API_TOKEN    — client token (not admin token)
 *   UNLEASH_APP_NAME     — identifies this service in the Unleash UI (default: SERVICE_NAME)
 *
 * Usage in any service:
 *   const { isEnabled } = require('../../shared/featureFlags');
 *
 *   if (isEnabled('fraud_detection_v1')) {
 *     await checkGpsSpoofing(update);
 *   }
 *
 * ---
 * Initial flag definitions (configure in Unleash or override via env):
 *
 *   fraud_detection_v1       — GPS spoofing + collusion checks (gradual rollout)
 *   new_surge_algorithm      — Replacement surge pricing model (canary)
 *   gdpr_export_v2           — New GDPR data export format
 *   stripe_webhook_v2        — Enhanced Stripe webhook idempotency
 *   location_purge_enabled   — Kill switch: disable location purge if DB issue
 */

let _client = null;
let _initialized = false;

// In-process fallback defaults (used in dev/CI without Unleash)
const FALLBACK_FLAGS = {
  fraud_detection_v1:     true,
  new_surge_algorithm:    false,
  gdpr_export_v2:         false,
  stripe_webhook_v2:      true,
  location_purge_enabled: true,
};

// Allow override via environment: FEATURE_FRAUD_DETECTION_V1=true
function envOverride(flagName) {
  const envKey = `FEATURE_${flagName.toUpperCase().replace(/-/g, '_')}`;
  const val = process.env[envKey];
  if (val === undefined) return undefined;
  return val === '1' || val.toLowerCase() === 'true';
}

/**
 * Initialize the Unleash client. Called once at service startup.
 * Safe to call multiple times — only initializes on first call.
 */
async function initFeatureFlags() {
  if (_initialized) return;
  _initialized = true;

  const unleashUrl = process.env.UNLEASH_URL;
  const apiToken   = process.env.UNLEASH_API_TOKEN;

  if (!unleashUrl || !apiToken) {
    console.info('[FeatureFlags] UNLEASH_URL or UNLEASH_API_TOKEN not set — using in-process defaults');
    return;
  }

  try {
    const { initialize } = require('unleash-client');
    _client = initialize({
      url:         unleashUrl,
      customHeaders: { Authorization: apiToken },
      appName:     process.env.UNLEASH_APP_NAME || process.env.SERVICE_NAME || 'mobo-service',
      refreshInterval: 15,    // poll every 15 seconds
      metricsInterval: 60,    // report usage metrics every 60 seconds
    });

    await new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        console.warn('[FeatureFlags] Unleash connect timeout — using defaults until connected');
        resolve(); // non-fatal: fallback defaults apply until sync completes
      }, 5000);

      _client.on('ready', () => {
        clearTimeout(t);
        console.info('[FeatureFlags] Unleash client connected and flags synced');
        resolve();
      });

      _client.on('error', (err) => {
        clearTimeout(t);
        console.warn('[FeatureFlags] Unleash error (falling back to defaults):', err.message);
        resolve(); // non-fatal
      });
    });
  } catch (err) {
    console.warn('[FeatureFlags] unleash-client not installed — using in-process defaults');
    console.warn('[FeatureFlags] Install with: npm install unleash-client');
    _client = null;
  }
}

/**
 * Check if a feature flag is enabled for an optional context.
 *
 * @param {string} flagName   - Flag name in Unleash
 * @param {object} [context]  - Unleash context: { userId, sessionId, remoteAddress, properties }
 * @returns {boolean}
 */
function isEnabled(flagName, context = {}) {
  // env override takes highest precedence
  const override = envOverride(flagName);
  if (override !== undefined) return override;

  // Unleash client (when connected)
  if (_client) {
    try {
      return _client.isEnabled(flagName, context);
    } catch (err) {
      console.warn(`[FeatureFlags] isEnabled(${flagName}) error:`, err.message);
    }
  }

  // In-process fallback
  return FALLBACK_FLAGS[flagName] ?? false;
}

/**
 * Get a variant value for a feature flag (A/B or multi-variant).
 *
 * @param {string} flagName
 * @param {object} [context]
 * @returns {{ name: string, payload?: { type: string, value: string }, enabled: boolean }}
 */
function getVariant(flagName, context = {}) {
  if (_client) {
    try {
      return _client.getVariant(flagName, context);
    } catch {}
  }
  return { name: 'disabled', enabled: false };
}

/**
 * Destroy the Unleash client. Called on graceful shutdown.
 */
function destroyFeatureFlags() {
  if (_client && typeof _client.destroy === 'function') {
    _client.destroy();
    _client = null;
  }
}

module.exports = { initFeatureFlags, isEnabled, getVariant, destroyFeatureFlags };

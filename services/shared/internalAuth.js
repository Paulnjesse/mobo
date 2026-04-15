const logger = require('./logger');
/**
 * MOBO Internal Service Authentication Middleware
 *
 * Protects internal inter-service endpoints from unauthorized external access.
 * Each calling service must send two headers:
 *   X-Internal-Service-Key  — the shared or per-service secret
 *   X-Calling-Service       — the service name (user|ride|payment|location|ml)
 *
 * Key resolution order (most specific wins):
 *   1. INTERNAL_SERVICE_KEY_<CALLER>  e.g. INTERNAL_SERVICE_KEY_RIDE
 *   2. INTERNAL_SERVICE_KEY           shared fallback (backward-compat)
 *
 * Benefits of per-service keys:
 *   - Compromise of one service's key cannot be used to call all services
 *   - Each key can be rotated independently
 *   - Audit logs can attribute calls to the specific calling service
 *
 * Security properties:
 *   - Uses crypto.timingSafeEqual() — immune to timing oracle attacks
 *   - Buffers are padded to equal length before comparison — no length leak
 *   - Key is validated at startup — misconfiguration fails fast in production
 *
 * For defence-in-depth, deploy all services on Render's private network so
 * internal routes are not reachable from the public internet at all.
 */
'use strict';

const crypto = require('crypto');

// Validate at startup — fail fast rather than silently accepting all requests
if (process.env.NODE_ENV === 'production') {
  const hasSharedKey = !!process.env.INTERNAL_SERVICE_KEY;
  const hasAnyPerServiceKey = [
    'INTERNAL_SERVICE_KEY_USER',
    'INTERNAL_SERVICE_KEY_RIDE',
    'INTERNAL_SERVICE_KEY_PAYMENT',
    'INTERNAL_SERVICE_KEY_LOCATION',
    'INTERNAL_SERVICE_KEY_ML',
  ].some(k => !!process.env[k]);

  if (!hasSharedKey && !hasAnyPerServiceKey) {
    logger.error('[FATAL] No INTERNAL_SERVICE_KEY or INTERNAL_SERVICE_KEY_<SERVICE> set in production. Exiting.');
    process.exit(1);
  }
}

/**
 * Constant-time comparison of two strings.
 * Returns true only if both strings are identical, regardless of where they differ.
 * Prevents timing-oracle attacks used to brute-force secrets character by character.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function timingSafeStringEqual(a, b) {
  // Normalize to Buffers of equal length to prevent length-based leaks.
  // We always compare buffers of length Math.max(a.length, b.length)
  // so comparison time is constant regardless of where a mismatch occurs.
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  const maxLen = Math.max(aBuf.length, bBuf.length);

  // Pad shorter buffer with zeroes (the comparison result is still correct
  // because the padding zeros won't match any real character in the other buf)
  const aPadded = Buffer.alloc(maxLen);
  const bPadded = Buffer.alloc(maxLen);
  aBuf.copy(aPadded);
  bBuf.copy(bPadded);

  return crypto.timingSafeEqual(aPadded, bPadded);
}

/**
 * Resolve the expected key for an incoming request.
 * Checks INTERNAL_SERVICE_KEY_<CALLER> first, then the shared fallback.
 *
 * @param {string} callingService — value from X-Calling-Service header (already normalised)
 * @returns {string|null}
 */
function resolveExpectedKey(callingService) {
  if (callingService) {
    const perServiceKey = process.env[`INTERNAL_SERVICE_KEY_${callingService.toUpperCase()}`];
    if (perServiceKey) return perServiceKey;
  }
  return process.env.INTERNAL_SERVICE_KEY || null;
}

/**
 * Express middleware: validates the X-Internal-Service-Key header.
 * Also reads X-Calling-Service to resolve a per-service key when available.
 * Returns 403 if the key is missing or incorrect.
 * Always uses constant-time comparison.
 */
function internalAuth(req, res, next) {
  const callingService = (req.headers['x-calling-service'] || '').replace(/[^a-z0-9_-]/gi, '');
  const expected = resolveExpectedKey(callingService);

  if (!expected) {
    // Allow in non-production environments where key is not configured
    if (process.env.NODE_ENV !== 'production') return next();
    // In production, startup check above would have already exited;
    // this branch is a last-resort safety net.
    return res.status(500).json({ success: false, message: 'Server misconfiguration' });
  }

  const provided = req.headers['x-internal-service-key'] || '';

  if (!timingSafeStringEqual(provided, expected)) {
    // Use a generic message — do not reveal whether key was missing vs wrong
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  // Attach calling service identity for downstream use (audit logs, etc.)
  req.callingService = callingService || 'unknown';
  return next();
}

/**
 * Axios request helper that injects the internal service key + caller identity headers.
 *
 * @param {string} callingService — the name of THIS service making the request
 *                                  e.g. 'ride', 'payment', 'user', 'location'
 * @param {object} extra          — additional headers to merge
 *
 * Usage:
 *   const { internalHeaders } = require('../shared/internalAuth');
 *   await axios.get(`${RIDE_SERVICE_URL}/rides/${id}`, {
 *     headers: internalHeaders('payment'),
 *   });
 */
function internalHeaders(callingService = '', extra = {}) {
  // Use per-service key if configured, fall back to shared key
  const key = (callingService
    ? process.env[`INTERNAL_SERVICE_KEY_${callingService.toUpperCase()}`]
    : null) || process.env.INTERNAL_SERVICE_KEY || '';

  return {
    'X-Internal-Service-Key': key,
    'X-Calling-Service':      callingService,
    'Content-Type':           'application/json',
    ...extra,
  };
}

module.exports = { internalAuth, internalHeaders, timingSafeStringEqual };

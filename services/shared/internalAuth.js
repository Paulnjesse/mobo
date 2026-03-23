/**
 * MOBO Internal Service Authentication Middleware
 *
 * Protects internal inter-service endpoints from unauthorized external access.
 * Each service must send the X-Internal-Service-Key header on internal calls.
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
if (process.env.NODE_ENV === 'production' && !process.env.INTERNAL_SERVICE_KEY) {
  console.error('[FATAL] INTERNAL_SERVICE_KEY is not set in production. Exiting.');
  process.exit(1);
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
 * Express middleware: validates the X-Internal-Service-Key header.
 * Returns 403 if the key is missing or incorrect.
 * Always uses constant-time comparison.
 */
function internalAuth(req, res, next) {
  const expected = process.env.INTERNAL_SERVICE_KEY;

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

  return next();
}

/**
 * Axios request helper that injects the internal service key header.
 * Usage:
 *   const { internalHeaders } = require('../shared/internalAuth');
 *   await axios.get(`${RIDE_SERVICE_URL}/rides/${id}`, { headers: internalHeaders() });
 */
function internalHeaders(extra = {}) {
  return {
    'X-Internal-Service-Key': process.env.INTERNAL_SERVICE_KEY || '',
    'Content-Type': 'application/json',
    ...extra,
  };
}

module.exports = { internalAuth, internalHeaders, timingSafeStringEqual };

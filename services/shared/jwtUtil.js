'use strict';
/**
 * Shared JWT utility — abstracts HS256 (dev/test) vs RS256 (production).
 *
 * Configuration:
 *   RS256 (preferred for production):
 *     JWT_PRIVATE_KEY  — PEM RSA private key for signing
 *     JWT_PUBLIC_KEY   — PEM RSA public key for verification (distribute to all services)
 *
 *   HS256 (non-production fallback):
 *     JWT_SECRET       — shared secret, ≥32 characters
 *
 * In production, JWT_PRIVATE_KEY + JWT_PUBLIC_KEY MUST be set.
 * JWT_SECRET alone is rejected in NODE_ENV=production.
 *
 * Token revocation:
 *   Every signed token includes a `jti` (JWT ID) UUID claim.
 *   To revoke a token, call revokeToken(jti, ttlSeconds) which writes
 *   the jti to Redis. The gateway's auth middleware checks this blocklist
 *   on every request via isTokenRevoked(jti).
 */
const jwt    = require('jsonwebtoken');
const crypto = require('crypto'); // randomUUID() available since Node 14.17 — no extra dep needed

const JWT_PRIVATE_KEY = process.env.JWT_PRIVATE_KEY || null;
const JWT_PUBLIC_KEY  = process.env.JWT_PUBLIC_KEY  || null;
const JWT_SECRET      = process.env.JWT_SECRET      || null;

const USE_RS256 = Boolean(JWT_PRIVATE_KEY && JWT_PUBLIC_KEY);

// REQUIRE_RS256=true protects staging/pre-prod environments that share production data.
// NODE_ENV alone is insufficient — a staging env can have NODE_ENV=staging with a prod DB.
const REQUIRE_RS256 = process.env.REQUIRE_RS256 === 'true';

if ((process.env.NODE_ENV === 'production' || REQUIRE_RS256) && !USE_RS256) {
  throw new Error(
    '[FATAL] JWT_PRIVATE_KEY and JWT_PUBLIC_KEY must be configured in production. ' +
    'HS256 shared-secret JWT is not permitted in production environments. ' +
    'To override for non-production use, ensure REQUIRE_RS256 is not set to "true".'
  );
}
if (!USE_RS256 && (!JWT_SECRET || JWT_SECRET.length < 32)) {
  throw new Error(
    '[FATAL] No valid JWT configuration. ' +
    'Set JWT_PRIVATE_KEY+JWT_PUBLIC_KEY (RS256) or JWT_SECRET ≥32 chars (HS256, non-production only).'
  );
}

/**
 * Sign a JWT payload.
 * Uses RS256 when keys are configured, HS256 otherwise (test/dev only).
 * Always injects a `jti` (JWT ID) UUID for revocation support unless
 * the caller has already provided one.
 *
 * @param {object} payload
 * @param {object} options  — jsonwebtoken sign options (expiresIn, etc.)
 * @returns {string}
 */
function signToken(payload, options = {}) {
  const payloadWithJti = { jti: crypto.randomUUID(), ...payload }; // caller's jti takes precedence if set
  if (USE_RS256) {
    return jwt.sign(payloadWithJti, JWT_PRIVATE_KEY, { ...options, algorithm: 'RS256' });
  }
  return jwt.sign(payloadWithJti, JWT_SECRET, options); // HS256 default
}

/**
 * Verify a JWT and return the decoded payload.
 * Throws jsonwebtoken errors (TokenExpiredError, JsonWebTokenError) on failure.
 *
 * @param {string} token
 * @returns {object}
 */
function verifyJwt(token) {
  if (USE_RS256) {
    return jwt.verify(token, JWT_PUBLIC_KEY, { algorithms: ['RS256'] });
  }
  return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
}

/**
 * Verify with ignoreExpiration — used for refresh token flows only.
 * Caller is responsible for applying its own time-bound check.
 *
 * @param {string} token
 * @returns {object}
 */
function decodeIgnoreExpiry(token) {
  if (USE_RS256) {
    return jwt.verify(token, JWT_PUBLIC_KEY, { algorithms: ['RS256'], ignoreExpiration: true });
  }
  return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'], ignoreExpiration: true });
}

// ── Token Revocation ─────────────────────────────────────────────────────────
// Redis is the primary blocklist store (O(1) check per request).
// The revoked_tokens DB table (migration_043) is the durable fallback.
// Lazy-load Redis so services that don't use revocation don't pay the cost.

let _redis = null;
function _getRedis() {
  if (_redis) return _redis;
  try { _redis = require('./redis'); } catch (_) { _redis = null; }
  return _redis;
}

const REVOCATION_KEY = (jti) => `revoked_token:${jti}`;

/**
 * Revoke a token by its jti.
 * Writes to Redis with a TTL equal to the token's remaining lifetime.
 *
 * @param {string} jti         — token's JWT ID claim
 * @param {number} ttlSeconds  — seconds until the token would have expired
 * @returns {Promise<void>}
 */
async function revokeToken(jti, ttlSeconds) {
  const r = _getRedis();
  if (r) {
    await r.set(REVOCATION_KEY(jti), { revoked: true }, Math.max(ttlSeconds, 1));
  }
  // Also persist to DB for durability (best-effort — non-fatal if DB is slow)
  try {
    const { Client } = require('pg');
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl) {
      const client = new Client({ connectionString: dbUrl, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false });
      await client.connect();
      await client.query(
        `INSERT INTO revoked_tokens (jti, revoked_at, expires_at)
         VALUES ($1, NOW(), NOW() + ($2 * INTERVAL '1 second'))
         ON CONFLICT (jti) DO NOTHING`,
        [jti, ttlSeconds]
      );
      await client.end();
    }
  } catch (_) { /* non-fatal — Redis is the primary check */ }
}

/**
 * Check whether a token's jti has been revoked.
 * Returns true if revoked (request should be rejected with 401).
 *
 * @param {string} jti
 * @returns {Promise<boolean>}
 */
async function isTokenRevoked(jti) {
  if (!jti) return false;
  const r = _getRedis();
  if (r) {
    const val = await r.get(REVOCATION_KEY(jti));
    return val !== null;
  }
  return false; // Redis unavailable — fail-open (better UX than blocking all requests)
}

module.exports = { signToken, verifyJwt, decodeIgnoreExpiry, revokeToken, isTokenRevoked, USE_RS256 };

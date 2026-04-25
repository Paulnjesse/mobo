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
 */
const jwt = require('jsonwebtoken');

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
 *
 * @param {object} payload
 * @param {object} options  — jsonwebtoken sign options (expiresIn, etc.)
 * @returns {string}
 */
function signToken(payload, options = {}) {
  if (USE_RS256) {
    return jwt.sign(payload, JWT_PRIVATE_KEY, { ...options, algorithm: 'RS256' });
  }
  return jwt.sign(payload, JWT_SECRET, options); // HS256 default
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

module.exports = { signToken, verifyJwt, decodeIgnoreExpiry, USE_RS256 };

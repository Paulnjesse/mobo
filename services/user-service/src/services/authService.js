'use strict';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { randomInt } = require('crypto');
const db = require('../config/database');
const { OTP, ROLES } = require('../constants');
const {
  UnauthorizedError,
  ConflictError,
  NotFoundError,
  ValidationError,
  ForbiddenError,
} = require('../utils/errors');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'mobo_jwt_secret_change_in_production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// ── Token helpers ─────────────────────────────────────────────────────────────

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// ── OTP helpers ───────────────────────────────────────────────────────────────

function generateOtp() {
  return randomInt(10 ** (OTP.LENGTH - 1), 10 ** OTP.LENGTH).toString();
}

async function getOtpSendCount(phone) {
  try {
    const { rows } = await db.query(
      `SELECT COUNT(*) FROM notifications
       WHERE data->>'phone' = $1 AND type = 'otp_sent'
         AND created_at >= NOW() - INTERVAL '1 hour'`,
      [phone]
    );
    return parseInt(rows[0].count || '0', 10);
  } catch (err) {
    logger.warn('OTP rate limit check failed', { error: err.message });
    return 0;
  }
}

async function logOtpSend(userId, phone) {
  try {
    await db.query(
      `INSERT INTO notifications (user_id, title, message, type, data)
       VALUES ($1, 'OTP Sent', 'Verification OTP was sent', 'otp_sent', $2)`,
      [userId || null, JSON.stringify({ phone })]
    );
  } catch (err) {
    logger.warn('OTP log failed', { error: err.message });
  }
}

// ── Core auth operations ──────────────────────────────────────────────────────

/**
 * Find a user by phone or email. Returns null if not found.
 */
async function findUserByIdentifier(identifier) {
  const isPhone = !identifier.includes('@');
  const field = isPhone ? 'phone' : 'email';
  const { rows } = await db.query(
    `SELECT * FROM users WHERE ${field} = $1 LIMIT 1`,
    [identifier]
  );
  return rows[0] || null;
}

/**
 * Verify password against bcrypt hash.
 * Throws UnauthorizedError on mismatch.
 */
async function verifyPassword(plaintext, hash) {
  const match = await bcrypt.compare(plaintext, hash);
  if (!match) throw new UnauthorizedError('Invalid credentials');
  return true;
}

/**
 * Hash a plaintext password.
 */
async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

/**
 * Check if a phone or email already exists.
 * Throws ConflictError if duplicate found.
 */
async function assertNoDuplicate(phone, email) {
  if (phone) {
    const { rows } = await db.query('SELECT id FROM users WHERE phone = $1 LIMIT 1', [phone]);
    if (rows.length) throw new ConflictError('This phone number is already registered');
  }
  if (email) {
    const { rows } = await db.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [email]);
    if (rows.length) throw new ConflictError('This email address is already registered');
  }
}

/**
 * Build a safe user object to return in API responses (no password/OTP).
 */
function sanitizeUser(user) {
  const { password_hash, otp_code, otp_expires_at, otp_attempts, ...safe } = user;
  return safe;
}

/**
 * Generate an auth token and the safe user object for a login response.
 */
function buildAuthResponse(user) {
  const token = signToken({
    userId: user.id,
    role: user.role,
    phone: user.phone,
  });
  return { token, user: sanitizeUser(user) };
}

module.exports = {
  signToken,
  verifyToken,
  generateOtp,
  getOtpSendCount,
  logOtpSend,
  findUserByIdentifier,
  verifyPassword,
  hashPassword,
  assertNoDuplicate,
  sanitizeUser,
  buildAuthResponse,
};

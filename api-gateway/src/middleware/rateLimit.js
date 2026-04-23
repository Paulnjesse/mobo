'use strict';
const rateLimit = require('express-rate-limit');

// ── Redis store (optional — falls back to in-memory if Redis not configured) ──
let RedisStore;
let redisClient;

if (process.env.REDIS_URL && process.env.NODE_ENV !== 'test') {
  try {
    const { default: RedisStoreClass } = require('rate-limit-redis');
    const Redis = require('ioredis');
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 3000,
    });
    redisClient.on('error', (err) => {
      console.warn('[RateLimit] Redis connection error — falling back to memory store:', err.message);
      redisClient = null;
    });
    RedisStore = RedisStoreClass;
    console.log('[RateLimit] Redis store configured:', process.env.REDIS_URL);
  } catch (err) {
    console.warn('[RateLimit] rate-limit-redis not available — using memory store:', err.message);
  }
}

/**
 * Key generators for different limiter types.
 *
 * MEDIUM-001 fix: pure IP-based keys break behind shared NAT (mobile carriers,
 * corporate offices) where many users share one IP.  We use a composite key:
 *   - Authenticated routes  → user ID  (per-account limit, IP-independent)
 *   - Auth/OTP routes       → phone/email from body, fallback to IP
 *   - Global fallback       → IP only (pre-auth, no user context yet)
 *
 * Prefix with the type tag so the key space stays clean in Redis.
 */
const keyGenerators = {
  /** Authenticated routes — limit per user ID to avoid NAT collisions */
  user_or_ip: (req) =>
    req.user?.id ? `uid:${req.user.id}` : `ip:${req.ip}`,

  /** Auth/OTP routes — limit per phone or email to stop per-account abuse */
  phone_or_ip: (req) => {
    const phone = req.body?.phone;
    const email = req.body?.email;
    if (phone) return `phone:${phone}`;
    if (email) return `email:${email}`;
    return `ip:${req.ip}`;
  },

  /** Global / pre-auth routes — IP only */
  ip: (req) => `ip:${req.ip}`,
};

/**
 * Build a rate limiter with optional Redis backing.
 * Falls back to in-memory when Redis is unavailable.
 *
 * @param {{ windowMs: number, max: number, message: string,
 *           keyPrefix?: string, keyType?: 'ip'|'user_or_ip'|'phone_or_ip' }} opts
 */
function buildLimiter({ windowMs, max, message, keyPrefix = 'rl', keyType = 'ip' }) {
  const options = {
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message, code: 'RATE_LIMIT_EXCEEDED' },
    skip: (req) => req.path === '/health',
    keyGenerator: keyGenerators[keyType] || keyGenerators.ip,
  };

  if (RedisStore && redisClient) {
    options.store = new RedisStore({
      sendCommand: (...args) => redisClient.call(...args),
      prefix: `mobo:${keyPrefix}:`,
    });
  }

  return rateLimit(options);
}

/**
 * Global rate limiter — 200 requests per 15 minutes per IP.
 * IP-based: applied before JWT decode so no user context available.
 */
const globalLimiter = buildLimiter({
  windowMs:  15 * 60 * 1000,
  max:       200,
  message:   'Too many requests from this IP. Please try again in 15 minutes.',
  keyPrefix: 'global',
  keyType:   'ip',
});

/**
 * Auth endpoints (OTP, login) — 20 attempts per 15 minutes per phone/email.
 * Keyed on phone/email from body so NAT users don't share a bucket, and
 * per-account brute-force attempts are blocked regardless of source IP.
 */
const authLimiter = buildLimiter({
  windowMs:  15 * 60 * 1000,
  max:       20,
  message:   'Too many authentication attempts. Please wait 15 minutes.',
  keyPrefix: 'auth',
  keyType:   'phone_or_ip',
});

/**
 * Ride request limiter — 30 requests per minute per authenticated user.
 * User-keyed: a busy driver/rider cannot starve other users sharing the same NAT.
 */
const rideLimiter = buildLimiter({
  windowMs:  60 * 1000,
  max:       30,
  message:   'Too many ride requests. Please slow down.',
  keyPrefix: 'ride',
  keyType:   'user_or_ip',
});

/**
 * Location update limiter — 120 updates per minute per authenticated user.
 */
const locationLimiter = buildLimiter({
  windowMs:  60 * 1000,
  max:       120,
  message:   'Location update rate exceeded.',
  keyPrefix: 'location',
  keyType:   'user_or_ip',
});

/**
 * Payment limiter — 10 attempts per 5 minutes per authenticated user.
 * Most critical to be user-keyed: a single bad actor cannot block payments
 * for an entire office building sharing one IP.
 */
const paymentLimiter = buildLimiter({
  windowMs:  5 * 60 * 1000,
  max:       10,
  message:   'Too many payment attempts. Please wait a few minutes.',
  keyPrefix: 'payment',
  keyType:   'user_or_ip',
});

module.exports = {
  globalLimiter,
  authLimiter,
  rideLimiter,
  locationLimiter,
  paymentLimiter,
};

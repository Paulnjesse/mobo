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
 * Build a rate limiter with optional Redis backing.
 * Falls back to in-memory when Redis is unavailable.
 */
function buildLimiter({ windowMs, max, message, keyPrefix = 'rl' }) {
  const options = {
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message, code: 'RATE_LIMIT_EXCEEDED' },
    skip: (req) => req.path === '/health',
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
 * Global rate limiter — 200 requests per 15 minutes per IP
 */
const globalLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: 'Too many requests from this IP. Please try again in 15 minutes.',
  keyPrefix: 'global',
});

/**
 * Strict limiter for auth endpoints — 20 requests per 15 minutes per IP
 */
const authLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many authentication attempts. Please wait 15 minutes.',
  keyPrefix: 'auth',
});

/**
 * Ride request limiter — 30 requests per minute per IP
 */
const rideLimiter = buildLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many ride requests. Please slow down.',
  keyPrefix: 'ride',
});

/**
 * Location update limiter — 120 updates per minute (every 0.5 seconds)
 */
const locationLimiter = buildLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: 'Location update rate exceeded.',
  keyPrefix: 'location',
});

/**
 * Payment limiter — 10 payment attempts per 5 minutes
 */
const paymentLimiter = buildLimiter({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: 'Too many payment attempts. Please wait a few minutes.',
  keyPrefix: 'payment',
});

module.exports = {
  globalLimiter,
  authLimiter,
  rideLimiter,
  locationLimiter,
  paymentLimiter,
};

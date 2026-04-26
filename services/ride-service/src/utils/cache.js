'use strict';
const logger = require('../utils/logger');
/**
 * Redis cache utility with in-memory fallback
 * Used for: fare estimates, nearby-driver lists, surge multipliers
 */
let redis = null;

/* istanbul ignore next */
if (process.env.REDIS_URL && process.env.NODE_ENV !== 'test') {
  try {
    const Redis = require('ioredis');
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
    });
    redis.on('error', (err) => {
      logger.warn('[Cache] Redis error — falling back to no-cache:', err.message);
      redis = null;
    });
  } catch (e) {
    logger.warn('[Cache] ioredis not available, caching disabled');
  }
}

const memCache = new Map();
const memExpiry = new Map();

/**
 * Get a cached value. Returns null on miss or error.
 */
async function get(key) {
  try {
    /* istanbul ignore next */
    if (redis) {
      const val = await redis.get(key);
      return val ? JSON.parse(val) : null;
    }
    // Memory fallback
    if (memCache.has(key) && Date.now() < (memExpiry.get(key) || 0)) {
      return memCache.get(key);
    }
    memCache.delete(key);
    return null;
  } catch {
    return null;
  }
}

/**
 * Set a cached value with TTL in seconds.
 */
async function set(key, value, ttlSeconds = 60) {
  try {
    /* istanbul ignore next */
    if (redis) {
      await redis.setex(key, ttlSeconds, JSON.stringify(value));
      return;
    }
    memCache.set(key, value);
    memExpiry.set(key, Date.now() + ttlSeconds * 1000);
  } catch {
    // silent
  }
}

/**
 * Delete a cached key.
 */
async function del(key) {
  try {
    /* istanbul ignore next */
    if (redis) { await redis.del(key); return; }
    memCache.delete(key);
    memExpiry.delete(key);
  } catch { /* silent */ }
}

/**
 * Delete all keys matching a pattern (e.g. 'fare:*')
 * Redis only — no-op in memory mode.
 */
async function delPattern(pattern) {
  try {
    /* istanbul ignore next */
    if (redis) {
      const keys = await redis.keys(pattern);
      if (keys.length) await redis.del(...keys);
    }
  } catch { /* silent */ }
}

// ---------------------------------------------------------------------------
// Sorted-set helpers (used by Push DLQ)
// Redis only — graceful no-op when Redis is unavailable.
// ---------------------------------------------------------------------------

/** Add a member to a sorted set with the given score. */
async function zadd(key, score, member) {
  try {
    /* istanbul ignore next */
    if (redis) await redis.zadd(key, score, member);
  } catch { /* silent */ }
}

/** Return all members with score between min and max (inclusive). */
async function zrangebyscore(key, min, max) {
  try {
    /* istanbul ignore next */
    if (redis) return await redis.zrangebyscore(key, min, max);
  } catch { /* silent */ }
  return [];
}

/** Remove a specific member from a sorted set. */
async function zrem(key, member) {
  try {
    /* istanbul ignore next */
    if (redis) await redis.zrem(key, member);
  } catch { /* silent */ }
}

/**
 * Atomically increment a counter and set TTL on first write.
 * Returns the new count. Falls back to get/set when Redis is unavailable.
 * @param {string} key
 * @param {number} ttlSeconds  TTL applied only on the first increment (key creation)
 * @returns {Promise<number>}
 */
async function incr(key, ttlSeconds = 3600) {
  try {
    /* istanbul ignore next */
    if (redis) {
      const newVal = await redis.incr(key);
      if (newVal === 1) await redis.expire(key, ttlSeconds); // set TTL on first write
      return newVal;
    }
    // Memory fallback (non-atomic but sufficient for rate limiting approximation)
    const current = memCache.has(key) && Date.now() < (memExpiry.get(key) || 0)
      ? (memCache.get(key) || 0) : 0;
    const next = current + 1;
    memCache.set(key, next);
    if (next === 1) memExpiry.set(key, Date.now() + ttlSeconds * 1000);
    return next;
  } catch {
    return 0;
  }
}

module.exports = { get, set, del, delPattern, zadd, zrangebyscore, zrem, incr };

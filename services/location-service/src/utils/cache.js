'use strict';
const logger = require('./utils/logger');
/**
 * Redis cache utility with in-memory fallback
 * Used for: fare estimates, nearby-driver lists, surge multipliers
 */
let redis = null;

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
    if (redis) {
      const keys = await redis.keys(pattern);
      if (keys.length) await redis.del(...keys);
    }
  } catch { /* silent */ }
}

module.exports = { get, set, del, delPattern };

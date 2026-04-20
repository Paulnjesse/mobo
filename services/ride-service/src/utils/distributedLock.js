'use strict';
/**
 * Distributed lock via Redis SET NX PX.
 *
 * Prevents duplicate periodic-job execution when ride-service (or any service
 * that imports this) runs as multiple Render instances.
 *
 * Pattern:
 *   - Acquire: SET lockKey 1 NX PX ttlMs  → "OK" or null
 *   - If null → another instance holds the lock; skip this tick silently
 *   - Release: DEL lockKey  (in finally — ensures release even on error)
 *   - TTL is a safety net: if the process crashes mid-job the lock auto-expires
 *     so the next tick on another instance can proceed
 *
 * Graceful degradation:
 *   If REDIS_URL is not set (local dev without Redis) the function runs fn()
 *   unconditionally — same behaviour as before, single-instance safe.
 */

const logger = require('../utils/logger');

let _redis = null;

function _getRedis() {
  if (_redis) return _redis;
  /* istanbul ignore next */
  if (!process.env.REDIS_URL || process.env.NODE_ENV === 'test') return null;
  /* istanbul ignore next */
  try {
    const { Redis } = require('ioredis');
    _redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableOfflineQueue:   false,
      connectTimeout:       3000,
      commandTimeout:       2000,
    });
    _redis.on('error', (err) =>
      logger.warn('[DistributedLock] Redis error (lock operations will degrade to no-op)', {
        err: err.message,
      })
    );
    return _redis;
  } catch (err) {
    logger.warn('[DistributedLock] ioredis unavailable — running without distributed lock', {
      err: err.message,
    });
    return null;
  }
}

/**
 * Run fn() only if this instance can acquire the named lock.
 * Silently skips if another instance already holds it.
 * Falls back to unconditional execution when Redis is unavailable.
 *
 * @param {string}   lockKey  — unique Redis key, e.g. 'lock:escalation-job'
 * @param {number}   ttlMs    — lock auto-expires after this many ms (crash safety)
 * @param {Function} fn       — async work to protect
 */
async function withLock(lockKey, ttlMs, fn) {
  const redis = _getRedis();

  if (!redis) {
    // No Redis → run unconditionally (dev / single-instance)
    await fn();
    return;
  }

  /* istanbul ignore next */
  let acquired = null;
  /* istanbul ignore next */
  try {
    acquired = await redis.set(lockKey, '1', 'NX', 'PX', ttlMs);
  } catch (err) {
    // Redis blip — run unconditionally rather than silently skipping
    logger.warn('[DistributedLock] SET NX failed, running without lock', {
      lockKey,
      err: err.message,
    });
    await fn();
    return;
  }

  /* istanbul ignore next */
  if (!acquired) {
    // Another instance holds the lock — skip this tick
    return;
  }

  /* istanbul ignore next */
  try {
    await fn();
  } finally {
    await redis.del(lockKey).catch((err) =>
      logger.warn('[DistributedLock] DEL failed (lock will expire via TTL)', {
        lockKey,
        err: err.message,
      })
    );
  }
}

module.exports = { withLock };

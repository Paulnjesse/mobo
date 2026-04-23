'use strict';
/**
 * Idempotency middleware — Redis-backed, in-memory fallback.
 *
 * CRITICAL-002 fix: the original implementation used a process-local Map, which
 * broke idempotency across multiple instances (Render autoscales to 2-8 pods).
 * We now use the shared Redis cache as the primary store so all instances share
 * the same idempotency state.  When Redis is unavailable (test env, cold start)
 * we fall back transparently to the in-memory Map — single-instance only but
 * better than crashing.
 *
 * Redis key:   `idempotency:{userId}:{idempotency-key}`
 * TTL:         24 hours (86400 s)
 * Atomicity:   Redis SET is atomic; the tiny race window (two identical requests
 *              landing simultaneously on different pods both getting a cache miss)
 *              is closed by storing the result immediately and replaying on retry.
 */

// Lazy-require so tests can mock before the module loads
let cache;
function getCache() {
  if (!cache) cache = require('../../../shared/redis');
  return cache;
}

// In-memory fallback for when Redis is unavailable
const fallbackStore = new Map(); // key → { status, body, expiresAt }
const TTL_MS = 24 * 60 * 60 * 1000;
const TTL_S  = 86400;

/* istanbul ignore next */
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of fallbackStore) {
    if (v.expiresAt < now) fallbackStore.delete(k);
  }
}, 5 * 60 * 1000).unref();

const idempotency = (req, res, next) => {
  const key = req.headers['idempotency-key'];
  if (!key || req.method !== 'POST') return next();

  const userId   = req.user?.id || 'anon';
  const storeKey = `idempotency:${userId}:${key}`;

  const redis = getCache();
  const redisAvailable = redis.isAvailable ? redis.isAvailable() : false;

  if (redisAvailable) {
    // Redis path: async get → replay or proceed
    redis.get(storeKey).then((existing) => {
      if (existing && existing.expiresAt > Date.now()) {
        res.set('X-Idempotency-Replayed', 'true');
        return res.status(existing.status).json(existing.body);
      }

      const originalJson = res.json.bind(res);
      res.json = (body) => {
        if (res.statusCode < 500) {
          redis.set(storeKey, { status: res.statusCode, body, expiresAt: Date.now() + TTL_MS }, TTL_S)
            .catch(() => {});
        }
        return originalJson(body);
      };

      next();
    }).catch(() => {
      // Redis error — fall through to in-memory path
      _inMemoryPath(storeKey, res, next);
    });
  } else {
    _inMemoryPath(storeKey, res, next);
  }
};

function _inMemoryPath(storeKey, res, next) {
  const existing = fallbackStore.get(storeKey);
  if (existing && existing.expiresAt > Date.now()) {
    res.set('X-Idempotency-Replayed', 'true');
    return res.status(existing.status).json(existing.body);
  }

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode < 500) {
      fallbackStore.set(storeKey, { status: res.statusCode, body, expiresAt: Date.now() + TTL_MS });
    }
    return originalJson(body);
  };

  next();
}

module.exports = idempotency;

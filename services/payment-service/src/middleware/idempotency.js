'use strict';
// In-memory store (replace with Redis for multi-instance production)
// Redis key: `idempotency:{storeKey}` with EX = 86400
const store = new Map(); // key → { status, body, expiresAt }
const TTL_MS = 24 * 60 * 60 * 1000;

// Cleanup expired keys every 5 minutes
/* istanbul ignore next */
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.expiresAt < now) store.delete(k);
  }
}, 5 * 60 * 1000).unref();

const idempotency = (req, res, next) => {
  const key = req.headers['idempotency-key'];
  if (!key || req.method !== 'POST') return next();

  const userId = req.user?.id || 'anon';
  const storeKey = `${userId}:${key}`;

  const existing = store.get(storeKey);
  if (existing && existing.expiresAt > Date.now()) {
    res.set('X-Idempotency-Replayed', 'true');
    return res.status(existing.status).json(existing.body);
  }

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode < 500) {
      store.set(storeKey, { status: res.statusCode, body, expiresAt: Date.now() + TTL_MS });
    }
    return originalJson(body);
  };

  next();
};

module.exports = idempotency;

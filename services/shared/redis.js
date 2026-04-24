const logger = require('./logger');
/**
 * MOBO Shared Redis Cache Helper
 * Used by ride-service (nearby drivers, surge zones) and location-service.
 * Falls back gracefully if REDIS_URL is not set.
 */
'use strict';

let redis = null;
let redisAvailable = false;

// ── Redis connection mode ────────────────────────────────────────────────────
// REDIS_SENTINEL_HOSTS  — comma-separated "host:port" list (Sentinel HA mode)
//   e.g. REDIS_SENTINEL_HOSTS=sentinel1:26379,sentinel2:26379,sentinel3:26379
//        REDIS_SENTINEL_MASTER=mymaster   (default: 'mymaster')
// REDIS_URL             — single standalone URL (dev / Render managed Redis)
//
// Sentinel mode is preferred when REDIS_SENTINEL_HOSTS is set.  It provides
// automatic failover: if the primary Redis crashes, a replica is promoted and
// ioredis reconnects transparently within seconds.
// ─────────────────────────────────────────────────────────────────────────────

const SENTINEL_HOSTS  = process.env.REDIS_SENTINEL_HOSTS;
const SENTINEL_MASTER = process.env.REDIS_SENTINEL_MASTER || 'mymaster';

if (SENTINEL_HOSTS) {
  // Sentinel (HA) mode via ioredis
  try {
    const Redis = require('ioredis');
    const sentinels = SENTINEL_HOSTS.split(',').map((h) => {
      const [host, port] = h.trim().split(':');
      return { host, port: Number(port) || 26379 };
    });

    redis = new Redis({
      sentinels,
      name:              SENTINEL_MASTER,
      password:          process.env.REDIS_PASSWORD || undefined,
      enableReadyCheck:  true,
      maxRetriesPerRequest: 3,
      retryStrategy: /* istanbul ignore next */ (times) => Math.min(times * 200, 5_000),
    });

    redis.on('error', /* istanbul ignore next */ (err) => {
      logger.warn('[Redis/Sentinel] Connection error (non-fatal):', err.message);
      redisAvailable = false;
    });
    redis.on('ready', /* istanbul ignore next */ () => {
      logger.info('[Redis/Sentinel] Connected and ready');
      redisAvailable = true;
    });
    redis.on('+failover-end', /* istanbul ignore next */ () => {
      logger.warn('[Redis/Sentinel] Failover completed — reconnected to new primary');
    });

    // Wrap ioredis into the same { get, setEx, del, keys } API as node-redis
    // so the rest of the module is interface-compatible.
    redis = {
      get:    (k)          => redis.get(k),
      setEx:  (k, ttl, v)  => redis.set(k, v, 'EX', ttl),
      del:    (...keys)    => redis.del(...keys),
      keys:   (pattern)    => redis.keys(pattern),
    };

    redisAvailable = true;
  } catch (err) {
    logger.warn('[Redis/Sentinel] ioredis not available:', err.message);
  }
} else if (process.env.REDIS_URL) {
  try {
    const { createClient } = require('redis');

    // Build client options — enforce TLS in production
    const clientOptions = { url: process.env.REDIS_URL };

    if (process.env.NODE_ENV === 'production') {
      // Render's managed Redis provides rediss:// URL (TLS) automatically.
      // For self-hosted Redis, use REDIS_URL=rediss://... to enable TLS.
      if (process.env.REDIS_URL.startsWith('rediss://')) {
        clientOptions.socket = { tls: true, rejectUnauthorized: true };
      } else {
        logger.warn('[Redis] WARNING: REDIS_URL does not use TLS (rediss://). ' +
          'In production, all Redis traffic should be encrypted.');
      }
    }

    redis = createClient(clientOptions);

    redis.on('error', (err) => {
      logger.warn('[Redis] Connection error (non-fatal):', err.message);
      redisAvailable = false;
    });
    redis.on('ready', () => {
      logger.info('[Redis] Connected and ready');
      redisAvailable = true;
    });
    redis.connect().catch((err) => {
      logger.warn('[Redis] Could not connect (non-fatal):', err.message);
    });
  } catch (err) {
    logger.warn('[Redis] Module not available:', err.message);
  }
}

/**
 * Get a cached value by key.
 * @param {string} key
 * @returns {Promise<any|null>} Parsed JSON value or null if not found/unavailable
 */
async function get(key) {
  if (!redis || !redisAvailable) return null;
  try {
    const val = await redis.get(key);
    return val ? JSON.parse(val) : null;
  } catch (err) {
    logger.warn('[Redis] get error:', err.message);
    return null;
  }
}

/**
 * Set a cached value with optional TTL.
 * @param {string} key
 * @param {any} value  — will be JSON.stringified
 * @param {number} [ttlSeconds=60]
 */
async function set(key, value, ttlSeconds = 60) {
  if (!redis || !redisAvailable) return;
  try {
    await redis.setEx(key, ttlSeconds, JSON.stringify(value));
  } catch (err) {
    logger.warn('[Redis] set error:', err.message);
  }
}

/**
 * Delete a key (cache invalidation).
 * @param {string} key
 */
async function del(key) {
  if (!redis || !redisAvailable) return;
  try {
    await redis.del(key);
  } catch (err) {
    logger.warn('[Redis] del error:', err.message);
  }
}

/**
 * Delete all keys matching a pattern (e.g. 'nearby_drivers:*').
 * @param {string} pattern
 */
async function delPattern(pattern) {
  if (!redis || !redisAvailable) return;
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(keys);
  } catch (err) {
    logger.warn('[Redis] delPattern error:', err.message);
  }
}

/**
 * Cache keys used across services (centralized naming).
 */
const KEYS = {
  nearbyDrivers: (lat, lng, type) => `nearby_drivers:${lat}:${lng}:${type}`,
  surgeZones: (city)             => `surge_zones:${city}`,
  fareEstimate: (pickupLat, pickupLng, dropLat, dropLng, type) =>
    `fare:${pickupLat}:${pickupLng}:${dropLat}:${dropLng}:${type}`,
  riderProfile: (userId)         => `rider_profile:${userId}`,
  driverStatus: (driverId)       => `driver_status:${driverId}`,
  shuttleRoutes: (city)          => `shuttle_routes:${city}`,
};

// TTL constants (seconds)
const TTL = {
  NEARBY_DRIVERS: 30,
  SURGE_ZONES: 60,
  FARE_ESTIMATE: 120,
  RIDER_PROFILE: 300,
  DRIVER_STATUS: 10,
  SHUTTLE_ROUTES: 600,
};

module.exports = { get, set, del, delPattern, KEYS, TTL, isAvailable: () => redisAvailable };

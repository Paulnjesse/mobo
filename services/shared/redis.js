/**
 * MOBO Shared Redis Cache Helper
 * Used by ride-service (nearby drivers, surge zones) and location-service.
 * Falls back gracefully if REDIS_URL is not set.
 */
'use strict';

let redis = null;
let redisAvailable = false;

// Only connect if REDIS_URL is provided
if (process.env.REDIS_URL) {
  try {
    const { createClient } = require('redis');

    // Build client options — enforce TLS in production
    const clientOptions = { url: process.env.REDIS_URL };

    if (process.env.NODE_ENV === 'production') {
      // Render's managed Redis provides rediss:// URL (TLS) automatically.
      // For self-hosted Redis, use REDIS_URL=rediss://... to enable TLS.
      // rejectUnauthorized: true validates the Redis server certificate.
      if (process.env.REDIS_URL.startsWith('rediss://')) {
        clientOptions.socket = { tls: true, rejectUnauthorized: true };
      } else {
        console.warn('[Redis] WARNING: REDIS_URL does not use TLS (rediss://). ' +
          'In production, all Redis traffic should be encrypted.');
      }
    }

    redis = createClient(clientOptions);

    redis.on('error', (err) => {
      console.warn('[Redis] Connection error (non-fatal):', err.message);
      redisAvailable = false;
    });
    redis.on('ready', () => {
      console.info('[Redis] Connected and ready');
      redisAvailable = true;
    });
    redis.connect().catch((err) => {
      console.warn('[Redis] Could not connect (non-fatal):', err.message);
    });
  } catch (err) {
    console.warn('[Redis] Module not available:', err.message);
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
    console.warn('[Redis] get error:', err.message);
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
    console.warn('[Redis] set error:', err.message);
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
    console.warn('[Redis] del error:', err.message);
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
    console.warn('[Redis] delPattern error:', err.message);
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

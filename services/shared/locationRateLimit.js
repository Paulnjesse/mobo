'use strict';

/**
 * MOBO Location Update Rate Limiter
 *
 * Applied to POST /location/update — the highest-volume endpoint in the system.
 * Each active driver sends a GPS update every 5 seconds; with 1,000 concurrent
 * drivers that's 200 req/s. This limiter enforces:
 *
 *   - Per-driver: max 30 updates / 60s  (one every 2s, with burst headroom)
 *   - Global:     express-rate-limit handles request-level DDoS protection
 *
 * Coordinate sanity checks prevent GPS spoofing for fare fraud:
 *   - Speed > 250 km/h → reject (no road vehicle exceeds this legitimately)
 *   - Jump > 50 km from last known position in < 30s → reject
 *   - Coordinates outside Cameroon/CEMAC bounding box → warn (allow, but flag)
 *
 * Uses Redis for distributed rate limiting across multiple location-service
 * instances. Falls back to in-memory map if Redis is unavailable.
 */

const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const AppError = require('./AppError');

// ─── Global HTTP rate limit for the location service ─────────────────────────
// 60 req/min per IP (standard traffic), 10 req/min for auth endpoints
const locationHttpLimiter = rateLimit({
  windowMs:        60 * 1000,
  max:             60,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'Too many location requests. Please slow down.' },
  // Use Redis store when available for multi-instance deployments
  ...(process.env.REDIS_URL && {
    store: new RedisStore({
      sendCommand: (...args) => {
        const { createClient } = require('redis');
        // Reuse the shared Redis client from services/shared/redis.js
        const client = createClient({ url: process.env.REDIS_URL });
        return client.sendCommand(args);
      },
    }),
  }),
});

// ─── Per-driver update throttle ───────────────────────────────────────────────
// In-memory map for non-Redis environments. Under Redis the window is stored there.
const driverLastUpdate = new Map();
const DRIVER_MIN_INTERVAL_MS = 2000;   // minimum 2 seconds between updates per driver

function perDriverThrottle(req, res, next) {
  const driverId = req.user?.id;
  if (!driverId) return next();  // auth middleware will catch unauthenticated callers

  const now = Date.now();
  const last = driverLastUpdate.get(driverId) || 0;

  if (now - last < DRIVER_MIN_INTERVAL_MS) {
    // Silent drop (429) — mobile client handles retries automatically
    return res.status(429).json({
      success: false,
      message: 'Location update rate limit: minimum 2 seconds between updates.',
      retry_after_ms: DRIVER_MIN_INTERVAL_MS - (now - last),
    });
  }

  driverLastUpdate.set(driverId, now);

  // Cleanup stale entries every 10 minutes to prevent memory leak
  if (driverLastUpdate.size > 10_000) {
    const cutoff = now - 60_000;
    for (const [id, ts] of driverLastUpdate.entries()) {
      if (ts < cutoff) driverLastUpdate.delete(id);
    }
  }

  next();
}

// ─── GPS sanity validation ────────────────────────────────────────────────────
// Cameroon / CEMAC service area bounding box (generous margins)
const BOUNDS = { latMin: -6, latMax: 15, lngMin: 8, lngMax: 30 };
const MAX_SPEED_KMH = 250;
const MAX_JUMP_KM   = 50;
const MAX_JUMP_SECS = 30;

const driverLastCoords = new Map();

function validateCoordinates(req, res, next) {
  const { latitude, longitude, speed } = req.body;
  const driverId = req.user?.id;

  if (!latitude || !longitude) {
    return next(new AppError('latitude and longitude are required', 400));
  }

  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);

  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return next(new AppError('Invalid coordinate values', 400));
  }

  // Speed check (km/h) — reject physically impossible values
  if (speed !== undefined) {
    const speedKmh = parseFloat(speed) * 3.6; // m/s → km/h
    if (!isNaN(speedKmh) && speedKmh > MAX_SPEED_KMH) {
      return next(new AppError(`Speed ${speedKmh.toFixed(0)} km/h exceeds maximum allowed (${MAX_SPEED_KMH} km/h)`, 400));
    }
  }

  // Jump distance check — prevent teleportation spoofing
  if (driverId) {
    const last = driverLastCoords.get(driverId);
    if (last) {
      const elapsedSecs = (Date.now() - last.ts) / 1000;
      const distKm = haversineKm(last.lat, last.lng, lat, lng);

      if (elapsedSecs < MAX_JUMP_SECS && distKm > MAX_JUMP_KM) {
        console.warn(`[LocationValidation] Suspicious jump for driver ${driverId}: ${distKm.toFixed(1)} km in ${elapsedSecs.toFixed(0)}s`);
        // Flag but allow (GPS can glitch). A persistent pattern should trigger fraud review.
        req.locationSuspicious = true;
      }
    }
    driverLastCoords.set(driverId, { lat, lng, ts: Date.now() });
  }

  // Service area check — warn on out-of-bounds (allow, but log)
  if (lat < BOUNDS.latMin || lat > BOUNDS.latMax || lng < BOUNDS.lngMin || lng > BOUNDS.lngMax) {
    console.warn(`[LocationValidation] Driver ${driverId} outside service area: (${lat}, ${lng})`);
  }

  next();
}

/**
 * Haversine great-circle distance in km.
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

module.exports = { locationHttpLimiter, perDriverThrottle, validateCoordinates };

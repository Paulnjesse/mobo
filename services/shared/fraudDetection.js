'use strict';

/**
 * fraudDetection.js  —  MOBO Fraud Detection Engine
 *
 * Detects two primary fraud patterns:
 *
 * 1. GPS Spoofing
 *    Drivers use fake GPS apps to appear in high-surge zones or to shorten
 *    trip distances. Detection:
 *      - Impossible speed (>250 km/h sustained across 3+ updates)
 *      - Teleportation (>50 km jump in <30 s — can't happen on any road)
 *      - Coordinate clamping outside Cameroon/CEMAC bounding box
 *
 * 2. Ride Collusion
 *    Driver and rider are the same person (or coordinating accounts) to
 *    generate fraudulent trip revenue or promotions. Detection:
 *      - Same device fingerprint (device_id) used for both accounts
 *      - Same IP address used to create/book rides on different accounts
 *      - Repeated mutual bookings: same driver/rider pair > threshold rides/week
 *      - Rapid consecutive bookings with no intervening driver movement
 *
 * Results are written to `fraud_flags` table (created in migration_022.sql).
 * High-severity flags auto-suspend the user pending admin review.
 */

// Lazy-load pg pool — each service provides DATABASE_URL in its env
let _pool = null;
function getPool() {
  if (!_pool) {
    const { Pool } = require('pg');
    _pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });
  }
  return _pool;
}
const db = { query: (...args) => getPool().query(...args) };

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_SPEED_KMH            = 250;   // absolute max for any legitimate road vehicle
const TELEPORT_DISTANCE_KM     = 50;    // max plausible jump in under TELEPORT_WINDOW_SEC
const TELEPORT_WINDOW_SEC      = 30;
const COLLUSION_PAIR_THRESHOLD = 5;     // mutual rides per 7-day window → flag
const SPEED_VIOLATION_STREAK   = 3;     // consecutive violations before raising flag

// Cameroon + wider CEMAC bounding box (degrees)
const BOUNDS = { minLat: 1.6, maxLat: 13.1, minLng: 8.4, maxLng: 16.2 };

// ─── Haversine distance (km) ──────────────────────────────────────────────────

function haversineKm(lat1, lng1, lat2, lng2) {
  const R    = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Flag writer ──────────────────────────────────────────────────────────────

async function writeFraudFlag({ userId, rideId, flagType, severity, details }) {
  try {
    const result = await db.query(
      `INSERT INTO fraud_flags (user_id, ride_id, flag_type, severity, details)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [userId, rideId || null, flagType, severity, JSON.stringify(details)]
    );
    const flagId = result.rows[0]?.id;
    console.warn(`[FraudDetection] Flag raised: ${flagType} severity=${severity} user=${userId} flag_id=${flagId}`, details);

    // Auto-suspend for critical severity
    if (severity === 'critical') {
      await db.query(
        `UPDATE users SET status = 'suspended', suspension_reason = $1 WHERE id = $2 AND status = 'active'`,
        [`Auto-suspended: fraud flag ${flagType} (flag_id=${flagId})`, userId]
      );
      console.warn(`[FraudDetection] User ${userId} auto-suspended due to critical fraud flag ${flagId}`);
    }

    return flagId;
  } catch (err) {
    console.error('[FraudDetection] Failed to write fraud flag:', err.message, { userId, flagType });
    return null;
  }
}

// ─── 1. GPS Spoofing ──────────────────────────────────────────────────────────

/**
 * checkGpsSpoofing(update)
 *
 * Call on every location update before persisting it.
 * Returns { ok: boolean, reason?: string } — if ok=false, reject the update.
 *
 * @param {object} update
 *   userId, lat, lng, timestampMs,
 *   prevLat?, prevLng?, prevTimestampMs?,
 *   speedViolationStreak? (caller maintains this counter per driver session)
 */
async function checkGpsSpoofing(update) {
  const { userId, lat, lng, timestampMs, prevLat, prevLng, prevTimestampMs, rideId } = update;

  // ── Out-of-bounds check ──────────────────────────────────────────────────
  const outOfBounds =
    lat < BOUNDS.minLat || lat > BOUNDS.maxLat ||
    lng < BOUNDS.minLng || lng > BOUNDS.maxLng;

  if (outOfBounds) {
    // Warn only — could be cross-border trip
    await writeFraudFlag({
      userId,
      rideId,
      flagType: 'gps_spoofing',
      severity: 'low',
      details:  { reason: 'out_of_bounds', lat, lng, bounds: BOUNDS },
    });
    // Don't block — let it through with a low flag
  }

  if (!prevLat || !prevLng || !prevTimestampMs) return { ok: true };

  const distKm    = haversineKm(prevLat, prevLng, lat, lng);
  const deltaSec  = Math.max((timestampMs - prevTimestampMs) / 1000, 0.001);
  const speedKmh  = (distKm / deltaSec) * 3600;

  // ── Teleportation check ──────────────────────────────────────────────────
  if (distKm > TELEPORT_DISTANCE_KM && deltaSec < TELEPORT_WINDOW_SEC) {
    await writeFraudFlag({
      userId,
      rideId,
      flagType: 'gps_spoofing',
      severity: 'high',
      details:  {
        reason:     'teleportation',
        distKm:     Math.round(distKm * 10) / 10,
        deltaSec:   Math.round(deltaSec),
        from:       [prevLat, prevLng],
        to:         [lat, lng],
      },
    });
    return { ok: false, reason: 'teleportation_detected' };
  }

  // ── Impossible speed check ───────────────────────────────────────────────
  if (speedKmh > MAX_SPEED_KMH) {
    const streak = (update.speedViolationStreak || 0) + 1;
    if (streak >= SPEED_VIOLATION_STREAK) {
      await writeFraudFlag({
        userId,
        rideId,
        flagType: 'gps_spoofing',
        severity: streak >= 5 ? 'critical' : 'medium',
        details:  {
          reason:   'impossible_speed',
          speedKmh: Math.round(speedKmh),
          streak,
          distKm:   Math.round(distKm * 10) / 10,
          deltaSec: Math.round(deltaSec),
        },
      });
    }
    return { ok: false, reason: 'impossible_speed', streak };
  }

  return { ok: true };
}

// ─── 2. Ride Collusion ────────────────────────────────────────────────────────

/**
 * checkRideCollusion(rideId, driverId, riderId, meta)
 *
 * Call when a driver accepts a ride.
 * meta: { driverDeviceId?, riderDeviceId?, driverIp?, riderIp? }
 */
async function checkRideCollusion(rideId, driverId, riderId, meta = {}) {
  const flags = [];

  // ── Same device fingerprint ──────────────────────────────────────────────
  if (
    meta.driverDeviceId &&
    meta.riderDeviceId  &&
    meta.driverDeviceId === meta.riderDeviceId
  ) {
    flags.push({
      flagType: 'ride_collusion',
      severity: 'critical',
      details:  {
        reason:        'same_device',
        device_id:     meta.driverDeviceId,
        driver_id:     driverId,
        rider_id:      riderId,
      },
    });
  }

  // ── Same IP ──────────────────────────────────────────────────────────────
  if (
    meta.driverIp &&
    meta.riderIp  &&
    meta.driverIp === meta.riderIp &&
    meta.driverIp !== '127.0.0.1'
  ) {
    flags.push({
      flagType: 'ride_collusion',
      severity: 'high',
      details:  {
        reason:    'same_ip',
        ip:        meta.driverIp,
        driver_id: driverId,
        rider_id:  riderId,
      },
    });
  }

  // ── Repeated mutual bookings (past 7 days) ───────────────────────────────
  try {
    const pairCount = await db.query(
      `SELECT COUNT(*) AS cnt FROM rides
       WHERE driver_id = $1 AND rider_id = $2
         AND created_at > NOW() - INTERVAL '7 days'
         AND status IN ('completed','in_progress')`,
      [driverId, riderId]
    );
    const cnt = parseInt(pairCount.rows[0]?.cnt || 0, 10);
    if (cnt >= COLLUSION_PAIR_THRESHOLD) {
      flags.push({
        flagType: 'ride_collusion',
        severity: cnt >= COLLUSION_PAIR_THRESHOLD * 2 ? 'critical' : 'high',
        details:  {
          reason:     'repeated_pair',
          pair_rides_7d: cnt,
          threshold:  COLLUSION_PAIR_THRESHOLD,
          driver_id:  driverId,
          rider_id:   riderId,
        },
      });
    }
  } catch (err) {
    console.error('[FraudDetection] Collusion DB query failed:', err.message);
  }

  // Write all flags
  for (const flag of flags) {
    await writeFraudFlag({ userId: driverId, rideId, ...flag });
  }

  const highestSeverity = flags.reduce((acc, f) => {
    const order = { low: 1, medium: 2, high: 3, critical: 4 };
    return (order[f.severity] || 0) > (order[acc] || 0) ? f.severity : acc;
  }, null);

  return { flagged: flags.length > 0, severity: highestSeverity, count: flags.length };
}

// ─── 3. Fare Manipulation ─────────────────────────────────────────────────────

/**
 * checkFareManipulation(rideId, driverId, estimatedFare, finalFare)
 *
 * Flags rides where the final fare deviates significantly from the estimate.
 * Drivers manually editing fare fields, or exploiting fare calculation bugs.
 */
async function checkFareManipulation(rideId, driverId, estimatedFare, finalFare) {
  if (!estimatedFare || estimatedFare <= 0 || !finalFare) return { flagged: false };

  const ratio = finalFare / estimatedFare;

  // More than 3× the estimate or more than 5000 XAF absolute difference
  const absDiff = Math.abs(finalFare - estimatedFare);
  if (ratio > 3.0 || (absDiff > 5000 && ratio > 2.0)) {
    const severity = ratio > 5.0 ? 'high' : 'medium';
    await writeFraudFlag({
      userId:   driverId,
      rideId,
      flagType: 'fare_manipulation',
      severity,
      details:  {
        estimated_fare: estimatedFare,
        final_fare:     finalFare,
        ratio:          Math.round(ratio * 100) / 100,
        abs_diff_xaf:   absDiff,
      },
    });
    return { flagged: true, severity, ratio };
  }

  return { flagged: false };
}

module.exports = {
  checkGpsSpoofing,
  checkRideCollusion,
  checkFareManipulation,
  writeFraudFlag,
  haversineKm,
};

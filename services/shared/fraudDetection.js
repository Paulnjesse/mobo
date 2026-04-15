'use strict';
const logger = require('./logger');

/**
 * fraudDetection.js — MOBO Fraud Detection Engine (ML-backed)
 *
 * All scoring is delegated to the ML microservice (services/ml-service).
 * This module handles:
 *   - Calling ML service endpoints with retry + timeout
 *   - Writing fraud_flags to DB based on ML verdict
 *   - Auto-suspending users on critical verdicts
 *   - Falling back to rule-based checks when ML service is unavailable
 *
 * ML Service endpoints:
 *   POST /score/gps        — GPS spoofing detection (Isolation Forest)
 *   POST /score/payment    — Payment fraud (Gradient Boosting)
 *   POST /score/collusion  — Ride collusion (Random Forest)
 */

const axios = require('axios');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://ml-service:8000';
const ML_TIMEOUT_MS  = parseInt(process.env.ML_TIMEOUT_MS || '800', 10);  // fast path — reject if >800ms

// Lazy-load pg pool — each service provides DATABASE_URL in its env
let _pool = null;
function getPool() {
  if (!_pool) {
    const { Pool } = require('pg');
    // Use the same SSL config as the per-service database.js:
    // DB_SSL_CA → validate against the provided CA cert (production)
    // DATABASE_SSL=false → disable SSL (local dev without certs)
    // Default → require TLS but validate the server cert using Node's built-in trust store
    let ssl;
    if (process.env.DATABASE_SSL === 'false') {
      ssl = false;
    } else if (process.env.DB_SSL_CA) {
      ssl = { rejectUnauthorized: true, ca: Buffer.from(process.env.DB_SSL_CA, 'base64').toString() };
    } else {
      ssl = { rejectUnauthorized: true };
    }
    _pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl });
  }
  return _pool;
}
const db = { query: (...args) => getPool().query(...args) };

// ─── Constants (fallback rule-based) ─────────────────────────────────────────
const MAX_SPEED_KMH        = 250;
const TELEPORT_DISTANCE_KM = 50;
const TELEPORT_WINDOW_SEC  = 30;
const BOUNDS = { minLat: 1.6, maxLat: 13.1, minLng: 8.4, maxLng: 16.2 };

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── ML Service caller ────────────────────────────────────────────────────────

async function callML(endpoint, payload) {
  try {
    const res = await axios.post(`${ML_SERVICE_URL}${endpoint}`, payload, {
      timeout: ML_TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Service-Key': process.env.INTERNAL_SERVICE_KEY || '',
      },
    });
    return res.data;
  } catch (err) {
    // ML service unavailable — fall back to rule-based
    if (process.env.NODE_ENV === 'production') {
      logger.warn(`[FraudDetection] ML service unavailable (${endpoint}):`, err.message);
    }
    return null;
  }
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
    logger.warn(`[FraudDetection] Flag: ${flagType} severity=${severity} user=${userId} flag_id=${flagId}`);

    if (severity === 'critical') {
      await db.query(
        `UPDATE users SET status = 'suspended', suspension_reason = $1 WHERE id = $2 AND status = 'active'`,
        [`Auto-suspended: fraud flag ${flagType} (flag_id=${flagId})`, userId]
      );
    }
    return flagId;
  } catch (err) {
    logger.error('[FraudDetection] Failed to write flag:', err.message);
    return null;
  }
}

function verdictToSeverity(verdict) {
  return verdict === 'block' ? 'critical' : verdict === 'review' ? 'high' : 'low';
}

// ─── 1. GPS Spoofing ──────────────────────────────────────────────────────────

const _gpsState = new Map(); // userId → { lat, lng, ts, streak }

async function checkGpsSpoofing(update) {
  const { userId, lat, lng, timestampMs, rideId } = update;
  const prev = _gpsState.get(userId);

  // Try ML service first
  const mlResult = await callML('/score/gps', {
    user_id:           userId,
    ride_id:           rideId || null,
    lat, lng,
    timestamp_ms:      timestampMs,
    prev_lat:          prev?.lat || null,
    prev_lng:          prev?.lng || null,
    prev_timestamp_ms: prev?.ts  || null,
    speed_kmh:         update.speedKmh || null,
    accuracy_m:        update.accuracyM || null,
  });

  if (mlResult) {
    _gpsState.set(userId, { lat, lng, ts: timestampMs, streak: mlResult.verdict !== 'clean' ? (prev?.streak || 0) + 1 : 0 });

    if (mlResult.verdict !== 'clean') {
      await writeFraudFlag({
        userId, rideId,
        flagType: 'gps_spoofing',
        severity: verdictToSeverity(mlResult.verdict),
        details:  { ml_score: mlResult.fraud_score, signals: mlResult.signals, model: mlResult.model_version },
      });
      if (mlResult.verdict === 'block') {
        return { ok: false, reason: mlResult.signals[0] || 'ml_fraud_detected' };
      }
    }
    return { ok: true };
  }

  // ── Rule-based fallback ───────────────────────────────────────────────────
  if (!prev) {
    _gpsState.set(userId, { lat, lng, ts: timestampMs, streak: 0 });
    return { ok: true };
  }

  const distKm   = haversineKm(prev.lat, prev.lng, lat, lng);
  const deltaSec = Math.max((timestampMs - prev.ts) / 1000, 0.001);
  const speedKmh = (distKm / deltaSec) * 3600;

  if (distKm > TELEPORT_DISTANCE_KM && deltaSec < TELEPORT_WINDOW_SEC) {
    await writeFraudFlag({ userId, rideId, flagType: 'gps_spoofing', severity: 'high',
      details: { reason: 'teleportation', distKm, deltaSec } });
    _gpsState.set(userId, { lat, lng, ts: timestampMs, streak: (prev.streak || 0) + 1 });
    return { ok: false, reason: 'teleportation_detected' };
  }
  if (speedKmh > MAX_SPEED_KMH) {
    const streak = (prev.streak || 0) + 1;
    if (streak >= 3) {
      await writeFraudFlag({ userId, rideId, flagType: 'gps_spoofing', severity: streak >= 5 ? 'critical' : 'medium',
        details: { reason: 'impossible_speed', speedKmh, streak } });
    }
    _gpsState.set(userId, { lat, lng, ts: timestampMs, streak });
    return { ok: false, reason: 'impossible_speed', streak };
  }

  _gpsState.set(userId, { lat, lng, ts: timestampMs, streak: 0 });
  return { ok: true };
}

// ─── 2. Ride Collusion ────────────────────────────────────────────────────────

async function checkRideCollusion(rideId, driverId, riderId, meta = {}) {
  // Get historical pair data from DB
  let pair7d = 0, pair30d = 0;
  try {
    const r7  = await db.query(
      `SELECT COUNT(*) FROM rides WHERE driver_id=(SELECT id FROM drivers WHERE user_id=$1) AND rider_id=$2 AND created_at>NOW()-INTERVAL '7 days'`,
      [driverId, riderId]
    );
    const r30 = await db.query(
      `SELECT COUNT(*) FROM rides WHERE driver_id=(SELECT id FROM drivers WHERE user_id=$1) AND rider_id=$2 AND created_at>NOW()-INTERVAL '30 days'`,
      [driverId, riderId]
    );
    pair7d  = parseInt(r7.rows[0]?.count || 0, 10);
    pair30d = parseInt(r30.rows[0]?.count || 0, 10);
  } catch (err) {
    logger.error('[FraudDetection] Pair query failed:', err.message);
  }

  const mlResult = await callML('/score/collusion', {
    ride_id:          rideId,
    driver_id:        driverId,
    rider_id:         riderId,
    driver_device_id: meta.driverDeviceId || null,
    rider_device_id:  meta.riderDeviceId  || null,
    driver_ip:        meta.driverIp       || null,
    rider_ip:         meta.riderIp        || null,
    pair_rides_7d:    pair7d,
    pair_rides_30d:   pair30d,
  });

  if (mlResult && mlResult.verdict !== 'clean') {
    await writeFraudFlag({
      userId:   driverId,
      rideId,
      flagType: 'ride_collusion',
      severity: verdictToSeverity(mlResult.verdict),
      details:  { ml_score: mlResult.fraud_score, signals: mlResult.signals },
    });
    return { flagged: true, severity: verdictToSeverity(mlResult.verdict) };
  }

  // Rule-based fallback
  if (meta.driverDeviceId && meta.riderDeviceId && meta.driverDeviceId === meta.riderDeviceId) {
    await writeFraudFlag({ userId: driverId, rideId, flagType: 'ride_collusion', severity: 'critical',
      details: { reason: 'same_device', device_id: meta.driverDeviceId } });
    return { flagged: true, severity: 'critical' };
  }
  if (pair7d >= 5) {
    await writeFraudFlag({ userId: driverId, rideId, flagType: 'ride_collusion', severity: 'high',
      details: { reason: 'repeated_pair', pair7d } });
    return { flagged: true, severity: 'high' };
  }

  return { flagged: false };
}

// ─── 3. Payment Fraud (ML-scored) ────────────────────────────────────────────

async function checkPaymentFraud(userId, rideId, paymentData) {
  const mlResult = await callML('/score/payment', {
    user_id:              userId,
    ride_id:              rideId || null,
    amount_xaf:           paymentData.amount,
    method:               paymentData.method,
    device_fingerprint:   paymentData.deviceFingerprint || null,
    ip_address:           paymentData.ipAddress || null,
    payments_last_1h:     paymentData.paymentsLast1h || 0,
    payments_last_24h:    paymentData.paymentsLast24h || 0,
    failed_attempts_last_1h: paymentData.failedLast1h || 0,
    avg_amount_30d:       paymentData.avgAmount30d || null,
    new_device:           paymentData.newDevice || false,
    new_location:         paymentData.newLocation || false,
    account_age_days:     paymentData.accountAgeDays || 365,
  });

  if (mlResult && mlResult.verdict !== 'clean') {
    await writeFraudFlag({
      userId, rideId,
      flagType: 'payment_fraud',
      severity: verdictToSeverity(mlResult.verdict),
      details:  { ml_score: mlResult.fraud_score, signals: mlResult.signals },
    });
    return { flagged: true, verdict: mlResult.verdict, score: mlResult.fraud_score, signals: mlResult.signals };
  }
  return { flagged: false };
}

// ─── 4. Fare Manipulation (rule-based — no ML needed) ────────────────────────

async function checkFareManipulation(rideId, driverId, estimatedFare, finalFare) {
  if (!estimatedFare || estimatedFare <= 0 || !finalFare) return { flagged: false };
  const ratio   = finalFare / estimatedFare;
  const absDiff = Math.abs(finalFare - estimatedFare);
  if (ratio > 3.0 || (absDiff > 5000 && ratio > 2.0)) {
    const severity = ratio > 5.0 ? 'high' : 'medium';
    await writeFraudFlag({ userId: driverId, rideId, flagType: 'fare_manipulation', severity,
      details: { estimated_fare: estimatedFare, final_fare: finalFare, ratio: Math.round(ratio * 100) / 100, abs_diff_xaf: absDiff } });
    return { flagged: true, severity, ratio };
  }
  return { flagged: false };
}

module.exports = {
  checkGpsSpoofing,
  checkRideCollusion,
  checkPaymentFraud,
  checkFareManipulation,
  writeFraudFlag,
  haversineKm,
};

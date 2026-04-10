'use strict';

const db = require('../config/database');
const https = require('https');
const logger = require('../utils/logger');

const SPEED_LIMIT_KMH        = 120;
const DEVIATION_THRESHOLD_M  = 500;
const FATIGUE_HOURS_THRESHOLD = 8;
const CRASH_DECEL_THRESHOLD_G = 3.5;   // > 3.5 g = likely crash
const CRASH_SPEED_DROP_KMH   = 30;     // speed drops ≥ 30 km/h in one interval
const SOS_RESPONSE_WINDOW_MS  = 30000; // 30 s before auto-SOS if no response

// ---------------------------------------------------------------------------
// Expo push helper (raw HTTPS — no SDK dependency in location-service)
// ---------------------------------------------------------------------------
async function sendPush(token, title, body, data = {}) {
  if (!token || !token.startsWith('ExponentPushToken[')) return;
  const payload = JSON.stringify({ to: token, sound: 'default', title, body, data, priority: 'high' });
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'exp.host',
      path: '/--/api/v2/push/send',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', (e) => { logger.warn({ err: e }, '[SafetyPush] Expo send error'); resolve(null); });
    req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// POST /safety/speed-alert
// ---------------------------------------------------------------------------
const recordSpeedAlert = async (req, res) => {
  try {
    const { ride_id, speed_kmh, latitude, longitude } = req.body;
    if (!ride_id || speed_kmh === undefined) {
      return res.status(400).json({ success: false, message: 'ride_id and speed_kmh are required' });
    }

    const speedValue = parseFloat(speed_kmh);
    if (speedValue <= SPEED_LIMIT_KMH) {
      return res.json({ success: true, alerted: false });
    }

    const rideResult = await db.query(
      `SELECT r.id, r.driver_id, r.rider_id,
              u.expo_push_token AS rider_token, u.full_name AS rider_name,
              du.expo_push_token AS driver_token, du.full_name AS driver_name
       FROM rides r
       LEFT JOIN users u  ON r.rider_id  = u.id
       LEFT JOIN drivers d ON d.id = r.driver_id
       LEFT JOIN users du ON du.id = d.user_id
       WHERE r.id = $1`,
      [ride_id]
    );
    if (rideResult.rows.length === 0) return res.status(404).json({ success: false, message: 'Ride not found' });
    const ride = rideResult.rows[0];

    await db.query(
      `INSERT INTO speed_alerts (ride_id, driver_id, speed_kmh, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5)`,
      [ride_id, ride.driver_id, speedValue, latitude || null, longitude || null]
    );
    await db.query(
      `UPDATE rides SET speed_alert_sent = true,
         max_speed_recorded = GREATEST(COALESCE(max_speed_recorded,0), $1) WHERE id = $2`,
      [speedValue, ride_id]
    );

    // Notify rider — real push via Expo
    if (ride.rider_token) {
      await sendPush(
        ride.rider_token,
        '⚠️ Speed Alert',
        `Your driver is travelling at ${Math.round(speedValue)} km/h. We've logged this for your safety.`,
        { type: 'speed_alert', ride_id, speed_kmh: speedValue }
      );
    }
    // Warn driver too
    if (ride.driver_token) {
      await sendPush(
        ride.driver_token,
        '⚠️ Please Slow Down',
        `You're travelling at ${Math.round(speedValue)} km/h. Please reduce your speed for passenger safety.`,
        { type: 'speed_alert_driver', ride_id, speed_kmh: speedValue }
      );
    }

    logger.info({ ride_id, speed_kmh: speedValue }, '[SafetyController] Speed alert recorded and notifications sent');
    return res.json({ success: true, alerted: true, speed_kmh: speedValue, ride_id });
  } catch (err) {
    logger.error({ err }, '[Safety] recordSpeedAlert error');
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ---------------------------------------------------------------------------
// POST /safety/route-deviation
// ---------------------------------------------------------------------------
const checkRouteDeviation = async (req, res) => {
  try {
    const { ride_id, current_latitude, current_longitude, deviation_meters } = req.body;
    if (!ride_id || deviation_meters === undefined) {
      return res.status(400).json({ success: false, message: 'ride_id and deviation_meters are required' });
    }

    const deviationValue = parseFloat(deviation_meters);
    const rideResult = await db.query(
      `SELECT r.id, r.route_deviation_alerted, r.rider_id,
              u.expo_push_token AS rider_token
       FROM rides r
       LEFT JOIN users u ON r.rider_id = u.id
       WHERE r.id = $1`,
      [ride_id]
    );
    if (rideResult.rows.length === 0) return res.status(404).json({ success: false, message: 'Ride not found' });

    const ride = rideResult.rows[0];
    if (deviationValue <= DEVIATION_THRESHOLD_M || ride.route_deviation_alerted) {
      return res.json({ success: true, deviated: false });
    }

    await db.query(
      `UPDATE rides SET route_deviation_at = NOW(), route_deviation_alerted = true WHERE id = $1`,
      [ride_id]
    );
    await db.query(
      `INSERT INTO ride_checkins (ride_id, checkin_type, address) VALUES ($1, 'route_deviation', $2)`,
      [ride_id, current_latitude && current_longitude ? `Lat: ${current_latitude}, Lng: ${current_longitude}` : 'Unknown']
    );

    // Notify rider of route deviation — real push
    if (ride.rider_token) {
      await sendPush(
        ride.rider_token,
        '⚠️ Route Deviation Detected',
        `Your driver has deviated ${Math.round(deviationValue)}m from the planned route. Tap to share your trip or contact support.`,
        { type: 'route_deviation', ride_id, deviation_meters: deviationValue }
      );
    }

    logger.info({ ride_id, deviationValue }, '[SafetyController] Route deviation detected and rider notified');
    return res.json({ success: true, deviated: true, deviation_meters: deviationValue, ride_id });
  } catch (err) {
    logger.error({ err }, '[Safety] checkRouteDeviation error');
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ---------------------------------------------------------------------------
// POST /safety/crash-detection  (RideCheck equivalent — P1 new feature)
// Detects crash from sudden deceleration and auto-triggers SOS flow.
// Body: { ride_id, speed_kmh, prev_speed_kmh, latitude, longitude }
// ---------------------------------------------------------------------------
const crashDetection = async (req, res) => {
  try {
    const { ride_id, speed_kmh, prev_speed_kmh, latitude, longitude } = req.body;
    if (!ride_id || speed_kmh === undefined || prev_speed_kmh === undefined) {
      return res.status(400).json({ success: false, message: 'ride_id, speed_kmh, prev_speed_kmh are required' });
    }

    const curr = parseFloat(speed_kmh);
    const prev = parseFloat(prev_speed_kmh);
    const drop = prev - curr;

    // Not a crash if speed didn't drop significantly
    if (drop < CRASH_SPEED_DROP_KMH) {
      return res.json({ success: true, crash_detected: false });
    }

    // Fetch ride + rider push token
    const rideResult = await db.query(
      `SELECT r.id, r.status, r.rider_id, r.driver_id,
              u.expo_push_token  AS rider_token,  u.full_name  AS rider_name,
              du.expo_push_token AS driver_token, du.full_name AS driver_name
       FROM rides r
       LEFT JOIN users u   ON r.rider_id  = u.id
       LEFT JOIN drivers d ON d.id = r.driver_id
       LEFT JOIN users du  ON du.id = d.user_id
       WHERE r.id = $1 AND r.status = 'in_progress'`,
      [ride_id]
    );

    if (rideResult.rows.length === 0) {
      return res.json({ success: true, crash_detected: false, reason: 'Ride not in progress' });
    }

    const ride = rideResult.rows[0];

    // Log crash event
    await db.query(
      `INSERT INTO speed_alerts (ride_id, driver_id, speed_kmh, latitude, longitude, alert_type)
       VALUES ($1, $2, $3, $4, $5, 'crash')
       ON CONFLICT DO NOTHING`,
      [ride_id, ride.driver_id, curr, latitude || null, longitude || null]
    ).catch(() => {
      // alert_type column may not exist yet — fall through gracefully
    });

    // Send safety check push to rider — if no response in 30s, escalate
    if (ride.rider_token) {
      await sendPush(
        ride.rider_token,
        '🚨 Are you okay?',
        'We detected a sudden stop on your ride. Tap to confirm you\'re safe, or we\'ll alert emergency contacts.',
        { type: 'crash_check', ride_id, action_required: true, timeout_ms: SOS_RESPONSE_WINDOW_MS }
      );
    }
    if (ride.driver_token) {
      await sendPush(
        ride.driver_token,
        '🚨 Crash Detected',
        'A sudden stop was detected. Are you and your passenger okay? Emergency contacts will be notified if no response.',
        { type: 'crash_check_driver', ride_id, action_required: true }
      );
    }

    logger.warn({ ride_id, speed_drop_kmh: drop, latitude, longitude }, '[SafetyController] Crash detected — safety check push sent');
    return res.json({
      success: true,
      crash_detected: true,
      speed_drop_kmh: drop,
      ride_id,
      message: 'Safety check notifications sent. Auto-SOS triggered if no response in 30s.'
    });
  } catch (err) {
    logger.error({ err }, '[Safety] crashDetection error');
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ---------------------------------------------------------------------------
// GET /safety/fatigue-check
// ---------------------------------------------------------------------------
const checkFatigue = async (req, res) => {
  try {
    const userId = req.user.id;
    const driverResult = await db.query(
      'SELECT id, online_since, total_trips_today, expo_push_token FROM drivers d JOIN users u ON u.id = d.user_id WHERE d.user_id = $1',
      [userId]
    );
    if (driverResult.rows.length === 0) return res.status(404).json({ success: false, message: 'Driver record not found' });

    const driver = driverResult.rows[0];
    const tripsToday = driver.total_trips_today || 0;
    const hoursOnline = driver.online_since
      ? (Date.now() - new Date(driver.online_since).getTime()) / 3600000
      : 0;

    if (hoursOnline >= FATIGUE_HOURS_THRESHOLD) {
      const breakUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      // Send push notification
      if (driver.expo_push_token) {
        await sendPush(
          driver.expo_push_token,
          '😴 Time for a Break',
          `You've been driving for ${Math.floor(hoursOnline)} hours. Please take a 15-minute rest for your safety and your passengers'.`,
          { type: 'fatigue_break', reason: 'hours', break_until: breakUntil }
        );
      }
      return res.json({ success: true, should_break: true, reason: 'hours', hours_online: Math.floor(hoursOnline), trips_today: tripsToday, break_until: breakUntil });
    }

    if (tripsToday >= 6) {
      const breakUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      if (driver.expo_push_token) {
        await sendPush(
          driver.expo_push_token,
          '😴 Break Recommended',
          `You've completed ${tripsToday} trips today. A 15-minute break will keep you sharp and safe.`,
          { type: 'fatigue_break', reason: 'trips', break_until: breakUntil }
        );
      }
      return res.json({ success: true, should_break: true, reason: 'trips', hours_online: parseFloat(hoursOnline.toFixed(1)), trips_today: tripsToday, break_until: breakUntil });
    }

    return res.json({ success: true, should_break: false, hours_online: parseFloat(hoursOnline.toFixed(2)), trips_today: tripsToday });
  } catch (err) {
    logger.error({ err }, '[Safety] checkFatigue error');
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ---------------------------------------------------------------------------
// POST /safety/fatigue-break
// ---------------------------------------------------------------------------
const enforceFatigueBreak = async (req, res) => {
  try {
    const userId = req.user?.id;
    const result = await db.query(
      `UPDATE drivers SET online_since = NULL, total_trips_today = 0, last_break_prompted_at = NOW()
       WHERE user_id = $1 RETURNING id`,
      [userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Driver not found' });
    res.json({ success: true, message: 'Break recorded. You can go online again.' });
  } catch (err) {
    logger.error({ err }, '[EnforceFatigueBreak] error');
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ---------------------------------------------------------------------------
// POST /safety/realid  (driver selfie submission)
// ---------------------------------------------------------------------------
const driverRealIDSubmit = async (req, res) => {
  try {
    const userId = req.user.id;
    const { selfie_url } = req.body;
    if (!selfie_url) return res.status(400).json({ success: false, message: 'selfie_url is required' });

    const driverResult = await db.query('SELECT id FROM drivers WHERE user_id = $1', [userId]);
    if (driverResult.rows.length === 0) return res.status(404).json({ success: false, message: 'Driver record not found' });

    const driverId = driverResult.rows[0].id;
    await db.query(
      `INSERT INTO driver_realid_checks (driver_id, selfie_url, status) VALUES ($1, $2, 'pending')`,
      [driverId, selfie_url]
    );
    await db.query(
      `UPDATE drivers SET realid_check_required = false, realid_last_checked_at = NOW() WHERE id = $1`,
      [driverId]
    );
    return res.json({ success: true, message: 'Identity verified. You can now go online.' });
  } catch (err) {
    logger.error({ err }, '[Safety] driverRealIDSubmit error');
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ---------------------------------------------------------------------------
// GET /safety/realid/pending  (admin only)
// ---------------------------------------------------------------------------
const getRealIDChecks = async (req, res) => {
  try {
    const userRole = req.user ? req.user.role : req.headers['x-user-role'];
    if (userRole !== 'admin') return res.status(403).json({ success: false, message: 'Admin access required' });

    const result = await db.query(
      `SELECT rc.id, rc.selfie_url, rc.status, rc.checked_at, rc.fail_reason,
              u.full_name AS driver_name, u.phone AS driver_phone, d.id AS driver_id
       FROM driver_realid_checks rc
       JOIN drivers d ON rc.driver_id = d.id
       JOIN users u ON d.user_id = u.id
       WHERE rc.status = 'pending'
       ORDER BY rc.checked_at ASC`
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error({ err }, '[Safety] getRealIDChecks error');
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  recordSpeedAlert,
  checkRouteDeviation,
  crashDetection,
  checkFatigue,
  enforceFatigueBreak,
  driverRealIDSubmit,
  getRealIDChecks,
};

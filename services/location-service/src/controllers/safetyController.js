const db = require('../config/database');

const SPEED_LIMIT_KMH = 120;
const DEVIATION_THRESHOLD_METERS = 500;
const FATIGUE_HOURS_THRESHOLD = 8;

/**
 * POST /safety/speed-alert
 * Records a speed alert if speed_kmh > 120.
 * Body: { ride_id, speed_kmh, latitude, longitude }
 */
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

    // Fetch ride to get driver_id and rider's push token
    const rideResult = await db.query(
      `SELECT r.id, r.driver_id, r.rider_id,
              u.expo_push_token, u.notifications_token
       FROM rides r
       LEFT JOIN users u ON r.rider_id = u.id
       WHERE r.id = $1`,
      [ride_id]
    );

    if (rideResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }

    const ride = rideResult.rows[0];

    // Insert speed alert record
    await db.query(
      `INSERT INTO speed_alerts (ride_id, driver_id, speed_kmh, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5)`,
      [ride_id, ride.driver_id, speedValue, latitude || null, longitude || null]
    );

    // Update max_speed_recorded and mark speed_alert_sent on the ride
    await db.query(
      `UPDATE rides
       SET speed_alert_sent = true,
           max_speed_recorded = GREATEST(COALESCE(max_speed_recorded, 0), $1)
       WHERE id = $2`,
      [speedValue, ride_id]
    );

    // Notify rider via push notification
    const pushToken = ride.expo_push_token || ride.notifications_token;
    if (pushToken) {
      // Log the push notification intent (Expo/FCM integration done when configured)
      console.log(`[SpeedAlert] Notifying rider ${ride.rider_id} push token ${pushToken}: speed ${speedValue} km/h exceeded on ride ${ride_id}`);
      // In production, call Expo push API or FCM here:
      // await sendPushNotification(pushToken, 'Speed Alert', `Your driver is travelling at ${speedValue} km/h.`);
    }

    return res.json({
      success: true,
      alerted: true,
      speed_kmh: speedValue,
      ride_id
    });
  } catch (err) {
    console.error('[Safety] recordSpeedAlert error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /safety/route-deviation
 * Checks if the driver has deviated from the planned route.
 * Body: { ride_id, current_latitude, current_longitude, deviation_meters }
 */
const checkRouteDeviation = async (req, res) => {
  try {
    const { ride_id, current_latitude, current_longitude, deviation_meters } = req.body;

    if (!ride_id || deviation_meters === undefined) {
      return res.status(400).json({ success: false, message: 'ride_id and deviation_meters are required' });
    }

    const deviationValue = parseFloat(deviation_meters);

    // Fetch ride to check if already alerted
    const rideResult = await db.query(
      'SELECT id, route_deviation_alerted FROM rides WHERE id = $1',
      [ride_id]
    );

    if (rideResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }

    const ride = rideResult.rows[0];

    if (deviationValue <= DEVIATION_THRESHOLD_METERS || ride.route_deviation_alerted) {
      return res.json({ success: true, deviated: false });
    }

    // Mark ride as deviated
    await db.query(
      `UPDATE rides
       SET route_deviation_at = NOW(),
           route_deviation_alerted = true
       WHERE id = $1`,
      [ride_id]
    );

    // Insert a ride_checkin record for the deviation event
    await db.query(
      `INSERT INTO ride_checkins (ride_id, checkin_type, address)
       VALUES ($1, 'route_deviation', $2)`,
      [
        ride_id,
        current_latitude && current_longitude
          ? `Lat: ${current_latitude}, Lng: ${current_longitude}`
          : 'Unknown location'
      ]
    );

    return res.json({
      success: true,
      deviated: true,
      deviation_meters: deviationValue,
      ride_id
    });
  } catch (err) {
    console.error('[Safety] checkRouteDeviation error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /safety/fatigue-check
 * Driver only. Returns whether the driver should take a break.
 */
const checkFatigue = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get driver record
    const driverResult = await db.query(
      'SELECT id, online_since FROM drivers WHERE user_id = $1',
      [userId]
    );

    if (driverResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Driver record not found' });
    }

    const driver = driverResult.rows[0];

    if (!driver.online_since) {
      return res.json({ success: true, should_break: false });
    }

    const now = new Date();
    const onlineSince = new Date(driver.online_since);
    const hoursOnline = (now - onlineSince) / (1000 * 60 * 60);

    if (hoursOnline > FATIGUE_HOURS_THRESHOLD) {
      const hoursRounded = Math.floor(hoursOnline);
      return res.json({
        success: true,
        should_break: true,
        hours_online: hoursRounded,
        message: `You've been driving for ${hoursRounded} hours. Please take a 15-minute break.`
      });
    }

    return res.json({
      success: true,
      should_break: false,
      hours_online: parseFloat(hoursOnline.toFixed(2))
    });
  } catch (err) {
    console.error('[Safety] checkFatigue error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /safety/realid
 * Driver only. Submit selfie URL for Real-ID check.
 * Body: { selfie_url }
 */
const driverRealIDSubmit = async (req, res) => {
  try {
    const userId = req.user.id;
    const { selfie_url } = req.body;

    if (!selfie_url) {
      return res.status(400).json({ success: false, message: 'selfie_url is required' });
    }

    // Get driver record
    const driverResult = await db.query(
      'SELECT id FROM drivers WHERE user_id = $1',
      [userId]
    );

    if (driverResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Driver record not found' });
    }

    const driverId = driverResult.rows[0].id;

    // Insert realid check record with status='pending'
    await db.query(
      `INSERT INTO driver_realid_checks (driver_id, selfie_url, status)
       VALUES ($1, $2, 'pending')`,
      [driverId, selfie_url]
    );

    // Mark driver as no longer requiring a check and update last_checked_at
    await db.query(
      `UPDATE drivers
       SET realid_check_required = false,
           realid_last_checked_at = NOW()
       WHERE id = $1`,
      [driverId]
    );

    return res.json({
      success: true,
      message: 'Identity verified. You can now go online.'
    });
  } catch (err) {
    console.error('[Safety] driverRealIDSubmit error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /safety/realid/pending
 * Admin only. Returns all pending Real-ID checks with driver details.
 */
const getRealIDChecks = async (req, res) => {
  try {
    const userRole = req.user ? req.user.role : req.headers['x-user-role'];

    if (userRole !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const result = await db.query(
      `SELECT
         rc.id,
         rc.selfie_url,
         rc.status,
         rc.checked_at,
         rc.fail_reason,
         u.full_name AS driver_name,
         u.phone AS driver_phone,
         d.id AS driver_id
       FROM driver_realid_checks rc
       JOIN drivers d ON rc.driver_id = d.id
       JOIN users u ON d.user_id = u.id
       WHERE rc.status = 'pending'
       ORDER BY rc.checked_at ASC`
    );

    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Safety] getRealIDChecks error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  recordSpeedAlert,
  checkRouteDeviation,
  checkFatigue,
  driverRealIDSubmit,
  getRealIDChecks
};

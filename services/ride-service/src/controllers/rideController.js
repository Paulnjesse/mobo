const { Pool } = require('pg');
const pool = require('../config/database');
const axios = require('axios');

// ============================================================
// EXISTING: requestRide, getFare, acceptRide, updateRideStatus,
// cancelRide, getRide, listRides, rateRide, addTip, roundUpFare,
// getSurgePricing, applyPromoCode, getActivePromos,
// getMessages, sendMessage
// ============================================================

// Helper: calculate fare in XAF
function calculateFare(distanceKm, durationMin, surgeMultiplier = 1.0, subscription = 'none', priceLocked = false, lockedFare = null) {
  if (priceLocked && lockedFare) return lockedFare;
  const BASE_FARE = 1000;
  const PER_KM = 700;
  const PER_MIN = 100;
  const BOOKING_FEE = 500;
  const raw = BASE_FARE + (PER_KM * distanceKm) + (PER_MIN * durationMin);
  const surged = Math.round(raw * surgeMultiplier);
  const discount = subscription === 'premium' ? 0.20 : subscription === 'basic' ? 0.10 : 0;
  const discounted = Math.round(surged * (1 - discount));
  const serviceFee = Math.round(discounted * 0.20);
  return { base: discounted, serviceFee, bookingFee: BOOKING_FEE, total: discounted + serviceFee + BOOKING_FEE };
}

// ---- MULTIPLE STOPS ----
const updateRideStops = async (req, res) => {
  try {
    const { id } = req.params;
    const { stops } = req.body; // array of { address, location: { lat, lng } }
    const userId = req.headers['x-user-id'];

    const ride = await pool.query('SELECT * FROM rides WHERE id = $1', [id]);
    if (!ride.rows[0]) return res.status(404).json({ error: 'Ride not found' });
    if (ride.rows[0].rider_id !== userId) return res.status(403).json({ error: 'Forbidden' });
    if (!['requested','accepted','arriving'].includes(ride.rows[0].status)) {
      return res.status(400).json({ error: 'Cannot modify stops after ride starts' });
    }

    await pool.query('UPDATE rides SET stops = $1, updated_at = NOW() WHERE id = $2', [JSON.stringify(stops), id]);
    res.json({ success: true, stops });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ---- PRICE LOCK ----
const lockPrice = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { pickup_location, dropoff_location, pickup_address, dropoff_address } = req.body;

    // Check user has premium subscription
    const user = await pool.query('SELECT subscription_plan FROM users WHERE id = $1', [userId]);
    if (!user.rows[0] || user.rows[0].subscription_plan !== 'premium') {
      return res.status(403).json({ error: 'Price Lock is a Premium feature' });
    }

    // Calculate fare
    const distKm = 5; // estimate — real app uses Google Maps
    const durMin = 15;
    const fare = calculateFare(distKm, durMin, 1.0, 'premium');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    res.json({
      locked_fare: fare.total,
      fare_breakdown: fare,
      expires_at: expiresAt,
      pickup_address,
      dropoff_address,
      message: 'Fare locked for 1 hour'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ---- RIDE CHECK-INS ----
const triggerCheckin = async (req, res) => {
  try {
    const { ride_id, checkin_type, location, address } = req.body;
    const userId = req.headers['x-user-id'];

    const result = await pool.query(
      `INSERT INTO ride_checkins (ride_id, user_id, checkin_type, location, address)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326), $6)
       RETURNING *`,
      [ride_id, userId, checkin_type, location?.lng || 0, location?.lat || 0, address]
    );

    // Notify user via push notification (they have 30s to respond)
    res.json({ checkin: result.rows[0], message: 'Check-in triggered. Please confirm you are safe.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const respondToCheckin = async (req, res) => {
  try {
    const { id } = req.params;
    const { response } = req.body; // 'safe' | 'need_help'
    const userId = req.headers['x-user-id'];

    const result = await pool.query(
      `UPDATE ride_checkins SET response = $1, responded_at = NOW()
       WHERE id = $2 AND user_id = $3 RETURNING *`,
      [response, id, userId]
    );

    if (!result.rows[0]) return res.status(404).json({ error: 'Check-in not found' });

    if (response === 'need_help') {
      // Escalate — mark as escalated, notify admin
      await pool.query('UPDATE ride_checkins SET escalated = true WHERE id = $1', [id]);
    }

    res.json({ success: true, checkin: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getCheckins = async (req, res) => {
  try {
    const { ride_id } = req.params;
    const result = await pool.query(
      'SELECT * FROM ride_checkins WHERE ride_id = $1 ORDER BY created_at DESC',
      [ride_id]
    );
    res.json({ checkins: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ---- LOST AND FOUND ----
const reportLostItem = async (req, res) => {
  try {
    const { ride_id, item_description, item_category } = req.body;
    const reporterId = req.headers['x-user-id'];

    // Get driver from ride
    const ride = await pool.query('SELECT driver_id FROM rides WHERE id = $1', [ride_id]);
    if (!ride.rows[0]) return res.status(404).json({ error: 'Ride not found' });

    const result = await pool.query(
      `INSERT INTO lost_and_found (ride_id, reporter_id, driver_id, item_description, item_category)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [ride_id, reporterId, ride.rows[0].driver_id, item_description, item_category]
    );

    res.status(201).json({ report: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getLostAndFound = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const result = await pool.query(
      `SELECT lf.*, r.pickup_address, r.dropoff_address, r.completed_at,
              u.full_name as driver_name, u.phone as driver_phone
       FROM lost_and_found lf
       JOIN rides r ON lf.ride_id = r.id
       LEFT JOIN drivers d ON lf.driver_id = d.id
       LEFT JOIN users u ON d.user_id = u.id
       WHERE lf.reporter_id = $1
       ORDER BY lf.created_at DESC`,
      [userId]
    );
    res.json({ reports: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updateLostAndFoundStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, driver_response } = req.body;
    const userId = req.headers['x-user-id'];

    const result = await pool.query(
      `UPDATE lost_and_found
       SET status = $1, driver_response = $2, resolved_at = CASE WHEN $1 IN ('returned','not_found','closed') THEN NOW() ELSE NULL END
       WHERE id = $3 RETURNING *`,
      [status, driver_response, id]
    );

    res.json({ report: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ---- PREFERRED DRIVERS ----
const addPreferredDriver = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { driver_id, ride_id } = req.body;

    const result = await pool.query(
      `INSERT INTO preferred_drivers (user_id, driver_id, ride_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, driver_id) DO UPDATE SET ride_id = $3
       RETURNING *`,
      [userId, driver_id, ride_id]
    );

    res.json({ preferred: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getPreferredDrivers = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const result = await pool.query(
      `SELECT pd.*, u.full_name, u.profile_picture, u.rating,
              v.make, v.model, v.color, v.plate, v.vehicle_type
       FROM preferred_drivers pd
       JOIN drivers d ON pd.driver_id = d.id
       JOIN users u ON d.user_id = u.id
       LEFT JOIN vehicles v ON d.vehicle_id = v.id
       WHERE pd.user_id = $1
       ORDER BY pd.created_at DESC`,
      [userId]
    );
    res.json({ preferred_drivers: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const removePreferredDriver = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { driver_id } = req.params;
    await pool.query('DELETE FROM preferred_drivers WHERE user_id = $1 AND driver_id = $2', [userId, driver_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ---- CONCIERGE ----
const createConciergeBooking = async (req, res) => {
  try {
    const bookedBy = req.headers['x-user-id'];
    const { passenger_name, passenger_phone, pickup_address, dropoff_address, scheduled_at, notes } = req.body;

    // Check admin/corporate role
    const user = await pool.query('SELECT role, corporate_role FROM users WHERE id = $1', [bookedBy]);
    const u = user.rows[0];
    if (!u || (u.role !== 'admin' && u.corporate_role !== 'admin' && u.corporate_role !== 'manager')) {
      return res.status(403).json({ error: 'Only admins and corporate managers can use concierge' });
    }

    const result = await pool.query(
      `INSERT INTO concierge_bookings (booked_by, passenger_name, passenger_phone, pickup_address, dropoff_address, scheduled_at, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [bookedBy, passenger_name, passenger_phone, pickup_address, dropoff_address, scheduled_at, notes]
    );

    res.status(201).json({ booking: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getConciergeBookings = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const result = await pool.query(
      `SELECT cb.*, u.full_name as booked_by_name
       FROM concierge_bookings cb
       JOIN users u ON cb.booked_by = u.id
       WHERE cb.booked_by = $1
       ORDER BY cb.created_at DESC`,
      [userId]
    );
    res.json({ bookings: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ---- EXISTING FUNCTIONS (kept intact) ----
const requestRide = async (req, res) => {
  try {
    const riderId = req.headers['x-user-id'];
    const {
      pickup_address, pickup_location, dropoff_address, dropoff_location,
      ride_type = 'standard', payment_method = 'cash', scheduled_at,
      stops = [], preferred_driver_id, notes,
      use_price_lock = false, locked_fare = null, price_lock_expires_at = null
    } = req.body;

    if (!pickup_location || !dropoff_location) {
      return res.status(400).json({ error: 'Pickup and dropoff locations required' });
    }

    // Get user subscription
    const userResult = await pool.query('SELECT subscription_plan, gender_preference, wallet_balance FROM users WHERE id = $1', [riderId]);
    const user = userResult.rows[0];

    // Check surge
    const surgeResult = await pool.query(
      `SELECT multiplier FROM surge_zones
       WHERE ST_Within(ST_SetSRID(ST_MakePoint($1, $2), 4326), zone) AND is_active = true
       AND (starts_at IS NULL OR starts_at <= NOW())
       AND (ends_at IS NULL OR ends_at >= NOW())
       ORDER BY multiplier DESC LIMIT 1`,
      [pickup_location.lng, pickup_location.lat]
    );
    const surgeMultiplier = surgeResult.rows[0]?.multiplier || 1.0;

    // Estimate distance (simplified — real app calls Google Maps)
    const R = 6371;
    const dLat = (dropoff_location.lat - pickup_location.lat) * Math.PI / 180;
    const dLon = (dropoff_location.lng - pickup_location.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(pickup_location.lat*Math.PI/180)*Math.cos(dropoff_location.lat*Math.PI/180)*Math.sin(dLon/2)**2;
    const distanceKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const durationMin = Math.round(distanceKm * 3);

    const fareCalc = calculateFare(distanceKm, durationMin, surgeMultiplier, user?.subscription_plan, use_price_lock, locked_fare);

    const priceLockValid = use_price_lock && locked_fare && price_lock_expires_at && new Date(price_lock_expires_at) > new Date();

    const result = await pool.query(
      `INSERT INTO rides (
        rider_id, ride_type, status, pickup_address, pickup_location,
        dropoff_address, dropoff_location, distance_km, duration_minutes,
        estimated_fare, base_fare, per_km_fare, per_minute_fare,
        surge_multiplier, surge_active, service_fee, booking_fee,
        payment_method, scheduled_at, is_scheduled, stops, preferred_driver_id,
        price_locked, notes
      ) VALUES (
        $1,$2,'requested',$3,ST_SetSRID(ST_MakePoint($4,$5),4326),
        $6,ST_SetSRID(ST_MakePoint($7,$8),4326),$9,$10,
        $11,1000,700,100,$12,$13,$14,500,$15,$16,$17,$18,$19,$20,$21
      ) RETURNING *`,
      [
        riderId, ride_type, pickup_address, pickup_location.lng, pickup_location.lat,
        dropoff_address, dropoff_location.lng, dropoff_location.lat,
        distanceKm.toFixed(2), durationMin,
        fareCalc.total, surgeMultiplier, surgeMultiplier > 1.0,
        fareCalc.serviceFee, payment_method,
        scheduled_at, !!scheduled_at,
        JSON.stringify(stops), preferred_driver_id, priceLockValid, notes
      ]
    );

    res.status(201).json({ ride: result.rows[0], fare: fareCalc, surge_active: surgeMultiplier > 1.0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getFare = async (req, res) => {
  try {
    const { pickup_location, dropoff_location, ride_type = 'standard', stops = [] } = req.body;
    const userId = req.headers['x-user-id'];

    const userResult = await pool.query('SELECT subscription_plan FROM users WHERE id = $1', [userId]);
    const subscription = userResult.rows[0]?.subscription_plan || 'none';

    const surgeResult = await pool.query(
      `SELECT multiplier FROM surge_zones
       WHERE ST_Within(ST_SetSRID(ST_MakePoint($1, $2), 4326), zone) AND is_active = true
       AND (starts_at IS NULL OR starts_at <= NOW()) AND (ends_at IS NULL OR ends_at >= NOW())
       ORDER BY multiplier DESC LIMIT 1`,
      [pickup_location.lng, pickup_location.lat]
    );
    const surgeMultiplier = surgeResult.rows[0]?.multiplier || 1.0;

    const R = 6371;
    const dLat = (dropoff_location.lat - pickup_location.lat) * Math.PI / 180;
    const dLon = (dropoff_location.lng - pickup_location.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(pickup_location.lat*Math.PI/180)*Math.cos(dropoff_location.lat*Math.PI/180)*Math.sin(dLon/2)**2;
    const distanceKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const durationMin = Math.round(distanceKm * 3);

    // Add stop distance estimate
    const stopExtra = stops.length * 0.5; // ~500m per stop estimate
    const totalDistance = distanceKm + stopExtra;

    const fare = calculateFare(totalDistance, durationMin, surgeMultiplier, subscription);

    res.json({
      fare,
      distance_km: totalDistance.toFixed(2),
      duration_minutes: durationMin,
      surge_multiplier: surgeMultiplier,
      surge_active: surgeMultiplier > 1.0,
      stops_count: stops.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const acceptRide = async (req, res) => {
  try {
    const { id } = req.params;
    const driverUserId = req.headers['x-user-id'];

    const driverResult = await pool.query('SELECT id FROM drivers WHERE user_id = $1 AND is_approved = true', [driverUserId]);
    if (!driverResult.rows[0]) return res.status(403).json({ error: 'Not an approved driver' });
    const driverId = driverResult.rows[0].id;

    const ride = await pool.query('SELECT * FROM rides WHERE id = $1 AND status = $2', [id, 'requested']);
    if (!ride.rows[0]) return res.status(404).json({ error: 'Ride not available' });

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const result = await pool.query(
      `UPDATE rides SET driver_id = $1, status = 'accepted', pickup_otp = $2, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [driverId, otp, id]
    );

    // Update driver streak
    await pool.query(
      `UPDATE drivers SET current_streak = current_streak + 1,
       streak_started_at = COALESCE(streak_started_at, NOW()),
       longest_streak = GREATEST(longest_streak, current_streak + 1)
       WHERE id = $1`,
      [driverId]
    );

    res.json({ ride: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updateRideStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.headers['x-user-id'];
    const validStatuses = ['arriving','in_progress','completed'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    let extra = '';
    if (status === 'in_progress') extra = ', started_at = NOW()';
    if (status === 'completed') extra = ', completed_at = NOW()';

    const result = await pool.query(
      `UPDATE rides SET status = $1 ${extra}, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, id]
    );

    if (status === 'completed' && result.rows[0]) {
      const ride = result.rows[0];
      const finalFare = ride.estimated_fare || 0;
      const serviceFee = ride.service_fee || 0;
      await pool.query(
        `UPDATE rides SET final_fare = $1 WHERE id = $2`,
        [finalFare, id]
      );
      // Give loyalty points: 1 point per 100 XAF
      const points = Math.floor(finalFare / 100);
      await pool.query(
        `UPDATE users SET loyalty_points = loyalty_points + $1, total_rides = total_rides + 1 WHERE id = $2`,
        [points, ride.rider_id]
      );
      // Driver earnings
      const driverEarning = finalFare - serviceFee;
      await pool.query(
        `UPDATE drivers SET total_earnings = total_earnings + $1 WHERE id = $2`,
        [driverEarning, ride.driver_id]
      );
    }

    res.json({ ride: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const cancelRide = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.headers['x-user-id'];
    const userRole = req.headers['x-user-role'];

    const ride = await pool.query('SELECT * FROM rides WHERE id = $1', [id]);
    if (!ride.rows[0]) return res.status(404).json({ error: 'Ride not found' });
    const r = ride.rows[0];

    // Delivery after 17:00 — driver can cancel free
    const isDeliveryAfterEvening = r.is_delivery && new Date().getHours() >= 17;
    const cancelledBy = r.rider_id === userId ? 'rider' : 'driver';

    let cancellationFee = 0;
    if (r.status === 'accepted' && cancelledBy === 'rider') {
      cancellationFee = isDeliveryAfterEvening ? 0 : 350;
    }

    // Reset driver streak on cancellation
    if (cancelledBy === 'driver') {
      await pool.query(
        `UPDATE drivers SET current_streak = 0, streak_started_at = NULL WHERE id = $1`,
        [r.driver_id]
      );
    }

    const result = await pool.query(
      `UPDATE rides SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = $1,
       cancellation_reason = $2, cancellation_fee = $3, updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [cancelledBy, reason, cancellationFee, id]
    );

    res.json({ ride: result.rows[0], cancellation_fee: cancellationFee });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getRide = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT r.*,
        ST_X(r.pickup_location::geometry) as pickup_lng,
        ST_Y(r.pickup_location::geometry) as pickup_lat,
        ST_X(r.dropoff_location::geometry) as dropoff_lng,
        ST_Y(r.dropoff_location::geometry) as dropoff_lat,
        u.full_name as rider_name, u.phone as rider_phone, u.profile_picture as rider_photo,
        du.full_name as driver_name, du.phone as driver_phone, du.profile_picture as driver_photo, du.rating as driver_rating,
        v.make, v.model, v.color, v.plate, v.vehicle_type
       FROM rides r
       JOIN users u ON r.rider_id = u.id
       LEFT JOIN drivers d ON r.driver_id = d.id
       LEFT JOIN users du ON d.user_id = du.id
       LEFT JOIN vehicles v ON d.vehicle_id = v.id
       WHERE r.id = $1`,
      [id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Ride not found' });
    res.json({ ride: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const listRides = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { limit = 20, offset = 0, status } = req.query;
    let whereClause = 'WHERE (r.rider_id = $1 OR d.user_id = $1)';
    const params = [userId, limit, offset];
    if (status) { whereClause += ` AND r.status = $4`; params.push(status); }

    const result = await pool.query(
      `SELECT r.id, r.status, r.ride_type, r.pickup_address, r.dropoff_address,
              r.estimated_fare, r.final_fare, r.payment_method, r.created_at, r.completed_at,
              u.full_name as rider_name, du.full_name as driver_name
       FROM rides r
       JOIN users u ON r.rider_id = u.id
       LEFT JOIN drivers d ON r.driver_id = d.id
       LEFT JOIN users du ON d.user_id = du.id
       ${whereClause}
       ORDER BY r.created_at DESC LIMIT $2 OFFSET $3`,
      params
    );
    res.json({ rides: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const rateRide = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;
    const raterId = req.headers['x-user-id'];

    const ride = await pool.query('SELECT * FROM rides WHERE id = $1 AND status = $2', [id, 'completed']);
    if (!ride.rows[0]) return res.status(404).json({ error: 'Completed ride not found' });

    const r = ride.rows[0];
    const ratedId = r.rider_id === raterId ? r.driver_id : r.rider_id;

    await pool.query(
      `INSERT INTO ride_ratings (ride_id, rater_id, rated_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (ride_id, rater_id) DO UPDATE SET rating = $4, comment = $5`,
      [id, raterId, ratedId, rating, comment]
    );

    // Update avg rating
    const avgResult = await pool.query(
      'SELECT AVG(rating) as avg FROM ride_ratings WHERE rated_id = $1', [ratedId]
    );
    await pool.query(
      'UPDATE users SET rating = $1 WHERE id = $2',
      [parseFloat(avgResult.rows[0].avg).toFixed(2), ratedId]
    );

    // If rider gave 5 stars → add preferred driver prompt
    if (rating === 5 && r.rider_id === raterId) {
      res.json({ success: true, suggest_preferred: true, driver_id: r.driver_id });
    } else {
      res.json({ success: true });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const addTip = async (req, res) => {
  try {
    const { id } = req.params;
    const { tip_amount } = req.body;
    const result = await pool.query(
      'UPDATE rides SET tip_amount = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [tip_amount, id]
    );
    res.json({ ride: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const roundUpFare = async (req, res) => {
  try {
    const { id } = req.params;
    const ride = await pool.query('SELECT * FROM rides WHERE id = $1', [id]);
    if (!ride.rows[0]) return res.status(404).json({ error: 'Ride not found' });
    const r = ride.rows[0];
    const nextHundred = Math.ceil((r.final_fare || r.estimated_fare) / 100) * 100;
    const roundUpAmount = nextHundred - (r.final_fare || r.estimated_fare);
    const points = Math.floor(roundUpAmount / 10);

    await pool.query('UPDATE rides SET round_up_amount = $1 WHERE id = $2', [roundUpAmount, id]);
    await pool.query(
      'UPDATE users SET loyalty_points = loyalty_points + $1 WHERE id = $2',
      [points, r.rider_id]
    );
    await pool.query(
      `INSERT INTO loyalty_transactions (user_id, points, action, ride_id, description)
       VALUES ($1, $2, 'round_up', $3, 'Round-up fare to loyalty points')`,
      [r.rider_id, points, id]
    );

    res.json({ round_up_amount: roundUpAmount, points_earned: points });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getSurgePricing = async (req, res) => {
  try {
    const { lat, lng } = req.query;
    const result = await pool.query(
      `SELECT name, multiplier, starts_at, ends_at FROM surge_zones
       WHERE ST_Within(ST_SetSRID(ST_MakePoint($1, $2), 4326), zone)
       AND is_active = true AND (starts_at IS NULL OR starts_at <= NOW())
       AND (ends_at IS NULL OR ends_at >= NOW())
       ORDER BY multiplier DESC LIMIT 1`,
      [parseFloat(lng), parseFloat(lat)]
    );
    res.json({ surge: result.rows[0] || null, surge_active: !!result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const applyPromoCode = async (req, res) => {
  try {
    const { code, fare } = req.body;
    const result = await pool.query(
      `SELECT * FROM promo_codes WHERE code = $1 AND is_active = true
       AND (expires_at IS NULL OR expires_at > NOW()) AND used_count < max_uses`,
      [code]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Invalid or expired promo code' });
    const promo = result.rows[0];
    const discount = promo.discount_type === 'percent'
      ? Math.round(fare * promo.discount_value / 100)
      : promo.discount_value;
    res.json({ discount, final_fare: fare - discount, promo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getActivePromos = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT code, discount_type, discount_value, expires_at FROM promo_codes
       WHERE is_active = true AND (expires_at IS NULL OR expires_at > NOW()) AND used_count < max_uses`
    );
    res.json({ promos: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getMessages = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT m.*, u.full_name as sender_name FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.ride_id = $1 ORDER BY m.created_at ASC`,
      [id]
    );
    res.json({ messages: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const sendMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { content, receiver_id } = req.body;
    const senderId = req.headers['x-user-id'];
    const result = await pool.query(
      `INSERT INTO messages (ride_id, sender_id, receiver_id, content) VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, senderId, receiver_id, content]
    );
    res.status(201).json({ message: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  requestRide, getFare, acceptRide, updateRideStatus, cancelRide, getRide, listRides,
  rateRide, addTip, roundUpFare, getSurgePricing, applyPromoCode, getActivePromos,
  getMessages, sendMessage,
  updateRideStops, lockPrice,
  triggerCheckin, respondToCheckin, getCheckins,
  reportLostItem, getLostAndFound, updateLostAndFoundStatus,
  addPreferredDriver, getPreferredDrivers, removePreferredDriver,
  createConciergeBooking, getConciergeBookings
};

const { Pool } = require('pg');
const pool = require('../config/database');
const axios = require('axios');
const cache = require('../utils/cache');

// ============================================================
// EXISTING: requestRide, getFare, acceptRide, updateRideStatus,
// cancelRide, getRide, listRides, rateRide, addTip, roundUpFare,
// getSurgePricing, applyPromoCode, getActivePromos,
// getMessages, sendMessage
// ============================================================

// ── Per-ride-type fare multipliers (XAF base rates) ───────────────────────────
const RIDE_TYPE_RATES = {
  moto:     { base: 300,  perKm: 80,  perMin: 12, bookingFee: 200 },
  benskin:  { base: 300,  perKm: 80,  perMin: 12, bookingFee: 200 },
  standard: { base: 1000, perKm: 700, perMin: 100, bookingFee: 500 },
  xl:       { base: 1400, perKm: 900, perMin: 130, bookingFee: 500 },
  women:    { base: 1000, perKm: 700, perMin: 100, bookingFee: 500 },
  delivery: { base: 500,  perKm: 150, perMin: 40,  bookingFee: 300 },
};

// ── Rental packages (XAF) ─────────────────────────────────────────────────────
const RENTAL_PACKAGES = {
  '1h': { hours: 1, kmLimit: 50,  price: 8000  },
  '2h': { hours: 2, kmLimit: 100, price: 14000 },
  '4h': { hours: 4, kmLimit: 180, price: 25000 },
  '8h': { hours: 8, kmLimit: 300, price: 45000 },
};
const RENTAL_EXTRA_KM_RATE = 200; // XAF per extra km

// Helper: calculate fare in XAF (ride-type-aware)
function calculateFare(distanceKm, durationMin, surgeMultiplier = 1.0, subscription = 'none', priceLocked = false, lockedFare = null, rideType = 'standard') {
  if (priceLocked && lockedFare) return lockedFare;
  const rates = RIDE_TYPE_RATES[rideType] || RIDE_TYPE_RATES.standard;
  const raw = rates.base + (rates.perKm * distanceKm) + (rates.perMin * durationMin);
  const surged = Math.round(raw * surgeMultiplier);
  const discount = subscription === 'premium' ? 0.20 : subscription === 'basic' ? 0.10 : 0;
  const discounted = Math.round(surged * (1 - discount));
  const serviceFee = Math.round(discounted * 0.20);
  return { base: discounted, serviceFee, bookingFee: rates.bookingFee, total: discounted + serviceFee + rates.bookingFee };
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

// ---- PRICE LOCK (upfront pricing — available to all users like Uber) ----
const lockPrice = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { pickup_location, dropoff_location, pickup_address, dropoff_address, ride_type = 'standard' } = req.body;

    const userResult = await pool.query('SELECT subscription_plan FROM users WHERE id = $1', [userId]);
    const subscription = userResult.rows[0]?.subscription_plan || 'none';

    // Estimate distance
    let distKm = 5, durMin = 15;
    if (pickup_location && dropoff_location) {
      const R = 6371;
      const dLat = (dropoff_location.lat - pickup_location.lat) * Math.PI / 180;
      const dLon = (dropoff_location.lng - pickup_location.lng) * Math.PI / 180;
      const a = Math.sin(dLat/2)**2 + Math.cos(pickup_location.lat*Math.PI/180)*Math.cos(dropoff_location.lat*Math.PI/180)*Math.sin(dLon/2)**2;
      distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      durMin = Math.round(distKm * 3);
    }

    // Check surge at pickup
    let surgeMultiplier = 1.0;
    if (pickup_location) {
      const surgeResult = await pool.query(
        `SELECT multiplier FROM surge_zones
         WHERE ST_Within(ST_SetSRID(ST_MakePoint($1, $2), 4326), zone) AND is_active = true
         AND (starts_at IS NULL OR starts_at <= NOW()) AND (ends_at IS NULL OR ends_at >= NOW())
         ORDER BY multiplier DESC LIMIT 1`,
        [pickup_location.lng, pickup_location.lat]
      );
      surgeMultiplier = surgeResult.rows[0]?.multiplier || 1.0;
    }

    const fare = calculateFare(distKm, durMin, surgeMultiplier, subscription, false, null, ride_type);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    res.json({
      locked_fare: fare.total,
      fare_breakdown: fare,
      expires_at: expiresAt,
      pickup_address,
      dropoff_address,
      surge_multiplier: surgeMultiplier,
      message: 'Price locked for 30 minutes — guaranteed fare',
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
      // Escalate — mark as escalated with timestamp so job doesn't double-process
      await pool.query(
        'UPDATE ride_checkins SET escalated = true, escalated_at = NOW() WHERE id = $1',
        [id]
      );
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

    // ── Notify driver ──────────────────────────────────────────────────────
    try {
      const driverUserId = await pool.query(
        'SELECT user_id FROM drivers WHERE id = $1', [ride.rows[0].driver_id]
      );
      if (driverUserId.rows[0]) {
        const uid = driverUserId.rows[0].user_id;
        // In-app notification (persisted)
        await pool.query(
          `INSERT INTO notifications (user_id, type, title, body, data)
           VALUES ($1, 'lost_item', $2, $3, $4)`,
          [
            uid,
            'Lost Item Reported',
            `A passenger reported a lost ${item_category || 'item'} from a recent ride. Please check your vehicle.`,
            JSON.stringify({ report_id: result.rows[0].id, ride_id, item_category, item_description }),
          ]
        );
        // Real-time socket push if driver is online
        const io = req.app.get('io');
        if (io) {
          const { driverSockets } = require('../socket/rideSocket');
          const targetSid = driverSockets.get(String(ride.rows[0].driver_id));
          if (targetSid) {
            io.of('/rides').to(targetSid).emit('lost_item_report', {
              reportId: result.rows[0].id,
              rideId: ride_id,
              itemCategory: item_category,
              itemDescription: item_description,
              message: `Lost item reported: ${item_description}`,
            });
          }
        }
      }
    } catch (notifyErr) {
      console.warn('[LostAndFound] Driver notification error:', notifyErr.message);
    }

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
      use_price_lock = false, locked_fare = null, price_lock_expires_at = null,
      rental_package = null,   // '1h','2h','4h','8h' for rental rides
      // ── Sprint 1-3 extended fields ──
      is_for_other = false,
      other_passenger_name = null,
      other_passenger_phone = null,
      child_seat_required = false,
      child_seat_count = 0,
      split_payment = false,
      split_wallet_pct = 100,
      split_momo_pct = 0,
      recurring_ride_id = null,
      booked_via_ussd = false,
      user_phone = null,
      // ── Ride preferences (Feature 3 & 4) ──
      pickup_instructions = null,
      quiet_mode = false,
      ac_preference = 'auto',
      music_preference = true,
    } = req.body;

    // ── Rental ride fast-path ──────────────────────────────────────────────
    if (ride_type === 'rental') {
      const pkg = RENTAL_PACKAGES[rental_package];
      if (!pkg) return res.status(400).json({ error: 'Invalid rental package. Choose: 1h, 2h, 4h, 8h' });

      const dropLng = dropoff_location?.lng ?? pickup_location.lng;
      const dropLat = dropoff_location?.lat ?? pickup_location.lat;

      const result = await pool.query(
        `INSERT INTO rides (
          rider_id, ride_type, status,
          pickup_address, pickup_location,
          dropoff_address, dropoff_location,
          estimated_fare, base_fare, service_fee, booking_fee,
          payment_method, notes,
          rental_package, rental_hours, rental_km_limit,
          price_locked, locked_fare
        ) VALUES (
          $1,'rental','requested',
          $2, ST_SetSRID(ST_MakePoint($3,$4),4326),
          $5, ST_SetSRID(ST_MakePoint($6,$7),4326),
          $8,1000,0,500,$9,$10,
          $11,$12,$13,true,$8
        ) RETURNING *`,
        [
          riderId,
          pickup_address, pickup_location.lng, pickup_location.lat,
          dropoff_address || pickup_address, dropLng, dropLat,
          pkg.price, payment_method, notes,
          rental_package, pkg.hours, pkg.kmLimit,
        ]
      );
      return res.status(201).json({
        ride: result.rows[0],
        fare: { total: pkg.price, base: pkg.price, serviceFee: 0, bookingFee: 500 },
        rental_package: pkg,
      });
    }

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

    // Estimate distance via haversine across all waypoints (pickup → stops → dropoff)
    function haversineKm(p1, p2) {
      const R = 6371;
      const dLat = (p2.lat - p1.lat) * Math.PI / 180;
      const dLon = (p2.lng - p1.lng) * Math.PI / 180;
      const a = Math.sin(dLat/2)**2 +
        Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) * Math.sin(dLon/2)**2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    const waypoints = [pickup_location, ...(stops || []).map(s => s.location || s), dropoff_location];
    let totalDistKm = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
      const p1 = waypoints[i], p2 = waypoints[i + 1];
      if (p1?.lat != null && p2?.lat != null) totalDistKm += haversineKm(p1, p2);
    }
    const distanceKm = totalDistKm;
    const durationMin = Math.round(distanceKm * 3) + (stops?.length || 0) * 2;

    let fareCalc = calculateFare(distanceKm, durationMin, surgeMultiplier, user?.subscription_plan, use_price_lock, locked_fare, ride_type);

    // ── Commuter pass discount ─────────────────────────────────────────────
    let commuterPassId = null;
    let commuterDiscount = 0;
    if (pickup_location && dropoff_location) {
      try {
        const { findMatchingPass } = require('./commuterPassController');
        const pass = await findMatchingPass(
          riderId,
          pickup_location.lat, pickup_location.lng,
          dropoff_location.lat, dropoff_location.lng
        );
        if (pass) {
          commuterPassId = pass.id;
          commuterDiscount = Math.round(fareCalc.total * (pass.discount_percent / 100));
          fareCalc = { ...fareCalc, total: fareCalc.total - commuterDiscount };
        }
      } catch (passErr) { console.warn('[CommuterPass]', passErr.message); }
    }

    const priceLockValid = use_price_lock && locked_fare && price_lock_expires_at && new Date(price_lock_expires_at) > new Date();

    const rates = RIDE_TYPE_RATES[ride_type] || RIDE_TYPE_RATES.standard;

    const result = await pool.query(
      `INSERT INTO rides (
        rider_id, ride_type, status, pickup_address, pickup_location,
        dropoff_address, dropoff_location, distance_km, duration_minutes,
        estimated_fare, base_fare, per_km_fare, per_minute_fare,
        surge_multiplier, surge_active, service_fee, booking_fee,
        payment_method, scheduled_at, is_scheduled, stops, preferred_driver_id,
        price_locked, notes, commuter_pass_id, commuter_discount,
        is_for_other, other_passenger_name, other_passenger_phone,
        child_seat_required, child_seat_count,
        split_payment, split_wallet_pct, split_momo_pct,
        upfront_fare_xaf, fare_locked_at,
        recurring_ride_id, booked_via_ussd, user_phone,
        pickup_instructions, quiet_mode, ac_preference, music_preference
      ) VALUES (
        $1,$2,'requested',$3,ST_SetSRID(ST_MakePoint($4,$5),4326),
        $6,ST_SetSRID(ST_MakePoint($7,$8),4326),$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,
        $28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45
      ) RETURNING *`,
      [
        riderId, ride_type,
        pickup_address, pickup_location.lng, pickup_location.lat,
        dropoff_address, dropoff_location.lng, dropoff_location.lat,
        distanceKm.toFixed(2), durationMin,
        fareCalc.total, fareCalc.base, rates.perKm, rates.perMin,
        surgeMultiplier, surgeMultiplier > 1.0,
        fareCalc.serviceFee, payment_method,
        scheduled_at, !!scheduled_at,
        JSON.stringify(stops), preferred_driver_id, priceLockValid, notes,
        commuterPassId, commuterDiscount,
        // Sprint 1-3 fields
        is_for_other, other_passenger_name, other_passenger_phone,
        child_seat_required, child_seat_count,
        split_payment, split_wallet_pct, split_momo_pct,
        priceLockValid ? fareCalc.total : null,
        priceLockValid ? new Date() : null,
        recurring_ride_id, booked_via_ussd, user_phone,
        // Ride preferences
        pickup_instructions, quiet_mode, ac_preference, music_preference,
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

    // Cache fare estimates (coords quantized to ~111m precision via *1000 rounding)
    const cacheKey = `fare:${ride_type}:${Math.round(pickup_location.lat * 1000)}:${Math.round(pickup_location.lng * 1000)}:${Math.round(dropoff_location.lat * 1000)}:${Math.round(dropoff_location.lng * 1000)}`;
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

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

    // Build ordered waypoint list: pickup → each stop (in order) → dropoff
    function haversineKm(p1, p2) {
      const R = 6371;
      const dLat = (p2.lat - p1.lat) * Math.PI / 180;
      const dLon = (p2.lng - p1.lng) * Math.PI / 180;
      const a = Math.sin(dLat/2)**2 +
        Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) * Math.sin(dLon/2)**2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    const waypoints = [pickup_location];
    for (const s of stops) {
      const loc = s.location || s; // support { location: {lat,lng} } or bare {lat,lng}
      if (loc?.lat != null && loc?.lng != null) waypoints.push(loc);
    }
    waypoints.push(dropoff_location);

    let totalDistance = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
      totalDistance += haversineKm(waypoints[i], waypoints[i + 1]);
    }
    // Add 2 min per stop for dwell time
    const distanceKm = totalDistance;
    const durationMin = Math.round(distanceKm * 3) + stops.length * 2;

    // Return fares for all ride types so the client can show comparison
    const allTypes = Object.keys(RIDE_TYPE_RATES);
    const fares = {};
    allTypes.forEach(rt => {
      fares[rt] = calculateFare(totalDistance, durationMin, surgeMultiplier, subscription, false, null, rt);
    });
    const fare = fares[ride_type] || fares.standard;

    const fareResponse = {
      fare,
      fares,           // per-type breakdown for RideCompareScreen
      distance_km: totalDistance.toFixed(2),
      duration_minutes: durationMin,
      surge_multiplier: surgeMultiplier,
      surge_active: surgeMultiplier > 1.0,
      stops_count: stops.length,
      waypoints_count: waypoints.length,
    };

    await cache.set(cacheKey, fareResponse, 300); // 5 min TTL
    res.json(fareResponse);
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

    // ── AR suspension check: blocked drivers cannot accept rides ──────────
    const arCheck = await pool.query(
      'SELECT ar_suspended_until FROM drivers WHERE id = $1',
      [driverId]
    );
    const suspendedUntil = arCheck.rows[0]?.ar_suspended_until;
    if (suspendedUntil && new Date(suspendedUntil) > new Date()) {
      return res.status(403).json({
        error: `Your account is temporarily suspended due to low acceptance rate. Suspension lifts at ${new Date(suspendedUntil).toLocaleString()}.`,
        suspended_until: suspendedUntil,
      });
    }

    // ── WAV: only wheelchair-accessible vehicles may accept WAV rides ─────
    if (ride.rows[0].ride_type === 'wav') {
      const wavCheck = await pool.query(
        `SELECT is_wheelchair_accessible FROM vehicles
         WHERE id = (SELECT vehicle_id FROM drivers WHERE id = $1)`,
        [driverId]
      );
      if (!wavCheck.rows[0]?.is_wheelchair_accessible) {
        return res.status(403).json({ error: 'This ride requires a wheelchair accessible vehicle.' });
      }
    }

    // ── EV: only electric vehicles may accept EV rides ────────────────────
    if (ride.rows[0].ride_type === 'ev') {
      const evCheck = await pool.query(
        `SELECT is_electric FROM vehicles
         WHERE id = (SELECT vehicle_id FROM drivers WHERE id = $1)`,
        [driverId]
      );
      if (!evCheck.rows[0]?.is_electric) {
        return res.status(403).json({ error: 'This is an EV-only ride. Only electric vehicles may accept it.' });
      }
    }

    // ── Women+ Connect: enforce gender preference ──────────────────────────
    const riderPref = await pool.query(
      'SELECT gender_preference FROM users WHERE id = $1',
      [ride.rows[0].rider_id]
    );
    if (riderPref.rows[0]?.gender_preference === 'women_nonbinary') {
      const driverGender = await pool.query(
        `SELECT u.gender FROM users u JOIN drivers d ON d.user_id = u.id WHERE d.id = $1`,
        [driverId]
      );
      const g = (driverGender.rows[0]?.gender || '').toLowerCase();
      const womenAllowed = ['female', 'woman', 'non_binary', 'nonbinary', 'non-binary'];
      if (!womenAllowed.includes(g)) {
        return res.status(403).json({
          error: 'This rider has enabled Women+ mode. Only women and non-binary drivers may accept this ride.',
        });
      }
    }

    const { randomInt } = require('crypto');
    const otp = randomInt(1000, 10000).toString();
    const result = await pool.query(
      `UPDATE rides SET driver_id = $1, status = 'accepted', pickup_otp = $2,
       accepted_at = NOW(), updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [driverId, otp, id]
    );

    // Update driver streak + acceptance rate tracking
    await pool.query(
      `UPDATE drivers SET
         current_streak         = current_streak + 1,
         streak_started_at      = COALESCE(streak_started_at, NOW()),
         longest_streak         = GREATEST(longest_streak, current_streak + 1),
         total_offers_accepted  = total_offers_accepted + 1,
         acceptance_rate        = CASE
           WHEN (total_offers_received + 1) > 0
           THEN ROUND(((total_offers_accepted + 1)::DECIMAL / (total_offers_received + 1)) * 100, 2)
           ELSE 100
         END
       WHERE id = $1`,
      [driverId]
    );

    // Push notification to rider: driver accepted
    try {
      const ride = result.rows[0];
      const { notifyRiderDriverAccepted } = require('../services/pushNotifications');
      const notifInfo = await pool.query(
        `SELECT
           u_rider.push_token   AS rider_token,
           u_driver.full_name   AS driver_name,
           v.make || ' ' || v.model AS vehicle,
           v.plate,
           v.color              AS vehicle_color
         FROM rides r
         JOIN users u_rider  ON u_rider.id  = r.rider_id
         JOIN drivers d      ON d.id         = r.driver_id
         JOIN users u_driver ON u_driver.id  = d.user_id
         LEFT JOIN vehicles v ON v.id        = d.vehicle_id
         WHERE r.id = $1`,
        [ride.id]
      );
      const info = notifInfo.rows[0];
      if (info?.rider_token) {
        await notifyRiderDriverAccepted(info.rider_token, {
          ride_id:     ride.id,
          driver_name: info.driver_name,
          vehicle:     info.vehicle || '',
          plate:       info.plate   || '',
          eta_minutes: 5,
          user_id:     ride.rider_id,
        });
      }
    } catch (pnErr) {
      console.warn('[AcceptRide PushNotification]', pnErr.message);
    }

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
    if (status === 'arriving')    extra = ', driver_arrived_at = NOW()';
    if (status === 'in_progress') extra = ', started_at = NOW()';
    if (status === 'completed')   extra = ', completed_at = NOW()';

    const result = await pool.query(
      `UPDATE rides SET status = $1 ${extra}, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, id]
    );

    // ── Feature 28: Driver Arrived push with photo + plate ───────────────────
    if (status === 'arriving' && result.rows[0]) {
      try {
        const ride = result.rows[0];
        const { notifyRiderDriverArrived } = require('../services/pushNotifications');

        // Fetch rider push token + driver/vehicle details in one query
        const infoRes = await pool.query(
          `SELECT
             u_rider.push_token         AS rider_token,
             u_driver.full_name         AS driver_name,
             u_driver.profile_photo_url AS driver_photo_url,
             v.plate, v.color           AS vehicle_color, v.make AS vehicle_make
           FROM rides r
           JOIN users u_rider  ON u_rider.id  = r.rider_id
           JOIN drivers d      ON d.id         = r.driver_id
           JOIN users u_driver ON u_driver.id  = d.user_id
           LEFT JOIN vehicles v ON v.id        = d.vehicle_id
           WHERE r.id = $1`,
          [ride.id]
        );

        const info = infoRes.rows[0];
        if (info?.rider_token) {
          await notifyRiderDriverArrived(info.rider_token, {
            ride_id:          ride.id,
            driver_name:      info.driver_name,
            driver_photo_url: info.driver_photo_url,
            plate:            info.plate,
            vehicle_color:    info.vehicle_color,
            vehicle_make:     info.vehicle_make,
            user_id:          ride.rider_id,
          });
        }
      } catch (arrErr) {
        console.warn('[ArrivalNotification]', arrErr.message);
      }
    }

    if (status === 'in_progress' && result.rows[0]) {
      const ride = result.rows[0];
      const rideId = ride.id;
      const riderId = ride.rider_id;

      // ── Push notification: trip started ──────────────────────────────────
      try {
        const { _send } = require('../services/pushNotifications');
        const riderTokenRow = await pool.query(
          'SELECT push_token FROM users WHERE id = $1',
          [riderId]
        );
        const riderToken = riderTokenRow.rows[0]?.push_token;
        if (riderToken) {
          const { Expo } = require('expo-server-sdk');
          const expo = new Expo();
          if (Expo.isExpoPushToken(riderToken)) {
            await expo.sendPushNotificationsAsync([{
              to: riderToken,
              sound: 'default',
              title: 'Trip started!',
              body: `You're on your way to ${ride.dropoff_address || 'your destination'}.`,
              data: { type: 'trip_started', ride_id: ride.id, user_id: riderId },
            }]);
          }
        }
      } catch (pnErr) {
        console.warn('[InProgressPushNotification]', pnErr.message);
      }

      // ── Waiting time charge ──────────────────────────────────────────────
      // driver_arrived_at set when status = 'arriving' (driver clicks "Arrived at Pickup")
      // Grace period: 3 minutes free; then 50 XAF / minute
      try {
        const arrivedAt = ride.driver_arrived_at;
        if (arrivedAt) {
          const waitMin = (Date.now() - new Date(arrivedAt).getTime()) / 60000;
          const GRACE_MIN = 3;
          const FEE_PER_MIN = 50; // XAF
          const chargeableMin = Math.max(0, waitMin - GRACE_MIN);
          const waitingFee = Math.round(chargeableMin * FEE_PER_MIN);
          if (waitingFee > 0) {
            await pool.query(
              'UPDATE rides SET waiting_fee = $1, estimated_fare = estimated_fare + $1 WHERE id = $2',
              [waitingFee, id]
            );
          }
        }
      } catch (waitErr) {
        console.warn('[WaitingFee]', waitErr.message);
      }

      // Auto-notify trusted contacts with SMS + share link
      try {
        const contactsResult = await pool.query(
          'SELECT name, phone, email FROM trusted_contacts WHERE user_id = $1 AND notify_on_trip_start = true',
          [riderId]
        );

        if (contactsResult.rows.length > 0) {
          // Generate share token automatically
          const crypto = require('crypto');
          const shareToken = crypto.randomBytes(16).toString('hex');
          const shareExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
          await pool.query(
            'UPDATE rides SET share_token = $1, share_token_expires = $2 WHERE id = $3',
            [shareToken, shareExpires, ride.id]
          );

          const shareUrl = `${process.env.APP_BASE_URL || 'https://mobo.app'}/track/${shareToken}`;

          // Get driver + vehicle info for the message
          const driverInfo = await pool.query(
            `SELECT u.full_name, v.plate, v.color, v.make
             FROM drivers d
             JOIN users u ON u.id = d.user_id
             LEFT JOIN vehicles v ON v.id = d.vehicle_id
             WHERE d.id = $1`,
            [ride.driver_id]
          );

          const drv = driverInfo.rows[0];
          if (drv) {
            const nameParts = (drv.full_name || '').split(' ');
            const driverName = nameParts[0] + (nameParts[1] ? ' ' + nameParts[1][0] + '.' : '');

            const { sendTripStartSMS } = require('../utils/notifyContacts');
            await sendTripStartSMS({
              contacts: contactsResult.rows,
              driverName,
              plate:        drv.plate  || 'N/A',
              vehicleColor: drv.color  || '',
              vehicleMake:  drv.make   || '',
              shareUrl,
              eta: null  // ETA can be added when routing is integrated
            });
          }

          // Also insert in-app notifications for contacts who have accounts
          for (const contact of contactsResult.rows) {
            await pool.query(
              `INSERT INTO notifications (user_id, type, title, body, data)
               SELECT id, 'trip_share', 'Ride Started', $1, $2
               FROM users WHERE phone = $3 AND is_active = true`,
              [
                `Your contact's ride has started. Driver: ${drv?.full_name || 'Unknown'}`,
                JSON.stringify({ share_url: shareUrl }),
                contact.phone
              ]
            );
          }
        }
      } catch (notifyErr) {
        console.warn('[TrustedContact Notify]', notifyErr.message);
      }
    }

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
      // Increment driver's trip counter for fatigue tracking
      await pool.query(
        'UPDATE drivers SET total_trips_today = COALESCE(total_trips_today, 0) + 1 WHERE id = $1',
        [ride.driver_id]
      );

      // ── Referral qualification: pay referrer on rider's first completed ride ──
      try {
        const riderRideCount = await pool.query(
          `SELECT COUNT(*) FROM rides WHERE rider_id = $1 AND status = 'completed'`,
          [ride.rider_id]
        );
        if (parseInt(riderRideCount.rows[0].count) === 1) {
          const referral = await pool.query(
            `SELECT * FROM referrals WHERE referred_id = $1 AND status = 'pending'`,
            [ride.rider_id]
          );
          if (referral.rows[0]) {
            await pool.query(
              `UPDATE referrals SET status = 'paid', qualified_at = NOW(), paid_at = NOW() WHERE id = $1`,
              [referral.rows[0].id]
            );
            await pool.query(
              `UPDATE users SET referral_credits = referral_credits + 1000,
               wallet_balance = wallet_balance + 1000 WHERE id = $1`,
              [referral.rows[0].referrer_id]
            );
          }
        }
      } catch (refErr) {
        console.warn('[Referral] qualify error:', refErr.message);
      }

      // ── Driver challenge progress: increment rides_count challenges ──────────
      try {
        const driverId = ride.driver_id;
        // Increment rides_count challenges
        await pool.query(
          `UPDATE driver_challenge_progress dcp
           SET current_value = dcp.current_value + 1
           FROM bonus_challenges bc
           WHERE dcp.challenge_id = bc.id
             AND dcp.driver_id = $1
             AND bc.challenge_type = 'rides_count'
             AND bc.is_active = true
             AND bc.ends_at > NOW()
             AND dcp.completed = false`,
          [driverId]
        );
        // Mark newly completed challenges
        await pool.query(
          `UPDATE driver_challenge_progress dcp
           SET completed = true, completed_at = NOW()
           FROM bonus_challenges bc
           WHERE dcp.challenge_id = bc.id
             AND dcp.driver_id = $1
             AND dcp.current_value >= bc.target_value
             AND dcp.completed = false`,
          [driverId]
        );
        // Auto-pay completed bonuses
        const pendingBonuses = await pool.query(
          `SELECT dcp.id, bc.bonus_amount
           FROM driver_challenge_progress dcp
           JOIN bonus_challenges bc ON dcp.challenge_id = bc.id
           WHERE dcp.driver_id = $1 AND dcp.completed = true AND dcp.bonus_paid = false`,
          [driverId]
        );
        for (const b of pendingBonuses.rows) {
          await pool.query(
            `UPDATE driver_challenge_progress SET bonus_paid = true, paid_at = NOW() WHERE id = $1`,
            [b.id]
          );
          await pool.query(
            `UPDATE drivers SET total_bonuses_earned = total_bonuses_earned + $1 WHERE id = $2`,
            [b.bonus_amount, driverId]
          );
          await pool.query(
            `UPDATE users SET wallet_balance = wallet_balance + $1
             WHERE id = (SELECT user_id FROM drivers WHERE id = $2)`,
            [b.bonus_amount, driverId]
          );
        }
      } catch (bonusErr) {
        console.warn('[Bonus] progress update error:', bonusErr.message);
      }

      // ── Commuter pass: consume one ride ──────────────────────────────────
      try {
        if (ride.commuter_pass_id) {
          const { consumePassRide } = require('./commuterPassController');
          await consumePassRide(ride.commuter_pass_id);
        }
      } catch (passErr) { console.warn('[CommuterPass consume]', passErr.message); }

      // ── Push notification: ride completed ────────────────────────────────
      try {
        const { notifyRideCompleted } = require('../services/pushNotifications');
        const riderTokenRow = await pool.query(
          'SELECT push_token FROM users WHERE id = $1',
          [ride.rider_id]
        );
        const riderToken = riderTokenRow.rows[0]?.push_token;
        if (riderToken) {
          const earnedPoints = Math.floor((ride.estimated_fare || 0) / 100);
          await notifyRideCompleted(riderToken, {
            ride_id:      ride.id,
            final_fare:   finalFare,
            points_earned: earnedPoints,
            user_id:      ride.rider_id,
          });
        }
      } catch (pnErr) {
        console.warn('[CompletedPushNotification]', pnErr.message);
      }

      // ── Send ride receipt email ──────────────────────────────────────────
      try {
        const [userRow, driverRow, freshRide] = await Promise.all([
          pool.query('SELECT email, full_name, preferred_language FROM users WHERE id = $1', [ride.rider_id]),
          pool.query(
            'SELECT u.full_name FROM drivers d JOIN users u ON u.id = d.user_id WHERE d.id = $1',
            [ride.driver_id]
          ),
          pool.query('SELECT * FROM rides WHERE id = $1', [id]),
        ]);
        const usr = userRow.rows[0];
        const fr  = freshRide.rows[0];
        if (usr?.email) {
          const { sendRideReceiptEmail } = require('../utils/email');
          await sendRideReceiptEmail(usr.email, {
            rider_name:      usr.full_name || 'Rider',
            pickup_address:  fr?.pickup_address  || ride.pickup_address,
            dropoff_address: fr?.dropoff_address || ride.dropoff_address,
            distance_km:     parseFloat(fr?.distance_km || ride.distance_km || 0).toFixed(1),
            duration_minutes: fr?.duration_minutes || ride.duration_minutes || 0,
            fare:            fr?.final_fare || finalFare,
            waiting_fee:     fr?.waiting_fee || 0,
            tip_amount:      fr?.tip_amount || 0,
            currency:        'XAF',
            ride_type:       fr?.ride_type || ride.ride_type,
            driver_name:     driverRow.rows[0]?.full_name || '–',
            completed_at:    fr?.completed_at || new Date(),
            receipt_id:      id,
            language:        usr.preferred_language || 'en',
          });
        }
      } catch (emailErr) {
        console.warn('[ReceiptEmail]', emailErr.message);
      }
    }

    res.json({ ride: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Cancellation fee tiers (rider cancels after driver accepted) ──────────────
// 0–2 min after accept → free grace period
// 2–5 min after accept → 350 XAF
// 5+ min after accept  → 750 XAF
// Driver arrived at pickup → 1,000 XAF (driver wasted trip)
function calcCancellationFee(ride) {
  if (!ride.driver_id) return 0;                          // not yet accepted
  if (!['accepted', 'arriving'].includes(ride.status)) return 0;

  const acceptedAt = ride.accepted_at ? new Date(ride.accepted_at) : null;
  const arrivedAt  = ride.driver_arrived_at ? new Date(ride.driver_arrived_at) : null;
  if (!acceptedAt) return 350;                            // accepted_at missing → default fee

  const elapsedMin = (Date.now() - acceptedAt.getTime()) / 60000;

  if (arrivedAt) return 1000;                             // driver already at pickup
  if (elapsedMin < 2) return 0;                           // grace window
  if (elapsedMin < 5) return 350;
  return 750;
}

const cancelRide = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.headers['x-user-id'];

    const ride = await pool.query('SELECT * FROM rides WHERE id = $1', [id]);
    if (!ride.rows[0]) return res.status(404).json({ error: 'Ride not found' });
    const r = ride.rows[0];

    const cancelledBy = r.rider_id === userId ? 'rider' : 'driver';

    // ── Fee calculation ──────────────────────────────────────────────────────
    let cancellationFee = 0;
    const isDeliveryAfterEvening = r.is_delivery && new Date().getHours() >= 17;

    if (cancelledBy === 'rider' && !isDeliveryAfterEvening) {
      cancellationFee = calcCancellationFee(r);
    }

    // ── Reset driver streak on driver cancellation ───────────────────────────
    if (cancelledBy === 'driver' && r.driver_id) {
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

    // ── Auto-charge rider wallet & credit driver if fee > 0 ─────────────────
    if (cancellationFee > 0 && cancelledBy === 'rider') {
      try {
        // Deduct from rider wallet (allow negative — rider owes)
        await pool.query(
          `UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2`,
          [cancellationFee, r.rider_id]
        );
        await pool.query(
          `UPDATE rides SET cancellation_fee_charged = true WHERE id = $1`, [id]
        );

        // Credit driver if assigned
        if (r.driver_id) {
          await pool.query(
            `UPDATE drivers SET total_earnings = total_earnings + $1 WHERE id = $2`,
            [cancellationFee, r.driver_id]
          );
          await pool.query(
            `UPDATE users SET wallet_balance = wallet_balance + $1
             WHERE id = (SELECT user_id FROM drivers WHERE id = $2)`,
            [cancellationFee, r.driver_id]
          );
          await pool.query(
            `UPDATE rides SET cancellation_fee_credited = true WHERE id = $1`, [id]
          );

          // Notify driver
          await pool.query(
            `INSERT INTO notifications (user_id, type, title, body, data)
             SELECT user_id, 'cancellation_fee', 'Cancellation Fee Received',
               $1, $2
             FROM drivers WHERE id = $3`,
            [
              `You received ${cancellationFee.toLocaleString()} XAF cancellation fee`,
              JSON.stringify({ ride_id: id, amount: cancellationFee }),
              r.driver_id,
            ]
          );
        }

        // Notify rider of charge
        await pool.query(
          `INSERT INTO notifications (user_id, type, title, body, data)
           VALUES ($1, 'cancellation_fee', 'Cancellation Fee Charged',
             $2, $3)`,
          [
            r.rider_id,
            `${cancellationFee.toLocaleString()} XAF cancellation fee was deducted from your wallet`,
            JSON.stringify({ ride_id: id, amount: cancellationFee }),
          ]
        );
      } catch (feeErr) {
        console.warn('[CancelFee] charge error:', feeErr.message);
      }
    }

    // ── Push notification to the OTHER party that ride was cancelled ─────────
    try {
      const { notifyRideCancelled } = require('../services/pushNotifications');
      const cancelledRide = result.rows[0];
      // If rider cancelled, notify driver; if driver cancelled, notify rider
      const notifyUserId = cancelledBy === 'rider' ? null : cancelledRide.rider_id;
      if (notifyUserId) {
        const tokenRow = await pool.query(
          'SELECT push_token FROM users WHERE id = $1',
          [notifyUserId]
        );
        const token = tokenRow.rows[0]?.push_token;
        if (token) {
          await notifyRideCancelled(token, {
            ride_id:      cancelledRide.id,
            reason:       reason || 'Cancelled',
            cancelled_by: cancelledBy,
            user_id:      notifyUserId,
          });
        }
      }
      // Also notify driver if rider cancelled and driver was assigned
      if (cancelledBy === 'rider' && r.driver_id) {
        const driverTokenRow = await pool.query(
          `SELECT u.push_token FROM drivers d JOIN users u ON u.id = d.user_id WHERE d.id = $1`,
          [r.driver_id]
        );
        const driverToken = driverTokenRow.rows[0]?.push_token;
        if (driverToken) {
          await notifyRideCancelled(driverToken, {
            ride_id:      cancelledRide.id,
            reason:       reason || 'Cancelled by rider',
            cancelled_by: cancelledBy,
            user_id:      null,
          });
        }
      }
    } catch (pnErr) {
      console.warn('[CancelPushNotification]', pnErr.message);
    }

    res.json({
      ride: result.rows[0],
      cancellation_fee: cancellationFee,
      fee_charged: cancellationFee > 0,
      message: cancellationFee > 0
        ? `A cancellation fee of ${cancellationFee.toLocaleString()} XAF has been charged`
        : 'Ride cancelled with no fee',
    });
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
    const safeLimit = Math.min(Math.max(1, parseInt(limit) || 20), 100);
    let whereClause = 'WHERE (r.rider_id = $1 OR d.user_id = $1)';
    const params = [userId, safeLimit, parseInt(offset) || 0];
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

    // Check for rating abuse (only when a rider gives a 1-star rating)
    if (rating === 1 && r.rider_id === raterId) {
      try {
        // Count consecutive 1-star ratings this rider gave to different drivers
        const recentRatings = await pool.query(
          `SELECT rating FROM ride_ratings
           WHERE rater_id = $1
           ORDER BY created_at DESC
           LIMIT 5`,
          [raterId]  // the user_id of the rider who just rated
        );

        const allOneStar = recentRatings.rows.length >= 5 &&
          recentRatings.rows.every(r => r.rating === 1);

        if (allOneStar) {
          // Flag the rider
          await pool.query(
            `UPDATE users
             SET rating_abuse_flagged = true,
                 rating_abuse_flagged_at = NOW(),
                 consecutive_low_ratings = 5
             WHERE id = $1`,
            [raterId]
          );

          // Notify admins
          await pool.query(
            `INSERT INTO notifications (user_id, type, title, body, data)
             SELECT id, 'rating_abuse', '⚠️ Rating Abuse Detected',
               'A rider has given 1-star to 5 consecutive drivers. Review account.',
               $1::jsonb
             FROM users WHERE role = 'admin' AND is_active = true`,
            [JSON.stringify({ rider_id: raterId, consecutive_count: 5 })]
          );

          console.log('[RatingAbuse] Flagged rider:', raterId);
        } else {
          // Update consecutive counter (reset if they gave > 1 star)
          const latestRating = recentRatings.rows[0]?.rating;
          if (latestRating > 1) {
            await pool.query(
              'UPDATE users SET consecutive_low_ratings = 0 WHERE id = $1',
              [raterId]
            );
          }
        }
      } catch (abuseErr) {
        console.warn('[RatingAbuse]', abuseErr.message);
      }
    }

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
    const amount = parseInt(req.body.tip_amount ?? req.body.amount ?? 0, 10);
    if (amount < 0) return res.status(400).json({ error: 'Tip amount cannot be negative' });

    const result = await pool.query(
      `UPDATE rides SET tip_amount = $1, tip_paid_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND status = 'completed' RETURNING *`,
      [amount, id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Completed ride not found' });

    // Credit tip to driver wallet + total_earnings
    const ride = result.rows[0];
    if (ride.driver_id && amount > 0) {
      await pool.query(
        `UPDATE drivers SET total_earnings = total_earnings + $1 WHERE id = $2`,
        [amount, ride.driver_id]
      );
      await pool.query(
        `UPDATE users SET wallet_balance = wallet_balance + $1
         WHERE id = (SELECT user_id FROM drivers WHERE id = $2)`,
        [amount, ride.driver_id]
      );
    }

    res.json({ ride: result.rows[0], tip_credited: amount });
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

    const surgeCacheKey = `surge:${Math.round(parseFloat(lat) * 100) / 100}:${Math.round(parseFloat(lng) * 100) / 100}`;
    const cachedSurge = await cache.get(surgeCacheKey);
    if (cachedSurge !== null) {
      return res.json(cachedSurge);
    }

    const result = await pool.query(
      `SELECT name, multiplier, starts_at, ends_at FROM surge_zones
       WHERE ST_Within(ST_SetSRID(ST_MakePoint($1, $2), 4326), zone)
       AND is_active = true AND (starts_at IS NULL OR starts_at <= NOW())
       AND (ends_at IS NULL OR ends_at >= NOW())
       ORDER BY multiplier DESC LIMIT 1`,
      [parseFloat(lng), parseFloat(lat)]
    );
    const surgeResponse = { surge: result.rows[0] || null, surge_active: !!result.rows[0] };
    await cache.set(surgeCacheKey, surgeResponse, 120); // 2 min TTL
    res.json(surgeResponse);
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

// ── CANCELLATION FEE PREVIEW ──────────────────────────────────────────────────
const getCancellationFeePreview = async (req, res) => {
  try {
    const { id } = req.params;
    const ride = await pool.query('SELECT * FROM rides WHERE id = $1', [id]);
    if (!ride.rows[0]) return res.status(404).json({ error: 'Ride not found' });
    const fee = calcCancellationFee(ride.rows[0]);
    const acceptedAt = ride.rows[0].accepted_at;
    const elapsedMin = acceptedAt ? (Date.now() - new Date(acceptedAt).getTime()) / 60000 : 0;
    res.json({
      cancellation_fee: fee,
      fee_applies: fee > 0,
      elapsed_minutes: Math.round(elapsedMin * 10) / 10,
      grace_period_remaining: Math.max(0, Math.round((2 - elapsedMin) * 60)),
      message: fee === 0
        ? 'Free cancellation — within grace period'
        : `A fee of ${fee.toLocaleString()} XAF will be charged`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── FARE SPLIT ────────────────────────────────────────────────────────────────
const createFareSplit = async (req, res) => {
  try {
    const { id } = req.params;
    const initiatorId = req.headers['x-user-id'];
    const { participants, note } = req.body;
    // participants: [{ name, phone }]
    if (!participants || participants.length < 1) {
      return res.status(400).json({ error: 'At least 1 participant required' });
    }

    const ride = await pool.query('SELECT * FROM rides WHERE id = $1', [id]);
    if (!ride.rows[0]) return res.status(404).json({ error: 'Ride not found' });

    const totalFare = ride.rows[0].final_fare || ride.rows[0].estimated_fare || 0;
    const splitCount = participants.length + 1; // +1 for initiator
    const amountPerPerson = Math.ceil(totalFare / splitCount);

    const splitResult = await pool.query(
      `INSERT INTO fare_splits (ride_id, initiator_id, total_fare, split_count, amount_per_person, note)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, initiatorId, totalFare, splitCount, amountPerPerson, note]
    );
    const split = splitResult.rows[0];

    for (const p of participants) {
      await pool.query(
        `INSERT INTO fare_split_participants (split_id, phone, name, amount)
         VALUES ($1, $2, $3, $4)`,
        [split.id, p.phone, p.name || null, amountPerPerson]
      );
    }

    const parts = await pool.query(
      'SELECT * FROM fare_split_participants WHERE split_id = $1', [split.id]
    );
    res.status(201).json({ split, participants: parts.rows, amount_per_person: amountPerPerson });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getFareSplit = async (req, res) => {
  try {
    const { id } = req.params;
    const split = await pool.query(
      `SELECT fs.*, u.full_name as initiator_name
       FROM fare_splits fs JOIN users u ON fs.initiator_id = u.id
       WHERE fs.ride_id = $1 ORDER BY fs.created_at DESC LIMIT 1`,
      [id]
    );
    if (!split.rows[0]) return res.status(404).json({ error: 'No split found for this ride' });

    const parts = await pool.query(
      'SELECT * FROM fare_split_participants WHERE split_id = $1', [split.rows[0].id]
    );
    res.json({ split: split.rows[0], participants: parts.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const markSplitParticipantPaid = async (req, res) => {
  try {
    const { participantId } = req.params;
    const { payment_method } = req.body;
    const result = await pool.query(
      `UPDATE fare_split_participants SET paid = true, paid_at = NOW(), payment_method = $1
       WHERE id = $2 RETURNING *`,
      [payment_method || 'cash', participantId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Participant not found' });

    // Check if all paid → update split status
    const splitId = result.rows[0].split_id;
    const counts = await pool.query(
      `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE paid = true) as paid_count
       FROM fare_split_participants WHERE split_id = $1`,
      [splitId]
    );
    const { total, paid_count } = counts.rows[0];
    const newStatus = parseInt(paid_count) === parseInt(total) ? 'paid' : 'partially_paid';
    await pool.query('UPDATE fare_splits SET status = $1 WHERE id = $2', [newStatus, splitId]);

    res.json({ participant: result.rows[0], split_status: newStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── DRIVER EARNINGS DASHBOARD ─────────────────────────────────────────────────
const getDriverEarnings = async (req, res) => {
  try {
    const driverUserId = req.headers['x-user-id'];
    const { period = 'week' } = req.query; // 'today' | 'week' | 'month' | 'year'

    const driverResult = await pool.query('SELECT id FROM drivers WHERE user_id = $1', [driverUserId]);
    if (!driverResult.rows[0]) return res.status(404).json({ error: 'Driver not found' });
    const driverId = driverResult.rows[0].id;

    const intervals = { today: '1 day', week: '7 days', month: '30 days', year: '365 days' };
    const interval = intervals[period] || '7 days';

    // Earnings over time (grouped by day)
    const dailyResult = await pool.query(
      `SELECT
         DATE(completed_at) as date,
         COUNT(*)::int as rides,
         COALESCE(SUM(final_fare), 0)::int as gross,
         COALESCE(SUM(tip_amount), 0)::int as tips,
         COALESCE(SUM(final_fare - COALESCE(service_fee,0)), 0)::int as net
       FROM rides
       WHERE driver_id = $1
         AND status = 'completed'
         AND completed_at >= NOW() - INTERVAL '${interval}'
       GROUP BY DATE(completed_at)
       ORDER BY date ASC`,
      [driverId]
    );

    // Totals
    const totalsResult = await pool.query(
      `SELECT
         COUNT(*)::int as total_rides,
         COALESCE(SUM(final_fare), 0)::int as total_gross,
         COALESCE(SUM(tip_amount), 0)::int as total_tips,
         COALESCE(SUM(final_fare - COALESCE(service_fee,0)), 0)::int as total_net,
         ROUND(AVG(final_fare))::int as avg_fare
       FROM rides
       WHERE driver_id = $1 AND status = 'completed'
         AND completed_at >= NOW() - INTERVAL '${interval}'`,
      [driverId]
    );

    // Peak hours (rides by hour of day)
    const peakResult = await pool.query(
      `SELECT
         EXTRACT(HOUR FROM completed_at)::int as hour,
         COUNT(*)::int as rides,
         COALESCE(SUM(final_fare - COALESCE(service_fee,0)), 0)::int as earnings
       FROM rides
       WHERE driver_id = $1 AND status = 'completed'
         AND completed_at >= NOW() - INTERVAL '30 days'
       GROUP BY EXTRACT(HOUR FROM completed_at)
       ORDER BY hour ASC`,
      [driverId]
    );

    // Today quick stats
    const todayResult = await pool.query(
      `SELECT
         COUNT(*)::int as rides_today,
         COALESCE(SUM(final_fare - COALESCE(service_fee,0)), 0)::int as earned_today,
         COALESCE(SUM(tip_amount), 0)::int as tips_today
       FROM rides
       WHERE driver_id = $1 AND status = 'completed'
         AND DATE(completed_at) = CURRENT_DATE`,
      [driverId]
    );

    // All-time totals from drivers table
    const driverStats = await pool.query(
      `SELECT total_earnings, acceptance_rate, total_bonuses_earned, current_streak
       FROM drivers WHERE id = $1`,
      [driverId]
    );

    res.json({
      period,
      daily: dailyResult.rows,
      totals: totalsResult.rows[0],
      peak_hours: peakResult.rows,
      today: todayResult.rows[0],
      all_time: driverStats.rows[0],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── RENTAL RIDES ──────────────────────────────────────────────────────────────
const getRentalPackages = async (req, res) => {
  res.json({ packages: RENTAL_PACKAGES, extra_km_rate: RENTAL_EXTRA_KM_RATE });
};

// ── DECLINE RIDE (driver declines / ignores) — updates acceptance rate ────────
// AR tiers: < 50% → 48h suspension, < 70% → warning notification
const declineRide = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const driverUserId = req.headers['x-user-id'];

    const driverResult = await pool.query('SELECT id FROM drivers WHERE user_id = $1', [driverUserId]);
    if (!driverResult.rows[0]) return res.status(403).json({ error: 'Not a driver' });
    const driverId = driverResult.rows[0].id;

    // Recalculate AR: offered += 1, accepted stays same
    const updated = await pool.query(
      `UPDATE drivers SET
         total_offers_received = total_offers_received + 1,
         acceptance_rate = CASE
           WHEN (total_offers_received + 1) > 0
           THEN ROUND((total_offers_accepted::DECIMAL / (total_offers_received + 1)) * 100, 2)
           ELSE 100
         END
       WHERE id = $1
       RETURNING acceptance_rate, total_offers_received, ar_warning_sent_at, ar_suspended_until`,
      [driverId]
    );

    const ar = parseFloat(updated.rows[0]?.acceptance_rate || 100);
    const offered = updated.rows[0]?.total_offers_received || 0;

    // Only enforce after at least 10 offers (avoid penalizing new drivers)
    if (offered >= 10) {
      if (ar < 50 && !updated.rows[0]?.ar_suspended_until) {
        // Suspend for 48 hours
        const until = new Date(Date.now() + 48 * 60 * 60 * 1000);
        await pool.query(
          `UPDATE drivers SET ar_suspended_until = $1, is_online = false WHERE id = $2`,
          [until, driverId]
        );
        // Notify driver
        await pool.query(
          `INSERT INTO notifications (user_id, type, title, body, data)
           SELECT user_id, 'ar_suspended', 'Account Suspended', $1, $2 FROM drivers WHERE id = $3`,
          [
            `Your acceptance rate (${ar.toFixed(0)}%) is too low. Your account is suspended for 48 hours. Accept more rides to stay active.`,
            JSON.stringify({ acceptance_rate: ar, suspended_until: until }),
            driverId,
          ]
        );
      } else if (ar < 70 && ar >= 50) {
        // Warn once per day
        const lastWarn = updated.rows[0]?.ar_warning_sent_at;
        const hoursSinceWarn = lastWarn ? (Date.now() - new Date(lastWarn).getTime()) / 3600000 : 999;
        if (hoursSinceWarn > 24) {
          await pool.query('UPDATE drivers SET ar_warning_sent_at = NOW() WHERE id = $1', [driverId]);
          await pool.query(
            `INSERT INTO notifications (user_id, type, title, body, data)
             SELECT user_id, 'ar_warning', 'Low Acceptance Rate', $1, $2 FROM drivers WHERE id = $3`,
            [
              `Your acceptance rate is ${ar.toFixed(0)}%. Drivers below 50% are suspended. Accept more rides to stay active and unlock bonuses.`,
              JSON.stringify({ acceptance_rate: ar }),
              driverId,
            ]
          );
        }
      }
    }

    res.json({ success: true, acceptance_rate: ar });
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
  createConciergeBooking, getConciergeBookings,
  // New features
  createFareSplit, getFareSplit, markSplitParticipantPaid,
  getDriverEarnings,
  getRentalPackages,
  getCancellationFeePreview,
  declineRide,
};

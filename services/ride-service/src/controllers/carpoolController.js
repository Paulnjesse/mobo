/**
 * Carpool / Pool Ride Matching Controller
 *
 * Flow:
 *  1. Rider requests a pool ride (POST /rides/pool/request)
 *  2. System searches for existing pool groups going in the same direction
 *     - pickup within PICKUP_RADIUS_M metres of the group's pickup area
 *     - dropoff within DROPOFF_RADIUS_M metres of the group's dropoff area
 *     - group is still "forming" and has available seats
 *  3. If a match is found → join the group; group fare is split between riders
 *  4. If no match found → create a new pool group and wait up to WAIT_SECS seconds
 *  5. Once MAX_RIDERS slots are filled (or WAIT_SECS elapsed) the group is dispatched
 *     to a nearby available driver exactly like a regular ride
 *
 * Pool fare discount: 30% off the individual standard fare
 */

const logger = require('../utils/logger');

'use strict';

const { v4: uuidv4 }  = require('uuid');
const pool            = require('../config/database');

const PICKUP_RADIUS_M  = 1000;  // 1 km pickup matching radius
const DROPOFF_RADIUS_M = 2000;  // 2 km dropoff matching radius
const MAX_RIDERS       = 4;     // max riders per pool group
const POOL_DISCOUNT    = 0.30;  // 30% cheaper than solo fare
const WAIT_SECONDS     = 120;   // 2-min window to fill seats before dispatch

// ── Haversine helper ──────────────────────────────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180)
    * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Calculate individual pool fare ───────────────────────────────────────────
function poolFare(distanceKm, durationMin, riderCount = 1, surgeMultiplier = 1.0) {
  const BASE    = 1000;
  const PER_KM  = 700;
  const PER_MIN = 100;
  const raw     = BASE + PER_KM * distanceKm + PER_MIN * durationMin;
  const surged  = raw * surgeMultiplier;
  const perRider = Math.round((surged / Math.max(riderCount, 1)) * (1 - POOL_DISCOUNT));
  const serviceFee = Math.round(perRider * 0.20);
  return { perRider, serviceFee, total: perRider + serviceFee };
}

/**
 * POST /rides/pool/request
 * Body: {
 *   pickup_location:  { lat, lng }
 *   pickup_address:   string
 *   dropoff_location: { lat, lng }
 *   dropoff_address:  string
 *   ride_type?:       'standard' (pool is always standard class)
 *   payment_method?:  'cash' | 'mtn_mobile_money' | 'orange_money' | 'wallet'
 * }
 */
const requestPoolRide = async (req, res) => {
  try {
    const riderId = req.headers['x-user-id'];
    const {
      pickup_location,
      pickup_address,
      dropoff_location,
      dropoff_address,
      payment_method = 'cash',
    } = req.body;

    if (!pickup_location?.lat || !pickup_location?.lng || !dropoff_location?.lat || !dropoff_location?.lng) {
      return res.status(400).json({ error: 'pickup_location and dropoff_location (lat/lng) are required' });
    }

    const pickLat  = parseFloat(pickup_location.lat);
    const pickLng  = parseFloat(pickup_location.lng);
    const dropLat  = parseFloat(dropoff_location.lat);
    const dropLng  = parseFloat(dropoff_location.lng);

    // Distance & duration estimate
    const distanceKm = haversineKm(pickLat, pickLng, dropLat, dropLng);
    const durationMin = Math.round(distanceKm * 3);

    // Surge check
    const surgeResult = await pool.query(
      `SELECT multiplier FROM surge_zones
       WHERE ST_Within(ST_SetSRID(ST_MakePoint($1, $2), 4326), zone) AND is_active = true
       AND (starts_at IS NULL OR starts_at <= NOW())
       AND (ends_at IS NULL OR ends_at >= NOW())
       ORDER BY multiplier DESC LIMIT 1`,
      [pickLng, pickLat]
    ).catch(() => ({ rows: [] }));
    const surgeMultiplier = surgeResult.rows[0]?.multiplier || 1.0;

    // ── 1. Search for matching pool groups ───────────────────────────────────
    const matchResult = await pool.query(
      `SELECT pg.*,
              ST_X(pg.pickup_area::geometry)  AS pickup_lng,
              ST_Y(pg.pickup_area::geometry)  AS pickup_lat,
              ST_X(pg.dropoff_area::geometry) AS dropoff_lng,
              ST_Y(pg.dropoff_area::geometry) AS dropoff_lat
       FROM pool_ride_groups pg
       WHERE pg.status = 'forming'
         AND pg.current_riders < pg.max_riders
         AND ST_DWithin(
               pg.pickup_area,
               ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
               $3
             )
         AND ST_DWithin(
               pg.dropoff_area,
               ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography,
               $6
             )
         AND pg.created_at >= NOW() - INTERVAL '2 minutes'
       ORDER BY
         ST_Distance(pg.pickup_area, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) ASC
       LIMIT 1`,
      [pickLng, pickLat, PICKUP_RADIUS_M, dropLng, dropLat, DROPOFF_RADIUS_M]
    );

    let groupId;
    let isNewGroup = false;

    if (matchResult.rows.length > 0) {
      // ── 2a. Join existing group ──────────────────────────────────────────
      groupId = matchResult.rows[0].id;
      await pool.query(
        `UPDATE pool_ride_groups SET current_riders = current_riders + 1 WHERE id = $1`,
        [groupId]
      );
    } else {
      // ── 2b. Create a new group ───────────────────────────────────────────
      isNewGroup = true;
      const newGroup = await pool.query(
        `INSERT INTO pool_ride_groups
           (pickup_area, dropoff_area, pickup_radius_m, dropoff_radius_m, max_riders, current_riders, status)
         VALUES (
           ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
           ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography,
           $5, $6, $7, 1, 'forming'
         )
         RETURNING id`,
        [pickLng, pickLat, dropLng, dropLat, PICKUP_RADIUS_M, DROPOFF_RADIUS_M, MAX_RIDERS]
      );
      groupId = newGroup.rows[0].id;
    }

    // Get current rider count for fare calc
    const groupRow = await pool.query(
      'SELECT current_riders FROM pool_ride_groups WHERE id = $1',
      [groupId]
    );
    const riderCount = groupRow.rows[0]?.current_riders || 1;

    const fareCalc = poolFare(distanceKm, durationMin, riderCount, surgeMultiplier);

    // ── 3. Create the ride record linked to the pool group ───────────────────
    const rideResult = await pool.query(
      `INSERT INTO rides (
         rider_id, ride_type, status,
         pickup_address, pickup_location,
         dropoff_address, dropoff_location,
         estimated_fare, base_fare, service_fee, booking_fee,
         payment_method, is_pool, pool_group_id, pool_fare,
         distance_km, duration_minutes
       ) VALUES (
         $1, 'standard', 'requested',
         $2, ST_SetSRID(ST_MakePoint($3, $4), 4326),
         $5, ST_SetSRID(ST_MakePoint($6, $7), 4326),
         $8, $9, $10, 500,
         $11, true, $12, $13,
         $14, $15
       ) RETURNING *`,
      [
        riderId,
        pickup_address,  pickLng, pickLat,
        dropoff_address, dropLng, dropLat,
        fareCalc.total, fareCalc.perRider, fareCalc.serviceFee,
        payment_method,
        groupId,
        fareCalc.perRider,
        parseFloat(distanceKm.toFixed(2)),
        durationMin,
      ]
    );

    const ride = rideResult.rows[0];

    // ── 4. If group is now full, mark it active and trigger dispatch ─────────
    const updatedGroup = await pool.query(
      'SELECT current_riders, max_riders FROM pool_ride_groups WHERE id = $1',
      [groupId]
    );
    const grp = updatedGroup.rows[0];
    let groupStatus = 'forming';

    if (grp && grp.current_riders >= grp.max_riders) {
      await pool.query(
        `UPDATE pool_ride_groups SET status = 'active' WHERE id = $1`,
        [groupId]
      );
      groupStatus = 'active';
    }

    return res.status(201).json({
      ride,
      pool: {
        group_id:       groupId,
        status:         groupStatus,
        is_new_group:   isNewGroup,
        current_riders: riderCount,
        max_riders:     MAX_RIDERS,
        wait_seconds:   groupStatus === 'forming' ? WAIT_SECONDS : 0,
        message:        groupStatus === 'active'
          ? `Pool is full (${riderCount} riders). Matching driver now.`
          : isNewGroup
          ? `Pool created! Waiting up to ${WAIT_SECONDS}s for more riders.`
          : `Joined a pool with ${riderCount} rider${riderCount !== 1 ? 's' : ''}. Waiting for more.`,
      },
      fare: {
        per_rider:    fareCalc.perRider,
        service_fee:  fareCalc.serviceFee,
        total:        fareCalc.total,
        solo_fare:    Math.round((1000 + 700 * distanceKm + 100 * durationMin) * surgeMultiplier),
        savings:      Math.round((1000 + 700 * distanceKm + 100 * durationMin) * surgeMultiplier * POOL_DISCOUNT),
        discount_pct: Math.round(POOL_DISCOUNT * 100),
        currency:     'XAF',
      },
    });
  } catch (err) {
    logger.error('[CarpoolController] requestPoolRide:', err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /rides/pool/groups/:groupId
 * Returns current group state — useful for polling while "forming".
 */
const getPoolGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId      = req.headers['x-user-id'];

    const groupResult = await pool.query(
      `SELECT pg.*,
              ST_X(pg.pickup_area::geometry)  AS pickup_lng,
              ST_Y(pg.pickup_area::geometry)  AS pickup_lat,
              ST_X(pg.dropoff_area::geometry) AS dropoff_lng,
              ST_Y(pg.dropoff_area::geometry) AS dropoff_lat
       FROM pool_ride_groups pg WHERE pg.id = $1`,
      [groupId]
    );

    if (!groupResult.rows[0]) {
      return res.status(404).json({ error: 'Pool group not found' });
    }

    // Get all rides in this group (without exposing other riders' private info)
    const ridesResult = await pool.query(
      `SELECT r.id, r.status, r.pickup_address, r.dropoff_address,
              r.estimated_fare, r.rider_id = $2 AS is_mine
       FROM rides r
       WHERE r.pool_group_id = $1`,
      [groupId, userId]
    );

    const grp = groupResult.rows[0];
    res.json({
      group: {
        id:             grp.id,
        status:         grp.status,
        current_riders: grp.current_riders,
        max_riders:     grp.max_riders,
        seats_available: grp.max_riders - grp.current_riders,
        created_at:     grp.created_at,
      },
      rides: ridesResult.rows,
    });
  } catch (err) {
    logger.error('[CarpoolController] getPoolGroup:', err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /rides/pool/groups/:groupId/dispatch
 * Admin / system call: dispatch this pool group to an available driver.
 * In production this is triggered by a job (scheduledRideJob or a pool-dispatch cron).
 */
const dispatchPoolGroup = async (req, res) => {
  try {
    const { groupId } = req.params;

    // Fetch a ride from the group to get pickup location for driver matching
    const rideRow = await pool.query(
      `SELECT r.*,
              ST_X(r.pickup_location::geometry) AS pickup_lng,
              ST_Y(r.pickup_location::geometry) AS pickup_lat
       FROM rides r
       WHERE r.pool_group_id = $1 AND r.status = 'requested'
       LIMIT 1`,
      [groupId]
    );

    if (!rideRow.rows[0]) {
      return res.status(404).json({ error: 'No pending rides in this pool group' });
    }

    const sampleRide = rideRow.rows[0];

    // Find nearest available driver
    const driverResult = await pool.query(
      `SELECT d.id AS driver_id, d.user_id,
              ST_Distance(d.current_location::geography,
                ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance_m
       FROM drivers d
       JOIN users u ON u.id = d.user_id
       WHERE d.is_online = true
         AND d.is_approved = true
         AND d.current_location IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM rides r2 WHERE r2.driver_id = d.id AND r2.status IN ('accepted','arriving','in_progress'))
       ORDER BY distance_m ASC
       LIMIT 1`,
      [sampleRide.pickup_lng, sampleRide.pickup_lat]
    );

    if (!driverResult.rows[0]) {
      return res.json({ dispatched: false, message: 'No available drivers nearby. Will retry.' });
    }

    const driver = driverResult.rows[0];
    const { randomInt } = require('crypto');
    const otp = randomInt(1000, 10000).toString();

    // Assign driver to ALL rides in the group
    await pool.query(
      `UPDATE rides SET driver_id = $1, status = 'accepted', pickup_otp = $2,
       accepted_at = NOW(), updated_at = NOW()
       WHERE pool_group_id = $3 AND status = 'requested'`,
      [driver.driver_id, otp, groupId]
    );

    await pool.query(
      `UPDATE pool_ride_groups SET status = 'active', driver_id = $1 WHERE id = $2`,
      [driver.driver_id, groupId]
    );

    return res.json({
      dispatched:  true,
      driver_id:   driver.driver_id,
      distance_m:  Math.round(driver.distance_m),
      message:     'Pool group dispatched to driver',
    });
  } catch (err) {
    logger.error('[CarpoolController] dispatchPoolGroup:', err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /rides/pool/estimate
 * Returns estimated pool fare for a given route (no ride created).
 * Query: pickup_lat, pickup_lng, dropoff_lat, dropoff_lng
 */
const estimatePoolFare = async (req, res) => {
  try {
    const { pickup_lat, pickup_lng, dropoff_lat, dropoff_lng } = req.query;

    if (!pickup_lat || !pickup_lng || !dropoff_lat || !dropoff_lng) {
      return res.status(400).json({ error: 'pickup_lat, pickup_lng, dropoff_lat, dropoff_lng required' });
    }

    const distanceKm = haversineKm(
      parseFloat(pickup_lat), parseFloat(pickup_lng),
      parseFloat(dropoff_lat), parseFloat(dropoff_lng)
    );
    const durationMin = Math.round(distanceKm * 3);

    const fare1 = poolFare(distanceKm, durationMin, 1, 1.0);
    const fare2 = poolFare(distanceKm, durationMin, 2, 1.0);
    const fare4 = poolFare(distanceKm, durationMin, 4, 1.0);
    const solo  = Math.round(1000 + 700 * distanceKm + 100 * durationMin);

    res.json({
      distance_km:    parseFloat(distanceKm.toFixed(2)),
      duration_min:   durationMin,
      currency:       'XAF',
      solo_fare:      solo,
      pool_fare_1:    fare1.total,
      pool_fare_2:    fare2.total,
      pool_fare_4:    fare4.total,
      max_savings:    solo - fare4.total,
      discount_pct:   Math.round(POOL_DISCOUNT * 100),
    });
  } catch (err) {
    logger.error('[CarpoolController] estimatePoolFare:', err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = { requestPoolRide, getPoolGroup, dispatchPoolGroup, estimatePoolFare };

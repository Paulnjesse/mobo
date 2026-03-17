const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const db = require('../config/database');

// ============================================================
// CONSTANTS — CFA Franc pricing
// ============================================================
const FARE_CONFIG = {
  base_fare: 1000,        // XAF
  per_km: 700,            // XAF per km
  per_minute: 100,        // XAF per minute
  booking_fee: 500,       // XAF flat fee
  service_fee_rate: 0.20, // 20% of subtotal
  cancellation_fee: 350,  // XAF
  min_fare: 2000          // XAF minimum
};

const RIDE_TYPE_MULTIPLIERS = {
  standard: 1.0,
  shared: 0.75,
  comfort: 1.3,
  luxury: 2.0,
  bike: 0.6,
  scooter: 0.65,
  delivery: 1.1,
  scheduled: 1.05
};

// Average city speed (km/h) — used when Google Maps unavailable
const AVG_SPEED_KMH = 25;

// ============================================================
// GOOGLE MAPS CLIENT (graceful — only if key present)
// ============================================================
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || null;

function hasMapsKey() {
  return (
    !!GOOGLE_MAPS_API_KEY &&
    GOOGLE_MAPS_API_KEY !== 'AIzaxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' &&
    GOOGLE_MAPS_API_KEY.startsWith('AIza')
  );
}

/**
 * Get route data from Google Maps Directions API.
 * Returns { distance_km, duration_minutes, polyline, steps } or null on failure.
 */
async function getGoogleMapsRoute(originLat, originLng, destLat, destLng) {
  if (!hasMapsKey()) return null;

  try {
    const { Client } = require('@googlemaps/google-maps-services-js');
    const mapsClient = new Client({});

    const response = await mapsClient.directions({
      params: {
        origin: `${originLat},${originLng}`,
        destination: `${destLat},${destLng}`,
        mode: 'driving',
        key: GOOGLE_MAPS_API_KEY
      },
      timeout: 8000
    });

    const data = response.data;
    if (!data || data.status !== 'OK' || !data.routes || data.routes.length === 0) {
      console.warn('[RideService Maps] Directions API status:', data?.status);
      return null;
    }

    const route = data.routes[0];
    const leg = route.legs[0];

    return {
      distance_km: Math.round((leg.distance.value / 1000) * 100) / 100,
      duration_minutes: Math.round(leg.duration.value / 60),
      polyline: route.overview_polyline?.points || null,
      steps: (leg.steps || []).map((s) => ({
        instruction: (s.html_instructions || '').replace(/<[^>]+>/g, ''),
        distance_m: s.distance.value,
        duration_s: s.duration.value
      })),
      source: 'google_maps'
    };
  } catch (err) {
    console.error('[RideService Maps] getGoogleMapsRoute error:', err.message);
    return null;
  }
}

/**
 * Haversine formula — distance between two lat/lng points in km
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate fare breakdown
 */
function calculateFare(distanceKm, durationMinutes, rideType, surgeMultiplier, subscriptionPlan) {
  const typeMultiplier = RIDE_TYPE_MULTIPLIERS[rideType] || 1.0;

  const subtotal =
    FARE_CONFIG.base_fare +
    FARE_CONFIG.per_km * distanceKm +
    FARE_CONFIG.per_minute * durationMinutes;

  const subtotalWithType = Math.round(subtotal * typeMultiplier);
  const surgedSubtotal = Math.round(subtotalWithType * surgeMultiplier);

  let service_fee = Math.round(surgedSubtotal * FARE_CONFIG.service_fee_rate);
  let discount_amount = 0;

  if (subscriptionPlan === 'basic') {
    discount_amount = Math.round(surgedSubtotal * 0.10);
  } else if (subscriptionPlan === 'premium') {
    discount_amount = Math.round(surgedSubtotal * 0.20);
  }

  const total_before_fees = surgedSubtotal - discount_amount + service_fee + FARE_CONFIG.booking_fee;
  const total = Math.max(total_before_fees, FARE_CONFIG.min_fare);

  return {
    base_fare: FARE_CONFIG.base_fare,
    distance_fare: Math.round(FARE_CONFIG.per_km * distanceKm),
    duration_fare: Math.round(FARE_CONFIG.per_minute * durationMinutes),
    type_multiplier: typeMultiplier,
    subtotal: subtotalWithType,
    surge_multiplier: surgeMultiplier,
    surge_active: surgeMultiplier > 1.0,
    discount_amount,
    subscription_plan: subscriptionPlan || 'none',
    service_fee,
    booking_fee: FARE_CONFIG.booking_fee,
    total,
    currency: 'XAF'
  };
}

/**
 * Check surge zone using PostGIS
 */
async function checkSurgeZone(lng, lat) {
  try {
    const result = await db.query(
      `SELECT id, name, multiplier FROM surge_zones
       WHERE is_active = true
         AND ST_Within(ST_SetSRID(ST_Point($1, $2), 4326), zone)
         AND (starts_at IS NULL OR starts_at <= NOW())
         AND (ends_at IS NULL OR ends_at >= NOW())
       ORDER BY multiplier DESC
       LIMIT 1`,
      [lng, lat]
    );

    if (result.rows.length > 0) {
      return result.rows[0];
    }

    // Peak hour surge (7-9am and 5-8pm local)
    const hour = new Date().getUTCHours() + 1; // approximate WAT/EAT
    const isPeakHour = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 20);
    if (isPeakHour) {
      return { multiplier: 1.5, name: 'Peak hours', id: null };
    }

    return null;
  } catch (err) {
    console.error('[CheckSurgeZone Error]', err);
    return null;
  }
}

/**
 * Generate 4-digit OTP for ride pickup verification
 */
function generatePickupOtp() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// ============================================================
// CONTROLLER FUNCTIONS
// ============================================================

/**
 * POST /rides/request
 * Requests a new ride.
 * Uses Google Maps for real distance/duration/polyline when key is available;
 * falls back to Haversine otherwise.
 */
const requestRide = async (req, res) => {
  try {
    const riderId = req.user.id;
    const {
      pickup_address,
      pickup_lat,
      pickup_lng,
      dropoff_address,
      dropoff_lat,
      dropoff_lng,
      ride_type = 'standard',
      payment_method = 'cash',
      scheduled_at,
      notes,
      promo_code
    } = req.body;

    if (!pickup_address || !pickup_lat || !pickup_lng ||
        !dropoff_address || !dropoff_lat || !dropoff_lng) {
      return res.status(400).json({
        success: false,
        message: 'Pickup and dropoff addresses and coordinates are required'
      });
    }

    const pLat = parseFloat(pickup_lat);
    const pLng = parseFloat(pickup_lng);
    const dLat = parseFloat(dropoff_lat);
    const dLng = parseFloat(dropoff_lng);

    if (isNaN(pLat) || isNaN(pLng) || isNaN(dLat) || isNaN(dLng)) {
      return res.status(400).json({ success: false, message: 'Invalid coordinates' });
    }

    const validRideTypes = ['standard', 'comfort', 'luxury', 'shared', 'bike', 'scooter', 'delivery', 'scheduled'];
    if (!validRideTypes.includes(ride_type)) {
      return res.status(400).json({ success: false, message: 'Invalid ride type' });
    }

    const validPaymentMethods = ['cash', 'card', 'mobile_money', 'wallet', 'points'];
    if (!validPaymentMethods.includes(payment_method)) {
      return res.status(400).json({ success: false, message: 'Invalid payment method' });
    }

    // Check if rider already has an active ride
    const activeRideCheck = await db.query(
      `SELECT id FROM rides
       WHERE rider_id = $1
         AND status NOT IN ('completed', 'cancelled')`,
      [riderId]
    );

    if (activeRideCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'You already have an active ride',
        active_ride_id: activeRideCheck.rows[0].id
      });
    }

    // Get rider subscription for discount
    const riderResult = await db.query(
      'SELECT subscription_plan, loyalty_points FROM users WHERE id = $1',
      [riderId]
    );
    const rider = riderResult.rows[0];
    const subscriptionPlan = rider ? rider.subscription_plan : 'none';

    // ---------------------------------------------------------------------------
    // Distance & duration — Google Maps preferred, Haversine fallback
    // ---------------------------------------------------------------------------
    let distanceKm;
    let durationMinutes;
    let routePolyline = null;
    let routeSource = 'haversine';

    const googleRoute = await getGoogleMapsRoute(pLat, pLng, dLat, dLng);

    if (googleRoute) {
      distanceKm = googleRoute.distance_km;
      durationMinutes = googleRoute.duration_minutes;
      routePolyline = googleRoute.polyline;
      routeSource = 'google_maps';
    } else {
      distanceKm = haversineDistance(pLat, pLng, dLat, dLng);
      durationMinutes = Math.round((distanceKm / AVG_SPEED_KMH) * 60);
    }

    // Check surge pricing
    const surgeZone = await checkSurgeZone(pLng, pLat);
    const surgeMultiplier = surgeZone ? parseFloat(surgeZone.multiplier) : 1.0;
    const surgeActive = surgeMultiplier > 1.0;

    // Calculate fare using real distance
    const fareBreakdown = calculateFare(
      distanceKm,
      durationMinutes,
      ride_type,
      surgeMultiplier,
      subscriptionPlan
    );

    // Apply promo code if provided
    let promoDiscount = 0;
    let promoCodeData = null;
    if (promo_code) {
      const promoResult = await db.query(
        `SELECT * FROM promo_codes
         WHERE code = $1 AND is_active = true
           AND (expires_at IS NULL OR expires_at > NOW())
           AND used_count < max_uses
           AND min_fare <= $2`,
        [promo_code.toUpperCase(), fareBreakdown.total]
      );

      if (promoResult.rows.length > 0) {
        promoCodeData = promoResult.rows[0];
        if (promoCodeData.discount_type === 'percent') {
          promoDiscount = Math.round(fareBreakdown.total * promoCodeData.discount_value / 100);
        } else {
          promoDiscount = promoCodeData.discount_value;
        }
        fareBreakdown.promo_code = promo_code.toUpperCase();
        fareBreakdown.promo_discount = promoDiscount;
        fareBreakdown.total = Math.max(fareBreakdown.total - promoDiscount, FARE_CONFIG.min_fare);

        await db.query(
          'UPDATE promo_codes SET used_count = used_count + 1 WHERE id = $1',
          [promoCodeData.id]
        );
      }
    }

    // Delivery refusal logic
    const isDelivery = ride_type === 'delivery';
    const currentHour = new Date().getHours();
    const deliveryRefusedAvailable = isDelivery && currentHour >= 17;

    // Scheduled ride logic
    const isScheduled = ride_type === 'scheduled' || !!scheduled_at;

    // Find or create shared ride group
    let sharedRideGroupId = null;
    if (ride_type === 'shared') {
      const existingGroup = await db.query(
        `SELECT id FROM shared_ride_groups
         WHERE status = 'open' AND current_passengers < max_passengers
         ORDER BY created_at ASC
         LIMIT 1`
      );

      if (existingGroup.rows.length > 0) {
        sharedRideGroupId = existingGroup.rows[0].id;
        await db.query(
          'UPDATE shared_ride_groups SET current_passengers = current_passengers + 1 WHERE id = $1',
          [sharedRideGroupId]
        );
      } else {
        const newGroup = await db.query(
          `INSERT INTO shared_ride_groups (max_passengers, current_passengers)
           VALUES (3, 1) RETURNING id`
        );
        sharedRideGroupId = newGroup.rows[0].id;
      }
    }

    const rideId = uuidv4();
    const pickupOtp = generatePickupOtp();

    const rideResult = await db.query(
      `INSERT INTO rides (
        id, rider_id, ride_type, status,
        pickup_address, pickup_location,
        dropoff_address, dropoff_location,
        distance_km, duration_minutes,
        base_fare, per_km_fare, per_minute_fare,
        surge_multiplier, surge_active,
        estimated_fare, service_fee, booking_fee,
        payment_method,
        is_shared, shared_ride_group_id,
        is_scheduled, scheduled_at,
        is_delivery, delivery_refused,
        pickup_otp, notes,
        route_polyline
      ) VALUES (
        $1, $2, $3, 'searching',
        $4, ST_SetSRID(ST_Point($5, $6), 4326),
        $7, ST_SetSRID(ST_Point($8, $9), 4326),
        $10, $11,
        $12, $13, $14,
        $15, $16,
        $17, $18, $19,
        $20,
        $21, $22,
        $23, $24,
        $25, $26,
        $27, $28,
        $29
      ) RETURNING
        id, rider_id, ride_type, status,
        pickup_address, dropoff_address,
        distance_km, duration_minutes,
        estimated_fare, service_fee, booking_fee,
        surge_multiplier, surge_active,
        payment_method, is_scheduled, scheduled_at,
        is_delivery, delivery_refused,
        pickup_otp, route_polyline, created_at`,
      [
        rideId, riderId, ride_type,
        pickup_address, pLng, pLat,
        dropoff_address, dLng, dLat,
        Math.round(distanceKm * 100) / 100, durationMinutes,
        FARE_CONFIG.base_fare, FARE_CONFIG.per_km, FARE_CONFIG.per_minute,
        surgeMultiplier, surgeActive,
        fareBreakdown.total, fareBreakdown.service_fee, FARE_CONFIG.booking_fee,
        payment_method,
        ride_type === 'shared', sharedRideGroupId,
        isScheduled, scheduled_at || null,
        isDelivery, false,
        pickupOtp, notes || null,
        routePolyline
      ]
    );

    const ride = rideResult.rows[0];

    res.status(201).json({
      success: true,
      message: 'Ride requested successfully. Searching for a driver...',
      data: {
        ride,
        fare_breakdown: fareBreakdown,
        surge_info: surgeZone
          ? { active: true, zone: surgeZone.name, multiplier: surgeMultiplier }
          : { active: false },
        delivery_refused_available: deliveryRefusedAvailable,
        pickup_otp: pickupOtp,
        route_polyline: routePolyline,
        route_source: routeSource,
        estimated_arrival_minutes: Math.round(3 + Math.random() * 7) // 3-10 min driver ETA
      }
    });
  } catch (err) {
    console.error('[RequestRide Error]', err);
    res.status(500).json({ success: false, message: 'Failed to request ride' });
  }
};

/**
 * GET /fare/estimate
 * Returns fare estimates for all ride types.
 * Uses Google Maps distance when key available; falls back to Haversine.
 * Returns route_polyline when Google Maps is used.
 */
const getFare = async (req, res) => {
  try {
    const {
      pickup_lat, pickup_lng,
      dropoff_lat, dropoff_lng,
      ride_type = 'standard'
    } = req.query;

    if (!pickup_lat || !pickup_lng || !dropoff_lat || !dropoff_lng) {
      return res.status(400).json({
        success: false,
        message: 'pickup_lat, pickup_lng, dropoff_lat, dropoff_lng are required'
      });
    }

    const pLat = parseFloat(pickup_lat);
    const pLng = parseFloat(pickup_lng);
    const dLat = parseFloat(dropoff_lat);
    const dLng = parseFloat(dropoff_lng);

    // ---------------------------------------------------------------------------
    // Distance — Google Maps preferred, Haversine fallback
    // ---------------------------------------------------------------------------
    let distanceKm;
    let durationMinutes;
    let routePolyline = null;
    let routeSource = 'haversine';

    const googleRoute = await getGoogleMapsRoute(pLat, pLng, dLat, dLng);

    if (googleRoute) {
      distanceKm = googleRoute.distance_km;
      durationMinutes = googleRoute.duration_minutes;
      routePolyline = googleRoute.polyline;
      routeSource = 'google_maps';
    } else {
      distanceKm = haversineDistance(pLat, pLng, dLat, dLng);
      durationMinutes = Math.round((distanceKm / AVG_SPEED_KMH) * 60);
    }

    const surgeZone = await checkSurgeZone(pLng, pLat);
    const surgeMultiplier = surgeZone ? parseFloat(surgeZone.multiplier) : 1.0;

    // Get subscription if authenticated
    let subscriptionPlan = 'none';
    if (req.user) {
      const riderResult = await db.query(
        'SELECT subscription_plan FROM users WHERE id = $1',
        [req.user.id]
      );
      if (riderResult.rows.length > 0) {
        subscriptionPlan = riderResult.rows[0].subscription_plan;
      }
    }

    // Calculate all ride types for comparison
    const estimates = {};
    const rideTypes = ['standard', 'shared', 'comfort', 'luxury', 'bike', 'scooter'];

    for (const type of rideTypes) {
      estimates[type] = calculateFare(distanceKm, durationMinutes, type, surgeMultiplier, subscriptionPlan);
    }

    const requestedFare = calculateFare(distanceKm, durationMinutes, ride_type, surgeMultiplier, subscriptionPlan);

    res.json({
      success: true,
      data: {
        distance_km: Math.round(distanceKm * 100) / 100,
        duration_minutes: durationMinutes,
        ride_type,
        fare: requestedFare,
        all_ride_types: estimates,
        surge_active: surgeMultiplier > 1.0,
        surge_multiplier: surgeMultiplier,
        surge_zone: surgeZone ? surgeZone.name : null,
        route_polyline: routePolyline,
        route_source: routeSource
      }
    });
  } catch (err) {
    console.error('[GetFare Error]', err);
    res.status(500).json({ success: false, message: 'Failed to calculate fare' });
  }
};

/**
 * PATCH /rides/:id/accept
 * Driver accepts a ride
 */
const acceptRide = async (req, res) => {
  try {
    const driverId = req.user.id;
    const { id: rideId } = req.params;

    const driverResult = await db.query(
      'SELECT id, is_approved, is_online, vehicle_id FROM drivers WHERE user_id = $1',
      [driverId]
    );

    if (driverResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Driver profile not found' });
    }

    const driver = driverResult.rows[0];

    if (!driver.is_approved) {
      return res.status(403).json({ success: false, message: 'Driver not approved yet' });
    }

    if (!driver.is_online) {
      return res.status(400).json({ success: false, message: 'Driver must be online to accept rides' });
    }

    const activeRideCheck = await db.query(
      `SELECT id FROM rides WHERE driver_id = $1 AND status NOT IN ('completed','cancelled')`,
      [driver.id]
    );

    if (activeRideCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'You already have an active ride',
        active_ride_id: activeRideCheck.rows[0].id
      });
    }

    const result = await db.query(
      `UPDATE rides
       SET status = 'accepted', driver_id = $1, vehicle_id = $2
       WHERE id = $3 AND status = 'searching'
       RETURNING *`,
      [driver.id, driver.vehicle_id, rideId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found or already accepted by another driver'
      });
    }

    const ride = result.rows[0];

    await db.query(
      `INSERT INTO notifications (user_id, title, message, type, data)
       VALUES ($1, $2, $3, 'ride_accepted', $4)`,
      [
        ride.rider_id,
        'Driver on the way!',
        'Your driver has accepted your ride and is heading to you.',
        JSON.stringify({ ride_id: rideId, driver_id: driver.id })
      ]
    );

    res.json({
      success: true,
      message: 'Ride accepted',
      data: { ride }
    });
  } catch (err) {
    console.error('[AcceptRide Error]', err);
    res.status(500).json({ success: false, message: 'Failed to accept ride' });
  }
};

/**
 * PATCH /rides/:id/status
 * Update ride status: arriving → in_progress → completed
 */
const updateRideStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: rideId } = req.params;
    const { status, pickup_otp } = req.body;

    const validStatuses = ['arriving', 'in_progress', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const rideResult = await db.query(
      `SELECT r.*, d.user_id AS driver_user_id
       FROM rides r
       LEFT JOIN drivers d ON r.driver_id = d.id
       WHERE r.id = $1`,
      [rideId]
    );

    if (rideResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }

    const ride = rideResult.rows[0];

    if (ride.driver_user_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized for this ride' });
    }

    const statusTransitions = {
      'accepted': ['arriving'],
      'arriving': ['in_progress'],
      'in_progress': ['completed']
    };

    if (!statusTransitions[ride.status] || !statusTransitions[ride.status].includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot transition from '${ride.status}' to '${status}'`
      });
    }

    if (status === 'in_progress') {
      if (!pickup_otp) {
        return res.status(400).json({ success: false, message: 'Pickup OTP is required to start ride' });
      }
      if (pickup_otp !== ride.pickup_otp) {
        return res.status(400).json({ success: false, message: 'Invalid pickup OTP' });
      }
    }

    let updateQuery;
    let updateParams;
    let finalFare = null;
    let loyaltyPointsEarned = 0;

    if (status === 'completed') {
      finalFare = ride.estimated_fare || 0;
      loyaltyPointsEarned = Math.floor(finalFare / 100);

      updateQuery = `
        UPDATE rides SET
          status = 'completed',
          final_fare = $1,
          completed_at = NOW()
        WHERE id = $2
        RETURNING *`;
      updateParams = [finalFare, rideId];
    } else if (status === 'in_progress') {
      updateQuery = `
        UPDATE rides SET status = 'in_progress', started_at = NOW()
        WHERE id = $1
        RETURNING *`;
      updateParams = [rideId];
    } else {
      updateQuery = `UPDATE rides SET status = $1 WHERE id = $2 RETURNING *`;
      updateParams = [status, rideId];
    }

    const result = await db.query(updateQuery, updateParams);
    const updatedRide = result.rows[0];

    if (status === 'completed') {
      if (loyaltyPointsEarned > 0) {
        await db.query(
          'UPDATE users SET loyalty_points = loyalty_points + $1, total_rides = total_rides + 1 WHERE id = $2',
          [loyaltyPointsEarned, ride.rider_id]
        );

        await db.query(
          `INSERT INTO loyalty_transactions (user_id, points, action, ride_id, description)
           VALUES ($1, $2, 'ride_completed', $3, $4)`,
          [ride.rider_id, loyaltyPointsEarned, rideId, `Earned ${loyaltyPointsEarned} points for ride`]
        );
      }

      if (ride.driver_id) {
        const driverEarnings = Math.round(finalFare * 0.80);
        await db.query(
          'UPDATE drivers SET total_earnings = total_earnings + $1 WHERE id = $2',
          [driverEarnings, ride.driver_id]
        );
        await db.query(
          'UPDATE users SET total_rides = total_rides + 1 WHERE id = (SELECT user_id FROM drivers WHERE id = $1)',
          [ride.driver_id]
        );
      }

      await db.query(
        `INSERT INTO notifications (user_id, title, message, type, data)
         VALUES ($1, $2, $3, 'ride_completed', $4)`,
        [
          ride.rider_id,
          'Ride Completed!',
          `You have arrived at your destination. Final fare: ${finalFare.toLocaleString()} XAF. You earned ${loyaltyPointsEarned} loyalty points!`,
          JSON.stringify({ ride_id: rideId, final_fare: finalFare, points_earned: loyaltyPointsEarned })
        ]
      );
    }

    res.json({
      success: true,
      message: `Ride status updated to '${status}'`,
      data: {
        ride: updatedRide,
        ...(status === 'completed' && {
          final_fare: finalFare,
          loyalty_points_earned: loyaltyPointsEarned
        })
      }
    });
  } catch (err) {
    console.error('[UpdateRideStatus Error]', err);
    res.status(500).json({ success: false, message: 'Failed to update ride status' });
  }
};

/**
 * POST /rides/:id/cancel
 */
const cancelRide = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: rideId } = req.params;
    const { reason } = req.body;

    const rideResult = await db.query(
      `SELECT r.*, d.user_id AS driver_user_id
       FROM rides r
       LEFT JOIN drivers d ON r.driver_id = d.id
       WHERE r.id = $1`,
      [rideId]
    );

    if (rideResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }

    const ride = rideResult.rows[0];

    const cancellableStatuses = ['requested', 'searching', 'accepted', 'arriving'];
    if (!cancellableStatuses.includes(ride.status)) {
      return res.status(400).json({
        success: false,
        message: 'Ride cannot be cancelled at this stage'
      });
    }

    let cancelledBy;
    if (ride.rider_id === userId) {
      cancelledBy = 'rider';
    } else if (ride.driver_user_id === userId) {
      cancelledBy = 'driver';
    } else if (req.user.role === 'admin') {
      cancelledBy = 'system';
    } else {
      return res.status(403).json({ success: false, message: 'Not authorized to cancel this ride' });
    }

    let cancellationFee = 0;
    const driverAlreadyAccepted = ['accepted', 'arriving'].includes(ride.status);

    if (cancelledBy === 'rider' && driverAlreadyAccepted) {
      cancellationFee = FARE_CONFIG.cancellation_fee;
    }

    const currentHour = new Date().getHours();
    if (cancelledBy === 'driver' && ride.is_delivery && currentHour >= 17) {
      cancellationFee = 0;
      await db.query('UPDATE rides SET delivery_refused = true WHERE id = $1', [rideId]);
    }

    await db.query(
      `UPDATE rides SET
        status = 'cancelled',
        cancelled_at = NOW(),
        cancelled_by = $1,
        cancellation_reason = $2,
        cancellation_fee = $3
       WHERE id = $4`,
      [cancelledBy, reason || null, cancellationFee, rideId]
    );

    if (cancelledBy === 'driver' && ride.driver_id) {
      await db.query(
        `UPDATE drivers
         SET cancellation_rate = LEAST(cancellation_rate + 0.5, 100)
         WHERE id = $1`,
        [ride.driver_id]
      );
    }

    const notifyUserId = cancelledBy === 'rider' ? ride.driver_user_id : ride.rider_id;
    if (notifyUserId) {
      const message = cancelledBy === 'rider'
        ? 'The rider has cancelled this ride.'
        : 'Your driver has cancelled. We will find you a new driver.';

      await db.query(
        `INSERT INTO notifications (user_id, title, message, type, data)
         VALUES ($1, 'Ride Cancelled', $2, 'ride_cancelled', $3)`,
        [notifyUserId, message, JSON.stringify({ ride_id: rideId })]
      );
    }

    res.json({
      success: true,
      message: 'Ride cancelled',
      data: {
        ride_id: rideId,
        cancelled_by: cancelledBy,
        cancellation_fee: cancellationFee,
        currency: 'XAF'
      }
    });
  } catch (err) {
    console.error('[CancelRide Error]', err);
    res.status(500).json({ success: false, message: 'Failed to cancel ride' });
  }
};

/**
 * GET /rides/:id
 */
const getRide = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: rideId } = req.params;

    const result = await db.query(
      `SELECT
        r.*,
        ST_AsGeoJSON(r.pickup_location) AS pickup_geojson,
        ST_AsGeoJSON(r.dropoff_location) AS dropoff_geojson,
        u_rider.full_name AS rider_name,
        u_rider.phone AS rider_phone,
        u_rider.rating AS rider_rating,
        u_driver.full_name AS driver_name,
        u_driver.phone AS driver_phone,
        u_driver.rating AS driver_rating,
        v.make, v.model, v.color, v.plate, v.vehicle_type,
        ST_AsGeoJSON(d.current_location) AS driver_location_geojson
       FROM rides r
       LEFT JOIN users u_rider ON r.rider_id = u_rider.id
       LEFT JOIN drivers d ON r.driver_id = d.id
       LEFT JOIN users u_driver ON d.user_id = u_driver.id
       LEFT JOIN vehicles v ON r.vehicle_id = v.id
       WHERE r.id = $1`,
      [rideId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }

    const ride = result.rows[0];

    const isRider = ride.rider_id === userId;
    const isDriver = req.user.role === 'driver';
    const isAdmin = req.user.role === 'admin';

    if (!isRider && !isDriver && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this ride' });
    }

    res.json({ success: true, data: { ride } });
  } catch (err) {
    console.error('[GetRide Error]', err);
    res.status(500).json({ success: false, message: 'Failed to get ride' });
  }
};

/**
 * GET /rides
 */
const listRides = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 20, offset = 0, status } = req.query;

    let whereClause = 'WHERE r.rider_id = $1';
    const params = [userId];

    if (req.user.role === 'driver') {
      const driverResult = await db.query('SELECT id FROM drivers WHERE user_id = $1', [userId]);
      if (driverResult.rows.length > 0) {
        whereClause = 'WHERE r.driver_id = $1';
        params[0] = driverResult.rows[0].id;
      }
    }

    if (status) {
      params.push(status);
      whereClause += ` AND r.status = $${params.length}`;
    }

    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(
      `SELECT
        r.id, r.ride_type, r.status,
        r.pickup_address, r.dropoff_address,
        r.distance_km, r.duration_minutes,
        r.estimated_fare, r.final_fare,
        r.payment_method, r.payment_status,
        r.surge_active, r.surge_multiplier,
        r.tip_amount, r.created_at, r.completed_at,
        u_driver.full_name AS driver_name,
        v.make, v.model, v.vehicle_type
       FROM rides r
       LEFT JOIN drivers d ON r.driver_id = d.id
       LEFT JOIN users u_driver ON d.user_id = u_driver.id
       LEFT JOIN vehicles v ON r.vehicle_id = v.id
       ${whereClause}
       ORDER BY r.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countParams = params.slice(0, params.length - 2);
    const countResult = await db.query(
      `SELECT COUNT(*) FROM rides r ${whereClause}`,
      countParams
    );

    res.json({
      success: true,
      data: {
        rides: result.rows,
        total: parseInt(countResult.rows[0].count),
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (err) {
    console.error('[ListRides Error]', err);
    res.status(500).json({ success: false, message: 'Failed to list rides' });
  }
};

/**
 * POST /rides/:id/rate
 */
const rateRide = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: rideId } = req.params;
    const { rating, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
    }

    const rideResult = await db.query(
      `SELECT r.*, d.user_id AS driver_user_id
       FROM rides r
       LEFT JOIN drivers d ON r.driver_id = d.id
       WHERE r.id = $1 AND r.status = 'completed'`,
      [rideId]
    );

    if (rideResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Completed ride not found' });
    }

    const ride = rideResult.rows[0];
    const isRider = ride.rider_id === userId;
    const isDriver = ride.driver_user_id === userId;

    if (!isRider && !isDriver) {
      return res.status(403).json({ success: false, message: 'Not authorized to rate this ride' });
    }

    const ratedId = isRider ? ride.driver_user_id : ride.rider_id;

    if (!ratedId) {
      return res.status(400).json({ success: false, message: 'Cannot rate — no counterpart found' });
    }

    await db.query(
      `INSERT INTO ride_ratings (ride_id, rater_id, rated_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (ride_id, rater_id) DO UPDATE SET rating = $4, comment = $5`,
      [rideId, userId, ratedId, parseInt(rating), comment || null]
    );

    const avgResult = await db.query(
      'SELECT AVG(rating) FROM ride_ratings WHERE rated_id = $1',
      [ratedId]
    );

    const newAvgRating = parseFloat(avgResult.rows[0].avg).toFixed(2);
    await db.query('UPDATE users SET rating = $1 WHERE id = $2', [newAvgRating, ratedId]);

    res.json({
      success: true,
      message: 'Rating submitted. Thank you for your feedback!',
      data: { rating: parseInt(rating), new_avg_rating: newAvgRating }
    });
  } catch (err) {
    console.error('[RateRide Error]', err);
    res.status(500).json({ success: false, message: 'Failed to submit rating' });
  }
};

/**
 * POST /rides/:id/tip
 */
const addTip = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: rideId } = req.params;
    const { amount } = req.body;

    if (!amount || amount < 100) {
      return res.status(400).json({ success: false, message: 'Minimum tip amount is 100 XAF' });
    }

    const rideResult = await db.query(
      'SELECT * FROM rides WHERE id = $1 AND rider_id = $2 AND status = $3',
      [rideId, userId, 'completed']
    );

    if (rideResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Completed ride not found' });
    }

    await db.query(
      'UPDATE rides SET tip_amount = tip_amount + $1 WHERE id = $2',
      [parseInt(amount), rideId]
    );

    res.json({
      success: true,
      message: `Tip of ${amount.toLocaleString()} XAF added. Your driver will appreciate it!`,
      data: { tip_amount: parseInt(amount) }
    });
  } catch (err) {
    console.error('[AddTip Error]', err);
    res.status(500).json({ success: false, message: 'Failed to add tip' });
  }
};

/**
 * POST /rides/:id/round-up
 * Round up fare — difference goes to loyalty wallet
 */
const roundUpFare = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: rideId } = req.params;

    const rideResult = await db.query(
      'SELECT * FROM rides WHERE id = $1 AND rider_id = $2 AND status = $3',
      [rideId, userId, 'completed']
    );

    if (rideResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Completed ride not found' });
    }

    const ride = rideResult.rows[0];
    const fare = ride.final_fare || ride.estimated_fare || 0;

    if (ride.round_up_amount > 0) {
      return res.status(400).json({ success: false, message: 'Round-up already applied' });
    }

    const roundedUp = Math.ceil(fare / 500) * 500;
    const roundUpAmount = roundedUp - fare;

    if (roundUpAmount === 0) {
      return res.json({ success: true, message: 'Fare is already a round number', data: { round_up_amount: 0 } });
    }

    await db.query(
      'UPDATE rides SET round_up_amount = $1 WHERE id = $2',
      [roundUpAmount, rideId]
    );

    const pointsEarned = Math.floor(roundUpAmount / 10);
    await db.query(
      'UPDATE users SET loyalty_points = loyalty_points + $1, wallet_balance = wallet_balance + $2 WHERE id = $3',
      [pointsEarned, roundUpAmount, userId]
    );

    await db.query(
      `INSERT INTO loyalty_transactions (user_id, points, action, ride_id, description)
       VALUES ($1, $2, 'round_up', $3, $4)`,
      [userId, pointsEarned, rideId, `Round-up of ${roundUpAmount} XAF credited to wallet`]
    );

    res.json({
      success: true,
      message: `${roundUpAmount} XAF rounded up and added to your MOBO wallet!`,
      data: { round_up_amount: roundUpAmount, points_earned: pointsEarned }
    });
  } catch (err) {
    console.error('[RoundUpFare Error]', err);
    res.status(500).json({ success: false, message: 'Failed to process round-up' });
  }
};

/**
 * GET /fare/surge
 */
const getSurgePricing = async (req, res) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ success: false, message: 'lat and lng are required' });
    }

    const surgeZone = await checkSurgeZone(parseFloat(lng), parseFloat(lat));

    if (surgeZone) {
      res.json({
        success: true,
        data: {
          surge_active: true,
          multiplier: surgeZone.multiplier,
          zone_name: surgeZone.name,
          message: `Surge pricing is active in this area (${surgeZone.multiplier}x). Try again in a few minutes.`
        }
      });
    } else {
      res.json({
        success: true,
        data: {
          surge_active: false,
          multiplier: 1.0,
          message: 'No surge pricing in this area'
        }
      });
    }
  } catch (err) {
    console.error('[GetSurgePricing Error]', err);
    res.status(500).json({ success: false, message: 'Failed to check surge pricing' });
  }
};

/**
 * GET /rides/drivers/nearby
 */
const getNearbyDrivers = async (req, res) => {
  try {
    const { lat, lng, radius = 5000, ride_type } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ success: false, message: 'lat and lng are required' });
    }

    const locationServiceUrl = process.env.LOCATION_SERVICE_URL || 'http://location-service:3004';

    try {
      const response = await axios.get(`${locationServiceUrl}/drivers/nearby`, {
        params: { lat, lng, radius, ride_type },
        headers: { Authorization: req.headers.authorization },
        timeout: 5000
      });

      return res.json(response.data);
    } catch (locationErr) {
      console.error('[GetNearbyDrivers] Location service error:', locationErr.message);

      const result = await db.query(
        `SELECT d.id, u.full_name, u.rating,
                v.make, v.model, v.vehicle_type, v.color, v.plate,
                ST_Distance(
                  d.current_location::geography,
                  ST_SetSRID(ST_Point($1, $2), 4326)::geography
                ) / 1000 AS distance_km,
                ST_AsGeoJSON(d.current_location) AS location_geojson
         FROM drivers d
         JOIN users u ON d.user_id = u.id
         JOIN vehicles v ON d.vehicle_id = v.id
         WHERE d.is_online = true AND d.is_approved = true
           AND d.current_location IS NOT NULL
           AND ST_DWithin(
             d.current_location::geography,
             ST_SetSRID(ST_Point($1, $2), 4326)::geography,
             $3
           )
         ORDER BY distance_km ASC
         LIMIT 20`,
        [parseFloat(lng), parseFloat(lat), parseFloat(radius)]
      );

      return res.json({
        success: true,
        data: { drivers: result.rows, count: result.rows.length }
      });
    }
  } catch (err) {
    console.error('[GetNearbyDrivers Error]', err);
    res.status(500).json({ success: false, message: 'Failed to get nearby drivers' });
  }
};

module.exports = {
  requestRide,
  getFare,
  acceptRide,
  updateRideStatus,
  cancelRide,
  getRide,
  listRides,
  rateRide,
  addTip,
  roundUpFare,
  getSurgePricing,
  getNearbyDrivers
};

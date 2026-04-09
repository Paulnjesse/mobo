'use strict';
const { fareWithLocalCurrency, getCurrencyCode, COUNTRY_CURRENCY } = require('../../../shared/currencyUtil');

/**
 * deliveryController — Full multi-type delivery feature for MOBO.
 *
 * Supported delivery types:
 *   parcel    — general packages (default)
 *   document  — letters, contracts, official documents (20% discount)
 *   grocery   — fresh food / supermarket items
 *   pharmacy  — medicine, medical supplies
 *   laundry   — clothes / laundry
 *   ecommerce — marketplace / online shopping parcels
 *   b2b       — business-to-business bulk shipments
 *
 * Extra features vs. old controller:
 *   • delivery_type with type-specific pricing adjustments
 *   • is_express (50% surcharge, ~33% faster ETA)
 *   • tracking_token — public share link, no auth required
 *   • Package insurance (1% of declared value, min 200 XAF)
 *   • rateDelivery — sender rates driver after delivery
 *   • getDeliveryByToken — public tracking endpoint
 *   • getDriverDeliveryHistory — driver stats dashboard
 *   • createBatchDelivery — B2B multi-drop up to 10 stops
 *   • getBatchDelivery — batch status with all child deliveries
 *   • All console.* replaced with Winston logger
 */

const crypto  = require('crypto');
const db      = require('../config/database');
const logger  = require('../utils/logger');

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const VALID_DELIVERY_TYPES  = ['parcel', 'document', 'grocery', 'pharmacy', 'laundry', 'ecommerce', 'b2b'];
const VALID_PACKAGE_SIZES   = ['envelope', 'small', 'medium', 'large', 'extra_large'];
const VALID_PAYMENT_METHODS = ['cash', 'card', 'mobile_money', 'wallet'];
const VALID_STATUSES        = ['driver_arriving', 'picked_up', 'in_transit', 'delivered', 'failed'];
const CANCELLABLE_STATUSES  = ['pending', 'driver_assigned', 'driver_arriving'];

/** Type-specific fare discounts (percent off total fare). */
const TYPE_DISCOUNTS = { document: 20 };

/** Insurance fee: 1% of declared value, minimum 200 XAF. */
function calcInsuranceFee(declaredValue) {
  if (!declaredValue || declaredValue <= 0) return 0;
  return Math.max(200, Math.round(declaredValue * 0.01));
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Haversine distance in kilometres between two lat/lng points. */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R    = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Resolve pricing row from DB; falls back to sensible defaults. */
async function resolvePricing(city, packageSize) {
  const result = await db.query(
    `SELECT base_fare, per_km_rate, fragile_surcharge, min_fare, express_multiplier
       FROM delivery_pricing
      WHERE city = $1 AND package_size = $2 AND is_active = true
      LIMIT 1`,
    [city, packageSize]
  );
  if (result.rows.length > 0) {
    const r = result.rows[0];
    return {
      base_fare:          parseFloat(r.base_fare),
      per_km_rate:        parseFloat(r.per_km_rate),
      fragile_surcharge:  parseFloat(r.fragile_surcharge),
      min_fare:           parseFloat(r.min_fare),
      express_multiplier: parseFloat(r.express_multiplier || 1.5),
    };
  }
  return { base_fare: 800, per_km_rate: 200, fragile_surcharge: 100, min_fare: 800, express_multiplier: 1.5 };
}

/**
 * Full fare breakdown.
 * @returns {{ base_fare, distance_charge, fragile_surcharge, type_discount, express_surcharge, subtotal, insurance_fee, total }}
 */
function computeFare(pricing, distanceKm, isFragile, isExpress, deliveryType, insuranceValue) {
  const distanceCharge   = Math.round(distanceKm * pricing.per_km_rate);
  const fragileCharge    = isFragile ? Math.round(pricing.fragile_surcharge) : 0;
  const subtotalRaw      = pricing.base_fare + distanceCharge + fragileCharge;
  const subtotalFloored  = Math.max(subtotalRaw, pricing.min_fare);

  // Type-specific discount (e.g., documents 20% off)
  const discountPct      = TYPE_DISCOUNTS[deliveryType] || 0;
  const typeDiscount     = Math.round(subtotalFloored * discountPct / 100);
  const afterDiscount    = subtotalFloored - typeDiscount;

  // Express surcharge applied after type discount
  const expressSurcharge = isExpress
    ? Math.round(afterDiscount * (pricing.express_multiplier - 1))
    : 0;

  const insuranceFee = calcInsuranceFee(insuranceValue);

  const total = afterDiscount + expressSurcharge + insuranceFee;

  return {
    base_fare:         Math.round(pricing.base_fare),
    distance_charge:   distanceCharge,
    fragile_surcharge: fragileCharge,
    type_discount:     typeDiscount,
    express_surcharge: expressSurcharge,
    insurance_fee:     insuranceFee,
    total,
  };
}

/**
 * Estimated delivery time in minutes.
 * Base: 30 min + 3 min/km. Express: shaves 33% off.
 */
function estimateMins(distanceKm, isExpress) {
  const base = Math.round(30 + distanceKm * 3);
  return isExpress ? Math.round(base * 0.67) : base;
}

/** Generate a cryptographically secure tracking token. */
function generateTrackingToken() {
  return crypto.randomBytes(32).toString('hex');
}

/** Generate a 6-digit OTP. */
function generateOtp() {
  return crypto.randomInt(100000, 999999).toString();
}

/** Insert a notification; never throws. */
async function insertNotification(userId, title, message) {
  try {
    await db.query(
      `INSERT INTO notifications (user_id, title, message, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [userId, title, message]
    );
  } catch (_) { /* fire-and-forget */ }
}

/** Emit a delivery socket event to the delivery room if io is available. */
function emitDeliveryEvent(req, deliveryId, event, payload) {
  try {
    const io = req.app?.get('io');
    if (io) io.of('/deliveries').to(`delivery:${deliveryId}`).emit(event, payload);
  } catch (_) { /* non-critical */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /deliveries/estimate
// ─────────────────────────────────────────────────────────────────────────────
const estimateDeliveryFare = async (req, res) => {
  try {
    const {
      pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
      package_size = 'small',
      delivery_type = 'parcel',
      city = 'Douala',
      insurance_value = 0,
    } = req.query;
    const is_fragile = req.query.is_fragile === 'true' || req.query.is_fragile === '1';
    const is_express = req.query.is_express === 'true' || req.query.is_express === '1';

    if (!pickup_lat || !pickup_lng || !dropoff_lat || !dropoff_lng) {
      return res.status(400).json({ success: false, error: 'pickup_lat, pickup_lng, dropoff_lat, dropoff_lng are required' });
    }
    const [pLat, pLng, dLat, dLng] = [pickup_lat, pickup_lng, dropoff_lat, dropoff_lng].map(Number);
    if ([pLat, pLng, dLat, dLng].some(isNaN)) {
      return res.status(400).json({ success: false, error: 'Coordinates must be valid numbers' });
    }

    const distanceKm  = haversineKm(pLat, pLng, dLat, dLng);
    const pricing     = await resolvePricing(city, package_size);
    const breakdown   = computeFare(pricing, distanceKm, is_fragile, is_express, delivery_type, Number(insurance_value));
    const estMins     = estimateMins(distanceKm, is_express);

    // req.currency is set by currencyMiddleware (runs inside authenticate)
    const countryCode  = req.currency?.country_code || req.query.country_code || 'CM';
    const localFare    = fareWithLocalCurrency(breakdown.total, countryCode);
    const expressPrice = is_express ? null : (() => {
      const ex = computeFare(pricing, distanceKm, is_fragile, true, delivery_type, Number(insurance_value));
      return {
        ...fareWithLocalCurrency(ex.total, countryCode),
        express_surcharge:  ex.express_surcharge,
        estimated_mins:     estimateMins(distanceKm, true),
      };
    })();

    return res.json({
      success:        true,
      fare_estimate:  breakdown.total,
      currency_code:  getCurrencyCode(countryCode),
      local_price:    localFare.local_price,
      distance_km:    Math.round(distanceKm * 1000) / 1000,
      estimated_mins: estMins,
      breakdown,
      express_price:  expressPrice,
    });
  } catch (err) {
    logger.error('[deliveryController] estimateDeliveryFare', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to estimate fare' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /deliveries
// ─────────────────────────────────────────────────────────────────────────────
const createDelivery = async (req, res) => {
  try {
    const senderId = req.user.id || req.user.userId;
    const {
      pickup_address, pickup_lat, pickup_lng,
      dropoff_address, dropoff_lat, dropoff_lng,
      recipient_name, recipient_phone,
      package_description,
      package_size        = 'small',
      delivery_type       = 'parcel',
      package_weight_kg,
      is_fragile          = false,
      is_express          = false,
      requires_signature  = false,
      package_photo_url,
      payment_method      = 'cash',
      sender_note,
      scheduled_at,
      city                = 'Douala',
      insurance_value_xaf = 0,
    } = req.body;

    // Validate required fields
    const missing = [];
    if (!pickup_address)    missing.push('pickup_address');
    if (pickup_lat == null) missing.push('pickup_lat');
    if (pickup_lng == null) missing.push('pickup_lng');
    if (!dropoff_address)   missing.push('dropoff_address');
    if (dropoff_lat == null) missing.push('dropoff_lat');
    if (dropoff_lng == null) missing.push('dropoff_lng');
    if (!recipient_name)    missing.push('recipient_name');
    if (!recipient_phone)   missing.push('recipient_phone');
    if (!package_description) missing.push('package_description');
    if (missing.length) {
      return res.status(400).json({ success: false, error: `Missing required fields: ${missing.join(', ')}` });
    }

    if (!VALID_DELIVERY_TYPES.includes(delivery_type)) {
      return res.status(400).json({ success: false, error: `delivery_type must be one of: ${VALID_DELIVERY_TYPES.join(', ')}` });
    }
    if (!VALID_PACKAGE_SIZES.includes(package_size)) {
      return res.status(400).json({ success: false, error: `package_size must be one of: ${VALID_PACKAGE_SIZES.join(', ')}` });
    }
    if (!VALID_PAYMENT_METHODS.includes(payment_method)) {
      return res.status(400).json({ success: false, error: `payment_method must be one of: ${VALID_PAYMENT_METHODS.join(', ')}` });
    }

    const [pLat, pLng, dLat, dLng] = [pickup_lat, pickup_lng, dropoff_lat, dropoff_lng].map(Number);
    if ([pLat, pLng, dLat, dLng].some(isNaN)) {
      return res.status(400).json({ success: false, error: 'Coordinates must be valid numbers' });
    }

    const distanceKm   = haversineKm(pLat, pLng, dLat, dLng);
    const pricing      = await resolvePricing(city, package_size);
    const breakdown    = computeFare(pricing, distanceKm, !!is_fragile, !!is_express, delivery_type, Number(insurance_value_xaf));
    const estMins      = estimateMins(distanceKm, !!is_express);
    const recipientOtp = generateOtp();
    const trackingToken = generateTrackingToken();
    const estimatedAt  = new Date(Date.now() + estMins * 60 * 1000);

    const result = await db.query(
      `INSERT INTO deliveries (
         sender_id,
         delivery_type, package_description, package_size, package_weight_kg,
         is_fragile, is_express, requires_signature, package_photo_url,
         pickup_address,  pickup_location,
         dropoff_address, dropoff_location,
         distance_km,
         recipient_name, recipient_phone, recipient_otp,
         fare_estimate, currency, payment_method,
         sender_note, scheduled_at,
         estimated_delivery_at, estimated_mins,
         tracking_token, surge_multiplier,
         insurance_value_xaf, insurance_fee_xaf, express_surcharge_xaf,
         status, created_at, updated_at
       ) VALUES (
         $1,
         $2, $3, $4, $5,
         $6, $7, $8, $9,
         $10, ST_SetSRID(ST_MakePoint($11, $12), 4326),
         $13, ST_SetSRID(ST_MakePoint($14, $15), 4326),
         $16,
         $17, $18, $19,
         $20, 'XAF', $21,
         $22, $23,
         $24, $25,
         $26, 1.0,
         $27, $28, $29,
         'pending', NOW(), NOW()
       )
       RETURNING *`,
      [
        senderId,
        delivery_type, package_description, package_size, package_weight_kg || null,
        !!is_fragile, !!is_express, !!requires_signature, package_photo_url || null,
        pickup_address,  pLng, pLat,
        dropoff_address, dLng, dLat,
        Math.round(distanceKm * 1000) / 1000,
        recipient_name, recipient_phone, recipientOtp,
        breakdown.total, payment_method,
        sender_note || null, scheduled_at || null,
        estimatedAt, estMins,
        trackingToken,
        Number(insurance_value_xaf),
        breakdown.insurance_fee,
        breakdown.express_surcharge,
      ]
    );

    const delivery = result.rows[0];

    await insertNotification(senderId, 'Delivery Booked', "Your delivery has been booked. We're finding a driver.");

    return res.status(201).json({
      success: true,
      data: {
        delivery,
        recipient_otp:  recipientOtp,
        tracking_url:   `/deliveries/track/${trackingToken}`,
        tracking_token: trackingToken,
        fare_breakdown: breakdown,
        estimated_mins: estMins,
      },
    });
  } catch (err) {
    logger.error('[deliveryController] createDelivery', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to create delivery' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /deliveries/track/:token  (PUBLIC — no auth required)
// ─────────────────────────────────────────────────────────────────────────────
const getDeliveryByToken = async (req, res) => {
  try {
    const { token } = req.params;
    if (!token || token.length !== 64) {
      return res.status(400).json({ success: false, error: 'Invalid tracking token' });
    }

    const result = await db.query(
      `SELECT
         d.id, d.status, d.delivery_type, d.package_size, d.is_express,
         d.package_description, d.is_fragile,
         d.pickup_address,  ST_Y(d.pickup_location::geometry)  AS pickup_lat,
                            ST_X(d.pickup_location::geometry)  AS pickup_lng,
         d.dropoff_address, ST_Y(d.dropoff_location::geometry) AS dropoff_lat,
                            ST_X(d.dropoff_location::geometry) AS dropoff_lng,
         d.recipient_name, d.estimated_delivery_at, d.estimated_mins,
         d.distance_km, d.fare_estimate, d.currency,
         d.driver_assigned_at, d.picked_up_at, d.delivered_at,
         d.created_at, d.updated_at,
         u_driver.full_name AS driver_name
       FROM deliveries d
       LEFT JOIN drivers drv      ON drv.id = d.driver_id
       LEFT JOIN users   u_driver ON u_driver.id = drv.user_id
       WHERE d.tracking_token = $1`,
      [token]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, error: 'Delivery not found' });
    }

    // Strip sensitive fields (OTP, sender phone, full sender_id) from public response
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('[deliveryController] getDeliveryByToken', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to retrieve delivery' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /deliveries/mine
// ─────────────────────────────────────────────────────────────────────────────
const getMyDeliveries = async (req, res) => {
  try {
    const userId       = req.user.id || req.user.userId;
    const isAdmin      = req.user.role === 'admin';
    const adminMode    = isAdmin && req.query.admin === 'true';
    const statusFilter = req.query.status;
    const typeFilter   = req.query.delivery_type;
    const limit        = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset       = parseInt(req.query.offset) || 0;

    const selectBase = `
      SELECT
        d.*,
        ST_Y(d.pickup_location::geometry)  AS pickup_lat,
        ST_X(d.pickup_location::geometry)  AS pickup_lng,
        ST_Y(d.dropoff_location::geometry) AS dropoff_lat,
        ST_X(d.dropoff_location::geometry) AS dropoff_lng,
        u_sender.full_name  AS sender_name,
        u_sender.phone      AS sender_phone,
        u_driver.full_name  AS driver_name,
        u_driver.phone      AS driver_phone
      FROM deliveries d
      LEFT JOIN users   u_sender ON u_sender.id = d.sender_id
      LEFT JOIN drivers drv      ON drv.id = d.driver_id
      LEFT JOIN users   u_driver ON u_driver.id = drv.user_id
    `;

    const conditions = [];
    const values     = [];
    let   paramIdx   = 1;

    if (!adminMode) {
      conditions.push(`d.sender_id = $${paramIdx++}`);
      values.push(userId);
    }
    if (statusFilter) { conditions.push(`d.status = $${paramIdx++}`); values.push(statusFilter); }
    if (typeFilter)   { conditions.push(`d.delivery_type = $${paramIdx++}`); values.push(typeFilter); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    values.push(limit, offset);

    const queryText = `${selectBase} ${where} ORDER BY d.created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    const result    = await db.query(queryText, values);

    return res.json({ success: true, data: result.rows, count: result.rowCount });
  } catch (err) {
    logger.error('[deliveryController] getMyDeliveries', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to retrieve deliveries' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /deliveries/:id
// ─────────────────────────────────────────────────────────────────────────────
const getDeliveryById = async (req, res) => {
  try {
    const { id }     = req.params;
    const userId     = req.user.id || req.user.userId;
    const userRole   = req.user.role;

    const result = await db.query(
      `SELECT
         d.*,
         ST_Y(d.pickup_location::geometry)  AS pickup_lat,
         ST_X(d.pickup_location::geometry)  AS pickup_lng,
         ST_Y(d.dropoff_location::geometry) AS dropoff_lat,
         ST_X(d.dropoff_location::geometry) AS dropoff_lng,
         u_sender.full_name AS sender_name, u_sender.phone AS sender_phone,
         u_driver.full_name AS driver_name, u_driver.phone AS driver_phone
       FROM deliveries d
       LEFT JOIN users   u_sender ON u_sender.id = d.sender_id
       LEFT JOIN drivers drv      ON drv.id = d.driver_id
       LEFT JOIN users   u_driver ON u_driver.id = drv.user_id
       WHERE d.id = $1`,
      [id]
    );

    if (!result.rows[0]) return res.status(404).json({ success: false, error: 'Delivery not found' });
    const delivery = result.rows[0];

    let isAssignedDriver = false;
    if (userRole === 'driver' && delivery.driver_id) {
      const drvCheck = await db.query(
        'SELECT id FROM drivers WHERE id = $1 AND user_id = $2',
        [delivery.driver_id, userId]
      );
      isAssignedDriver = drvCheck.rowCount > 0;
    }

    if (delivery.sender_id !== userId && !isAssignedDriver && userRole !== 'admin') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    return res.json({ success: true, data: delivery });
  } catch (err) {
    logger.error('[deliveryController] getDeliveryById', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to retrieve delivery' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /deliveries/nearby  (driver only)
// ─────────────────────────────────────────────────────────────────────────────
const getNearbyDeliveries = async (req, res) => {
  try {
    const { lat, lng, radius_km = 5, delivery_type } = req.query;
    if (!lat || !lng) return res.status(400).json({ success: false, error: 'lat and lng are required' });

    const dLat         = parseFloat(lat);
    const dLng         = parseFloat(lng);
    const radiusMeters = parseFloat(radius_km) * 1000;

    if ([dLat, dLng, radiusMeters].some(isNaN)) {
      return res.status(400).json({ success: false, error: 'Invalid coordinate or radius values' });
    }

    const conditions = [`d.status = 'pending'`,
      `ST_DWithin(d.pickup_location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)`];
    const values = [dLng, dLat, radiusMeters];
    if (delivery_type) {
      conditions.push(`d.delivery_type = $${values.length + 1}`);
      values.push(delivery_type);
    }

    const result = await db.query(
      `SELECT
         d.id, d.pickup_address, d.dropoff_address,
         d.package_size, d.delivery_type, d.is_express, d.is_fragile,
         d.fare_estimate, d.currency, d.distance_km, d.sender_note,
         d.estimated_mins, d.created_at,
         ST_Y(d.pickup_location::geometry)  AS pickup_lat,
         ST_X(d.pickup_location::geometry)  AS pickup_lng,
         ST_Y(d.dropoff_location::geometry) AS dropoff_lat,
         ST_X(d.dropoff_location::geometry) AS dropoff_lng,
         ST_Distance(
           d.pickup_location::geography,
           ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
         ) / 1000.0 AS distance_to_pickup_km
       FROM deliveries d
       WHERE ${conditions.join(' AND ')}
       ORDER BY distance_to_pickup_km ASC`,
      values
    );

    return res.json({ success: true, data: result.rows, count: result.rowCount });
  } catch (err) {
    logger.error('[deliveryController] getNearbyDeliveries', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to find nearby deliveries' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /deliveries/:id/accept  (driver only)
// ─────────────────────────────────────────────────────────────────────────────
const acceptDelivery = async (req, res) => {
  try {
    const { id }   = req.params;
    const userId   = req.user.id || req.user.userId;

    if (req.user.role !== 'driver' && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Driver access required' });
    }

    const driverRes = await db.query('SELECT id FROM drivers WHERE user_id = $1', [userId]);
    if (!driverRes.rows[0]) return res.status(403).json({ success: false, error: 'Driver profile not found' });
    const driverId = driverRes.rows[0].id;

    const deliveryRes = await db.query('SELECT * FROM deliveries WHERE id = $1', [id]);
    if (!deliveryRes.rows[0]) return res.status(404).json({ success: false, error: 'Delivery not found' });
    const delivery = deliveryRes.rows[0];

    if (delivery.status !== 'pending') {
      return res.status(409).json({ success: false, error: `Delivery is no longer available (status: ${delivery.status})` });
    }

    const activeCheck = await db.query(
      `SELECT id FROM deliveries
        WHERE driver_id = $1 AND status IN ('driver_assigned','driver_arriving','picked_up','in_transit')
        LIMIT 1`,
      [driverId]
    );
    if (activeCheck.rowCount > 0) {
      return res.status(409).json({ success: false, error: 'Complete your current delivery before accepting a new one.' });
    }

    const updated = await db.query(
      `UPDATE deliveries
          SET status = 'driver_assigned', driver_id = $1, driver_assigned_at = NOW(), updated_at = NOW()
        WHERE id = $2 RETURNING *`,
      [driverId, id]
    );

    const driverName = req.user.full_name || req.user.name || 'Your driver';
    await insertNotification(delivery.sender_id, 'Driver Assigned', `${driverName} is heading to pick up your package.`);
    emitDeliveryEvent(req, id, 'delivery_status_update', { deliveryId: id, status: 'driver_assigned', driverName });

    return res.json({ success: true, data: updated.rows[0] });
  } catch (err) {
    logger.error('[deliveryController] acceptDelivery', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to accept delivery' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /deliveries/:id/status  (driver only)
// ─────────────────────────────────────────────────────────────────────────────
const updateDeliveryStatus = async (req, res) => {
  try {
    const { id }     = req.params;
    const userId     = req.user.id || req.user.userId;
    const { status, pickup_photo_url, delivery_photo_url, failure_reason } = req.body;

    if (req.user.role !== 'driver' && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Driver access required' });
    }
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    const deliveryRes = await db.query('SELECT * FROM deliveries WHERE id = $1', [id]);
    if (!deliveryRes.rows[0]) return res.status(404).json({ success: false, error: 'Delivery not found' });
    const delivery = deliveryRes.rows[0];

    if (req.user.role !== 'admin') {
      const driverRes = await db.query('SELECT id FROM drivers WHERE user_id = $1', [userId]);
      if (!driverRes.rows[0] || driverRes.rows[0].id !== delivery.driver_id) {
        return res.status(403).json({ success: false, error: 'You are not assigned to this delivery' });
      }
    }

    const fields = { status, updated_at: 'NOW()' };
    let validationError = null;

    switch (status) {
      case 'picked_up':
        if (!pickup_photo_url) {
          validationError = 'pickup_photo_url is required when marking as picked_up';
        } else {
          fields.pickup_photo_url = pickup_photo_url;
          fields.picked_up_at    = 'NOW()';
        }
        break;
      case 'delivered':
        if (!delivery_photo_url && !delivery.recipient_otp_verified) {
          validationError = 'Either delivery_photo_url or recipient OTP verification is required';
        } else {
          if (delivery_photo_url) fields.delivery_photo_url = delivery_photo_url;
          fields.delivered_at    = 'NOW()';
          fields.payment_status  = delivery.payment_method === 'cash' ? 'paid' : delivery.payment_status;
          fields.final_fare      = delivery.fare_estimate;
        }
        break;
      case 'failed':
        if (!failure_reason) validationError = 'failure_reason is required';
        else fields.failure_reason = failure_reason;
        break;
      default:
        break;
    }

    if (validationError) return res.status(400).json({ success: false, error: validationError });

    const setClauses = [];
    const values     = [];
    let   idx        = 1;

    for (const [key, val] of Object.entries(fields)) {
      if (val === 'NOW()') { setClauses.push(`${key} = NOW()`); }
      else { setClauses.push(`${key} = $${idx++}`); values.push(val); }
    }
    values.push(id);

    const updated = await db.query(
      `UPDATE deliveries SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    const notifMessages = {
      picked_up:  { title: 'Package Picked Up',  message: 'Your package has been picked up and is on the way.' },
      in_transit: null,
      delivered:  { title: 'Package Delivered',  message: 'Your package has been delivered! Please rate your driver.' },
      failed:     { title: 'Delivery Failed',    message: `Your delivery could not be completed: ${failure_reason || ''}` },
    };
    const notif = notifMessages[status];
    if (notif) await insertNotification(delivery.sender_id, notif.title, notif.message);

    emitDeliveryEvent(req, id, 'delivery_status_update', { deliveryId: id, status, timestamp: Date.now() });

    return res.json({ success: true, data: updated.rows[0] });
  } catch (err) {
    logger.error('[deliveryController] updateDeliveryStatus', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to update delivery status' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /deliveries/:id/verify-otp
// ─────────────────────────────────────────────────────────────────────────────
const verifyRecipientOTP = async (req, res) => {
  try {
    const { id }  = req.params;
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ success: false, error: 'otp is required' });

    const deliveryRes = await db.query(
      'SELECT id, recipient_otp, recipient_otp_verified FROM deliveries WHERE id = $1', [id]
    );
    if (!deliveryRes.rows[0]) return res.status(404).json({ success: false, error: 'Delivery not found' });
    const delivery = deliveryRes.rows[0];

    if (delivery.recipient_otp_verified) return res.json({ success: true, verified: true, message: 'OTP already verified' });

    // Timing-safe comparison
    const provided = Buffer.from(otp.toString().trim().padEnd(6, ' '));
    const stored   = Buffer.from(delivery.recipient_otp.padEnd(6, ' '));
    const match    = provided.length === stored.length && crypto.timingSafeEqual(provided, stored);

    if (!match) return res.status(400).json({ success: false, verified: false, error: 'Invalid OTP' });

    await db.query('UPDATE deliveries SET recipient_otp_verified = true, updated_at = NOW() WHERE id = $1', [id]);
    return res.json({ success: true, verified: true });
  } catch (err) {
    logger.error('[deliveryController] verifyRecipientOTP', { error: err.message });
    return res.status(500).json({ success: false, error: 'OTP verification failed' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /deliveries/:id/cancel
// ─────────────────────────────────────────────────────────────────────────────
const cancelDelivery = async (req, res) => {
  try {
    const { id }    = req.params;
    const userId    = req.user.id || req.user.userId;
    const userRole  = req.user.role;
    const { reason } = req.body;

    const deliveryRes = await db.query('SELECT * FROM deliveries WHERE id = $1', [id]);
    if (!deliveryRes.rows[0]) return res.status(404).json({ success: false, error: 'Delivery not found' });
    const delivery = deliveryRes.rows[0];

    if (delivery.sender_id !== userId && userRole !== 'admin') {
      return res.status(403).json({ success: false, error: 'Only the sender or admin can cancel this delivery' });
    }
    if (!CANCELLABLE_STATUSES.includes(delivery.status)) {
      return res.status(409).json({ success: false, error: `Cannot cancel delivery with status '${delivery.status}'` });
    }

    const updated = await db.query(
      `UPDATE deliveries SET status = 'cancelled', cancellation_reason = $1, updated_at = NOW()
        WHERE id = $2 RETURNING *`,
      [reason || null, id]
    );

    if (delivery.driver_id) {
      const drvRes = await db.query('SELECT user_id FROM drivers WHERE id = $1', [delivery.driver_id]);
      if (drvRes.rows[0]) {
        await insertNotification(drvRes.rows[0].user_id, 'Delivery Cancelled', 'The sender cancelled this delivery.');
      }
    }

    emitDeliveryEvent(req, id, 'delivery_status_update', { deliveryId: id, status: 'cancelled' });

    return res.json({ success: true, data: updated.rows[0] });
  } catch (err) {
    logger.error('[deliveryController] cancelDelivery', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to cancel delivery' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /deliveries/:id/rate  (sender rates driver after delivery)
// ─────────────────────────────────────────────────────────────────────────────
const rateDelivery = async (req, res) => {
  try {
    const { id }     = req.params;
    const senderId   = req.user.id || req.user.userId;
    const { rating, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, error: 'rating must be an integer between 1 and 5' });
    }

    const deliveryRes = await db.query(
      `SELECT d.id, d.sender_id, d.driver_id, d.status,
              drv.user_id AS driver_user_id
         FROM deliveries d
         LEFT JOIN drivers drv ON drv.id = d.driver_id
        WHERE d.id = $1`,
      [id]
    );
    if (!deliveryRes.rows[0]) return res.status(404).json({ success: false, error: 'Delivery not found' });
    const delivery = deliveryRes.rows[0];

    if (delivery.sender_id !== senderId) {
      return res.status(403).json({ success: false, error: 'Only the sender can rate this delivery' });
    }
    if (delivery.status !== 'delivered') {
      return res.status(409).json({ success: false, error: 'Can only rate completed deliveries' });
    }
    if (!delivery.driver_id) {
      return res.status(409).json({ success: false, error: 'No driver assigned to this delivery' });
    }

    // Insert into delivery_ratings (UNIQUE on delivery_id + rater_id prevents duplicates)
    await db.query(
      `INSERT INTO delivery_ratings (delivery_id, rater_id, ratee_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (delivery_id, rater_id) DO UPDATE
         SET rating = EXCLUDED.rating, comment = EXCLUDED.comment`,
      [id, senderId, delivery.driver_user_id, parseInt(rating), comment || null]
    );

    // Also store inline on the delivery row for quick dashboards
    await db.query(
      `UPDATE deliveries
          SET driver_rating = $1, driver_rating_comment = $2, driver_rated_at = NOW(), updated_at = NOW()
        WHERE id = $3`,
      [parseInt(rating), comment || null, id]
    );

    // Update driver's average rating in drivers table
    await db.query(
      `UPDATE drivers
          SET rating = (
            SELECT ROUND(AVG(dr.rating)::numeric, 2)
              FROM delivery_ratings dr
              JOIN deliveries d ON d.id = dr.delivery_id
             WHERE d.driver_id = drivers.id
          )
        WHERE id = $1`,
      [delivery.driver_id]
    );

    return res.json({ success: true, message: 'Rating submitted' });
  } catch (err) {
    logger.error('[deliveryController] rateDelivery', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to submit rating' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /deliveries/driver/history  (driver's own delivery history + stats)
// ─────────────────────────────────────────────────────────────────────────────
const getDriverDeliveryHistory = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    if (req.user.role !== 'driver' && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Driver access required' });
    }

    const driverRes = await db.query('SELECT id FROM drivers WHERE user_id = $1', [userId]);
    if (!driverRes.rows[0]) return res.status(404).json({ success: false, error: 'Driver profile not found' });
    const driverId = driverRes.rows[0].id;

    const limit  = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;

    const [historyRes, statsRes] = await Promise.all([
      db.query(
        `SELECT
           d.id, d.status, d.delivery_type, d.package_size, d.is_express,
           d.pickup_address, d.dropoff_address, d.distance_km,
           d.final_fare, d.fare_estimate, d.currency,
           d.driver_rating, d.driver_rating_comment,
           d.picked_up_at, d.delivered_at, d.created_at
         FROM deliveries d
         WHERE d.driver_id = $1
         ORDER BY d.created_at DESC
         LIMIT $2 OFFSET $3`,
        [driverId, limit, offset]
      ),
      db.query(
        `SELECT
           COUNT(*)                                              AS total_deliveries,
           COUNT(*) FILTER (WHERE status = 'delivered')         AS completed,
           COUNT(*) FILTER (WHERE status = 'cancelled')         AS cancelled,
           COUNT(*) FILTER (WHERE status = 'failed')            AS failed,
           COALESCE(SUM(final_fare) FILTER (WHERE status = 'delivered'), 0) AS total_earnings_xaf,
           COALESCE(SUM(final_fare) FILTER (
             WHERE status = 'delivered' AND delivered_at >= CURRENT_DATE
           ), 0)                                                AS earnings_today_xaf,
           ROUND(AVG(driver_rating) FILTER (WHERE driver_rating IS NOT NULL), 2) AS avg_rating,
           ROUND(AVG(distance_km)   FILTER (WHERE status = 'delivered'), 2)       AS avg_distance_km,
           ROUND(AVG(
             EXTRACT(EPOCH FROM (delivered_at - picked_up_at)) / 60.0
           ) FILTER (WHERE status = 'delivered' AND delivered_at IS NOT NULL), 0) AS avg_delivery_mins
         FROM deliveries
         WHERE driver_id = $1`,
        [driverId]
      ),
    ]);

    return res.json({
      success: true,
      stats:   statsRes.rows[0],
      data:    historyRes.rows,
      count:   historyRes.rowCount,
    });
  } catch (err) {
    logger.error('[deliveryController] getDriverDeliveryHistory', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to retrieve delivery history' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /deliveries/batch  (B2B multi-drop, up to 10 stops)
// ─────────────────────────────────────────────────────────────────────────────
const createBatchDelivery = async (req, res) => {
  try {
    const senderId = req.user.id || req.user.userId;
    const {
      business_name,
      batch_note,
      payment_method = 'cash',
      city           = 'Douala',
      stops,         // array of stop objects
    } = req.body;

    if (!Array.isArray(stops) || stops.length < 2) {
      return res.status(400).json({ success: false, error: 'Batch delivery requires at least 2 stops' });
    }
    if (stops.length > 10) {
      return res.status(400).json({ success: false, error: 'Batch delivery is limited to 10 stops' });
    }

    // Validate each stop
    for (let i = 0; i < stops.length; i++) {
      const s = stops[i];
      const missing = [];
      if (!s.address)          missing.push('address');
      if (s.lat == null)       missing.push('lat');
      if (s.lng == null)       missing.push('lng');
      if (!s.recipient_name)   missing.push('recipient_name');
      if (!s.recipient_phone)  missing.push('recipient_phone');
      if (!s.package_description) missing.push('package_description');
      if (missing.length) {
        return res.status(400).json({ success: false, error: `Stop ${i + 1} missing: ${missing.join(', ')}` });
      }
    }

    // Use first stop's location as pickup for all subsequent stops
    const pickupStop  = stops[0];
    const pLat = parseFloat(pickupStop.lat);
    const pLng = parseFloat(pickupStop.lng);

    // Create the batch record
    const batchRes = await db.query(
      `INSERT INTO delivery_batches (sender_id, business_name, batch_note, stop_count, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'pending', NOW(), NOW()) RETURNING id`,
      [senderId, business_name || null, batch_note || null, stops.length - 1]
    );
    const batchId = batchRes.rows[0].id;

    // Create a delivery for each stop after the first (first is pickup, rest are drop-offs)
    const createdDeliveries = [];
    let   totalFare         = 0;

    for (let i = 1; i < stops.length; i++) {
      const stop      = stops[i];
      const dLat      = parseFloat(stop.lat);
      const dLng      = parseFloat(stop.lng);
      const pkgSize   = stop.package_size   || 'small';
      const delType   = stop.delivery_type  || 'b2b';
      const isFragile = !!stop.is_fragile;
      const insValue  = Number(stop.insurance_value_xaf || 0);

      const distanceKm  = haversineKm(pLat, pLng, dLat, dLng);
      const pricing     = await resolvePricing(city, pkgSize);
      const breakdown   = computeFare(pricing, distanceKm, isFragile, false, delType, insValue);
      const estMins     = estimateMins(distanceKm, false);
      const recipientOtp  = generateOtp();
      const trackingToken = generateTrackingToken();

      const result = await db.query(
        `INSERT INTO deliveries (
           sender_id, batch_id, delivery_type, package_description, package_size,
           is_fragile, requires_signature,
           pickup_address,  pickup_location,
           dropoff_address, dropoff_location,
           distance_km, recipient_name, recipient_phone, recipient_otp,
           fare_estimate, currency, payment_method,
           sender_note, estimated_mins, tracking_token,
           insurance_value_xaf, insurance_fee_xaf,
           status, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7,
           $8,  ST_SetSRID(ST_MakePoint($9, $10),  4326),
           $11, ST_SetSRID(ST_MakePoint($12, $13), 4326),
           $14, $15, $16, $17,
           $18, 'XAF', $19,
           $20, $21, $22,
           $23, $24,
           'pending', NOW(), NOW()
         ) RETURNING id, fare_estimate, tracking_token`,
        [
          senderId, batchId, delType, stop.package_description, pkgSize,
          isFragile, !!stop.requires_signature,
          pickupStop.address, pLng, pLat,
          stop.address, dLng, dLat,
          Math.round(distanceKm * 1000) / 1000,
          stop.recipient_name, stop.recipient_phone, recipientOtp,
          breakdown.total, payment_method,
          stop.note || null, estMins, trackingToken,
          insValue, breakdown.insurance_fee,
        ]
      );

      totalFare += breakdown.total;
      createdDeliveries.push({
        ...result.rows[0],
        recipient_otp:  recipientOtp,
        tracking_token: trackingToken,
        stop_index:     i,
      });
    }

    // Update batch total
    await db.query(
      'UPDATE delivery_batches SET total_fare_xaf = $1, updated_at = NOW() WHERE id = $2',
      [totalFare, batchId]
    );

    await insertNotification(senderId, 'Batch Delivery Created',
      `${stops.length - 1} deliveries created. We're finding a driver.`);

    return res.status(201).json({
      success:    true,
      batch_id:   batchId,
      stop_count: stops.length - 1,
      total_fare_xaf: totalFare,
      currency:   'XAF',
      deliveries: createdDeliveries,
    });
  } catch (err) {
    logger.error('[deliveryController] createBatchDelivery', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to create batch delivery' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /deliveries/batch/:batchId  (sender or assigned driver)
// ─────────────────────────────────────────────────────────────────────────────
const getBatchDelivery = async (req, res) => {
  try {
    const { batchId } = req.params;
    const userId      = req.user.id || req.user.userId;
    const userRole    = req.user.role;

    const batchRes = await db.query(
      `SELECT b.*, u.full_name AS sender_name
         FROM delivery_batches b
         LEFT JOIN users u ON u.id = b.sender_id
        WHERE b.id = $1`,
      [batchId]
    );
    if (!batchRes.rows[0]) return res.status(404).json({ success: false, error: 'Batch not found' });
    const batch = batchRes.rows[0];

    let isAssignedDriver = false;
    if (userRole === 'driver' && batch.driver_id) {
      const drvCheck = await db.query('SELECT id FROM drivers WHERE id = $1 AND user_id = $2', [batch.driver_id, userId]);
      isAssignedDriver = drvCheck.rowCount > 0;
    }

    if (batch.sender_id !== userId && !isAssignedDriver && userRole !== 'admin') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const deliveriesRes = await db.query(
      `SELECT
         d.id, d.status, d.delivery_type, d.package_size,
         d.dropoff_address,
         ST_Y(d.dropoff_location::geometry) AS dropoff_lat,
         ST_X(d.dropoff_location::geometry) AS dropoff_lng,
         d.recipient_name, d.fare_estimate, d.final_fare,
         d.tracking_token, d.driver_rating,
         d.picked_up_at, d.delivered_at
       FROM deliveries d
       WHERE d.batch_id = $1
       ORDER BY d.created_at ASC`,
      [batchId]
    );

    return res.json({
      success:    true,
      batch,
      deliveries: deliveriesRes.rows,
      count:      deliveriesRes.rowCount,
    });
  } catch (err) {
    logger.error('[deliveryController] getBatchDelivery', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to retrieve batch' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /deliveries/stats  (admin only)
// ─────────────────────────────────────────────────────────────────────────────
const getDeliveryStats = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const [overall, byType] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*)                                                          AS total,
          COUNT(*) FILTER (WHERE status = 'pending')                       AS pending,
          COUNT(*) FILTER (WHERE status = 'driver_assigned')               AS driver_assigned,
          COUNT(*) FILTER (WHERE status = 'picked_up')                     AS picked_up,
          COUNT(*) FILTER (WHERE status = 'in_transit')                    AS in_transit,
          COUNT(*) FILTER (WHERE status = 'delivered')                     AS delivered,
          COUNT(*) FILTER (WHERE status = 'cancelled')                     AS cancelled,
          COUNT(*) FILTER (WHERE status = 'failed')                        AS failed,
          COUNT(*) FILTER (WHERE is_express = true)                        AS express_count,
          COALESCE(SUM(final_fare) FILTER (WHERE status = 'delivered'), 0) AS total_revenue_xaf,
          COALESCE(SUM(final_fare) FILTER (WHERE status = 'delivered' AND delivered_at >= CURRENT_DATE), 0) AS revenue_today_xaf,
          COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)               AS today_count,
          ROUND(AVG(driver_rating) FILTER (WHERE driver_rating IS NOT NULL), 2) AS avg_driver_rating,
          ROUND(AVG(EXTRACT(EPOCH FROM (delivered_at - created_at)) / 60.0)
            FILTER (WHERE status = 'delivered' AND delivered_at IS NOT NULL)) AS avg_delivery_time_mins
        FROM deliveries`),
      db.query(`
        SELECT delivery_type,
               COUNT(*) AS count,
               COUNT(*) FILTER (WHERE status = 'delivered')                     AS delivered,
               COALESCE(SUM(final_fare) FILTER (WHERE status = 'delivered'), 0) AS revenue_xaf
          FROM deliveries
         GROUP BY delivery_type
         ORDER BY count DESC`),
    ]);

    return res.json({ success: true, data: { overall: overall.rows[0], by_type: byType.rows } });
  } catch (err) {
    logger.error('[deliveryController] getDeliveryStats', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to retrieve stats' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  estimateDeliveryFare,
  createDelivery,
  getDeliveryByToken,
  getMyDeliveries,
  getDeliveryById,
  getNearbyDeliveries,
  acceptDelivery,
  updateDeliveryStatus,
  verifyRecipientOTP,
  cancelDelivery,
  rateDelivery,
  getDriverDeliveryHistory,
  createBatchDelivery,
  getBatchDelivery,
  getDeliveryStats,
};

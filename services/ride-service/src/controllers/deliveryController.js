const db = require('../config/database');
const crypto = require('crypto');

// ============================================================
// HELPERS
// ============================================================

/**
 * Haversine distance in kilometres between two lat/lng points.
 */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Resolve the fare components for a given city / package_size / fragile flag.
 * Falls back to sensible defaults if no DB pricing row exists.
 */
async function resolvePricing(city, packageSize) {
  const result = await db.query(
    `SELECT base_fare, per_km_rate, fragile_surcharge, min_fare
       FROM delivery_pricing
      WHERE city = $1 AND package_size = $2 AND is_active = true
      LIMIT 1`,
    [city, packageSize]
  );
  if (result.rows.length > 0) {
    const r = result.rows[0];
    return {
      base_fare: parseFloat(r.base_fare),
      per_km_rate: parseFloat(r.per_km_rate),
      fragile_surcharge: parseFloat(r.fragile_surcharge),
      min_fare: parseFloat(r.min_fare),
    };
  }
  // Default fallback (small package, no city match)
  return { base_fare: 800, per_km_rate: 200, fragile_surcharge: 100, min_fare: 800 };
}

/**
 * Calculate a fare given pricing rules, distance, and fragile flag.
 * Returns the breakdown object.
 */
function computeFare(pricing, distanceKm, isFragile) {
  const distanceCharge = distanceKm * pricing.per_km_rate;
  const fragileCharge = isFragile ? pricing.fragile_surcharge : 0;
  const raw = pricing.base_fare + distanceCharge + fragileCharge;
  const total = Math.max(raw, pricing.min_fare);
  return {
    base_fare: Math.round(pricing.base_fare),
    distance_charge: Math.round(distanceCharge),
    fragile_surcharge: Math.round(fragileCharge),
    total: Math.round(total),
  };
}

/**
 * Insert a notification for a user by their user-service user id.
 * Silently swallows errors so it never breaks the main flow.
 */
async function insertNotification(userId, title, message) {
  try {
    await db.query(
      `INSERT INTO notifications (user_id, title, message, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [userId, title, message]
    );
  } catch (_err) {
    // Notification table may differ in schema — never fail the main request.
  }
}

// ============================================================
// CONTROLLERS
// ============================================================

/**
 * GET /deliveries/estimate
 * Query params: pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
 *               package_size, is_fragile, city
 */
const estimateDeliveryFare = async (req, res) => {
  try {
    const {
      pickup_lat,
      pickup_lng,
      dropoff_lat,
      dropoff_lng,
      package_size = 'small',
      city = 'Douala',
    } = req.query;
    const is_fragile = req.query.is_fragile === 'true' || req.query.is_fragile === '1';

    if (!pickup_lat || !pickup_lng || !dropoff_lat || !dropoff_lng) {
      return res.status(400).json({
        success: false,
        error: 'pickup_lat, pickup_lng, dropoff_lat, dropoff_lng are required',
      });
    }

    const pLat = parseFloat(pickup_lat);
    const pLng = parseFloat(pickup_lng);
    const dLat = parseFloat(dropoff_lat);
    const dLng = parseFloat(dropoff_lng);

    if ([pLat, pLng, dLat, dLng].some(isNaN)) {
      return res.status(400).json({ success: false, error: 'Coordinates must be valid numbers' });
    }

    const distanceKm = haversineKm(pLat, pLng, dLat, dLng);
    const pricing = await resolvePricing(city, package_size);
    const breakdown = computeFare(pricing, distanceKm, is_fragile);

    return res.json({
      success: true,
      fare_estimate: breakdown.total,
      distance_km: Math.round(distanceKm * 1000) / 1000,
      currency: 'XAF',
      breakdown,
    });
  } catch (err) {
    console.error('[deliveryController] estimateDeliveryFare:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * POST /deliveries
 * Authenticated sender creates a new delivery.
 */
const createDelivery = async (req, res) => {
  try {
    const senderId = req.user.id || req.user.userId;

    const {
      pickup_address,
      pickup_lat,
      pickup_lng,
      dropoff_address,
      dropoff_lat,
      dropoff_lng,
      recipient_name,
      recipient_phone,
      package_description,
      package_size = 'small',
      package_weight_kg,
      is_fragile = false,
      requires_signature = false,
      package_photo_url,
      payment_method = 'cash',
      sender_note,
      scheduled_at,
      city = 'Douala',
    } = req.body;

    // ── Validation
    const missing = [];
    if (!pickup_address) missing.push('pickup_address');
    if (pickup_lat == null) missing.push('pickup_lat');
    if (pickup_lng == null) missing.push('pickup_lng');
    if (!dropoff_address) missing.push('dropoff_address');
    if (dropoff_lat == null) missing.push('dropoff_lat');
    if (dropoff_lng == null) missing.push('dropoff_lng');
    if (!recipient_name) missing.push('recipient_name');
    if (!recipient_phone) missing.push('recipient_phone');
    if (!package_description) missing.push('package_description');

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missing.join(', ')}`,
      });
    }

    const pLat = parseFloat(pickup_lat);
    const pLng = parseFloat(pickup_lng);
    const dLat = parseFloat(dropoff_lat);
    const dLng = parseFloat(dropoff_lng);

    if ([pLat, pLng, dLat, dLng].some(isNaN)) {
      return res.status(400).json({ success: false, error: 'Coordinates must be valid numbers' });
    }

    // ── Fare calculation
    const distanceKm = haversineKm(pLat, pLng, dLat, dLng);
    const pricing = await resolvePricing(city, package_size);
    const breakdown = computeFare(pricing, distanceKm, !!is_fragile);
    const fareEstimate = breakdown.total;

    // ── OTP for recipient
    const recipientOtp = Math.floor(100000 + Math.random() * 900000).toString();

    // ── Estimated delivery time: now + 30 minutes
    const estimatedDeliveryAt = new Date(Date.now() + 30 * 60 * 1000);

    const result = await db.query(
      `INSERT INTO deliveries (
         sender_id,
         package_description, package_size, package_weight_kg,
         is_fragile, requires_signature, package_photo_url,
         pickup_address,  pickup_location,
         dropoff_address, dropoff_location,
         distance_km,
         recipient_name, recipient_phone, recipient_otp,
         fare_estimate, currency, payment_method,
         sender_note, scheduled_at,
         estimated_delivery_at,
         status, created_at, updated_at
       ) VALUES (
         $1,
         $2, $3, $4,
         $5, $6, $7,
         $8,  ST_SetSRID(ST_MakePoint($9,  $10), 4326),
         $11, ST_SetSRID(ST_MakePoint($12, $13), 4326),
         $14,
         $15, $16, $17,
         $18, 'XAF', $19,
         $20, $21,
         $22,
         'pending', NOW(), NOW()
       )
       RETURNING *`,
      [
        senderId,
        package_description, package_size, package_weight_kg || null,
        !!is_fragile, !!requires_signature, package_photo_url || null,
        pickup_address,  pLng, pLat,
        dropoff_address, dLng, dLat,
        Math.round(distanceKm * 1000) / 1000,
        recipient_name, recipient_phone, recipientOtp,
        fareEstimate, payment_method,
        sender_note || null, scheduled_at || null,
        estimatedDeliveryAt,
      ]
    );

    const delivery = result.rows[0];

    // ── Notify sender
    await insertNotification(
      senderId,
      'Delivery Booked',
      "Your delivery has been booked. We're finding a driver."
    );

    return res.status(201).json({
      success: true,
      data: {
        delivery,
        recipient_otp: recipientOtp, // show to sender so they can share with recipient
        fare_breakdown: breakdown,
      },
    });
  } catch (err) {
    console.error('[deliveryController] createDelivery:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /deliveries/mine   (or /deliveries?admin=true for admins)
 * Returns deliveries for the authenticated sender (or all if admin).
 */
const getMyDeliveries = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const isAdmin = req.user.role === 'admin';
    const adminMode = isAdmin && req.query.admin === 'true';
    const statusFilter = req.query.status;

    let queryText;
    let queryParams;

    const selectBase = `
      SELECT
        d.*,
        ST_X(d.pickup_location::geometry)  AS pickup_lng,
        ST_Y(d.pickup_location::geometry)  AS pickup_lat,
        ST_X(d.dropoff_location::geometry) AS dropoff_lng,
        ST_Y(d.dropoff_location::geometry) AS dropoff_lat,
        u_sender.full_name  AS sender_name,
        u_sender.phone      AS sender_phone,
        u_driver.full_name  AS driver_name,
        u_driver.phone      AS driver_phone
      FROM deliveries d
      LEFT JOIN users    u_sender ON u_sender.id = d.sender_id
      LEFT JOIN drivers  drv      ON drv.id = d.driver_id
      LEFT JOIN users    u_driver ON u_driver.id = drv.user_id
    `;

    if (adminMode) {
      // Admin sees everything
      if (statusFilter) {
        queryText = `${selectBase} WHERE d.status = $1 ORDER BY d.created_at DESC`;
        queryParams = [statusFilter];
      } else {
        queryText = `${selectBase} ORDER BY d.created_at DESC`;
        queryParams = [];
      }
    } else {
      if (statusFilter) {
        queryText = `${selectBase} WHERE d.sender_id = $1 AND d.status = $2 ORDER BY d.created_at DESC`;
        queryParams = [userId, statusFilter];
      } else {
        queryText = `${selectBase} WHERE d.sender_id = $1 ORDER BY d.created_at DESC`;
        queryParams = [userId];
      }
    }

    const result = await db.query(queryText, queryParams);
    return res.json({ success: true, data: result.rows, count: result.rowCount });
  } catch (err) {
    console.error('[deliveryController] getMyDeliveries:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /deliveries/:id
 * Returns full delivery details. Only sender, assigned driver, or admin may access.
 */
const getDeliveryById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user.userId;
    const userRole = req.user.role;

    const result = await db.query(
      `SELECT
         d.*,
         ST_X(d.pickup_location::geometry)  AS pickup_lng,
         ST_Y(d.pickup_location::geometry)  AS pickup_lat,
         ST_X(d.dropoff_location::geometry) AS dropoff_lng,
         ST_Y(d.dropoff_location::geometry) AS dropoff_lat,
         u_sender.full_name  AS sender_name,
         u_sender.phone      AS sender_phone,
         u_driver.full_name  AS driver_name,
         u_driver.phone      AS driver_phone
       FROM deliveries d
       LEFT JOIN users    u_sender ON u_sender.id = d.sender_id
       LEFT JOIN drivers  drv      ON drv.id = d.driver_id
       LEFT JOIN users    u_driver ON u_driver.id = drv.user_id
       WHERE d.id = $1`,
      [id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, error: 'Delivery not found' });
    }

    const delivery = result.rows[0];

    // Determine if the caller is the assigned driver
    let isAssignedDriver = false;
    if (userRole === 'driver' && delivery.driver_id) {
      const drvCheck = await db.query(
        'SELECT id FROM drivers WHERE id = $1 AND user_id = $2',
        [delivery.driver_id, userId]
      );
      isAssignedDriver = drvCheck.rowCount > 0;
    }

    const isSender = delivery.sender_id === userId;
    const isAdmin = userRole === 'admin';

    if (!isSender && !isAssignedDriver && !isAdmin) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    return res.json({ success: true, data: delivery });
  } catch (err) {
    console.error('[deliveryController] getDeliveryById:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /deliveries/nearby
 * Driver only. Query params: lat, lng, radius_km (default 5).
 * Returns pending deliveries within radius.
 */
const getNearbyDeliveries = async (req, res) => {
  try {
    const { lat, lng, radius_km = 5 } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ success: false, error: 'lat and lng are required' });
    }

    const dLat = parseFloat(lat);
    const dLng = parseFloat(lng);
    const radiusMeters = parseFloat(radius_km) * 1000;

    if ([dLat, dLng, radiusMeters].some(isNaN)) {
      return res.status(400).json({ success: false, error: 'Invalid coordinate or radius values' });
    }

    const result = await db.query(
      `SELECT
         d.id,
         d.pickup_address,
         d.dropoff_address,
         d.package_size,
         d.is_fragile,
         d.fare_estimate,
         d.currency,
         d.distance_km,
         d.sender_note,
         d.created_at,
         ST_X(d.pickup_location::geometry)  AS pickup_lng,
         ST_Y(d.pickup_location::geometry)  AS pickup_lat,
         ST_X(d.dropoff_location::geometry) AS dropoff_lng,
         ST_Y(d.dropoff_location::geometry) AS dropoff_lat,
         ST_Distance(
           d.pickup_location::geography,
           ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
         ) / 1000.0 AS distance_to_pickup_km
       FROM deliveries d
       WHERE d.status = 'pending'
         AND ST_DWithin(
           d.pickup_location::geography,
           ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
           $3
         )
       ORDER BY distance_to_pickup_km ASC`,
      [dLng, dLat, radiusMeters]
    );

    return res.json({ success: true, data: result.rows, count: result.rowCount });
  } catch (err) {
    console.error('[deliveryController] getNearbyDeliveries:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * POST /deliveries/:id/accept
 * Driver only. Accepts a pending delivery.
 */
const acceptDelivery = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user.userId;

    if (req.user.role !== 'driver' && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Driver access required' });
    }

    // Resolve driver record
    const driverRes = await db.query('SELECT id, user_id FROM drivers WHERE user_id = $1', [userId]);
    if (!driverRes.rows[0]) {
      return res.status(403).json({ success: false, error: 'Driver profile not found' });
    }
    const driverId = driverRes.rows[0].id;

    // Check delivery is still pending
    const deliveryRes = await db.query('SELECT * FROM deliveries WHERE id = $1', [id]);
    if (!deliveryRes.rows[0]) {
      return res.status(404).json({ success: false, error: 'Delivery not found' });
    }
    const delivery = deliveryRes.rows[0];

    if (delivery.status !== 'pending') {
      return res.status(409).json({
        success: false,
        error: `Delivery is no longer available (status: ${delivery.status})`,
      });
    }

    // Check driver doesn't already have an active delivery
    const activeCheck = await db.query(
      `SELECT id FROM deliveries
        WHERE driver_id = $1
          AND status IN ('driver_assigned','driver_arriving','picked_up','in_transit')
        LIMIT 1`,
      [driverId]
    );
    if (activeCheck.rowCount > 0) {
      return res.status(409).json({
        success: false,
        error: 'You already have an active delivery. Complete it before accepting a new one.',
      });
    }

    // Accept
    const updated = await db.query(
      `UPDATE deliveries
          SET status = 'driver_assigned',
              driver_id = $1,
              driver_assigned_at = NOW(),
              updated_at = NOW()
        WHERE id = $2
        RETURNING *`,
      [driverId, id]
    );

    // Notify sender
    const driverName = req.user.full_name || req.user.name || 'Your driver';
    await insertNotification(
      delivery.sender_id,
      'Driver Assigned',
      `Driver ${driverName} is on the way to pick up your package.`
    );

    return res.json({ success: true, data: updated.rows[0] });
  } catch (err) {
    console.error('[deliveryController] acceptDelivery:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * PATCH /deliveries/:id/status
 * Driver only. Advances the delivery through status transitions.
 * Body: { status, pickup_photo_url, delivery_photo_url, failure_reason }
 */
const updateDeliveryStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user.userId;
    const { status, pickup_photo_url, delivery_photo_url, failure_reason } = req.body;

    if (req.user.role !== 'driver' && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Driver access required' });
    }

    const VALID_STATUSES = ['driver_arriving', 'picked_up', 'in_transit', 'delivered', 'failed'];
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
      });
    }

    // Fetch current delivery
    const deliveryRes = await db.query('SELECT * FROM deliveries WHERE id = $1', [id]);
    if (!deliveryRes.rows[0]) {
      return res.status(404).json({ success: false, error: 'Delivery not found' });
    }
    const delivery = deliveryRes.rows[0];

    // Verify this driver owns the delivery
    const driverRes = await db.query('SELECT id FROM drivers WHERE user_id = $1', [userId]);
    if (!driverRes.rows[0] || driverRes.rows[0].id !== delivery.driver_id) {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'You are not assigned to this delivery' });
      }
    }

    // Build update object
    const updateFields = { status, updated_at: 'NOW()' };
    let validationError = null;

    switch (status) {
      case 'driver_arriving':
        // No extra requirements
        break;

      case 'picked_up':
        if (!pickup_photo_url) {
          validationError = 'pickup_photo_url is required when marking as picked_up';
        } else {
          updateFields.pickup_photo_url = pickup_photo_url;
          updateFields.picked_up_at = 'NOW()';
        }
        break;

      case 'in_transit':
        // No extra requirements
        break;

      case 'delivered':
        if (!delivery_photo_url && !delivery.recipient_otp_verified) {
          validationError =
            'Either delivery_photo_url or recipient OTP verification is required to mark as delivered';
        } else {
          if (delivery_photo_url) updateFields.delivery_photo_url = delivery_photo_url;
          updateFields.delivered_at = 'NOW()';
          updateFields.payment_status = delivery.payment_method === 'cash' ? 'paid' : delivery.payment_status;
          updateFields.final_fare = delivery.fare_estimate;
        }
        break;

      case 'failed':
        if (!failure_reason) {
          validationError = 'failure_reason is required when marking as failed';
        } else {
          updateFields.failure_reason = failure_reason;
        }
        break;

      default:
        break;
    }

    if (validationError) {
      return res.status(400).json({ success: false, error: validationError });
    }

    // Build dynamic SET clause
    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, val] of Object.entries(updateFields)) {
      if (val === 'NOW()') {
        setClauses.push(`${key} = NOW()`);
      } else {
        setClauses.push(`${key} = $${paramIndex}`);
        values.push(val);
        paramIndex++;
      }
    }
    values.push(id);
    const setClause = setClauses.join(', ');

    const updated = await db.query(
      `UPDATE deliveries SET ${setClause} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    // Notifications per status
    const notifyMessages = {
      driver_arriving: null,
      picked_up: {
        title: 'Package Picked Up',
        message: 'Your package has been picked up and is on the way.',
      },
      in_transit: null,
      delivered: {
        title: 'Package Delivered',
        message: 'Your package has been delivered!',
      },
      failed: {
        title: 'Delivery Failed',
        message: `Your delivery could not be completed: ${failure_reason || 'no reason provided'}.`,
      },
    };

    const notif = notifyMessages[status];
    if (notif) {
      await insertNotification(delivery.sender_id, notif.title, notif.message);
    }

    return res.json({ success: true, data: updated.rows[0] });
  } catch (err) {
    console.error('[deliveryController] updateDeliveryStatus:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * POST /deliveries/:id/verify-otp
 * Driver submits the OTP given by recipient to confirm delivery.
 * Body: { otp }
 */
const verifyRecipientOTP = async (req, res) => {
  try {
    const { id } = req.params;
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({ success: false, error: 'otp is required' });
    }

    const deliveryRes = await db.query(
      'SELECT id, recipient_otp, recipient_otp_verified FROM deliveries WHERE id = $1',
      [id]
    );
    if (!deliveryRes.rows[0]) {
      return res.status(404).json({ success: false, error: 'Delivery not found' });
    }
    const delivery = deliveryRes.rows[0];

    if (delivery.recipient_otp_verified) {
      return res.json({ success: true, verified: true, message: 'OTP already verified' });
    }

    if (delivery.recipient_otp !== otp.toString().trim()) {
      return res.status(400).json({ success: false, verified: false, error: 'Invalid OTP' });
    }

    await db.query(
      'UPDATE deliveries SET recipient_otp_verified = true, updated_at = NOW() WHERE id = $1',
      [id]
    );

    return res.json({ success: true, verified: true });
  } catch (err) {
    console.error('[deliveryController] verifyRecipientOTP:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * POST /deliveries/:id/cancel
 * Sender or admin cancels a delivery.
 * Body: { reason }
 */
const cancelDelivery = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user.userId;
    const userRole = req.user.role;
    const { reason } = req.body;

    const deliveryRes = await db.query('SELECT * FROM deliveries WHERE id = $1', [id]);
    if (!deliveryRes.rows[0]) {
      return res.status(404).json({ success: false, error: 'Delivery not found' });
    }
    const delivery = deliveryRes.rows[0];

    // Auth: sender or admin
    const isSender = delivery.sender_id === userId;
    const isAdmin = userRole === 'admin';
    if (!isSender && !isAdmin) {
      return res.status(403).json({ success: false, error: 'Only the sender or admin can cancel this delivery' });
    }

    const CANCELLABLE_STATUSES = ['pending', 'driver_assigned', 'driver_arriving'];
    if (!CANCELLABLE_STATUSES.includes(delivery.status)) {
      return res.status(409).json({
        success: false,
        error: `Cannot cancel a delivery with status '${delivery.status}'`,
      });
    }

    const updated = await db.query(
      `UPDATE deliveries
          SET status = 'cancelled',
              cancellation_reason = $1,
              updated_at = NOW()
        WHERE id = $2
        RETURNING *`,
      [reason || null, id]
    );

    // If driver was assigned, notify them
    if (delivery.driver_id) {
      // Fetch driver's user_id to notify
      const drvRes = await db.query('SELECT user_id FROM drivers WHERE id = $1', [delivery.driver_id]);
      if (drvRes.rows[0]) {
        await insertNotification(
          drvRes.rows[0].user_id,
          'Delivery Cancelled',
          'The delivery has been cancelled by the sender.'
        );
      }
    }

    return res.json({ success: true, data: updated.rows[0] });
  } catch (err) {
    console.error('[deliveryController] cancelDelivery:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /deliveries/stats
 * Admin only. Returns aggregate stats.
 */
const getDeliveryStats = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const statsRes = await db.query(`
      SELECT
        COUNT(*)                                                             AS total_deliveries,
        COUNT(*) FILTER (WHERE status = 'pending')                          AS pending,
        COUNT(*) FILTER (WHERE status = 'driver_assigned')                  AS driver_assigned,
        COUNT(*) FILTER (WHERE status = 'driver_arriving')                  AS driver_arriving,
        COUNT(*) FILTER (WHERE status = 'picked_up')                        AS picked_up,
        COUNT(*) FILTER (WHERE status = 'in_transit')                       AS in_transit,
        COUNT(*) FILTER (WHERE status = 'delivered')                        AS delivered,
        COUNT(*) FILTER (WHERE status = 'cancelled')                        AS cancelled,
        COUNT(*) FILTER (WHERE status = 'failed')                           AS failed,
        COALESCE(SUM(final_fare) FILTER (WHERE status = 'delivered'), 0)    AS total_revenue,
        COALESCE(SUM(final_fare) FILTER (
          WHERE status = 'delivered'
            AND delivered_at >= CURRENT_DATE
        ), 0)                                                                AS revenue_today,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)                  AS today_count,
        COUNT(*) FILTER (
          WHERE status = 'delivered' AND created_at >= CURRENT_DATE
        )                                                                    AS delivered_today,
        ROUND(
          AVG(
            EXTRACT(EPOCH FROM (delivered_at - created_at)) / 60.0
          ) FILTER (WHERE status = 'delivered' AND delivered_at IS NOT NULL)
        )                                                                    AS avg_delivery_time_minutes
      FROM deliveries
    `);

    return res.json({ success: true, data: statsRes.rows[0] });
  } catch (err) {
    console.error('[deliveryController] getDeliveryStats:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  estimateDeliveryFare,
  createDelivery,
  getMyDeliveries,
  getDeliveryById,
  getNearbyDeliveries,
  acceptDelivery,
  updateDeliveryStatus,
  verifyRecipientOTP,
  cancelDelivery,
  getDeliveryStats,
};

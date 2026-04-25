'use strict';
/**
 * adminRideController.js — Admin endpoints for rides, surge pricing, promotions
 *
 * GET    /admin/rides
 * GET    /admin/rides/stats
 * GET    /admin/rides/:id
 *
 * GET    /admin/surge
 * POST   /admin/surge
 * PATCH  /admin/surge/:id
 * PATCH  /admin/surge/:id/toggle
 * DELETE /admin/surge/:id
 *
 * GET    /admin/promotions
 * POST   /admin/promotions
 * PATCH  /admin/promotions/:id
 * PATCH  /admin/promotions/:id/toggle
 * DELETE /admin/promotions/:id
 *
 * GET    /admin/map/active-rides
 * GET    /admin/payments
 * GET    /admin/payments/stats
 * GET    /admin/payments/revenue
 * GET    /admin/payments/methods
 */

const pool   = require('../config/database');
const logger = require('../utils/logger');

// ── Rides ──────────────────────────────────────────────────────────────────────

const listRides = async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit,  10) || 50, 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const status = req.query.status;
  const search = req.query.search;

  try {
    const params = [limit, offset];
    let where = `WHERE 1=1`;
    if (status) { params.push(status); where += ` AND r.status = $${params.length}`; }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (rider.full_name ILIKE $${params.length} OR driver_u.full_name ILIKE $${params.length})`;
    }

    const result = await pool.query(
      `SELECT r.id, r.status, r.ride_type AS type,
              r.pickup_address, r.dropoff_address, r.pickup_city AS city,
              r.final_fare AS fare, r.payment_method, r.payment_status,
              r.created_at,
              rider.full_name    AS rider,
              driver_u.full_name AS driver,
              COUNT(*) OVER()    AS total_count
       FROM rides r
       LEFT JOIN users rider    ON rider.id = r.rider_id
       LEFT JOIN drivers d      ON d.id = r.driver_id
       LEFT JOIN users driver_u ON driver_u.id = d.user_id
       ${where}
       ORDER BY r.created_at DESC
       LIMIT $1 OFFSET $2`,
      params
    );

    const total = result.rows[0]?.total_count ? parseInt(result.rows[0].total_count, 10) : 0;
    const rides = result.rows.map(({ total_count, ...r }) => r);
    res.json({ success: true, data: rides, total, limit, offset });
  } catch (err) {
    logger.error('[AdminRideCtrl] listRides error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to list rides' });
  }
};

const getRideStats = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         COUNT(*)                                                         AS total,
         COUNT(*) FILTER (WHERE status = 'completed')                    AS completed,
         COUNT(*) FILTER (WHERE status = 'cancelled')                    AS cancelled,
         COUNT(*) FILTER (WHERE status IN ('accepted','in_progress','arriving')) AS active,
         COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)              AS today,
         COALESCE(SUM(final_fare) FILTER (WHERE status = 'completed' AND created_at >= CURRENT_DATE), 0) AS revenue_today
       FROM rides`
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('[AdminRideCtrl] getRideStats error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to load ride stats' });
  }
};

const getRideById = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT r.*,
              rider.full_name    AS rider_name,    rider.phone AS rider_phone,
              driver_u.full_name AS driver_name, driver_u.phone AS driver_phone,
              d.vehicle_make, d.vehicle_model, d.vehicle_plate
       FROM rides r
       LEFT JOIN users rider    ON rider.id = r.rider_id
       LEFT JOIN drivers d      ON d.id = r.driver_id
       LEFT JOIN users driver_u ON driver_u.id = d.user_id
       WHERE r.id = $1`,
      [id]
    );
    if (!result.rows[0]) return res.status(404).json({ success: false, message: 'Ride not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('[AdminRideCtrl] getRideById error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to load ride' });
  }
};

// ── Surge Pricing ──────────────────────────────────────────────────────────────

const listSurgeZones = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, multiplier, is_active, city,
              ST_AsGeoJSON(boundary)::json AS boundary,
              created_at, updated_at
       FROM surge_zones
       ORDER BY created_at DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('[AdminRideCtrl] listSurgeZones error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to load surge zones' });
  }
};

const createSurgeZone = async (req, res) => {
  const { name, multiplier, city, boundary } = req.body;
  if (!name || !multiplier || !city) {
    return res.status(400).json({ success: false, message: 'name, multiplier, city are required' });
  }
  if (multiplier < 1 || multiplier > 5) {
    return res.status(400).json({ success: false, message: 'multiplier must be between 1 and 5' });
  }
  try {
    const geom = boundary
      ? `ST_SetSRID(ST_GeomFromGeoJSON($4), 4326)`
      : `ST_SetSRID(ST_MakePoint(0,0), 4326)`;
    const params = boundary
      ? [name, parseFloat(multiplier), city, JSON.stringify(boundary)]
      : [name, parseFloat(multiplier), city];

    const result = await pool.query(
      `INSERT INTO surge_zones (name, multiplier, city, boundary, is_active, created_at)
       VALUES ($1, $2, $3, ${geom}, true, NOW())
       RETURNING id, name, multiplier, city, is_active, created_at`,
      params
    );
    logger.info('[AdminRideCtrl] Surge zone created', { id: result.rows[0].id });
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('[AdminRideCtrl] createSurgeZone error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to create surge zone' });
  }
};

const updateSurgeZone = async (req, res) => {
  const { id } = req.params;
  const { name, multiplier, city } = req.body;
  try {
    const sets = [];
    const params = [id];
    if (name)       { params.push(name);                    sets.push(`name = $${params.length}`); }
    if (multiplier) { params.push(parseFloat(multiplier));  sets.push(`multiplier = $${params.length}`); }
    if (city)       { params.push(city);                    sets.push(`city = $${params.length}`); }
    if (sets.length === 0) return res.status(400).json({ success: false, message: 'No fields to update' });
    sets.push(`updated_at = NOW()`);

    const result = await pool.query(
      `UPDATE surge_zones SET ${sets.join(', ')} WHERE id = $1 RETURNING id, name, multiplier, city, is_active`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ success: false, message: 'Surge zone not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('[AdminRideCtrl] updateSurgeZone error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to update surge zone' });
  }
};

const toggleSurgeZone = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE surge_zones SET is_active = NOT is_active, updated_at = NOW()
       WHERE id = $1 RETURNING id, name, is_active`,
      [id]
    );
    if (!result.rows[0]) return res.status(404).json({ success: false, message: 'Surge zone not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('[AdminRideCtrl] toggleSurgeZone error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to toggle surge zone' });
  }
};

const deleteSurgeZone = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `DELETE FROM surge_zones WHERE id = $1 RETURNING id`,
      [id]
    );
    if (!result.rows[0]) return res.status(404).json({ success: false, message: 'Surge zone not found' });
    res.json({ success: true, message: 'Surge zone deleted' });
  } catch (err) {
    logger.error('[AdminRideCtrl] deleteSurgeZone error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to delete surge zone' });
  }
};

// ── Promotions ─────────────────────────────────────────────────────────────────

const listPromotions = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, code, description, discount_type, discount_value,
              min_fare, max_uses, used_count, is_active, expires_at, created_at
       FROM promo_codes
       ORDER BY created_at DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('[AdminRideCtrl] listPromotions error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to load promotions' });
  }
};

const createPromotion = async (req, res) => {
  const { code, description, discount_type, discount_value, min_fare, max_uses, expires_at } = req.body;
  if (!code || !discount_type || discount_value === undefined) {
    return res.status(400).json({ success: false, message: 'code, discount_type, discount_value are required' });
  }
  if (!['percentage', 'fixed'].includes(discount_type)) {
    return res.status(400).json({ success: false, message: 'discount_type must be percentage or fixed' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO promo_codes
         (code, description, discount_type, discount_value, min_fare, max_uses, is_active, expires_at)
       VALUES (UPPER($1), $2, $3, $4, $5, $6, true, $7)
       RETURNING id, code, discount_type, discount_value, is_active, expires_at`,
      [code, description || null, discount_type, discount_value, min_fare || 0, max_uses || null, expires_at || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'Promo code already exists' });
    }
    logger.error('[AdminRideCtrl] createPromotion error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to create promotion' });
  }
};

const updatePromotion = async (req, res) => {
  const { id } = req.params;
  const { description, discount_value, min_fare, max_uses, expires_at } = req.body;
  try {
    const sets = ['updated_at = NOW()'];
    const params = [id];
    if (description    !== undefined) { params.push(description);    sets.push(`description = $${params.length}`); }
    if (discount_value !== undefined) { params.push(discount_value); sets.push(`discount_value = $${params.length}`); }
    if (min_fare       !== undefined) { params.push(min_fare);       sets.push(`min_fare = $${params.length}`); }
    if (max_uses       !== undefined) { params.push(max_uses);       sets.push(`max_uses = $${params.length}`); }
    if (expires_at     !== undefined) { params.push(expires_at);     sets.push(`expires_at = $${params.length}`); }

    const result = await pool.query(
      `UPDATE promo_codes SET ${sets.join(', ')} WHERE id = $1 RETURNING id, code, discount_value, is_active`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ success: false, message: 'Promotion not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('[AdminRideCtrl] updatePromotion error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to update promotion' });
  }
};

const togglePromotion = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE promo_codes SET is_active = NOT is_active, updated_at = NOW()
       WHERE id = $1 RETURNING id, code, is_active`,
      [id]
    );
    if (!result.rows[0]) return res.status(404).json({ success: false, message: 'Promotion not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('[AdminRideCtrl] togglePromotion error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to toggle promotion' });
  }
};

const deletePromotion = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `DELETE FROM promo_codes WHERE id = $1 RETURNING id`,
      [id]
    );
    if (!result.rows[0]) return res.status(404).json({ success: false, message: 'Promotion not found' });
    res.json({ success: true, message: 'Promotion deleted' });
  } catch (err) {
    logger.error('[AdminRideCtrl] deletePromotion error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to delete promotion' });
  }
};

// ── Live map ───────────────────────────────────────────────────────────────────

const getActiveRides = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.id, r.status, r.ride_type,
              r.pickup_lat, r.pickup_lng,
              r.dropoff_lat, r.dropoff_lng,
              rider.full_name   AS rider,
              driver_u.full_name AS driver
       FROM rides r
       LEFT JOIN users rider    ON rider.id = r.rider_id
       LEFT JOIN drivers d      ON d.id = r.driver_id
       LEFT JOIN users driver_u ON driver_u.id = d.user_id
       WHERE r.status IN ('accepted','arriving','in_progress')
       ORDER BY r.created_at DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('[AdminRideCtrl] getActiveRides error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to load active rides' });
  }
};

// ── Payment stats (served from ride-service shared DB) ────────────────────────

const listPayments = async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit,  10) || 50, 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const method = req.query.method;
  const status = req.query.status;

  try {
    const params = [limit, offset];
    let where = `WHERE 1=1`;
    if (method) { params.push(method); where += ` AND p.payment_method = $${params.length}`; }
    if (status) { params.push(status); where += ` AND p.status = $${params.length}`; }

    const result = await pool.query(
      `SELECT p.id, p.amount, p.payment_method, p.status,
              p.reference_id, p.ride_id, p.created_at,
              u.full_name AS user_name,
              COUNT(*) OVER() AS total_count
       FROM payments p
       LEFT JOIN users u ON u.id = p.user_id
       ${where}
       ORDER BY p.created_at DESC
       LIMIT $1 OFFSET $2`,
      params
    );

    const total    = result.rows[0]?.total_count ? parseInt(result.rows[0].total_count, 10) : 0;
    const payments = result.rows.map(({ total_count, ...p }) => p);
    res.json({ success: true, data: payments, total, limit, offset });
  } catch (err) {
    logger.error('[AdminRideCtrl] listPayments error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to list payments' });
  }
};

const getPaymentStats = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         COUNT(*)                                                              AS total,
         COUNT(*) FILTER (WHERE status = 'completed')                         AS completed,
         COUNT(*) FILTER (WHERE status = 'failed')                            AS failed,
         COUNT(*) FILTER (WHERE status = 'pending')                           AS pending,
         COALESCE(SUM(amount) FILTER (WHERE status = 'completed'), 0)         AS total_revenue,
         COALESCE(SUM(amount) FILTER (WHERE status = 'completed'
                               AND created_at >= CURRENT_DATE), 0)            AS revenue_today
       FROM payments`
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('[AdminRideCtrl] getPaymentStats error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to load payment stats' });
  }
};

const getPaymentRevenue = async (req, res) => {
  const days = Math.min(parseInt(req.query.days, 10) || 30, 90);
  try {
    const result = await pool.query(
      `SELECT DATE(created_at) AS date,
              COALESCE(SUM(amount), 0) AS revenue
       FROM payments
       WHERE status = 'completed'
         AND created_at >= NOW() - ($1 || ' days')::INTERVAL
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [days]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('[AdminRideCtrl] getPaymentRevenue error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to load revenue chart' });
  }
};

const getPaymentMethodBreakdown = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT payment_method AS name,
              COUNT(*) AS value
       FROM payments
       WHERE status = 'completed'
       GROUP BY payment_method
       ORDER BY value DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('[AdminRideCtrl] getPaymentMethodBreakdown error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to load method breakdown' });
  }
};

// ── Bulk Ride Reassignment (CF-006) ──────────────────────────────────────────

/**
 * POST /admin/bulk/rides/reassign
 * Reassign up to 50 rides to a single driver. Only reassigns rides in
 * requested/accepted/arriving state; skips completed/cancelled.
 */
const bulkReassignRides = async (req, res) => {
  const { ride_ids, driver_id, reason = 'bulk_admin_reassignment' } = req.body;
  const adminId = req.user?.id;

  if (!Array.isArray(ride_ids) || ride_ids.length === 0) {
    return res.status(400).json({ error: 'ride_ids must be a non-empty array' });
  }
  if (ride_ids.length > 50) {
    return res.status(400).json({ error: 'Maximum 50 rides per bulk reassignment' });
  }
  if (!driver_id) {
    return res.status(400).json({ error: 'driver_id is required' });
  }

  try {
    const driverRes = await pool.query(
      `SELECT id FROM drivers WHERE user_id = $1 AND is_approved = true AND status = 'online'`,
      [driver_id]
    );
    if (!driverRes.rows[0]) {
      return res.status(404).json({ error: 'Driver not found, not approved, or not online' });
    }
    const driverId = driverRes.rows[0].id;

    const { rows: updated } = await pool.query(
      `UPDATE rides
       SET driver_id = $1, updated_at = NOW()
       WHERE id = ANY($2::uuid[])
         AND status IN ('requested','accepted','arriving')
       RETURNING id, status`,
      [driverId, ride_ids]
    );

    const updatedIds = new Set(updated.map(r => r.id));
    const skippedIds = ride_ids.filter(id => !updatedIds.has(id));

    logger.info('[BulkReassign] Rides reassigned', {
      admin: adminId, driver_id, reassigned: updated.length, skipped: skippedIds.length, reason,
    });

    res.json({
      success:  true,
      reassigned: updated.map(r => r.id),
      skipped:    skippedIds,
      skipped_reason: 'ride_not_in_reassignable_state',
      summary: { total: ride_ids.length, reassigned: updated.length, skipped: skippedIds.length },
    });
  } catch (err) {
    logger.error('[BulkReassign] Error', { err: err.message });
    res.status(500).json({ error: 'Bulk reassignment failed' });
  }
};

/**
 * GET /admin/rides/:id/waypoints
 * Return the recorded GPS trail for trip replay.
 */
const getRideWaypoints = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT id, lat, lng, bearing, speed_kmh, accuracy_m, recorded_at
       FROM   ride_waypoints
       WHERE  ride_id = $1
       ORDER  BY recorded_at ASC`,
      [id]
    );
    res.json({ success: true, ride_id: id, waypoints: rows, count: rows.length });
  } catch (err) {
    logger.error('[AdminRideCtrl] getRideWaypoints error', { err: err.message });
    res.status(500).json({ error: 'Failed to fetch waypoints' });
  }
};

module.exports = {
  // Rides
  listRides, getRideStats, getRideById,
  // Surge
  listSurgeZones, createSurgeZone, updateSurgeZone, toggleSurgeZone, deleteSurgeZone,
  // Promotions
  listPromotions, createPromotion, updatePromotion, togglePromotion, deletePromotion,
  // Map
  getActiveRides,
  // Payments
  listPayments, getPaymentStats, getPaymentRevenue, getPaymentMethodBreakdown,
  // Bulk + trip replay
  bulkReassignRides, getRideWaypoints,
};

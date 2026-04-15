const logger = require('../utils/logger');
const db = require('../config/database');

/**
 * POST /rides/disputes
 * File a dispute for a ride the authenticated user was part of.
 * Body: { ride_id, category, description, evidence_urls? }
 */
const fileDispute = async (req, res) => {
  try {
    const reporterId = req.user ? req.user.id : req.headers['x-user-id'];
    const { ride_id, category, description, evidence_urls = [] } = req.body;

    if (!ride_id || !category || !description) {
      return res.status(400).json({ success: false, message: 'ride_id, category, and description are required' });
    }

    // Fetch the ride to verify the reporter was part of it
    const rideResult = await db.query(
      `SELECT r.id, r.rider_id, d.user_id AS driver_user_id
       FROM rides r
       LEFT JOIN drivers d ON r.driver_id = d.id
       WHERE r.id = $1`,
      [ride_id]
    );

    if (rideResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }

    const ride = rideResult.rows[0];
    let reporter_role = null;

    if (ride.rider_id === reporterId) {
      reporter_role = 'rider';
    } else if (ride.driver_user_id === reporterId) {
      reporter_role = 'driver';
    } else {
      return res.status(403).json({ success: false, message: 'You were not part of this ride' });
    }

    const result = await db.query(
      `INSERT INTO ride_disputes
         (ride_id, reporter_id, reporter_role, category, description, evidence_urls)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [ride_id, reporterId, reporter_role, category, description, JSON.stringify(evidence_urls)]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('[Disputes] fileDispute error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /rides/disputes/mine
 * All disputes filed by the current authenticated user.
 */
const getMyDisputes = async (req, res) => {
  try {
    const reporterId = req.user ? req.user.id : req.headers['x-user-id'];

    const result = await db.query(
      `SELECT rd.*,
              r.pickup_address, r.dropoff_address, r.created_at AS ride_date
       FROM ride_disputes rd
       JOIN rides r ON rd.ride_id = r.id
       WHERE rd.reporter_id = $1
       ORDER BY rd.created_at DESC`,
      [reporterId]
    );

    return res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('[Disputes] getMyDisputes error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /rides/disputes/:id
 * Single dispute with ride info joined. Authenticated user must own the dispute or be admin.
 */
const getDisputeById = async (req, res) => {
  try {
    const userId = req.user ? req.user.id : req.headers['x-user-id'];
    const userRole = req.user ? req.user.role : req.headers['x-user-role'];
    const { id } = req.params;

    const result = await db.query(
      `SELECT rd.*,
              r.pickup_address, r.dropoff_address, r.status AS ride_status,
              r.estimated_fare, r.final_fare, r.created_at AS ride_date,
              u.full_name AS reporter_name, u.phone AS reporter_phone
       FROM ride_disputes rd
       JOIN rides r ON rd.ride_id = r.id
       JOIN users u ON rd.reporter_id = u.id
       WHERE rd.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Dispute not found' });
    }

    const dispute = result.rows[0];

    // Only the reporter or an admin may view the dispute
    if (dispute.reporter_id !== userId && userRole !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    return res.json({ success: true, data: dispute });
  } catch (err) {
    logger.error('[Disputes] getDisputeById error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * PATCH /rides/disputes/:id/resolve
 * Admin only. Resolve or dismiss a dispute.
 * Body: { resolution, status ('resolved'|'dismissed') }
 */
const resolveDispute = async (req, res) => {
  try {
    const adminId = req.user ? req.user.id : req.headers['x-user-id'];
    const userRole = req.user ? req.user.role : req.headers['x-user-role'];

    if (userRole !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { id } = req.params;
    const { resolution, status } = req.body;

    if (!['resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'status must be "resolved" or "dismissed"' });
    }

    if (!resolution) {
      return res.status(400).json({ success: false, message: 'resolution is required' });
    }

    const result = await db.query(
      `UPDATE ride_disputes
       SET status = $1,
           resolution = $2,
           resolved_by = $3,
           resolved_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [status, resolution, adminId, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Dispute not found' });
    }

    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('[Disputes] resolveDispute error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /rides/disputes
 * Admin only. All disputes with optional filters: status, category, date_from, date_to.
 * Joins ride info and reporter name/phone.
 */
const getAllDisputes = async (req, res) => {
  try {
    const userRole = req.user ? req.user.role : req.headers['x-user-role'];

    if (userRole !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { status, category, date_from, date_to, limit = 50, offset = 0 } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (status) {
      conditions.push(`rd.status = $${idx++}`);
      params.push(status);
    }
    if (category) {
      conditions.push(`rd.category = $${idx++}`);
      params.push(category);
    }
    if (date_from) {
      conditions.push(`rd.created_at >= $${idx++}`);
      params.push(date_from);
    }
    if (date_to) {
      conditions.push(`rd.created_at <= $${idx++}`);
      params.push(date_to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const result = await db.query(
      `SELECT rd.*,
              r.pickup_address, r.dropoff_address, r.status AS ride_status,
              r.estimated_fare, r.final_fare, r.created_at AS ride_date,
              u.full_name AS reporter_name, u.phone AS reporter_phone
       FROM ride_disputes rd
       JOIN rides r ON rd.ride_id = r.id
       JOIN users u ON rd.reporter_id = u.id
       ${whereClause}
       ORDER BY rd.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      params
    );

    return res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('[Disputes] getAllDisputes error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  fileDispute,
  getMyDisputes,
  getDisputeById,
  resolveDispute,
  getAllDisputes
};

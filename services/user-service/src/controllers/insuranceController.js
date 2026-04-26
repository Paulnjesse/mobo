'use strict';
/**
 * insuranceController.js — Insurance claims lifecycle
 *
 * Rider/driver:
 *   POST   /insurance/claims          — file a new claim
 *   GET    /insurance/claims          — my claims
 *   GET    /insurance/claims/:id      — claim detail
 *
 * Admin:
 *   GET    /admin/insurance/claims          — all claims (paginated, filterable)
 *   GET    /admin/insurance/claims/stats    — summary stats
 *   GET    /admin/insurance/claims/:id      — claim detail
 *   PATCH  /admin/insurance/claims/:id      — update status / assign / notes
 */

const db     = require('../config/database');
const logger = require('../utils/logger');

// ── Rider / Driver ─────────────────────────────────────────────────────────────

const fileClaim = async (req, res) => {
  try {
    const claimantId = String(req.user.id);
    const { ride_id, claim_type, description, incident_date, amount_claimed_xaf } = req.body;

    if (!claim_type || !description) {
      return res.status(400).json({ success: false, message: 'claim_type and description are required' });
    }
    const validTypes = ['accident', 'theft', 'damage', 'injury', 'other'];
    if (!validTypes.includes(claim_type)) {
      return res.status(400).json({ success: false, message: `claim_type must be one of: ${validTypes.join(', ')}` });
    }
    if (description.trim().length < 20) {
      return res.status(400).json({ success: false, message: 'description must be at least 20 characters' });
    }

    // Verify ride belongs to claimant (if ride_id provided)
    if (ride_id) {
      const rideCheck = await db.query(
        `SELECT 1 FROM rides r
         LEFT JOIN drivers d ON d.id = r.driver_id
         WHERE r.id = $1 AND (r.rider_id = $2 OR d.user_id = $2)`,
        [ride_id, claimantId]
      );
      if (!rideCheck.rows[0]) {
        return res.status(403).json({ success: false, message: 'You are not a participant in this ride' });
      }
    }

    const result = await db.query(
      `INSERT INTO insurance_claims
         (ride_id, claimant_id, claim_type, description, incident_date, amount_claimed_xaf)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        ride_id       || null,
        claimantId,
        claim_type,
        description.trim(),
        incident_date || null,
        amount_claimed_xaf ? parseInt(amount_claimed_xaf, 10) : null,
      ]
    );
    logger.info('[InsuranceCtrl] Claim filed', { claimId: result.rows[0].id, claimantId });
    res.status(201).json({ success: true, claim: result.rows[0] });
  } catch (err) {
    logger.error('[InsuranceCtrl] fileClaim error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to file claim' });
  }
};

const getMyClaims = async (req, res) => {
  try {
    const claimantId = String(req.user.id);
    const { limit = 20, offset = 0 } = req.query;
    const result = await db.query(
      `SELECT ic.*, r.pickup_address, r.dropoff_address, r.completed_at AS ride_date
       FROM insurance_claims ic
       LEFT JOIN rides r ON r.id = ic.ride_id
       WHERE ic.claimant_id = $1
       ORDER BY ic.created_at DESC LIMIT $2 OFFSET $3`,
      [claimantId, Math.min(100, parseInt(limit) || 20), parseInt(offset) || 0]
    );
    res.json({ success: true, claims: result.rows });
  } catch (err) {
    logger.error('[InsuranceCtrl] getMyClaims error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to load claims' });
  }
};

const getClaimById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId  = String(req.user.id);
    const isAdmin = req.user.role === 'admin';

    const result = await db.query(
      `SELECT ic.*, u.full_name AS claimant_name, u.phone AS claimant_phone,
              r.pickup_address, r.dropoff_address
       FROM insurance_claims ic
       JOIN  users u ON u.id = ic.claimant_id
       LEFT JOIN rides r ON r.id = ic.ride_id
       WHERE ic.id = $1`,
      [id]
    );
    if (!result.rows[0]) return res.status(404).json({ success: false, message: 'Claim not found' });

    const claim = result.rows[0];
    if (!isAdmin && claim.claimant_id !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    res.json({ success: true, claim });
  } catch (err) {
    logger.error('[InsuranceCtrl] getClaimById error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to load claim' });
  }
};

// ── Admin ──────────────────────────────────────────────────────────────────────

const adminListClaims = async (req, res) => {
  try {
    const { status, claim_type, limit = 25, offset = 0 } = req.query;
    const params = [];
    const conds  = [];

    if (status)     { params.push(status);     conds.push(`ic.status = $${params.length}`); }
    if (claim_type) { params.push(claim_type); conds.push(`ic.claim_type = $${params.length}`); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const safeLimit  = Math.min(100, parseInt(limit)  || 25);
    const safeOffset = Math.max(0,   parseInt(offset) || 0);
    params.push(safeLimit, safeOffset);

    const result = await db.query(
      `SELECT ic.*, u.full_name AS claimant_name, u.phone AS claimant_phone
       FROM insurance_claims ic
       JOIN  users u ON u.id = ic.claimant_id
       ${where}
       ORDER BY ic.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    // Total count for pagination
    const countParams = params.slice(0, params.length - 2);
    const countResult = await db.query(
      `SELECT COUNT(*) FROM insurance_claims ic ${where}`,
      countParams
    );

    res.json({
      success: true,
      claims:  result.rows,
      total:   parseInt(countResult.rows[0].count, 10),
    });
  } catch (err) {
    logger.error('[InsuranceCtrl] adminListClaims error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to load claims' });
  }
};

const adminClaimStats = async (req, res) => {
  try {
    const [statusRow, typeRow, amountRow] = await Promise.all([
      db.query(`SELECT status, COUNT(*) FROM insurance_claims GROUP BY status`),
      db.query(`SELECT claim_type, COUNT(*) FROM insurance_claims GROUP BY claim_type`),
      db.query(`SELECT
                  COUNT(*) AS total,
                  COALESCE(SUM(amount_claimed_xaf),0) AS total_claimed_xaf,
                  COALESCE(SUM(amount_settled_xaf),0) AS total_settled_xaf
                FROM insurance_claims`),
    ]);
    res.json({
      success: true,
      by_status: statusRow.rows,
      by_type:   typeRow.rows,
      totals:    amountRow.rows[0],
    });
  } catch (err) {
    logger.error('[InsuranceCtrl] adminClaimStats error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to load stats' });
  }
};

const adminUpdateClaim = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, admin_notes, amount_settled_xaf, assigned_to } = req.body;

    const validStatuses = ['submitted','under_review','approved','rejected','settled','closed'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const sets  = ['updated_at = NOW()'];
    const vals  = [];

    if (status)             { vals.push(status);                         sets.push(`status = $${vals.length}`); }
    if (admin_notes !== undefined) { vals.push(admin_notes);             sets.push(`admin_notes = $${vals.length}`); }
    if (amount_settled_xaf !== undefined) { vals.push(parseInt(amount_settled_xaf,10) || null); sets.push(`amount_settled_xaf = $${vals.length}`); }
    if (assigned_to)        { vals.push(assigned_to);                    sets.push(`assigned_to = $${vals.length}`); }

    // Set resolved_at when terminal status reached
    if (['approved','rejected','settled','closed'].includes(status)) {
      sets.push('resolved_at = NOW()');
    }

    vals.push(id);
    const result = await db.query(
      `UPDATE insurance_claims SET ${sets.join(', ')}
       WHERE id = $${vals.length} RETURNING *`,
      vals
    );
    if (!result.rows[0]) return res.status(404).json({ success: false, message: 'Claim not found' });

    logger.info('[InsuranceCtrl] Claim updated', { claimId: id, status, adminId: req.user?.id });
    res.json({ success: true, claim: result.rows[0] });
  } catch (err) {
    logger.error('[InsuranceCtrl] adminUpdateClaim error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to update claim' });
  }
};

module.exports = {
  fileClaim,
  getMyClaims,
  getClaimById,
  adminListClaims,
  adminClaimStats,
  adminUpdateClaim,
};

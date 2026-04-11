'use strict';
// Driver Shift-Start Selfie Controller — Uber Real-Time ID Check style
// Before going online each shift, the driver takes a selfie.
// We compare it against their profile photo using Smile ID liveness API.
// If the match score drops below threshold → manual_review or block from going online.

const pool   = require('../config/database');
const axios  = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger') || console;

const SMILE_BASE_URL     = process.env.SMILE_ID_BASE_URL || 'https://testapi.smileidentity.com/v1';
const SMILE_PARTNER_ID   = process.env.SMILE_ID_PARTNER_ID;
const SMILE_API_KEY      = process.env.SMILE_ID_API_KEY;
const SMILE_CALLBACK_URL = process.env.SMILE_ID_CALLBACK_URL;
const MATCH_THRESHOLD    = parseFloat(process.env.SELFIE_MATCH_THRESHOLD || '0.75');
const LIVENESS_THRESHOLD = parseFloat(process.env.LIVENESS_THRESHOLD    || '0.70');
// Selfie valid for 12 hours — checked via expires_at GENERATED column in DB

// ── GET /drivers/me/selfie-check — Check if shift selfie is needed ────────────
const getSelfieCheckStatus = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];

    const driverRow = await pool.query(
      `SELECT d.id, d.last_selfie_passed_at, d.selfie_check_required,
              d.is_available
       FROM drivers d WHERE d.user_id = $1`,
      [userId]
    );
    if (!driverRow.rows[0]) return res.status(403).json({ error: 'Not a driver' });
    const driver = driverRow.rows[0];

    // Check if there is a valid (unexpired, passed) selfie for today
    const selfieRow = await pool.query(
      `SELECT id, status, match_score, liveness_score, checked_at, expires_at
       FROM driver_selfie_checks
       WHERE driver_id = $1
         AND status = 'passed'
         AND expires_at > NOW()
       ORDER BY checked_at DESC LIMIT 1`,
      [driver.id]
    );

    const hasPassed = selfieRow.rows.length > 0;
    res.json({
      required: driver.selfie_check_required || !hasPassed,
      passed:   hasPassed,
      last_check: selfieRow.rows[0] || null,
      last_passed_at: driver.last_selfie_passed_at,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── POST /drivers/me/selfie-check — Driver submits selfie for shift check ────
const submitSelfieCheck = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { selfie_url, selfie_base64 } = req.body;

    if (!selfie_url && !selfie_base64) {
      return res.status(400).json({ error: 'selfie_url or selfie_base64 required' });
    }

    const driverRow = await pool.query(
      `SELECT d.id AS driver_id, d.user_id,
              u.profile_photo_url, u.full_name
       FROM drivers d JOIN users u ON u.id = d.user_id
       WHERE d.user_id = $1 AND d.is_approved = true`,
      [userId]
    );
    if (!driverRow.rows[0]) return res.status(403).json({ error: 'Approved driver account required' });
    const { driver_id, profile_photo_url, full_name } = driverRow.rows[0];

    // --- Smile ID Liveness + Compare call ---
    let matchScore    = null;
    let livenessScore = null;
    let providerRef   = null;
    let status        = 'manual_review';
    let failureReason = null;

    const smileConfigured = SMILE_PARTNER_ID && SMILE_API_KEY && SMILE_PARTNER_ID !== 'smile_partner_id_here';

    if (smileConfigured) {
      try {
        const timestamp = new Date().toISOString();
        const signature = crypto
          .createHmac('sha256', SMILE_API_KEY)
          .update(`${timestamp}${SMILE_PARTNER_ID}sid_request`)
          .digest('base64');

        const payload = {
          partner_id: SMILE_PARTNER_ID,
          timestamp,
          signature,
          source_sdk: 'mobo_server',
          source_sdk_version: '1.0.0',
          callback_url: SMILE_CALLBACK_URL,
          partner_params: {
            user_id: userId,
            job_id:  `selfie_${driver_id}_${Date.now()}`,
            job_type: 6,  // Smile ID job_type 6 = Liveness Check + Compare
          },
          image_links: {
            selfie_image: selfie_url || selfie_base64,
            ...(profile_photo_url ? { id_image: profile_photo_url } : {}),
          },
        };

        const smileRes = await axios.post(`${SMILE_BASE_URL}/smile_links`, payload, {
          timeout: 8000,
        });

        const result   = smileRes.data?.result || {};
        matchScore     = parseFloat(result.ConfidenceValue || result.match_score || '0') / 100;
        livenessScore  = parseFloat(result.Liveness?.score || result.liveness_score || '0');
        providerRef    = smileRes.data?.job_run_id;

        if (matchScore >= MATCH_THRESHOLD && livenessScore >= LIVENESS_THRESHOLD) {
          status = 'passed';
        } else if (matchScore < 0.5 || livenessScore < 0.5) {
          status = 'failed';
          failureReason = `Low match (${(matchScore * 100).toFixed(0)}%) or liveness (${(livenessScore * 100).toFixed(0)}%)`;
        } else {
          status = 'manual_review';
          failureReason = 'Inconclusive — flagged for manual review';
        }
      } catch (smileErr) {
        logger.warn({ err: smileErr }, '[SelfieCheck] Smile ID call failed — fallback to manual_review');
        status = 'manual_review';
        failureReason = 'Identity provider unavailable';
      }
    } else {
      // Dev / staging fallback — auto-pass for testing
      logger.info('[SelfieCheck] Smile ID not configured — dev auto-pass');
      status = 'passed';
      matchScore = 0.99;
      livenessScore = 0.99;
    }

    // Insert selfie check record
    const insertRes = await pool.query(
      `INSERT INTO driver_selfie_checks
         (driver_id, user_id, selfie_url, match_score, liveness_score,
          status, provider, provider_ref, failure_reason, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,'smile_id',$7,$8, NOW() + INTERVAL '12 hours')
       RETURNING *`,
      [driver_id, userId, selfie_url || 'base64_upload', matchScore, livenessScore,
       status, providerRef, failureReason]
    );
    const selfieCheck = insertRes.rows[0];

    // Update driver record
    if (status === 'passed') {
      await pool.query(
        `UPDATE drivers SET last_selfie_check_id = $1, last_selfie_passed_at = NOW(),
           selfie_check_required = false WHERE id = $2`,
        [selfieCheck.id, driver_id]
      );
    } else if (status === 'failed') {
      await pool.query(
        `UPDATE drivers SET selfie_check_required = true WHERE id = $1`,
        [driver_id]
      );
    }

    res.status(status === 'passed' ? 200 : 422).json({
      status,
      passed: status === 'passed',
      match_score:    matchScore,
      liveness_score: livenessScore,
      failure_reason: failureReason,
      selfie_check_id: selfieCheck.id,
      message: status === 'passed'
        ? 'Identity verified — you can go online'
        : status === 'manual_review'
          ? 'Your selfie has been flagged for manual review. A MOBO agent will respond shortly.'
          : `Verification failed: ${failureReason}`,
    });
  } catch (err) {
    logger.error({ err }, '[SelfieCheck] submitSelfieCheck error');
    res.status(500).json({ error: err.message });
  }
};

// ── GET /admin/selfie-checks — Admin lists recent selfie checks ───────────────
const listSelfieChecks = async (req, res) => {
  try {
    const { status, page = 1, limit = 25 } = req.query;
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT sc.*, u.full_name AS driver_name, u.phone AS driver_phone
       FROM driver_selfie_checks sc
       JOIN users u ON u.id = sc.user_id
       WHERE ($1::text IS NULL OR sc.status = $1)
       ORDER BY sc.checked_at DESC
       LIMIT $2 OFFSET $3`,
      [status || null, limit, offset]
    );

    res.json({ selfie_checks: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── PATCH /admin/selfie-checks/:id/review — Admin manually clears a check ───
const adminReviewSelfie = async (req, res) => {
  try {
    const { id } = req.params;
    const { decision, notes } = req.body; // decision: 'passed' | 'failed'

    if (!['passed', 'failed'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be passed or failed' });
    }

    const updated = await pool.query(
      `UPDATE driver_selfie_checks SET status = $1, failure_reason = $2, updated_at = NOW()
       WHERE id = $3 AND status = 'manual_review' RETURNING *`,
      [decision, notes || null, id]
    );
    if (!updated.rows[0]) return res.status(404).json({ error: 'Check not found or not in manual_review' });

    if (decision === 'passed') {
      await pool.query(
        `UPDATE drivers SET last_selfie_check_id = $1, last_selfie_passed_at = NOW(),
           selfie_check_required = false WHERE id = $2`,
        [id, updated.rows[0].driver_id]
      );
    } else {
      await pool.query(
        `UPDATE drivers SET selfie_check_required = true WHERE id = $1`,
        [updated.rows[0].driver_id]
      );
    }

    res.json({ selfie_check: updated.rows[0], message: `Selfie check ${decision} by admin` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getSelfieCheckStatus, submitSelfieCheck, listSelfieChecks, adminReviewSelfie };

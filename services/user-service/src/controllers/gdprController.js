'use strict';

/**
 * GDPR Right to Erasure (Article 17)
 * POST /users/me/erase — user requests deletion of their account and all personal data
 * POST /admin/users/:id/erase — admin executes erasure after verification
 */

const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

/**
 * POST /users/me/erase
 * User requests erasure of their own account.
 * Creates an erasure request — actual deletion is processed async.
 */
const requestErasure = async (req, res) => {
  const userId = req.user.id;
  const { reason } = req.body;

  try {
    // Check for active rides
    const activeRide = await db.query(
      `SELECT id FROM rides WHERE rider_id = $1 AND status IN ('requested','accepted','arriving','in_progress')`,
      [userId]
    );
    if (activeRide.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete account with an active ride in progress',
      });
    }

    // Check for outstanding balance
    const balance = await db.query(
      'SELECT wallet_balance FROM users WHERE id = $1',
      [userId]
    );
    if ((balance.rows[0]?.wallet_balance || 0) > 0) {
      return res.status(409).json({
        success: false,
        message: 'Please withdraw your wallet balance before deleting your account',
      });
    }

    // Create erasure request
    const request = await db.query(
      `INSERT INTO gdpr_erasure_requests (user_id, reason, status)
       VALUES ($1, $2, 'pending')
       RETURNING id, status, created_at`,
      [userId, reason || 'User-requested account deletion']
    );

    // Also log to gdpr_deletion_requests if it exists (from migration_020)
    await db.query(
      `INSERT INTO gdpr_deletion_requests (user_id, reason, status)
       VALUES ($1, $2, 'pending')
       ON CONFLICT DO NOTHING`,
      [userId, reason || 'User-requested account deletion']
    ).catch(() => {}); // non-fatal if table doesn't exist

    res.json({
      success: true,
      message: 'Your erasure request has been received. Your account will be deleted within 30 days.',
      data: {
        request_id:  request.rows[0].id,
        status:      'pending',
        requested_at: request.rows[0].created_at,
        expected_completion: new Date(Date.now() + 30 * 86400000).toISOString(),
      },
    });
  } catch (err) {
    console.error('[GDPRController] requestErasure error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to submit erasure request' });
  }
};

/**
 * POST /admin/users/:id/erase  (admin-triggered immediate erasure)
 * Anonymises all PII in the database while retaining transaction records
 * (required by financial regulations — 7-year retention for payments).
 */
const executeErasure = async (req, res) => {
  const { id: targetUserId } = req.params;
  const adminId = req.user.id;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // 1. Anonymise user PII
    const anonId = uuidv4().replace(/-/g, '').substring(0, 12);
    await client.query(
      `UPDATE users SET
         full_name        = 'Deleted User',
         phone            = 'deleted_' || $2,
         email            = NULL,
         phone_encrypted  = NULL,
         phone_hash       = NULL,
         dob_encrypted    = NULL,
         date_of_birth    = NULL,
         profile_picture  = NULL,
         push_token       = NULL,
         status           = 'deleted',
         updated_at       = NOW()
       WHERE id = $1`,
      [targetUserId, anonId]
    );

    // 2. Remove location history
    await client.query('DELETE FROM locations WHERE user_id = $1', [targetUserId]);

    // 3. Remove trusted contacts
    await client.query('DELETE FROM trusted_contacts WHERE user_id = $1', [targetUserId]);

    // 4. Remove saved places
    await client.query('DELETE FROM saved_places WHERE user_id = $1', [targetUserId]);

    // 5. Remove notifications
    await client.query('DELETE FROM notifications WHERE user_id = $1', [targetUserId]);

    // 6. Remove device tokens / sessions
    await client.query(
      `UPDATE users SET push_token = NULL WHERE id = $1`,
      [targetUserId]
    );

    // 7. Anonymise payment methods (keep structure for dispute resolution, remove PII)
    await client.query(
      `UPDATE payment_methods SET
         phone            = NULL,
         phone_encrypted  = NULL,
         phone_hash       = NULL,
         card_last4       = 'XXXX',
         updated_at       = NOW()
       WHERE user_id = $1`,
      [targetUserId]
    );

    // 8. Anonymise driver record if exists
    await client.query(
      `UPDATE drivers SET
         license_number             = 'DELETED',
         license_number_encrypted   = NULL,
         license_number_hash        = NULL
       WHERE user_id = $1`,
      [targetUserId]
    );

    // 9. Mark erasure request as completed
    await client.query(
      `UPDATE gdpr_erasure_requests
       SET status = 'completed', completed_at = NOW()
       WHERE user_id = $1 AND status IN ('pending','processing')`,
      [targetUserId]
    );

    // 10. Audit log the erasure
    await client.query(
      `INSERT INTO admin_audit_logs
         (admin_id, action, resource_type, resource_id, new_value)
       VALUES ($1, 'gdpr.erasure', 'user', $2, $3)`,
      [adminId, targetUserId, JSON.stringify({ erasure_type: 'full_anonymisation', executed_by: adminId })]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'User data has been anonymised in compliance with GDPR Article 17',
      data: { user_id: targetUserId, completed_at: new Date().toISOString() },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[GDPRController] executeErasure error:', err.message);
    res.status(500).json({ success: false, message: 'Erasure failed — rolled back' });
  } finally {
    client.release();
  }
};

/**
 * GET /admin/users/erasure-requests — list pending erasure requests
 */
const listErasureRequests = async (req, res) => {
  try {
    const { status = 'pending', limit = 50, offset = 0 } = req.query;
    const result = await db.query(
      `SELECT er.*, u.full_name, u.email
       FROM gdpr_erasure_requests er
       LEFT JOIN users u ON u.id = er.user_id
       WHERE er.status = $1
       ORDER BY er.created_at ASC
       LIMIT $2 OFFSET $3`,
      [status, parseInt(limit, 10), parseInt(offset, 10)]
    );
    res.json({ success: true, data: result.rows, total: result.rowCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { requestErasure, executeErasure, listErasureRequests };

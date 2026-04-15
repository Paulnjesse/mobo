const logger = require('../utils/logger');
/**
 * backgroundCheckController.js
 * Driver background check management — admin-only endpoints + scheduled cleanup.
 *
 * Routes (registered in profile.js):
 *   PATCH /drivers/:id/background-check                — updateBackgroundCheck  (admin)
 *   GET   /drivers/background-checks/expired           — getExpiredBackgroundChecks (admin)
 *
 * Internal (scheduled):
 *   markBackgroundCheckExpired()  — runs daily via setInterval on startup
 */

const db = require('../config/database');

// ── Controllers ──────────────────────────────────────────────────────────────

/**
 * PATCH /drivers/:id/background-check  (admin only)
 * Body: { status, provider, notes, check_date }
 *
 * Sets the background check result for a driver and auto-calculates
 * the expiry date as 12 months from check_date.
 */
const updateBackgroundCheck = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { id } = req.params; // driver UUID (drivers.id)
    const { status, provider, notes, check_date } = req.body;

    const validStatuses = ['not_checked', 'clear', 'flagged', 'pending', 'expired'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `status is required and must be one of: ${validStatuses.join(', ')}`
      });
    }

    if (!check_date) {
      return res.status(400).json({ success: false, message: 'check_date is required (YYYY-MM-DD)' });
    }

    // Validate check_date format
    const checkDateObj = new Date(check_date);
    if (isNaN(checkDateObj.getTime())) {
      return res.status(400).json({ success: false, message: 'check_date is not a valid date' });
    }

    // Verify driver exists
    const driverCheck = await db.query('SELECT id FROM drivers WHERE id = $1', [id]);
    if (driverCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Driver not found' });
    }

    // Update driver background check fields; expiry = check_date + 12 months
    const result = await db.query(
      `UPDATE drivers
       SET background_check_date       = $1::DATE,
           background_check_expires_at = ($1::DATE + INTERVAL '12 months')::DATE,
           background_check_status     = $2,
           background_check_provider   = $3,
           background_check_notes      = $4
       WHERE id = $5
       RETURNING id, user_id,
                 background_check_date,
                 background_check_expires_at,
                 background_check_status,
                 background_check_provider,
                 background_check_notes`,
      [check_date, status, provider || null, notes || null, id]
    );

    return res.json({
      success: true,
      message: 'Background check updated',
      data: result.rows[0]
    });
  } catch (err) {
    logger.error('[BackgroundCheck updateBackgroundCheck]', err);
    return res.status(500).json({ success: false, message: 'Failed to update background check' });
  }
};

/**
 * GET /drivers/background-checks/expired  (admin only)
 * Returns drivers whose background check has expired, is expiring within 30 days,
 * or has never been done, including a computed days_until_expiry field.
 */
const getExpiredBackgroundChecks = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const result = await db.query(
      `SELECT
         d.id                        AS driver_id,
         d.user_id,
         u.full_name,
         u.phone,
         u.email,
         d.background_check_date,
         d.background_check_expires_at,
         d.background_check_status,
         d.background_check_provider,
         d.background_check_notes,
         -- Compute days remaining (NULL if no expiry set)
         CASE
           WHEN d.background_check_expires_at IS NOT NULL
           THEN (d.background_check_expires_at - CURRENT_DATE)
           ELSE NULL
         END AS days_until_expiry
       FROM drivers d
       JOIN users u ON d.user_id = u.id
       WHERE
         d.background_check_status IN ('not_checked', 'expired')
         OR d.background_check_expires_at < (CURRENT_DATE + INTERVAL '30 days')
       ORDER BY
         d.background_check_expires_at ASC NULLS FIRST,
         u.full_name ASC`
    );

    return res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (err) {
    logger.error('[BackgroundCheck getExpiredBackgroundChecks]', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve expired background checks' });
  }
};

// ── Internal scheduled function ───────────────────────────────────────────────

/**
 * markBackgroundCheckExpired()
 * Auto-sets background_check_status = 'expired' for any drivers whose
 * background_check_expires_at has passed and status is still 'clear' or 'pending'.
 * Intended to be invoked on startup and then on a daily interval.
 */
const markBackgroundCheckExpired = async () => {
  try {
    const result = await db.query(
      `UPDATE drivers
       SET background_check_status = 'expired'
       WHERE background_check_expires_at < CURRENT_DATE
         AND background_check_status IN ('clear', 'pending')
       RETURNING id`
    );

    if (result.rows.length > 0) {
      logger.info(
        `[BackgroundCheck] Auto-expired ${result.rows.length} driver background check(s)`
      );
    }
  } catch (err) {
    logger.warn('[BackgroundCheck markBackgroundCheckExpired]', err.message);
  }
};

// ── Schedule daily cleanup on module load ─────────────────────────────────────
// Run once immediately, then every 24 hours
markBackgroundCheckExpired();
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
setInterval(markBackgroundCheckExpired, TWENTY_FOUR_HOURS_MS);

// ── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  updateBackgroundCheck,
  getExpiredBackgroundChecks,
  markBackgroundCheckExpired
};

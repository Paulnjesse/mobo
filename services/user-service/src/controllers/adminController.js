'use strict';
/**
 * adminController.js — Admin dashboard & user/driver management
 *
 * Implements the endpoints called by the admin React dashboard:
 *   GET  /admin/dashboard/stats
 *   GET  /admin/dashboard/revenue
 *   GET  /admin/dashboard/rides-chart
 *   GET  /admin/dashboard/payment-methods
 *   GET  /admin/dashboard/recent-rides
 *   GET  /admin/dashboard/recent-users
 *
 *   GET    /admin/users
 *   GET    /admin/users/stats
 *   GET    /admin/users/:id
 *   PATCH  /admin/users/:id/suspend
 *   PATCH  /admin/users/:id/unsuspend
 *   DELETE /admin/users/:id           → soft-archive
 *
 *   GET    /admin/drivers
 *   GET    /admin/drivers/stats
 *   GET    /admin/drivers/:id
 *   PATCH  /admin/drivers/:id/approve
 *   PATCH  /admin/drivers/:id/suspend
 *   PATCH  /admin/drivers/:id/unsuspend
 *
 *   GET  /admin/map/drivers
 *
 *   POST /admin/notifications/send
 *   GET  /admin/notifications/history
 *   GET  /admin/notifications/stats
 *
 *   GET /admin/settings
 *   PUT /admin/settings
 */

const db     = require('../config/database');
const logger = require('../utils/logger');
const smsService  = require('../services/sms');
const { sendPushNotification } = require('../services/pushNotifications');
const checkr = require('../services/checkr');

// ── Dashboard ──────────────────────────────────────────────────────────────────

const getStats = async (req, res) => {
  try {
    const [userRow, driverRow, rideRow, revenueRow] = await Promise.all([
      db.query(`SELECT COUNT(*) FROM users WHERE is_archived = false`),
      db.query(`SELECT COUNT(*) FROM drivers d JOIN users u ON u.id = d.user_id WHERE u.is_archived = false`),
      db.query(`SELECT COUNT(*) FROM rides WHERE status IN ('accepted','arriving','in_progress')`),
      db.query(
        `SELECT COALESCE(SUM(amount),0) AS total FROM payments
         WHERE status = 'completed' AND created_at >= CURRENT_DATE`
      ),
    ]);
    res.json({
      success: true,
      data: {
        totalUsers:   parseInt(userRow.rows[0].count,    10),
        totalDrivers: parseInt(driverRow.rows[0].count,  10),
        activeRides:  parseInt(rideRow.rows[0].count,    10),
        revenueToday: parseInt(revenueRow.rows[0].total, 10),
      },
    });
  } catch (err) {
    logger.error('[AdminCtrl] getStats error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to load stats' });
  }
};

const getRevenueChart = async (req, res) => {
  const days = Math.min(parseInt(req.query.days, 10) || 7, 90);
  try {
    const result = await db.query(
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
    logger.error('[AdminCtrl] getRevenueChart error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to load revenue chart' });
  }
};

const getRidesChart = async (req, res) => {
  const days = Math.min(parseInt(req.query.days, 10) || 7, 90);
  try {
    const result = await db.query(
      `SELECT DATE(created_at) AS date,
              COUNT(*) AS rides
       FROM rides
       WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [days]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('[AdminCtrl] getRidesChart error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to load rides chart' });
  }
};

const getPaymentMethods = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT payment_method AS name,
              COUNT(*) AS value
       FROM payments
       WHERE status = 'completed'
       GROUP BY payment_method
       ORDER BY value DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('[AdminCtrl] getPaymentMethods error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to load payment methods' });
  }
};

const getRecentRides = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT r.id,
              rider.full_name  AS rider,
              drv_u.full_name  AS driver,
              r.ride_type      AS type,
              r.status,
              r.pickup_city    AS city,
              r.final_fare     AS fare
       FROM rides r
       LEFT JOIN users rider ON rider.id = r.rider_id
       LEFT JOIN drivers d   ON d.id = r.driver_id
       LEFT JOIN users drv_u ON drv_u.id = d.user_id
       ORDER BY r.created_at DESC
       LIMIT 20`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('[AdminCtrl] getRecentRides error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to load recent rides' });
  }
};

const getRecentUsers = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, full_name AS name, phone, email, role, country_code AS country,
              created_at AS joined
       FROM users
       WHERE is_archived = false
       ORDER BY created_at DESC
       LIMIT 20`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('[AdminCtrl] getRecentUsers error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to load recent users' });
  }
};

// ── Users ──────────────────────────────────────────────────────────────────────

const listUsers = async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit,  10) || 50, 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const role   = req.query.role;
  const search = req.query.search;

  try {
    const params = [limit, offset];
    let where = `WHERE u.is_archived = false`;
    if (role)   { params.push(role);   where += ` AND u.role = $${params.length}`; }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
    }

    const result = await db.query(
      `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.country_code,
              u.is_suspended, u.created_at,
              COUNT(*) OVER() AS total_count
       FROM users u
       ${where}
       ORDER BY u.created_at DESC
       LIMIT $1 OFFSET $2`,
      params
    );

    const total = result.rows[0]?.total_count ? parseInt(result.rows[0].total_count, 10) : 0;
    const users = result.rows.map(({ total_count, ...u }) => u);
    res.json({ success: true, data: users, total, limit, offset });
  } catch (err) {
    logger.error('[AdminCtrl] listUsers error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to list users' });
  }
};

const getUserStats = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE is_archived = false)                          AS total,
         COUNT(*) FILTER (WHERE is_archived = false AND role = 'rider')       AS riders,
         COUNT(*) FILTER (WHERE is_archived = false AND role = 'driver')      AS drivers,
         COUNT(*) FILTER (WHERE is_archived = false AND is_suspended = true)  AS suspended,
         COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)                   AS new_today
       FROM users`
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('[AdminCtrl] getUserStats error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to load user stats' });
  }
};

const getUserById = async (req, res) => {
  const { id } = req.params;
  try {
    const userRow = await db.query(
      `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.country_code,
              u.is_suspended, u.is_active, u.created_at,
              u.wallet_balance, u.referral_code, u.referral_credits
       FROM users u WHERE u.id = $1 AND u.is_archived = false`,
      [id]
    );
    if (!userRow.rows[0]) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: userRow.rows[0] });
  } catch (err) {
    logger.error('[AdminCtrl] getUserById error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to load user' });
  }
};

const suspendUser = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(
      `UPDATE users SET is_suspended = true WHERE id = $1 AND is_archived = false RETURNING id, full_name`,
      [id]
    );
    if (!result.rows[0]) return res.status(404).json({ success: false, message: 'User not found' });
    logger.info('[AdminCtrl] User suspended', { userId: id, adminId: req.user?.id });
    res.json({ success: true, message: 'User suspended', user: result.rows[0] });
  } catch (err) {
    logger.error('[AdminCtrl] suspendUser error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to suspend user' });
  }
};

const unsuspendUser = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(
      `UPDATE users SET is_suspended = false WHERE id = $1 AND is_archived = false RETURNING id, full_name`,
      [id]
    );
    if (!result.rows[0]) return res.status(404).json({ success: false, message: 'User not found' });
    logger.info('[AdminCtrl] User unsuspended', { userId: id, adminId: req.user?.id });
    res.json({ success: true, message: 'User unsuspended', user: result.rows[0] });
  } catch (err) {
    logger.error('[AdminCtrl] unsuspendUser error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to unsuspend user' });
  }
};

const archiveUser = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(
      `UPDATE users SET is_archived = true, archived_at = NOW() WHERE id = $1 RETURNING id`,
      [id]
    );
    if (!result.rows[0]) return res.status(404).json({ success: false, message: 'User not found' });
    logger.info('[AdminCtrl] User archived', { userId: id, adminId: req.user?.id });
    res.json({ success: true, message: 'User archived' });
  } catch (err) {
    logger.error('[AdminCtrl] archiveUser error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to archive user' });
  }
};

// ── Drivers ────────────────────────────────────────────────────────────────────

const listDrivers = async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit,  10) || 50, 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const status = req.query.status; // 'approved','pending','suspended'
  const search = req.query.search;

  try {
    const params = [limit, offset];
    let where = `WHERE u.is_archived = false`;
    if (status === 'approved') where += ` AND d.is_approved = true AND u.is_suspended = false`;
    if (status === 'pending')  where += ` AND d.is_approved = false`;
    if (status === 'suspended') where += ` AND u.is_suspended = true`;
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
    }

    const result = await db.query(
      `SELECT d.id AS driver_id, u.id AS user_id, u.full_name, u.email, u.phone,
              u.country_code, u.is_suspended, d.is_approved, d.rating,
              d.total_trips_today, d.total_earnings, u.created_at,
              COUNT(*) OVER() AS total_count
       FROM drivers d
       JOIN users u ON u.id = d.user_id
       ${where}
       ORDER BY u.created_at DESC
       LIMIT $1 OFFSET $2`,
      params
    );

    const total   = result.rows[0]?.total_count ? parseInt(result.rows[0].total_count, 10) : 0;
    const drivers = result.rows.map(({ total_count, ...d }) => d);
    res.json({ success: true, data: drivers, total, limit, offset });
  } catch (err) {
    logger.error('[AdminCtrl] listDrivers error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to list drivers' });
  }
};

const getDriverStats = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         COUNT(*)                                       AS total,
         COUNT(*) FILTER (WHERE d.is_approved = true)  AS approved,
         COUNT(*) FILTER (WHERE d.is_approved = false) AS pending,
         COUNT(*) FILTER (WHERE u.is_suspended = true) AS suspended,
         COUNT(*) FILTER (WHERE u.created_at >= CURRENT_DATE) AS new_today
       FROM drivers d
       JOIN users u ON u.id = d.user_id
       WHERE u.is_archived = false`
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('[AdminCtrl] getDriverStats error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to load driver stats' });
  }
};

const getDriverById = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(
      `SELECT d.id AS driver_id, u.id AS user_id, u.full_name, u.email, u.phone,
              u.country_code, u.is_suspended, u.wallet_balance,
              d.is_approved, d.rating, d.total_trips_today, d.total_earnings,
              d.license_number_encrypted, d.vehicle_make, d.vehicle_model,
              d.vehicle_plate, d.vehicle_year, u.created_at
       FROM drivers d
       JOIN users u ON u.id = d.user_id
       WHERE d.id = $1 AND u.is_archived = false`,
      [id]
    );
    if (!result.rows[0]) return res.status(404).json({ success: false, message: 'Driver not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('[AdminCtrl] getDriverById error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to load driver' });
  }
};

const approveDriver = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(
      `UPDATE drivers
       SET is_approved = true,
           bgc_status  = CASE
             WHEN bgc_status NOT IN ('passed','failed') THEN 'manually_approved'
             ELSE bgc_status
           END
       WHERE id = $1
       RETURNING id, user_id, bgc_status`,
      [id]
    );
    if (!result.rows[0]) return res.status(404).json({ success: false, message: 'Driver not found' });

    const { user_id: userId, bgc_status } = result.rows[0];
    logger.info('[AdminCtrl] Driver approved', { driverId: id, adminId: req.user?.id, bgc_status });

    // Notify driver via SMS + push notification (fire-and-forget — non-blocking)
    ;(async () => {
      try {
        const userRow = await db.query(
          `SELECT phone, push_token, full_name, email FROM users WHERE id = $1`,
          [userId]
        );
        const user = userRow.rows[0];
        if (!user) return;

        const approvalMsg = `Congratulations ${user.full_name || 'Driver'}! Your MOBO driver account has been approved. Open the app to go online and start accepting rides.`;

        if (user.phone) {
          smsService.sendSms(user.phone, approvalMsg).catch((err) =>
            logger.warn('[AdminCtrl] Approval SMS failed', { err: err.message, userId })
          );
        }
        if (user.push_token) {
          sendPushNotification(
            user.push_token,
            'Account Approved!',
            'Your MOBO driver account is approved. Tap to go online.',
            { type: 'driver_approved', driver_id: id }
          ).catch((err) =>
            logger.warn('[AdminCtrl] Approval push failed', { err: err.message, userId })
          );
        }

        // Auto-trigger Checkr BGC if not yet started (runs in background, non-blocking)
        const driverRow = await db.query(
          `SELECT bgc_status FROM drivers WHERE id = $1`, [id]
        );
        if (driverRow.rows[0]?.bgc_status === 'not_started' || driverRow.rows[0]?.bgc_status === 'manually_approved') {
          triggerCheckrBgc(id, user).catch(() => {});
        }
      } catch (notifyErr) {
        logger.warn('[AdminCtrl] Approval notification error', { err: notifyErr.message });
      }
    })();

    res.json({ success: true, message: 'Driver approved', bgc_status });
  } catch (err) {
    logger.error('[AdminCtrl] approveDriver error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to approve driver' });
  }
};

/**
 * Trigger Checkr BGC for a driver — internal helper (also called from
 * POST /admin/drivers/:id/bgc endpoint for manual re-trigger).
 */
async function triggerCheckrBgc(driverId, user) {
  if (!user) {
    const driverRow = await db.query(
      `SELECT u.full_name, u.email, u.phone, d.user_id
       FROM drivers d JOIN users u ON u.id = d.user_id
       WHERE d.id = $1`, [driverId]
    );
    user = driverRow.rows[0];
  }
  if (!user) return;

  const nameParts = (user.full_name || '').split(' ');
  const bgcResult = await checkr.initiateBackgroundCheck({
    firstName: nameParts[0] || '',
    lastName:  nameParts.slice(1).join(' ') || nameParts[0] || '',
    email:     user.email,
    phone:     user.phone,
  });

  if (bgcResult.success) {
    await db.query(
      `UPDATE drivers
       SET bgc_status = 'submitted',
           bgc_invitation_url = $2,
           bgc_submitted_at   = NOW()
       WHERE id = $1`,
      [driverId, bgcResult.invitationUrl || null]
    );
    logger.info('[AdminCtrl] Checkr BGC initiated', {
      driverId, mock: bgcResult.mock, invitationUrl: bgcResult.invitationUrl,
    });
    // Notify driver to complete the BGC form
    if (user.push_token && bgcResult.invitationUrl) {
      sendPushNotification(
        user.push_token,
        'Complete your background check',
        'Please complete your Checkr background check to activate your account.',
        { type: 'bgc_invitation', url: bgcResult.invitationUrl }
      ).catch(() => {});
    }
  } else {
    logger.warn('[AdminCtrl] Checkr BGC initiation failed', { driverId, error: bgcResult.error });
  }
}

/** POST /admin/drivers/:id/bgc — manually (re-)trigger BGC */
const triggerDriverBgc = async (req, res) => {
  const { id } = req.params;
  try {
    const driverRow = await db.query(
      `SELECT d.id, d.bgc_status, u.full_name, u.email, u.phone, u.push_token
       FROM drivers d JOIN users u ON u.id = d.user_id WHERE d.id = $1`, [id]
    );
    if (!driverRow.rows[0]) return res.status(404).json({ success: false, message: 'Driver not found' });

    await triggerCheckrBgc(id, driverRow.rows[0]);
    const updated = await db.query(`SELECT bgc_status, bgc_invitation_url, bgc_submitted_at FROM drivers WHERE id = $1`, [id]);
    res.json({ success: true, ...updated.rows[0] });
  } catch (err) {
    logger.error('[AdminCtrl] triggerDriverBgc error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to trigger BGC' });
  }
};

/** GET /admin/drivers/:id/bgc — get BGC status */
const getDriverBgcStatus = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(
      `SELECT bgc_status, bgc_report_id, bgc_invitation_url, bgc_submitted_at, bgc_completed_at
       FROM drivers WHERE id = $1`, [id]
    );
    if (!result.rows[0]) return res.status(404).json({ success: false, message: 'Driver not found' });
    res.json({ success: true, ...result.rows[0] });
  } catch (err) {
    logger.error('[AdminCtrl] getDriverBgcStatus error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to load BGC status' });
  }
};

/** POST /webhooks/checkr — Checkr webhook handler */
const handleCheckrWebhook = async (req, res) => {
  try {
    const rawBody  = req.rawBody || JSON.stringify(req.body); // raw body for sig verification
    const sig      = req.headers['x-checkr-signature'];
    if (!checkr.verifyWebhookSignature(rawBody, sig)) {
      logger.warn('[CheckrWebhook] Invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { type, data } = req.body;
    logger.info('[CheckrWebhook] Event received', { type });

    if (type === 'report.completed' || type === 'report.pre_adverse_action') {
      const report   = data?.object;
      const reportId = report?.id;
      const status   = checkr.mapCheckrResultToStatus(report?.result, report?.adjudication);

      const driverRow = await db.query(
        `SELECT id FROM drivers WHERE bgc_report_id = $1`, [reportId]
      );

      // Also try matching by candidate ID if report ID not stored yet
      let driverId = driverRow.rows[0]?.id;
      if (!driverId && report?.candidate_id) {
        const byCandidate = await db.query(
          `SELECT d.id FROM drivers d
           JOIN users u ON u.id = d.user_id
           WHERE u.email = (SELECT email FROM checkr_candidates WHERE candidate_id = $1 LIMIT 1)
           LIMIT 1`,
          [report.candidate_id]
        );
        driverId = byCandidate.rows[0]?.id;
      }

      if (driverId) {
        await db.query(
          `UPDATE drivers
           SET bgc_status       = $2,
               bgc_report_id    = $3,
               bgc_completed_at = NOW()
           WHERE id = $1`,
          [driverId, status, reportId]
        );
        logger.info('[CheckrWebhook] Driver BGC updated', { driverId, status, reportId });

        // Notify driver of BGC result
        const notifRow = await db.query(
          `SELECT u.push_token, u.phone, u.full_name FROM drivers d JOIN users u ON u.id = d.user_id WHERE d.id = $1`,
          [driverId]
        );
        const u = notifRow.rows[0];
        if (u?.push_token) {
          const passed = status === 'passed';
          sendPushNotification(
            u.push_token,
            passed ? 'Background check passed!' : 'Background check update',
            passed
              ? 'Your background check passed. Your account is now fully verified.'
              : 'Your background check requires further review. Our team will contact you.',
            { type: 'bgc_result', status }
          ).catch(() => {});
        }
      }
    }

    res.json({ received: true });
  } catch (err) {
    logger.error('[CheckrWebhook] Error processing event', { err: err.message });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

const suspendDriver = async (req, res) => {
  const { id } = req.params;
  try {
    const driver = await db.query(`SELECT user_id FROM drivers WHERE id = $1`, [id]);
    if (!driver.rows[0]) return res.status(404).json({ success: false, message: 'Driver not found' });
    await db.query(`UPDATE users SET is_suspended = true WHERE id = $1`, [driver.rows[0].user_id]);
    logger.info('[AdminCtrl] Driver suspended', { driverId: id, adminId: req.user?.id });
    res.json({ success: true, message: 'Driver suspended' });
  } catch (err) {
    logger.error('[AdminCtrl] suspendDriver error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to suspend driver' });
  }
};

const unsuspendDriver = async (req, res) => {
  const { id } = req.params;
  try {
    const driver = await db.query(`SELECT user_id FROM drivers WHERE id = $1`, [id]);
    if (!driver.rows[0]) return res.status(404).json({ success: false, message: 'Driver not found' });
    await db.query(`UPDATE users SET is_suspended = false WHERE id = $1`, [driver.rows[0].user_id]);
    logger.info('[AdminCtrl] Driver unsuspended', { driverId: id, adminId: req.user?.id });
    res.json({ success: true, message: 'Driver unsuspended' });
  } catch (err) {
    logger.error('[AdminCtrl] unsuspendDriver error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to unsuspend driver' });
  }
};

// ── Live map ───────────────────────────────────────────────────────────────────

const getOnlineDrivers = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT d.id, u.full_name AS name, d.last_lat AS lat, d.last_lng AS lng,
              d.last_seen, d.vehicle_make, d.vehicle_model, d.vehicle_plate,
              d.rating, d.total_trips_today
       FROM drivers d
       JOIN users u ON u.id = d.user_id
       WHERE d.is_online = true
         AND d.last_seen > NOW() - INTERVAL '5 minutes'
         AND u.is_archived = false
         AND u.is_suspended = false`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('[AdminCtrl] getOnlineDrivers error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to load online drivers' });
  }
};

// ── Notifications ──────────────────────────────────────────────────────────────

const sendNotification = async (req, res) => {
  const { title, body, target, role } = req.body;
  if (!title || !body) {
    return res.status(400).json({ success: false, message: 'title and body are required' });
  }
  try {
    // Record notification in admin_notifications table for audit trail
    await db.query(
      `INSERT INTO admin_notifications (title, body, target, target_role, sent_by, sent_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT DO NOTHING`,
      [title, body, target || 'all', role || null, req.user?.id]
    );
    // In production, this triggers a push notification via FCM / Expo Push
    // For now returns success — actual delivery handled by background worker
    logger.info('[AdminCtrl] Notification queued', { title, target, adminId: req.user?.id });
    res.json({ success: true, message: 'Notification queued for delivery' });
  } catch (err) {
    logger.error('[AdminCtrl] sendNotification error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to send notification' });
  }
};

const getNotificationHistory = async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit,  10) || 20, 100);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  try {
    const result = await db.query(
      `SELECT an.id, an.title, an.body, an.target, an.target_role, an.sent_at,
              u.full_name AS sent_by_name
       FROM admin_notifications an
       LEFT JOIN users u ON u.id = an.sent_by
       ORDER BY an.sent_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('[AdminCtrl] getNotificationHistory error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to load notification history' });
  }
};

const getNotificationStats = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         COUNT(*)                                                           AS total_sent,
         COUNT(*) FILTER (WHERE sent_at >= CURRENT_DATE)                   AS sent_today,
         COUNT(*) FILTER (WHERE target = 'all')                            AS broadcast,
         COUNT(*) FILTER (WHERE target_role = 'driver')                    AS to_drivers,
         COUNT(*) FILTER (WHERE target_role = 'rider')                     AS to_riders
       FROM admin_notifications`
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('[AdminCtrl] getNotificationStats error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to load notification stats' });
  }
};

// ── Settings ───────────────────────────────────────────────────────────────────

const getSettings = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT key, value, updated_at FROM system_settings ORDER BY key ASC`
    );
    // Return as object map for easy dashboard consumption
    const settings = {};
    for (const row of result.rows) settings[row.key] = row.value;
    res.json({ success: true, data: settings });
  } catch (err) {
    logger.error('[AdminCtrl] getSettings error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to load settings' });
  }
};

const updateSettings = async (req, res) => {
  const updates = req.body; // { key: value, ... }
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return res.status(400).json({ success: false, message: 'Body must be a key-value object' });
  }
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    for (const [key, value] of Object.entries(updates)) {
      await client.query(
        `INSERT INTO system_settings (key, value, updated_by, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
        [key, String(value), req.user?.id]
      );
    }
    await client.query('COMMIT');
    logger.info('[AdminCtrl] Settings updated', { keys: Object.keys(updates), adminId: req.user?.id });
    res.json({ success: true, message: 'Settings updated' });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('[AdminCtrl] updateSettings error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to update settings' });
  } finally {
    client.release();
  }
};

module.exports = {
  // Dashboard
  getStats, getRevenueChart, getRidesChart, getPaymentMethods, getRecentRides, getRecentUsers,
  // Users
  listUsers, getUserStats, getUserById, suspendUser, unsuspendUser, archiveUser,
  // Drivers
  listDrivers, getDriverStats, getDriverById, approveDriver, suspendDriver, unsuspendDriver,
  // BGC
  triggerDriverBgc, getDriverBgcStatus, handleCheckrWebhook,
  // Map
  getOnlineDrivers,
  // Notifications
  sendNotification, getNotificationHistory, getNotificationStats,
  // Settings
  getSettings, updateSettings,
};

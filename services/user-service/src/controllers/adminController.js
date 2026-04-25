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
      `UPDATE drivers SET is_approved = true WHERE id = $1
       RETURNING id, user_id`,
      [id]
    );
    if (!result.rows[0]) return res.status(404).json({ success: false, message: 'Driver not found' });

    const { user_id: userId } = result.rows[0];
    logger.info('[AdminCtrl] Driver approved', { driverId: id, adminId: req.user?.id });

    // Notify driver via SMS + push notification (fire-and-forget — non-blocking)
    ;(async () => {
      try {
        const userRow = await db.query(
          `SELECT phone, push_token, full_name FROM users WHERE id = $1`,
          [userId]
        );
        const user = userRow.rows[0];
        if (!user) return;

        const approvalMsg = `Congratulations ${user.full_name || 'Driver'}! Your MOBO driver account has been approved. Open the app to go online and start accepting rides.`;

        // SMS notification
        if (user.phone) {
          smsService.sendSms(user.phone, approvalMsg).catch((err) =>
            logger.warn('[AdminCtrl] Approval SMS failed', { err: err.message, userId })
          );
        }

        // Push notification
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
      } catch (notifyErr) {
        logger.warn('[AdminCtrl] Approval notification error', { err: notifyErr.message });
      }
    })();

    res.json({ success: true, message: 'Driver approved' });
  } catch (err) {
    logger.error('[AdminCtrl] approveDriver error', { err: err.message });
    res.status(500).json({ success: false, message: 'Failed to approve driver' });
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
  // Map
  getOnlineDrivers,
  // Notifications
  sendNotification, getNotificationHistory, getNotificationStats,
  // Settings
  getSettings, updateSettings,
};

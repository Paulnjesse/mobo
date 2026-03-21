/**
 * sosController.js
 * POST /rides/:id/sos
 *
 * Triggered when a rider or driver activates the in-app SOS button.
 * Actions performed:
 *   1. Validates the ride and the caller's involvement
 *   2. Inserts an escalated ride_checkin with checkin_type = 'sos'
 *   3. Inserts an admin notification
 *   4. SMS-es the user's trusted contacts via Twilio (console.log fallback)
 *   5. Emits `sos_triggered` to the ride room via Socket.IO
 */

const pool = require('../config/database');
const { sendSOSSMS } = require('../utils/notifyContacts');

const triggerSOS = async (req, res) => {
  const { id: rideId } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    // ── 1. Verify ride exists and caller is involved ─────────────────────
    const rideResult = await pool.query(
      `SELECT id, rider_id, driver_id, status,
              pickup_address, dropoff_address
       FROM rides WHERE id = $1`,
      [rideId]
    );

    if (rideResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }

    const ride = rideResult.rows[0];
    const isRider  = String(ride.rider_id)  === String(userId);
    const isDriver = String(ride.driver_id) === String(userId);
    const isAdmin  = userRole === 'admin';

    if (!isRider && !isDriver && !isAdmin) {
      return res.status(403).json({ success: false, message: 'You are not part of this ride' });
    }

    // ── 2. Insert escalated SOS checkin ──────────────────────────────────
    await pool.query(
      `INSERT INTO ride_checkins (ride_id, user_id, checkin_type, escalated, escalated_at)
       VALUES ($1, $2, 'sos', true, NOW())`,
      [rideId, userId]
    );

    // ── 3. Insert admin notification ─────────────────────────────────────
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       SELECT id, 'sos_alert',
              'SOS Alert — Ride ' || $1,
              'A user triggered SOS on ride ' || $1 || '. Immediate attention required.',
              $2::jsonb
       FROM users WHERE role = 'admin' AND is_active = true`,
      [
        rideId,
        JSON.stringify({ rideId, triggeredBy: userId, role: userRole, timestamp: new Date().toISOString() }),
      ]
    );

    // ── 4. SMS trusted contacts ───────────────────────────────────────────
    // Fetch the caller's trusted contacts that have notify_on_sos = true
    const contactsResult = await pool.query(
      `SELECT tc.name, tc.phone
       FROM trusted_contacts tc
       WHERE tc.user_id = $1 AND tc.notify_on_sos = true`,
      [userId]
    );

    if (contactsResult.rows.length > 0) {
      // Fire-and-forget — don't block the response on SMS delivery
      sendSOSSMS({
        contacts: contactsResult.rows,
        triggeredBy: req.user.full_name || req.user.phone || 'A MOBO user',
        rideId,
        pickupAddress: ride.pickup_address || 'Unknown location',
      }).catch((err) => console.warn('[SOS] SMS error:', err.message));
    }

    // ── 5. Emit socket event to ride room ────────────────────────────────
    const io = req.app.get('io');
    if (io) {
      io.of('/rides').to(`ride:${rideId}`).emit('sos_triggered', {
        rideId,
        triggeredBy: userId,
        role: userRole,
        timestamp: Date.now(),
      });
    }

    return res.json({
      success: true,
      message: 'SOS triggered. Emergency contacts and MOBO safety team have been notified.',
    });
  } catch (err) {
    console.error('[SOS] triggerSOS error:', err);
    return res.status(500).json({ success: false, message: 'Failed to trigger SOS' });
  }
};

module.exports = { triggerSOS };

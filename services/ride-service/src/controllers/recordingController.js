/**
 * recordingController.js
 * Ride audio recording management.
 * The mobile app uploads audio to Supabase Storage and sends back the URL.
 *
 * Routes (registered in rides.js):
 *   POST /rides/:id/recording   — saveRecording  (authenticated, rider or driver)
 *   GET  /rides/:id/recordings  — getRecordings  (admin OR parties of the ride)
 *
 * Internal:
 *   deleteExpiredRecordings()   — scheduled cleanup (called on startup + daily)
 */

const pool = require('../config/database');

// ── Controllers ──────────────────────────────────────────────────────────────

/**
 * POST /rides/:id/recording  (authenticated)
 * Body: { storage_url, duration_sec, file_size_kb, role ('rider'|'driver') }
 *
 * The mobile app uploads audio to Supabase Storage and submits the public URL here.
 * Recording expires in 30 days.
 */
const saveRecording = async (req, res) => {
  try {
    const { id: rideId } = req.params;
    const userId = req.user.id;
    const { storage_url, duration_sec, file_size_kb, role } = req.body;

    if (!storage_url) {
      return res.status(400).json({ success: false, message: 'storage_url is required' });
    }

    const validRoles = ['rider', 'driver'];
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `role is required and must be one of: ${validRoles.join(', ')}`
      });
    }

    // Verify ride exists and the user is a party to it
    const rideResult = await pool.query(
      `SELECT r.id, r.rider_id, d.user_id AS driver_user_id
       FROM rides r
       LEFT JOIN drivers d ON r.driver_id = d.id
       WHERE r.id = $1`,
      [rideId]
    );

    if (rideResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }

    const ride = rideResult.rows[0];
    const isParty = ride.rider_id === userId || ride.driver_user_id === userId;
    const isAdmin = req.user.role === 'admin';

    if (!isParty && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied — you are not a party to this ride'
      });
    }

    // Insert recording record; expires_at = NOW() + 30 days (also set as DB default)
    const result = await pool.query(
      `INSERT INTO ride_recordings (
         ride_id, recorded_by, role,
         storage_url, duration_sec, file_size_kb,
         is_encrypted, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6, true, NOW() + INTERVAL '30 days')
       RETURNING id, ride_id, role, duration_sec, file_size_kb, expires_at, created_at`,
      [
        rideId,
        userId,
        role,
        storage_url,
        duration_sec || null,
        file_size_kb || null
      ]
    );

    const recording = result.rows[0];

    return res.status(201).json({
      success: true,
      recording_id: recording.id,
      expires_at:   recording.expires_at,
      message:      'Recording saved successfully'
    });
  } catch (err) {
    console.error('[Recording saveRecording]', err);
    return res.status(500).json({ success: false, message: 'Failed to save recording' });
  }
};

/**
 * GET /rides/:id/recordings  (admin OR parties of the ride)
 *
 * Access rules:
 *   - Admins:              see full list including storage_url; access is logged.
 *   - Rider / driver:      see recording metadata but NOT storage_url.
 */
const getRecordings = async (req, res) => {
  try {
    const { id: rideId } = req.params;
    const userId  = req.user.id;
    const isAdmin = req.user.role === 'admin';

    // Verify ride exists and get parties
    const rideResult = await pool.query(
      `SELECT r.id, r.rider_id, d.user_id AS driver_user_id
       FROM rides r
       LEFT JOIN drivers d ON r.driver_id = d.id
       WHERE r.id = $1`,
      [rideId]
    );

    if (rideResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }

    const ride = rideResult.rows[0];
    const isParty = ride.rider_id === userId || ride.driver_user_id === userId;

    if (!isParty && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied — you are not a party to this ride'
      });
    }

    // Fetch recordings
    const recordingsResult = await pool.query(
      `SELECT
         rr.id,
         rr.ride_id,
         rr.role,
         rr.duration_sec,
         rr.file_size_kb,
         rr.is_encrypted,
         rr.expires_at,
         rr.created_at,
         ${isAdmin ? 'rr.storage_url,' : ''}
         u.full_name AS recorded_by_name
       FROM ride_recordings rr
       JOIN users u ON rr.recorded_by = u.id
       WHERE rr.ride_id = $1
         AND rr.expires_at > NOW()
       ORDER BY rr.created_at ASC`,
      [rideId]
    );

    // For admins: log access on each recording
    if (isAdmin && recordingsResult.rows.length > 0) {
      const recordingIds = recordingsResult.rows.map(r => r.id);
      // Use unnest to batch-update all recordings efficiently
      await pool.query(
        `UPDATE ride_recordings
         SET accessed_by = $1, accessed_at = NOW()
         WHERE id = ANY($2::uuid[])`,
        [userId, recordingIds]
      );
    }

    // For non-admins: replace storage_url with a policy message
    const sanitizedRecordings = recordingsResult.rows.map(r => {
      if (!isAdmin) {
        return {
          ...r,
          storage_url: undefined,
          access_note: 'Available for dispute resolution only'
        };
      }
      return r;
    });

    return res.json({
      success: true,
      count: sanitizedRecordings.length,
      data: sanitizedRecordings
    });
  } catch (err) {
    console.error('[Recording getRecordings]', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve recordings' });
  }
};

// ── Internal scheduled cleanup ────────────────────────────────────────────────

/**
 * deleteExpiredRecordings()
 * Deletes recording rows whose expires_at < NOW().
 * The actual Supabase Storage objects must be purged separately via a
 * storage lifecycle rule or a separate cleanup job.
 * Called on startup and then every 24 hours.
 */
const deleteExpiredRecordings = async () => {
  try {
    const result = await pool.query(
      'DELETE FROM ride_recordings WHERE expires_at < NOW() RETURNING id'
    );

    if (result.rows.length > 0) {
      console.log(`[Recording] Deleted ${result.rows.length} expired recording(s)`);
    }
  } catch (err) {
    console.warn('[Recording deleteExpiredRecordings]', err.message);
  }
};

// Schedule: run immediately, then every 24 hours
deleteExpiredRecordings();
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
setInterval(deleteExpiredRecordings, TWENTY_FOUR_HOURS_MS);

// ── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  saveRecording,
  getRecordings,
  deleteExpiredRecordings
};

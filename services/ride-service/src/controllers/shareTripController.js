const logger = require('../utils/logger');
const crypto = require('crypto');
const db = require('../config/database');

/**
 * POST /rides/:id/share
 * Authenticated rider generates a share token for their active ride.
 * Returns { share_url, token }.
 * Trusted contacts (family/friends) can view the live trip WITHOUT installing the app.
 */
const generateShareToken = async (req, res) => {
  try {
    const riderId = req.user ? req.user.id : req.headers['x-user-id'];
    const { id } = req.params;

    // Verify the ride belongs to this rider
    const rideResult = await db.query(
      'SELECT id, rider_id, status FROM rides WHERE id = $1',
      [id]
    );

    if (rideResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }

    const ride = rideResult.rows[0];

    if (ride.rider_id !== riderId) {
      return res.status(403).json({ success: false, message: 'Access denied — not your ride' });
    }

    // Generate 32-char hex token
    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await db.query(
      'UPDATE rides SET share_token = $1, share_token_expires = $2 WHERE id = $3',
      [token, expiresAt, id]
    );

    const shareUrl = `https://mobo.app/track/${token}`;

    return res.json({
      success: true,
      data: {
        share_url: shareUrl,
        expires_at: expiresAt,
        note: 'Anyone with this link can track your ride in real time — no app needed.'
      }
    });
  } catch (err) {
    logger.error('[ShareTrip] generateShareToken error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /rides/track/:token
 * PUBLIC — no authentication required. Family and friends can track without the app.
 * Returns safe, limited ride info: status, addresses, driver first name + last initial,
 * vehicle info, and the driver's last known GPS location for live map display.
 * Returns 404 if token is expired or the ride completed more than 2 hours ago.
 */
const getSharedTrip = async (req, res) => {
  try {
    const { token } = req.params;
    const now = new Date();

    const result = await db.query(
      `SELECT
         r.id,
         r.status,
         r.pickup_address,
         r.dropoff_address,
         r.estimated_arrival,
         r.share_token_expires,
         r.completed_at,
         r.driver_id,
         -- Driver: first name + last initial only (no full PII)
         SPLIT_PART(du.full_name, ' ', 1) AS driver_first_name,
         LEFT(SPLIT_PART(du.full_name, ' ', 2), 1) AS driver_last_initial,
         du.is_verified AS driver_verified,
         v.make,
         v.model,
         v.color,
         v.plate,
         v.vehicle_type,
         -- Last known driver location (from driver_locations table)
         dl.latitude  AS driver_lat,
         dl.longitude AS driver_lng,
         dl.heading   AS driver_heading,
         dl.updated_at AS location_updated_at
       FROM rides r
       LEFT JOIN drivers d ON r.driver_id = d.id
       LEFT JOIN users du ON d.user_id = du.id
       LEFT JOIN vehicles v ON d.vehicle_id = v.id
       LEFT JOIN driver_locations dl ON dl.driver_id = d.id
       WHERE r.share_token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Shared trip not found' });
    }

    const ride = result.rows[0];

    // Check token expiry
    if (ride.share_token_expires && new Date(ride.share_token_expires) < now) {
      return res.status(404).json({ success: false, message: 'Share link has expired' });
    }

    // If ride is completed, only allow access within 2 hours of completion
    if (ride.status === 'completed' && ride.completed_at) {
      const completedAt = new Date(ride.completed_at);
      const twoHoursAfterCompletion = new Date(completedAt.getTime() + 2 * 60 * 60 * 1000);
      if (now > twoHoursAfterCompletion) {
        return res.status(404).json({ success: false, message: 'This trip link has expired' });
      }
    }

    // Build safe response — no PII (no full name, no phone number)
    const safeData = {
      ride_id:           ride.id,
      status:            ride.status,
      pickup_address:    ride.pickup_address,
      dropoff_address:   ride.dropoff_address,
      estimated_arrival: ride.estimated_arrival || null,
      driver: ride.driver_first_name
        ? {
            name: `${ride.driver_first_name}${ride.driver_last_initial ? ' ' + ride.driver_last_initial + '.' : ''}`,
            verified: ride.driver_verified || false,
            vehicle: {
              make:         ride.make,
              model:        ride.model,
              color:        ride.color,
              plate:        ride.plate,
              vehicle_type: ride.vehicle_type
            },
            // Live location — lets family/friends track on a map without the app
            live_location: ride.driver_lat != null
              ? {
                  latitude:     parseFloat(ride.driver_lat),
                  longitude:    parseFloat(ride.driver_lng),
                  heading:      ride.driver_heading,
                  updated_at:   ride.location_updated_at,
                  // Indicate if location is stale (>5 min old)
                  is_live:      ride.location_updated_at
                    ? (now - new Date(ride.location_updated_at)) < 5 * 60 * 1000
                    : false,
                }
              : null
          }
        : null,
      // Polling hint: clients should refresh every 10 seconds while ride is active
      refresh_interval_seconds: ['accepted', 'arriving', 'in_progress'].includes(ride.status) ? 10 : null,
    };

    return res.json({ success: true, data: safeData });
  } catch (err) {
    logger.error('[ShareTrip] getSharedTrip error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  generateShareToken,
  getSharedTrip
};

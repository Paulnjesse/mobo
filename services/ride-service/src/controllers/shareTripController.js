const crypto = require('crypto');
const db = require('../config/database');

/**
 * POST /rides/:id/share
 * Authenticated rider generates a share token for their active ride.
 * Returns { share_url, token }.
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
        expires_at: expiresAt
      }
    });
  } catch (err) {
    console.error('[ShareTrip] generateShareToken error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /rides/track/:token
 * PUBLIC — no authentication required.
 * Returns safe, limited ride info for sharing.
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
         -- Driver: first name + last initial only
         SPLIT_PART(du.full_name, ' ', 1) AS driver_first_name,
         LEFT(SPLIT_PART(du.full_name, ' ', 2), 1) AS driver_last_initial,
         v.make,
         v.model,
         v.color,
         v.plate,
         v.vehicle_type
       FROM rides r
       LEFT JOIN drivers d ON r.driver_id = d.id
       LEFT JOIN users du ON d.user_id = du.id
       LEFT JOIN vehicles v ON d.vehicle_id = v.id
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

    // Build safe response — no PII (no full name, no phone)
    const safeData = {
      ride_id: ride.id,
      status: ride.status,
      pickup_address: ride.pickup_address,
      dropoff_address: ride.dropoff_address,
      estimated_arrival: ride.estimated_arrival || null,
      driver: ride.driver_first_name
        ? {
            name: `${ride.driver_first_name}${ride.driver_last_initial ? ' ' + ride.driver_last_initial + '.' : ''}`,
            vehicle: {
              make: ride.make,
              model: ride.model,
              color: ride.color,
              plate: ride.plate,
              vehicle_type: ride.vehicle_type
            }
          }
        : null
    };

    return res.json({ success: true, data: safeData });
  } catch (err) {
    console.error('[ShareTrip] getSharedTrip error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  generateShareToken,
  getSharedTrip
};

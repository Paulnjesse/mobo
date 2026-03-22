/**
 * Commuter Pass Controller
 * Route-specific discounted ride passes (Lyft Pink / Uber Pass equivalent)
 * Riders buy a pass for a specific commuter route (e.g. Home ↔ Work) and
 * receive a fixed % discount on every matching ride.
 */
const pool = require('../config/database');

// Pass pricing tiers: rides in pack → price (XAF) + default discount %
const PASS_TIERS = [
  { rides: 10, price: 8000,  discount: 15 },
  { rides: 20, price: 14000, discount: 20 },
  { rides: 40, price: 25000, discount: 25 },
];

// Haversine distance in metres between two lat/lng points
function distanceM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Get available pass tiers ──────────────────────────────────────────────────
const getPassTiers = async (req, res) => {
  res.json({ tiers: PASS_TIERS });
};

// ── Get rider's active commuter passes ────────────────────────────────────────
const getMyPasses = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const result = await pool.query(
      `SELECT * FROM commuter_passes
       WHERE user_id = $1 AND is_active = true AND valid_until >= CURRENT_DATE
       ORDER BY created_at DESC`,
      [userId]
    );
    res.json({ passes: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Purchase a commuter pass ───────────────────────────────────────────────────
const createPass = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const {
      route_name,
      origin_address, origin_lat, origin_lng,
      destination_address, destination_lat, destination_lng,
      tier_rides,          // 10 | 20 | 40
      payment_method,
    } = req.body;

    const tier = PASS_TIERS.find((t) => t.rides === tier_rides);
    if (!tier) return res.status(400).json({ error: 'Invalid pass tier. Choose 10, 20, or 40 rides.' });

    // Check user wallet / deduct if wallet payment
    if (payment_method === 'wallet') {
      const userRow = await pool.query('SELECT wallet_balance FROM users WHERE id = $1', [userId]);
      if ((userRow.rows[0]?.wallet_balance || 0) < tier.price) {
        return res.status(400).json({ error: 'Insufficient wallet balance.' });
      }
      await pool.query('UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2', [tier.price, userId]);
    }

    // 30-day validity
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 30);

    const result = await pool.query(
      `INSERT INTO commuter_passes (
         user_id, route_name,
         origin_address, origin_lat, origin_lng,
         destination_address, destination_lat, destination_lng,
         discount_percent, rides_total, rides_used, price_paid, valid_until
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,$11,$12) RETURNING *`,
      [
        userId, route_name,
        origin_address, origin_lat, origin_lng,
        destination_address, destination_lat, destination_lng,
        tier.discount, tier.rides, tier.price, validUntil.toISOString().split('T')[0],
      ]
    );

    res.status(201).json({ pass: result.rows[0], message: `Pass activated! ${tier.rides} rides with ${tier.discount}% off.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Cancel / deactivate a pass ────────────────────────────────────────────────
const cancelPass = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE commuter_passes SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, userId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Pass not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * findMatchingPass(userId, pickupLat, pickupLng, dropoffLat, dropoffLng)
 * Returns the first active pass whose origin/destination match the trip endpoints
 * within match_radius_m. Used internally by requestRide.
 */
async function findMatchingPass(userId, pickupLat, pickupLng, dropoffLat, dropoffLng) {
  const result = await pool.query(
    `SELECT * FROM commuter_passes
     WHERE user_id = $1 AND is_active = true
       AND valid_until >= CURRENT_DATE AND rides_used < rides_total
     ORDER BY discount_percent DESC`,
    [userId]
  );

  for (const pass of result.rows) {
    const originToPickup = distanceM(pass.origin_lat, pass.origin_lng, pickupLat, pickupLng);
    const destToDropoff  = distanceM(pass.destination_lat, pass.destination_lng, dropoffLat, dropoffLng);
    const radius = pass.match_radius_m;

    // Forward match: origin→pickup, destination→dropoff
    if (originToPickup <= radius && destToDropoff <= radius) return pass;

    // Reverse match (return trip): destination→pickup, origin→dropoff
    const destToPickup  = distanceM(pass.destination_lat, pass.destination_lng, pickupLat, pickupLng);
    const originToDropoff = distanceM(pass.origin_lat, pass.origin_lng, dropoffLat, dropoffLng);
    if (destToPickup <= radius && originToDropoff <= radius) return pass;
  }

  return null;
}

// Increment pass usage (called after ride completes successfully)
async function consumePassRide(passId) {
  await pool.query(
    `UPDATE commuter_passes
     SET rides_used = rides_used + 1, updated_at = NOW(),
         is_active = CASE WHEN rides_used + 1 >= rides_total THEN false ELSE true END
     WHERE id = $1`,
    [passId]
  );
}

module.exports = {
  getPassTiers,
  getMyPasses,
  createPass,
  cancelPass,
  findMatchingPass,
  consumePassRide,
};

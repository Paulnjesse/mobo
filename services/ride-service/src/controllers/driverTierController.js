const logger = require('../utils/logger');
const db = require('../db');

const TIER_THRESHOLDS = [
  { name: 'Diamond',  minTrips: 1500, minRating: 4.85, minAcceptance: 90  },
  { name: 'Platinum', minTrips: 500,  minRating: 4.7,  minAcceptance: 85  },
  { name: 'Gold',     minTrips: 100,  minRating: 4.5,  minAcceptance: 80  },
  { name: 'Bronze',   minTrips: 0,    minRating: 0,    minAcceptance: 0   },
];

function calculateTier(trips, rating, acceptance) {
  for (const tier of TIER_THRESHOLDS) {
    if (trips >= tier.minTrips && rating >= tier.minRating && acceptance >= tier.minAcceptance) {
      return tier.name;
    }
  }
  return 'Bronze';
}

/**
 * GET /rides/drivers/me/tier
 * Returns driver tier, stats, and progress toward next tier.
 */
exports.getDriverTier = async (req, res) => {
  try {
    const driverId = req.user.driver_id || req.user.id;

    const { rows } = await db.query(`
      SELECT
        d.tier,
        d.lifetime_trips,
        d.acceptance_rate,
        COALESCE(AVG(r.driver_rating), 5.0) AS rating,
        COUNT(r.id) FILTER (WHERE r.created_at >= date_trunc('month', NOW())) AS trips_this_month,
        COALESCE(SUM(r.final_fare) FILTER (WHERE r.created_at >= date_trunc('month', NOW())), 0) AS earnings_this_month
      FROM drivers d
      LEFT JOIN rides r ON r.driver_id = d.id AND r.status = 'completed'
      WHERE d.id = $1
      GROUP BY d.id
    `, [driverId]);

    if (!rows.length) return res.status(404).json({ error: 'Driver not found' });

    const row = rows[0];
    const rating = parseFloat(row.rating) || 5.0;
    const acceptance = parseFloat(row.acceptance_rate) || 100;
    const trips = parseInt(row.lifetime_trips) || 0;

    // Recalculate and update tier
    const newTier = calculateTier(trips, rating, acceptance);
    if (newTier !== row.tier) {
      await db.query('UPDATE drivers SET tier = $1, tier_updated_at = NOW() WHERE id = $2', [newTier, driverId]);
    }

    res.json({
      tier: newTier,
      total_trips: trips,
      rating: parseFloat(rating.toFixed(2)),
      acceptance_rate: Math.round(acceptance),
      trips_this_month: parseInt(row.trips_this_month) || 0,
      earnings_this_month: parseFloat(row.earnings_this_month) || 0,
    });
  } catch (err) {
    logger.error('driverTierController.getDriverTier:', err);
    res.status(500).json({ error: 'Failed to load driver tier' });
  }
};

/**
 * GET /rides/driver/radar
 * Returns pending ride requests near the driver's current location.
 * Uses driver's last known location from the request or query param.
 */
exports.getDriverRadar = async (req, res) => {
  try {
    const { lat, lng, radius_km = 5 } = req.query;

    let query;
    let params;

    if (lat && lng) {
      // Haversine-based proximity filter
      query = `
        SELECT
          r.id, r.ride_type, r.pickup_address, r.dropoff_address,
          r.estimated_fare, r.surge_multiplier AS surge,
          ROUND(
            6371 * acos(
              cos(radians($1)) * cos(radians(r.pickup_lat)) *
              cos(radians(r.pickup_lng) - radians($2)) +
              sin(radians($1)) * sin(radians(r.pickup_lat))
            )::numeric, 1
          ) AS distance_km,
          ROUND((
            6371 * acos(
              cos(radians($1)) * cos(radians(r.pickup_lat)) *
              cos(radians(r.pickup_lng) - radians($2)) +
              sin(radians($1)) * sin(radians(r.pickup_lat))
            ) / 25 * 60
          )::numeric, 0) AS wait_min
        FROM rides r
        WHERE r.status = 'pending'
          AND r.scheduled_at IS NULL
          AND r.pickup_lat IS NOT NULL
          AND 6371 * acos(
            cos(radians($1)) * cos(radians(r.pickup_lat)) *
            cos(radians(r.pickup_lng) - radians($2)) +
            sin(radians($1)) * sin(radians(r.pickup_lat))
          ) <= $3
        ORDER BY distance_km ASC
        LIMIT 10
      `;
      params = [parseFloat(lat), parseFloat(lng), parseFloat(radius_km)];
    } else {
      // Return recent pending rides without geo-filter
      query = `
        SELECT id, ride_type, pickup_address, dropoff_address,
               estimated_fare, surge_multiplier AS surge,
               5.0 AS distance_km, 3 AS wait_min
        FROM rides
        WHERE status = 'pending' AND scheduled_at IS NULL
        ORDER BY created_at DESC
        LIMIT 10
      `;
      params = [];
    }

    const { rows } = await db.query(query, params);
    res.json({ rides: rows });
  } catch (err) {
    logger.error('driverTierController.getDriverRadar:', err);
    res.status(500).json({ error: 'Failed to load radar' });
  }
};

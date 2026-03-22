/**
 * Ride Service Layer
 * Business logic for ride lifecycle management
 */

const db = require('../config/database');

/**
 * Find an active ride for a user (prevents double-booking)
 */
async function findActiveRide(userId, role = 'rider') {
  const column = role === 'driver' ? 'driver_id' : 'rider_id';
  const { rows } = await db.query(
    `SELECT id, status FROM rides
     WHERE ${column} = $1 AND status IN ('requested','accepted','arriving','in_progress')
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

/**
 * Get a ride by ID with full details
 */
async function getRideById(rideId) {
  const { rows } = await db.query(
    `SELECT r.*,
       u_rider.full_name AS rider_name, u_rider.phone AS rider_phone,
       u_driver.full_name AS driver_name,
       d.vehicle_make, d.vehicle_model, d.vehicle_plate, d.vehicle_color, d.rating AS driver_rating
     FROM rides r
     LEFT JOIN users u_rider ON u_rider.id = r.rider_id
     LEFT JOIN drivers d ON d.id = r.driver_id
     LEFT JOIN users u_driver ON u_driver.id = d.user_id
     WHERE r.id = $1`,
    [rideId]
  );
  return rows[0] || null;
}

/**
 * Update ride status with timestamp tracking
 */
async function updateRideStatus(rideId, status, extra = {}) {
  const timestampMap = {
    accepted: 'accepted_at',
    arriving: null,
    in_progress: 'started_at',
    completed: 'completed_at',
    cancelled: 'cancelled_at',
  };
  const tsColumn = timestampMap[status];
  const setClauses = [`status = $1`, `updated_at = NOW()`];
  const params = [status];
  if (tsColumn) {
    setClauses.push(`${tsColumn} = NOW()`);
  }
  if (extra.driverId) {
    params.push(extra.driverId);
    setClauses.push(`driver_id = $${params.length}`);
  }
  if (extra.actualFare) {
    params.push(extra.actualFare);
    setClauses.push(`actual_fare = $${params.length}`);
  }
  params.push(rideId);
  const { rows } = await db.query(
    `UPDATE rides SET ${setClauses.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );
  return rows[0] || null;
}

/**
 * Get ride history for a user (paginated)
 */
async function getRideHistory(userId, role = 'rider', { limit = 20, offset = 0 } = {}) {
  const column = role === 'driver' ? 'd.user_id' : 'r.rider_id';
  const { rows: countRows } = await db.query(
    `SELECT COUNT(*) FROM rides r
     LEFT JOIN drivers d ON d.id = r.driver_id
     WHERE ${column} = $1 AND r.status IN ('completed','cancelled')`,
    [userId]
  );
  const { rows } = await db.query(
    `SELECT r.*, d.vehicle_make, d.vehicle_model, d.rating AS driver_rating
     FROM rides r
     LEFT JOIN drivers d ON d.id = r.driver_id
     WHERE ${column} = $1 AND r.status IN ('completed','cancelled')
     ORDER BY r.created_at DESC LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return { total: parseInt(countRows[0].count, 10), rides: rows };
}

module.exports = {
  findActiveRide,
  getRideById,
  updateRideStatus,
  getRideHistory,
};

const pool = require('../config/database');

// GET /rides/airport/zones  — list all airport zones
const getAirportZones = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, city, iata_code, radius_m,
              ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat
       FROM airport_zones WHERE is_active = true ORDER BY city`
    );
    res.json({ zones: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /rides/airport/checkin  — driver checks into airport queue
const airportCheckIn = async (req, res) => {
  try {
    const driverUserId = req.headers['x-user-id'];
    const { airport_zone_id } = req.body;

    const driverResult = await pool.query(
      'SELECT id FROM drivers WHERE user_id = $1 AND is_approved = true AND is_online = true',
      [driverUserId]
    );
    if (!driverResult.rows[0]) {
      return res.status(403).json({ error: 'Must be an approved online driver' });
    }
    const driverId = driverResult.rows[0].id;

    // Verify zone exists
    const zone = await pool.query('SELECT * FROM airport_zones WHERE id = $1 AND is_active = true', [airport_zone_id]);
    if (!zone.rows[0]) return res.status(404).json({ error: 'Airport zone not found' });

    // Remove any existing waiting slot for this driver at this airport
    await pool.query(
      `DELETE FROM airport_queue
       WHERE driver_id = $1 AND airport_zone_id = $2 AND status = 'waiting'`,
      [driverId, airport_zone_id]
    );

    // Get next queue position
    const posResult = await pool.query(
      `SELECT COALESCE(MAX(position), 0) + 1 as next_pos
       FROM airport_queue WHERE airport_zone_id = $1 AND status = 'waiting'`,
      [airport_zone_id]
    );
    const position = posResult.rows[0].next_pos;

    const entry = await pool.query(
      `INSERT INTO airport_queue (airport_zone_id, driver_id, position, status)
       VALUES ($1, $2, $3, 'waiting') RETURNING *`,
      [airport_zone_id, driverId, position]
    );

    // Set driver airport_mode flag
    await pool.query(
      'UPDATE drivers SET airport_mode = true, airport_zone_id = $1 WHERE id = $2',
      [airport_zone_id, driverId]
    );

    res.json({
      entry: entry.rows[0],
      position,
      zone: zone.rows[0],
      message: `You are #${position} in the ${zone.rows[0].name} queue`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE /rides/airport/checkout  — driver leaves airport queue
const airportCheckOut = async (req, res) => {
  try {
    const driverUserId = req.headers['x-user-id'];
    const driverResult = await pool.query('SELECT id FROM drivers WHERE user_id = $1', [driverUserId]);
    if (!driverResult.rows[0]) return res.status(404).json({ error: 'Driver not found' });
    const driverId = driverResult.rows[0].id;

    await pool.query(
      `UPDATE airport_queue SET status = 'departed'
       WHERE driver_id = $1 AND status = 'waiting'`,
      [driverId]
    );
    await pool.query(
      'UPDATE drivers SET airport_mode = false, airport_zone_id = NULL WHERE id = $1',
      [driverId]
    );

    res.json({ success: true, message: 'Left airport queue' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /rides/airport/queue/:zone_id  — get queue for a zone (driver/admin)
const getAirportQueue = async (req, res) => {
  try {
    const { zone_id } = req.params;
    const result = await pool.query(
      `SELECT aq.position, aq.checked_in_at, aq.status,
              u.full_name as driver_name, u.profile_picture,
              v.make, v.model, v.color, v.plate
       FROM airport_queue aq
       JOIN drivers d ON aq.driver_id = d.id
       JOIN users u ON d.user_id = u.id
       LEFT JOIN vehicles v ON d.vehicle_id = v.id
       WHERE aq.airport_zone_id = $1 AND aq.status = 'waiting'
       ORDER BY aq.position ASC`,
      [zone_id]
    );
    res.json({ queue: result.rows, count: result.rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /rides/airport/my-position  — driver checks their queue position
const getMyQueuePosition = async (req, res) => {
  try {
    const driverUserId = req.headers['x-user-id'];
    const driverResult = await pool.query(
      'SELECT id, airport_mode, airport_zone_id FROM drivers WHERE user_id = $1',
      [driverUserId]
    );
    if (!driverResult.rows[0]) return res.status(404).json({ error: 'Driver not found' });
    const driver = driverResult.rows[0];

    if (!driver.airport_mode) {
      return res.json({ airport_mode: false, position: null });
    }

    const queueResult = await pool.query(
      `SELECT aq.position, aq.checked_in_at, az.name as zone_name, az.city,
              (SELECT COUNT(*) FROM airport_queue WHERE airport_zone_id = aq.airport_zone_id AND status = 'waiting') as total_waiting
       FROM airport_queue aq
       JOIN airport_zones az ON aq.airport_zone_id = az.id
       WHERE aq.driver_id = $1 AND aq.status = 'waiting'`,
      [driver.id]
    );

    if (!queueResult.rows[0]) {
      return res.json({ airport_mode: true, position: null, message: 'Not in any active queue' });
    }

    const q = queueResult.rows[0];
    res.json({
      airport_mode: true,
      position: q.position,
      total_waiting: parseInt(q.total_waiting),
      zone_name: q.zone_name,
      city: q.city,
      checked_in_at: q.checked_in_at,
      estimated_wait_minutes: (q.position - 1) * 8, // ~8 min per ride
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Internal: dispatch next driver from queue when airport ride is requested
const dispatchFromQueue = async (airportZoneId) => {
  const next = await pool.query(
    `SELECT aq.driver_id, d.user_id
     FROM airport_queue aq JOIN drivers d ON aq.driver_id = d.id
     WHERE aq.airport_zone_id = $1 AND aq.status = 'waiting'
     ORDER BY aq.position ASC LIMIT 1`,
    [airportZoneId]
  );
  if (!next.rows[0]) return null;

  const { driver_id } = next.rows[0];
  await pool.query(
    `UPDATE airport_queue SET status = 'dispatched', dispatched_at = NOW()
     WHERE driver_id = $1 AND airport_zone_id = $2 AND status = 'waiting'`,
    [driver_id, airportZoneId]
  );
  // Shift remaining queue positions
  await pool.query(
    `UPDATE airport_queue SET position = position - 1
     WHERE airport_zone_id = $1 AND status = 'waiting'`,
    [airportZoneId]
  );

  return driver_id;
};

// GET /rides/drivers/me/airport-mode — get driver's airport mode status
const getAirportMode = async (req, res) => {
  try {
    const driverUserId = req.headers['x-user-id'] || req.user?.id;
    const { rows } = await pool.query(
      `SELECT d.airport_mode, d.airport_zone_id, az.name as zone_name, az.city,
              aq.position, aq.checked_in_at,
              (SELECT COUNT(*) FROM airport_queue
               WHERE airport_zone_id = d.airport_zone_id AND status = 'waiting') as total_waiting
       FROM drivers d
       LEFT JOIN airport_zones az ON d.airport_zone_id = az.id
       LEFT JOIN airport_queue aq ON aq.driver_id = d.id AND aq.status = 'waiting'
       WHERE d.user_id = $1`,
      [driverUserId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Driver not found' });
    const d = rows[0];
    res.json({
      airport_mode: d.airport_mode || false,
      airport_zone_id: d.airport_zone_id || null,
      zone_name: d.zone_name || null,
      city: d.city || null,
      position: d.position || null,
      total_waiting: d.total_waiting ? parseInt(d.total_waiting) : 0,
      checked_in_at: d.checked_in_at || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /rides/drivers/me/airport-mode — enable or disable airport mode
const updateAirportMode = async (req, res) => {
  try {
    const driverUserId = req.headers['x-user-id'] || req.user?.id;
    const { enabled, airport_zone_id } = req.body;

    const driverRes = await pool.query(
      'SELECT id FROM drivers WHERE user_id = $1 AND is_approved = true',
      [driverUserId]
    );
    if (!driverRes.rows.length) return res.status(403).json({ error: 'Driver not found or not approved' });
    const driverId = driverRes.rows[0].id;

    if (enabled) {
      if (!airport_zone_id) return res.status(400).json({ error: 'airport_zone_id required when enabling airport mode' });
      // Delegate to check-in logic
      req.body.airport_zone_id = airport_zone_id;
      req.headers['x-user-id'] = driverUserId;
      return airportCheckIn(req, res);
    } else {
      // Delegate to checkout logic
      return airportCheckOut(req, res);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getAirportZones, airportCheckIn, airportCheckOut,
  getAirportQueue, getMyQueuePosition, dispatchFromQueue,
  getAirportMode, updateAirportMode,
};

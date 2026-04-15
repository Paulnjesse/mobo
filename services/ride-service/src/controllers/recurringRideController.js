const logger = require('../utils/logger');
const db = require('../db');

exports.getMySeries = async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM recurring_rides WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ series: rows });
  } catch (err) {
    logger.error('recurringRideController.getMySeries:', err);
    res.status(500).json({ error: 'Failed to load recurring rides' });
  }
};

exports.createSeries = async (req, res) => {
  try {
    const { frequency, ride_type, pickup_address, dropoff_address, time, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng } = req.body;
    const { rows } = await db.query(
      `INSERT INTO recurring_rides
         (user_id, frequency, ride_type, pickup_address, dropoff_address, time, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [req.user.id, frequency, ride_type, pickup_address, dropoff_address, time, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng]
    );
    res.status(201).json({ series: rows[0] });
  } catch (err) {
    logger.error('recurringRideController.createSeries:', err);
    res.status(500).json({ error: 'Failed to create recurring ride' });
  }
};

exports.updateSeries = async (req, res) => {
  try {
    const { active, frequency, time } = req.body;
    const updates = [];
    const params = [];
    if (active !== undefined) { params.push(active); updates.push(`active = $${params.length}`); }
    if (frequency) { params.push(frequency); updates.push(`frequency = $${params.length}`); }
    if (time) { params.push(time); updates.push(`time = $${params.length}`); }
    if (!updates.length) return res.json({ ok: true });

    params.push(req.params.id, req.user.id);
    const { rows } = await db.query(
      `UPDATE recurring_rides SET ${updates.join(', ')} WHERE id = $${params.length - 1} AND user_id = $${params.length} RETURNING *`,
      params
    );
    res.json({ series: rows[0] });
  } catch (err) {
    logger.error('recurringRideController.updateSeries:', err);
    res.status(500).json({ error: 'Failed to update recurring ride' });
  }
};

exports.deleteSeries = async (req, res) => {
  try {
    await db.query('DELETE FROM recurring_rides WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    logger.error('recurringRideController.deleteSeries:', err);
    res.status(500).json({ error: 'Failed to delete recurring ride' });
  }
};

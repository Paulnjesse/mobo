const logger = require('../utils/logger');
const db = require('../db');

exports.getSavedPlaces = async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM saved_places WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ places: rows });
  } catch (err) {
    logger.error('savedPlacesController.getSavedPlaces:', err);
    res.status(500).json({ error: 'Failed to load saved places' });
  }
};

exports.createSavedPlace = async (req, res) => {
  try {
    const { label, type, address, lat, lng } = req.body;
    const { rows } = await db.query(
      'INSERT INTO saved_places (user_id, label, type, address, lat, lng) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.user.id, label, type || 'custom', address, lat, lng]
    );
    res.status(201).json({ place: rows[0] });
  } catch (err) {
    logger.error('savedPlacesController.createSavedPlace:', err);
    res.status(500).json({ error: 'Failed to save place' });
  }
};

exports.deleteSavedPlace = async (req, res) => {
  try {
    await db.query('DELETE FROM saved_places WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    logger.error('savedPlacesController.deleteSavedPlace:', err);
    res.status(500).json({ error: 'Failed to delete saved place' });
  }
};

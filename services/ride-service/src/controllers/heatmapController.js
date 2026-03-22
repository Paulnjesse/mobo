const db = require('../db');

/**
 * GET /rides/heatmap/zones
 * Returns demand zones with intensity and demand count.
 * Optionally filter by city via ?city=Yaoundé
 */
exports.getHeatmapZones = async (req, res) => {
  try {
    const { city } = req.query;
    let query = 'SELECT * FROM demand_zones WHERE 1=1';
    const params = [];
    if (city) {
      params.push(city);
      query += ` AND city = $${params.length}`;
    }
    query += ' ORDER BY demand DESC';
    const { rows } = await db.query(query, params);
    res.json({ zones: rows });
  } catch (err) {
    console.error('heatmapController.getHeatmapZones:', err);
    res.status(500).json({ error: 'Failed to load heat map zones' });
  }
};

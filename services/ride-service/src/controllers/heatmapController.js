'use strict';
const logger = require('../utils/logger');
const db     = require('../db');
const cache  = require('../utils/cache');

const HEATMAP_TTL_S  = 10;    // 10-second cache — demand zones change slowly
const SKIP_CACHE     = process.env.NODE_ENV === 'test'; // unit tests mock db — skip cache

/**
 * GET /rides/heatmap/zones
 * Returns demand zones with intensity and demand count.
 * Optionally filter by city via ?city=Yaoundé
 *
 * Cached for 10 seconds per city to prevent full table scans on every
 * dashboard poll cycle (typically every 5s per admin browser tab).
 */
exports.getHeatmapZones = async (req, res) => {
  try {
    const { city } = req.query;
    const cacheKey = `heatmap:zones:${city || '_all'}`;

    if (!SKIP_CACHE) {
      const cached = await cache.get(cacheKey);
      if (cached) return res.json({ zones: cached, cached: true });
    }

    let query = 'SELECT * FROM demand_zones WHERE 1=1';
    const params = [];
    if (city) {
      params.push(city);
      query += ` AND city = $${params.length}`;
    }
    query += ' ORDER BY demand DESC';

    const { rows } = await db.query(query, params);
    if (!SKIP_CACHE) await cache.set(cacheKey, rows, HEATMAP_TTL_S);
    res.json({ zones: rows });
  } catch (err) {
    logger.error('heatmapController.getHeatmapZones:', err);
    res.status(500).json({ error: 'Failed to load heat map zones' });
  }
};

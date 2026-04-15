/**
 * Ads Controller
 * Manages promotional banners shown in the mobile app.
 *
 * Public:   GET  /ads?context=home|ride|auth|all
 * Admin:    POST /ads
 *           PUT  /ads/:id
 *           PATCH /ads/:id/toggle
 *           DELETE /ads/:id
 *           POST  /ads/:id/impression   (mobile tracking)
 *           POST  /ads/:id/click        (mobile tracking)
 */

const logger = require('../utils/logger');
const db = require('../db');

// ── Public: fetch active ads for a given context ─────────────────────────────
exports.getAds = async (req, res) => {
  try {
    const { context = 'home' } = req.query;
    const today = new Date().toISOString().slice(0, 10);

    const { rows } = await db.query(
      `SELECT id, type, title, subtitle, cta, icon, color, sponsor, url, image_url, context, priority
       FROM ads
       WHERE active = TRUE
         AND (context = $1 OR context = 'all')
         AND (start_date IS NULL OR start_date <= $2)
         AND (end_date   IS NULL OR end_date   >= $2)
       ORDER BY priority DESC, created_at ASC`,
      [context, today]
    );
    res.json({ ads: rows });
  } catch (err) {
    logger.error('adsController.getAds:', err);
    res.status(500).json({ error: 'Failed to load ads' });
  }
};

// ── Admin: list all ads ───────────────────────────────────────────────────────
exports.listAllAds = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT *,
         CASE WHEN clicks > 0 THEN ROUND(clicks::numeric / NULLIF(impressions,0) * 100, 1) ELSE 0 END AS ctr
       FROM ads ORDER BY priority DESC, created_at DESC`
    );
    res.json({ ads: rows });
  } catch (err) {
    logger.error('adsController.listAllAds:', err);
    res.status(500).json({ error: 'Failed to list ads' });
  }
};

// ── Admin: create ad ─────────────────────────────────────────────────────────
exports.createAd = async (req, res) => {
  try {
    const {
      type = 'internal', title, subtitle, cta = 'Learn More',
      icon = 'megaphone-outline', color = '#FF00BF',
      sponsor, url, image_url, context = 'home',
      priority = 0, start_date, end_date,
    } = req.body;

    if (!title || !subtitle) return res.status(400).json({ error: 'title and subtitle are required' });

    const { rows } = await db.query(
      `INSERT INTO ads
         (type, title, subtitle, cta, icon, color, sponsor, url, image_url, context, priority, start_date, end_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [type, title, subtitle, cta, icon, color, sponsor || null, url || null,
       image_url || null, context, priority, start_date || null, end_date || null,
       req.user?.id || null]
    );
    res.status(201).json({ ad: rows[0] });
  } catch (err) {
    logger.error('adsController.createAd:', err);
    res.status(500).json({ error: 'Failed to create ad' });
  }
};

// ── Admin: update ad ─────────────────────────────────────────────────────────
exports.updateAd = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      type, title, subtitle, cta, icon, color,
      sponsor, url, image_url, context, priority, start_date, end_date,
    } = req.body;

    const { rows } = await db.query(
      `UPDATE ads SET
         type        = COALESCE($1, type),
         title       = COALESCE($2, title),
         subtitle    = COALESCE($3, subtitle),
         cta         = COALESCE($4, cta),
         icon        = COALESCE($5, icon),
         color       = COALESCE($6, color),
         sponsor     = COALESCE($7, sponsor),
         url         = COALESCE($8, url),
         image_url   = COALESCE($9, image_url),
         context     = COALESCE($10, context),
         priority    = COALESCE($11, priority),
         start_date  = COALESCE($12, start_date),
         end_date    = COALESCE($13, end_date),
         updated_at  = NOW()
       WHERE id = $14
       RETURNING *`,
      [type, title, subtitle, cta, icon, color, sponsor, url, image_url,
       context, priority, start_date, end_date, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Ad not found' });
    res.json({ ad: rows[0] });
  } catch (err) {
    logger.error('adsController.updateAd:', err);
    res.status(500).json({ error: 'Failed to update ad' });
  }
};

// ── Admin: toggle active ─────────────────────────────────────────────────────
exports.toggleAd = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await db.query(
      'UPDATE ads SET active = NOT active, updated_at = NOW() WHERE id = $1 RETURNING id, active',
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Ad not found' });
    res.json({ id: rows[0].id, active: rows[0].active });
  } catch (err) {
    logger.error('adsController.toggleAd:', err);
    res.status(500).json({ error: 'Failed to toggle ad' });
  }
};

// ── Admin: delete ad ─────────────────────────────────────────────────────────
exports.deleteAd = async (req, res) => {
  try {
    const { id } = req.params;
    const { rowCount } = await db.query('DELETE FROM ads WHERE id = $1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'Ad not found' });
    res.json({ ok: true });
  } catch (err) {
    logger.error('adsController.deleteAd:', err);
    res.status(500).json({ error: 'Failed to delete ad' });
  }
};

// ── Mobile: record impression ────────────────────────────────────────────────
exports.recordImpression = async (req, res) => {
  try {
    await db.query('UPDATE ads SET impressions = impressions + 1 WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch { res.json({ ok: true }); } // silent fail — tracking is non-critical
};

// ── Mobile: record click ─────────────────────────────────────────────────────
exports.recordClick = async (req, res) => {
  try {
    await db.query('UPDATE ads SET clicks = clicks + 1 WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch { res.json({ ok: true }); }
};

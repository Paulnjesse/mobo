const db = require('../db');
const crypto = require('crypto');
const logger = require('../utils/logger');

function generateApiKey() {
  return 'mobo_live_sk_' + crypto.randomBytes(20).toString('base64url').slice(0, 32);
}

/** Returns a masked representation: prefix + dots + last 4 chars. */
function maskApiKey(key) {
  if (!key || key.length < 8) return '••••••••';
  return key.slice(0, 13) + '••••••••••••••••••••' + key.slice(-4);
}

/** Safe portal row — never exposes the raw api_key. */
function safePortalRow(row) {
  const { api_key, ...rest } = row;
  return { ...rest, api_key_masked: maskApiKey(api_key) };
}

exports.getPortal = async (req, res) => {
  try {
    let { rows } = await db.query(
      'SELECT * FROM developer_api_keys WHERE user_id = $1 AND active = TRUE ORDER BY created_at DESC LIMIT 1',
      [req.user.id]
    );

    if (!rows.length) {
      const newKey = generateApiKey();
      const { rows: newRows } = await db.query(
        `INSERT INTO developer_api_keys (user_id, api_key, plan) VALUES ($1, $2, 'Starter') RETURNING *`,
        [req.user.id, newKey]
      );
      rows = newRows;
    }

    res.json(safePortalRow(rows[0]));
  } catch (err) {
    logger.error('developerPortalController.getPortal', { error: err.message, userId: req.user?.id });
    res.status(500).json({ error: 'Failed to load developer portal' });
  }
};

exports.regenerateKey = async (req, res) => {
  try {
    const newKey = generateApiKey();
    await db.query(
      'UPDATE developer_api_keys SET active = FALSE WHERE user_id = $1',
      [req.user.id]
    );
    const { rows } = await db.query(
      `INSERT INTO developer_api_keys (user_id, api_key, plan)
       SELECT $1, $2, plan FROM developer_api_keys WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [req.user.id, newKey]
    );
    // Return the full key ONCE on generation (same pattern as GitHub PATs / Stripe keys).
    // All subsequent GET /portal calls return only the masked version.
    res.json({ api_key: rows[0]?.api_key || newKey, message: 'Save this key — it will not be shown again.' });
  } catch (err) {
    logger.error('developerPortalController.regenerateKey', { error: err.message, userId: req.user?.id });
    res.status(500).json({ error: 'Failed to regenerate API key' });
  }
};

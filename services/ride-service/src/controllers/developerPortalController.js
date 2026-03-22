const db = require('../db');
const crypto = require('crypto');

function generateApiKey() {
  return 'mobo_live_sk_' + crypto.randomBytes(20).toString('base64url').slice(0, 32);
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

    res.json(rows[0]);
  } catch (err) {
    console.error('developerPortalController.getPortal:', err);
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
    res.json({ api_key: rows[0]?.api_key || newKey });
  } catch (err) {
    console.error('developerPortalController.regenerateKey:', err);
    res.status(500).json({ error: 'Failed to regenerate API key' });
  }
};

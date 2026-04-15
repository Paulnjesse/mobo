const logger = require('../utils/logger');
const db = require('../db');

const TIER_RATES = { Bronze: 2000, Gold: 2500, Platinum: 3000, Diamond: 4000 };

exports.getGuarantee = async (req, res) => {
  try {
    const driverId = req.user.driver_id || req.user.id;
    const today = new Date().toISOString().slice(0, 10);

    // Get or create today's window
    let { rows } = await db.query(
      'SELECT * FROM earnings_guarantee_windows WHERE driver_id = $1 AND window_date = $2',
      [driverId, today]
    );

    if (!rows.length) {
      const tierRes = await db.query('SELECT tier FROM drivers WHERE id = $1', [driverId]);
      const tier = tierRes.rows[0]?.tier || 'Bronze';
      const ratePerHr = TIER_RATES[tier] || 2000;

      const { rows: newRows } = await db.query(
        `INSERT INTO earnings_guarantee_windows
           (driver_id, window_date, guarantee_xaf_per_hr)
         VALUES ($1, $2, $3)
         ON CONFLICT (driver_id, window_date) DO UPDATE SET guarantee_xaf_per_hr = $3
         RETURNING *`,
        [driverId, today, ratePerHr]
      );
      rows = newRows;
    }

    // Recalculate actual earnings for today
    const earningsRes = await db.query(
      `SELECT COALESCE(SUM(r.final_fare), 0) AS actual
       FROM rides r
       WHERE r.driver_id = $1 AND DATE(r.completed_at) = $2 AND r.status = 'completed'`,
      [driverId, today]
    );

    const window = rows[0];
    const actual = parseFloat(earningsRes.rows[0]?.actual) || 0;
    const guaranteed = parseFloat(window.hours_online) * parseFloat(window.guarantee_xaf_per_hr);
    const topupOwed = Math.max(0, guaranteed - actual);

    await db.query(
      `UPDATE earnings_guarantee_windows
         SET actual_earnings = $1, guaranteed_earnings = $2, topup_owed = $3
       WHERE driver_id = $4 AND window_date = $5`,
      [actual, guaranteed, topupOwed, driverId, today]
    );

    // History
    const histRes = await db.query(
      `SELECT window_date AS date, hours_online AS hours, actual_earnings AS actual,
              guaranteed_earnings AS guarantee, topup_owed AS topup, topup_paid AS paid
       FROM earnings_guarantee_windows
       WHERE driver_id = $1 AND window_date < $2
       ORDER BY window_date DESC LIMIT 7`,
      [driverId, today]
    );

    res.json({
      active: true,
      guarantee_xaf_per_hr: parseFloat(window.guarantee_xaf_per_hr),
      window_start: `${today}T06:00:00Z`,
      window_end: `${today}T22:00:00Z`,
      hours_online: parseFloat(window.hours_online),
      actual_earnings: actual,
      guaranteed_earnings: guaranteed,
      topup_owed: topupOwed,
      topup_paid: window.topup_paid,
      history: histRes.rows,
    });
  } catch (err) {
    logger.error('earningsGuaranteeController.getGuarantee:', err);
    res.status(500).json({ error: 'Failed to load guarantee data' });
  }
};

exports.getGuaranteeHistory = async (req, res) => {
  try {
    const driverId = req.user.driver_id || req.user.id;
    const { rows } = await db.query(
      `SELECT window_date AS date, hours_online AS hours, actual_earnings AS actual,
              guaranteed_earnings AS guarantee, topup_owed AS topup, topup_paid AS paid
       FROM earnings_guarantee_windows WHERE driver_id = $1
       ORDER BY window_date DESC LIMIT 30`,
      [driverId]
    );
    res.json({ history: rows });
  } catch (err) {
    logger.error('earningsGuaranteeController.getGuaranteeHistory:', err);
    res.status(500).json({ error: 'Failed to load history' });
  }
};

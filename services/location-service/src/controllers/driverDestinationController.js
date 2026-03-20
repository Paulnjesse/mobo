const pool = require('../config/database');

// ---- DESTINATION MODE ----
const setDestinationMode = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { destination_address, destination_location, enabled } = req.body;

    const driver = await pool.query('SELECT id FROM drivers WHERE user_id = $1', [userId]);
    if (!driver.rows[0]) return res.status(403).json({ error: 'Not a driver' });
    const driverId = driver.rows[0].id;

    if (!enabled) {
      await pool.query(
        `UPDATE drivers SET destination_mode = false, destination_address = NULL,
         destination_location = NULL, destination_expires_at = NULL WHERE id = $1`,
        [driverId]
      );
      return res.json({ success: true, destination_mode: false });
    }

    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
    await pool.query(
      `UPDATE drivers SET destination_mode = true, destination_address = $1,
       destination_location = ST_SetSRID(ST_MakePoint($2, $3), 4326),
       destination_expires_at = $4 WHERE id = $5`,
      [destination_address, destination_location.lng, destination_location.lat, expiresAt, driverId]
    );

    res.json({ success: true, destination_mode: true, destination_address, expires_at: expiresAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getDestinationMode = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const result = await pool.query(
      `SELECT destination_mode, destination_address, destination_expires_at,
              ST_X(destination_location::geometry) as dest_lng,
              ST_Y(destination_location::geometry) as dest_lat
       FROM drivers WHERE user_id = $1`,
      [userId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Driver not found' });
    res.json({ destination: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ---- DRIVER BONUSES & STREAKS ----
const getDriverBonuses = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const driver = await pool.query(
      `SELECT d.id, d.current_streak, d.longest_streak, d.total_bonuses_earned, d.streak_started_at
       FROM drivers d WHERE d.user_id = $1`, [userId]
    );
    if (!driver.rows[0]) return res.status(403).json({ error: 'Not a driver' });
    const driverId = driver.rows[0].id;

    // Active challenges
    const challenges = await pool.query(
      `SELECT bc.*, dcp.current_value, dcp.completed, dcp.bonus_paid
       FROM bonus_challenges bc
       LEFT JOIN driver_challenge_progress dcp ON dcp.challenge_id = bc.id AND dcp.driver_id = $1
       WHERE bc.is_active = true AND bc.ends_at > NOW()
       ORDER BY bc.ends_at ASC`,
      [driverId]
    );

    // Initialize progress for new challenges
    for (const ch of challenges.rows) {
      if (!ch.current_value && ch.current_value !== 0) {
        await pool.query(
          `INSERT INTO driver_challenge_progress (driver_id, challenge_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [driverId, ch.id]
        );
      }
    }

    res.json({
      streak: {
        current: driver.rows[0].current_streak,
        longest: driver.rows[0].longest_streak,
        started_at: driver.rows[0].streak_started_at
      },
      total_bonuses_earned: driver.rows[0].total_bonuses_earned,
      challenges: challenges.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Admin: create bonus challenge
const createBonusChallenge = async (req, res) => {
  try {
    const userRole = req.headers['x-user-role'];
    if (userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const { name, description, challenge_type, target_value, bonus_amount, city, starts_at, ends_at } = req.body;
    const result = await pool.query(
      `INSERT INTO bonus_challenges (name, description, challenge_type, target_value, bonus_amount, city, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [name, description, challenge_type, target_value, bonus_amount, city, starts_at, ends_at]
    );
    res.status(201).json({ challenge: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ---- EXPRESS PAY ----
const setupExpressPay = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { express_pay_account } = req.body; // phone number for mobile money

    await pool.query(
      'UPDATE drivers SET express_pay_enabled = true, express_pay_account = $1 WHERE user_id = $2',
      [express_pay_account, userId]
    );

    res.json({ success: true, message: 'Express Pay enabled. Funds will be sent within minutes.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const requestExpressPayout = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { amount } = req.body;

    const driver = await pool.query(
      'SELECT id, total_earnings, express_pay_enabled, express_pay_account FROM drivers WHERE user_id = $1',
      [userId]
    );
    if (!driver.rows[0]) return res.status(403).json({ error: 'Not a driver' });
    const d = driver.rows[0];

    if (!d.express_pay_enabled) return res.status(400).json({ error: 'Express Pay not set up' });
    if (amount > d.total_earnings) return res.status(400).json({ error: 'Insufficient earnings' });

    const fee = Math.round(amount * 0.015); // 1.5% fee
    const netAmount = amount - fee;

    const result = await pool.query(
      `INSERT INTO express_pay_transactions (driver_id, amount, fee, net_amount, status)
       VALUES ($1, $2, $3, $4, 'processing') RETURNING *`,
      [d.id, amount, fee, netAmount]
    );

    // Deduct from earnings
    await pool.query('UPDATE drivers SET total_earnings = total_earnings - $1 WHERE id = $2', [amount, d.id]);

    // In production: call MTN/Orange Money API here
    // Simulate success after 2 seconds
    setTimeout(async () => {
      await pool.query(
        `UPDATE express_pay_transactions SET status = 'completed', completed_at = NOW() WHERE id = $1`,
        [result.rows[0].id]
      );
    }, 2000);

    res.json({
      transaction: result.rows[0],
      fee,
      net_amount: netAmount,
      account: d.express_pay_account,
      message: `${netAmount} XAF will be sent to ${d.express_pay_account} within minutes`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getExpressPayHistory = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const driver = await pool.query('SELECT id FROM drivers WHERE user_id = $1', [userId]);
    if (!driver.rows[0]) return res.status(403).json({ error: 'Not a driver' });

    const result = await pool.query(
      'SELECT * FROM express_pay_transactions WHERE driver_id = $1 ORDER BY created_at DESC LIMIT 50',
      [driver.rows[0].id]
    );
    res.json({ transactions: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  setDestinationMode, getDestinationMode,
  getDriverBonuses, createBonusChallenge,
  setupExpressPay, requestExpressPayout, getExpressPayHistory
};

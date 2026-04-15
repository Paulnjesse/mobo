const logger = require('../utils/logger');
const db = require('../db');

exports.getFuelCard = async (req, res) => {
  try {
    const driverId = req.user.driver_id || req.user.id;
    const { rows } = await db.query(
      `SELECT fc.*,
         COALESCE(SUM(ft.discount_xaf), 0) AS total_saved_xaf
       FROM fuel_cards fc
       LEFT JOIN fuel_transactions ft ON ft.fuel_card_id = fc.id
       WHERE fc.driver_id = $1
       GROUP BY fc.id`,
      [driverId]
    );
    if (!rows.length) {
      // Auto-create card if none exists
      const cardNumber = 'MOBO-FC-' + Math.floor(1000 + Math.random() * 9000);
      const { rows: newRows } = await db.query(
        'INSERT INTO fuel_cards (driver_id, card_number) VALUES ($1, $2) RETURNING *, 0 AS total_saved_xaf',
        [driverId, cardNumber]
      );
      return res.json({ ...newRows[0], transactions: [], partner_stations: [] });
    }
    res.json(rows[0]);
  } catch (err) {
    logger.error('fuelCardController.getFuelCard:', err);
    res.status(500).json({ error: 'Failed to load fuel card' });
  }
};

exports.getTransactions = async (req, res) => {
  try {
    const driverId = req.user.driver_id || req.user.id;
    const { rows } = await db.query(
      `SELECT ft.* FROM fuel_transactions ft
       JOIN fuel_cards fc ON fc.id = ft.fuel_card_id
       WHERE fc.driver_id = $1
       ORDER BY ft.transacted_at DESC
       LIMIT 50`,
      [driverId]
    );
    res.json({ transactions: rows });
  } catch (err) {
    logger.error('fuelCardController.getTransactions:', err);
    res.status(500).json({ error: 'Failed to load transactions' });
  }
};

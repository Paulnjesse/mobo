/**
 * Payment Service Layer
 * Business logic for payment processing, wallet management, and loyalty
 */

const db = require('../config/database');

/**
 * Get or create a wallet for a user
 */
async function getOrCreateWallet(userId) {
  const { rows } = await db.query(
    `INSERT INTO wallets (user_id, balance, currency)
     VALUES ($1, 0, 'XAF')
     ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [userId]
  );
  return rows[0];
}

/**
 * Credit a wallet — used for refunds, bonuses, referral credits
 */
async function creditWallet(userId, amount, description = 'credit', client = db) {
  const { rows } = await client.query(
    `UPDATE wallets SET balance = balance + $1, updated_at = NOW()
     WHERE user_id = $2 RETURNING *`,
    [amount, userId]
  );
  if (!rows[0]) throw new Error(`Wallet not found for user ${userId}`);
  await client.query(
    `INSERT INTO wallet_transactions (user_id, amount, type, description)
     VALUES ($1, $2, 'credit', $3)`,
    [userId, amount, description]
  );
  return rows[0];
}

/**
 * Debit a wallet — used for ride payments
 */
async function debitWallet(userId, amount, description = 'debit', client = db) {
  const { rows: walletRows } = await client.query(
    `SELECT balance FROM wallets WHERE user_id = $1`,
    [userId]
  );
  if (!walletRows[0]) throw new Error(`Wallet not found for user ${userId}`);
  if (parseFloat(walletRows[0].balance) < amount) {
    throw new Error('Insufficient wallet balance');
  }
  const { rows } = await client.query(
    `UPDATE wallets SET balance = balance - $1, updated_at = NOW()
     WHERE user_id = $2 RETURNING *`,
    [amount, userId]
  );
  await client.query(
    `INSERT INTO wallet_transactions (user_id, amount, type, description)
     VALUES ($1, $2, 'debit', $3)`,
    [userId, amount, description]
  );
  return rows[0];
}

/**
 * Record a payment in the DB
 */
async function recordPayment({ rideId, userId, amount, currency = 'XAF', method, status = 'pending', reference = null }) {
  const { rows } = await db.query(
    `INSERT INTO payments (ride_id, user_id, amount, currency, payment_method, status, reference, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     RETURNING *`,
    [rideId, userId, amount, currency, method, status, reference]
  );
  return rows[0];
}

/**
 * Update payment status
 */
async function updatePaymentStatus(paymentId, status, metadata = {}) {
  const { rows } = await db.query(
    `UPDATE payments SET status = $1, metadata = $2, updated_at = NOW()
     WHERE id = $3 RETURNING *`,
    [status, JSON.stringify(metadata), paymentId]
  );
  return rows[0];
}

/**
 * Find payment by external reference (used for webhooks)
 */
async function findPaymentByReference(reference) {
  const { rows } = await db.query(
    `SELECT p.*, r.rider_id, r.driver_id FROM payments p
     JOIN rides r ON r.id = p.ride_id
     WHERE p.reference = $1`,
    [reference]
  );
  return rows[0] || null;
}

/**
 * Get loyalty points for a user
 */
async function getLoyaltyPoints(userId) {
  const { rows } = await db.query(
    `SELECT points, tier FROM loyalty_points WHERE user_id = $1`,
    [userId]
  );
  return rows[0] || { points: 0, tier: 'bronze' };
}

/**
 * Award loyalty points after a completed ride
 */
async function awardRidePoints(userId, rideId) {
  const BASE_POINTS = 10;
  await db.query(
    `INSERT INTO loyalty_points (user_id, points, tier)
     VALUES ($1, $2, 'bronze')
     ON CONFLICT (user_id) DO UPDATE
     SET points = loyalty_points.points + $2, updated_at = NOW()`,
    [userId, BASE_POINTS]
  );
  await db.query(
    `INSERT INTO loyalty_transactions (user_id, ride_id, points, type, description)
     VALUES ($1, $2, $3, 'earn', 'Points earned for completing a ride')
     ON CONFLICT DO NOTHING`,
    [userId, rideId, BASE_POINTS]
  );
}

/**
 * Redeem loyalty points (100 points = 500 XAF)
 */
async function redeemPoints(userId, pointsToRedeem) {
  const POINTS_TO_XAF_RATE = 5; // 1 point = 5 XAF
  const { rows } = await db.query(
    `SELECT points FROM loyalty_points WHERE user_id = $1`,
    [userId]
  );
  if (!rows[0] || rows[0].points < pointsToRedeem) {
    throw new Error('Insufficient loyalty points');
  }
  const xafValue = pointsToRedeem * POINTS_TO_XAF_RATE;
  await db.query(
    `UPDATE loyalty_points SET points = points - $1, updated_at = NOW() WHERE user_id = $2`,
    [pointsToRedeem, userId]
  );
  await creditWallet(userId, xafValue, `Redeemed ${pointsToRedeem} loyalty points`);
  return { pointsRedeemed: pointsToRedeem, xafCredited: xafValue };
}

module.exports = {
  getOrCreateWallet,
  creditWallet,
  debitWallet,
  recordPayment,
  updatePaymentStatus,
  findPaymentByReference,
  getLoyaltyPoints,
  awardRidePoints,
  redeemPoints,
};

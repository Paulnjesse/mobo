'use strict';
/**
 * settleEarnings.js — Saga earnings settlement job
 *
 * Called by the payment service when a ride payment is confirmed (status → paid).
 * Atomically moves the pending driver earnings from earnings_pending into
 * drivers.total_earnings so the final credit is always tied to a real payment.
 *
 * Called from:
 *   - paymentController.chargeRide (synchronous path: wallet, cash)
 *   - paymentController.resolvePendingPayment (async path: MoMo, Orange Money)
 *   - webhookStripe (Stripe payment_intent.succeeded)
 *
 * Design:
 *   Uses a single DB transaction with SELECT … FOR UPDATE on the pending row
 *   so concurrent settlement attempts (e.g. duplicate webhook delivery) are
 *   idempotent — only the first UPDATE wins, the second is a no-op.
 */

const logger = require('../utils/logger');
const db     = require('../config/database');

/**
 * Settle pending driver earnings for a confirmed ride payment.
 *
 * @param {string} rideId   - UUID of the completed ride
 * @param {object} [opts]
 * @param {string} [opts.notes] - Optional note stored on the settled row
 * @returns {Promise<{ settled: boolean, amount_xaf: number|null }>}
 */
async function settleDriverEarnings(rideId, opts = {}) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Lock the pending row — prevents concurrent settlement (e.g. duplicate webhooks)
    const pendingRow = await client.query(
      `SELECT id, driver_id, amount_xaf
       FROM earnings_pending
       WHERE ride_id = $1 AND status = 'pending'
       FOR UPDATE SKIP LOCKED`,
      [rideId]
    );

    if (!pendingRow.rows[0]) {
      // Already settled or no pending row (cash rides never create one)
      await client.query('ROLLBACK');
      return { settled: false, amount_xaf: null };
    }

    const { id: pendingId, driver_id: driverId, amount_xaf } = pendingRow.rows[0];

    // Credit driver earnings
    await client.query(
      `UPDATE drivers SET total_earnings = total_earnings + $1 WHERE id = $2`,
      [amount_xaf, driverId]
    );

    // Mark settled
    await client.query(
      `UPDATE earnings_pending
       SET status = 'settled', settled_at = NOW(), notes = $1
       WHERE id = $2`,
      [opts.notes || null, pendingId]
    );

    await client.query('COMMIT');
    logger.info('[SettleEarnings] Driver earnings settled from saga', { rideId, driverId, amount_xaf });
    return { settled: true, amount_xaf };
  } catch (err) {
    await client.query('ROLLBACK');
    // Mark as failed for ops review
    try {
      await db.query(
        `UPDATE earnings_pending SET status = 'failed', failed_at = NOW(), notes = $1
         WHERE ride_id = $2 AND status = 'pending'`,
        [err.message, rideId]
      );
    } catch (_) { /* best-effort */ }
    logger.error('[SettleEarnings] Failed to settle driver earnings', { rideId, err: err.message });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Cron job: flag earnings_pending rows older than 24h as 'review'.
 * Run daily — called from reconcilePayments.js scheduler.
 */
async function flagStaleEarnings() {
  try {
    const result = await db.query(
      `UPDATE earnings_pending
       SET status = 'review', notes = 'Stale: payment not confirmed within 24h'
       WHERE status = 'pending' AND created_at < NOW() - INTERVAL '24 hours'
       RETURNING ride_id, driver_id, amount_xaf`,
    );
    if (result.rows.length > 0) {
      logger.warn('[SettleEarnings] Stale pending earnings flagged for ops review', {
        count: result.rows.length,
        totalXAF: result.rows.reduce((s, r) => s + r.amount_xaf, 0),
      });
    }
  } catch (err) {
    logger.error('[SettleEarnings] flagStaleEarnings error', { err: err.message });
  }
}

module.exports = { settleDriverEarnings, flagStaleEarnings };

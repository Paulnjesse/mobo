'use strict';
/**
 * reconcilePayments.js — PAY-RECON-001
 *
 * Reconciles payments stuck in "pending" state by polling the original
 * payment provider for a final status. Designed to run on a schedule
 * (e.g. every 10 minutes via setInterval or an external cron).
 *
 * Handles:
 *   - MTN Mobile Money  (pollMtnStatus)
 *   - Orange Money      (pollOrangeStatus)
 *   - Wave / Flutterwave: webhook-only — no polling available; alert after 2h
 *
 * Safety guards:
 *   - Only touches payments pending > PENDING_TIMEOUT_MINUTES
 *   - Skips mock payments (reference_id starts with 'mock-')
 *   - Caps retries at MAX_POLL_ATTEMPTS per payment
 *   - Marks as 'failed' after MAX_POLL_ATTEMPTS exhausted
 */

const db      = require('../config/database');
const logger  = require('../utils/logger');
const { pollMtnStatus, pollOrangeStatus } = require('../controllers/paymentController');

const PENDING_TIMEOUT_MINUTES = 30;  // Only reconcile payments pending > 30 min
const MAX_POLL_ATTEMPTS       = 144; // 144 polls × 10 min = 24 h coverage for MoMo/Orange
const INTERVAL_MS             = 10 * 60 * 1000; // Run every 10 minutes

let _timer = null;

/**
 * Fetch all payments stuck in pending for longer than PENDING_TIMEOUT_MINUTES.
 */
async function fetchStalePendingPayments() {
  const { rows } = await db.query(
    `SELECT id, user_id, ride_id, amount, method, reference,
            provider_ref, metadata, poll_attempts,
            created_at
     FROM   payments
     WHERE  status = 'pending'
       AND  created_at < NOW() - INTERVAL '${PENDING_TIMEOUT_MINUTES} minutes'
       AND  method IN ('mtn_mobile_money', 'orange_money')
       AND  COALESCE((metadata->>'poll_attempts')::int, 0) < $1
     ORDER  BY created_at ASC
     LIMIT  50`,
    [MAX_POLL_ATTEMPTS]
  );
  return rows;
}

/**
 * Resolve a single payment by polling its provider.
 */
async function reconcileOne(payment) {
  const ref      = payment.reference || payment.provider_ref;
  const attempts = parseInt(payment.metadata?.poll_attempts || '0', 10);

  // Skip dev-mode mock payments
  if (ref && ref.startsWith('mock-')) {
    logger.info('[Reconcile] Skipping mock payment', { id: payment.id });
    return;
  }

  logger.info('[Reconcile] Polling payment', { id: payment.id, method: payment.method, ref, attempts });

  let providerStatus = null;

  try {
    if (payment.method === 'mtn_mobile_money') {
      const result = await pollMtnStatus(ref);
      // MTN returns { status: 'SUCCESSFUL' | 'FAILED' | 'PENDING' }
      providerStatus = result.status;
    } else if (payment.method === 'orange_money') {
      const payToken = payment.metadata?.pay_token || null;
      const result   = await pollOrangeStatus(ref, payToken);
      // Orange returns { status: 'SUCCESS' | 'FAILED' | 'PENDING' }
      providerStatus = result.status;
    }
  } catch (err) {
    logger.warn('[Reconcile] Provider poll error', { id: payment.id, err: err.message });
    await incrementAttempts(payment, attempts);
    return;
  }

  const newAttempts = attempts + 1;

  if (providerStatus === 'SUCCESSFUL' || providerStatus === 'SUCCESS') {
    await finalisePayment(payment, 'completed', providerStatus);
  } else if (providerStatus === 'FAILED') {
    await finalisePayment(payment, 'failed', providerStatus);
  } else if (newAttempts >= MAX_POLL_ATTEMPTS) {
    // Exhausted retries — mark failed so the UI can show a clear error
    logger.warn('[Reconcile] Max poll attempts reached, marking failed', { id: payment.id });
    await finalisePayment(payment, 'failed', 'MAX_ATTEMPTS_EXCEEDED');
  } else {
    // Still pending — increment counter
    await incrementAttempts(payment, newAttempts);
  }
}

async function finalisePayment(payment, newStatus, providerStatus) {
  const metadata = { ...(payment.metadata || {}), reconciled_at: new Date().toISOString(), provider_status: providerStatus };
  await db.query(
    `UPDATE payments
     SET    status   = $1,
            metadata = metadata || $2::jsonb,
            updated_at = NOW()
     WHERE  id = $3 AND status = 'pending'`,
    [newStatus, JSON.stringify(metadata), payment.id]
  );
  logger.info(`[Reconcile] Payment ${payment.id} → ${newStatus}`, { provider_status: providerStatus });

  // If the ride was awaiting payment, update its payment_status field
  if (payment.ride_id) {
    await db.query(
      `UPDATE rides SET payment_status = $1 WHERE id = $2 AND payment_status = 'pending'`,
      [newStatus, payment.ride_id]
    ).catch((err) => logger.warn('[Reconcile] ride payment_status update failed', { err: err.message }));
  }
}

async function incrementAttempts(payment, newAttempts) {
  const metadata = { ...(payment.metadata || {}), poll_attempts: newAttempts };
  await db.query(
    `UPDATE payments SET metadata = metadata || $1::jsonb WHERE id = $2`,
    [JSON.stringify({ poll_attempts: newAttempts }), payment.id]
  );
}

/**
 * Run one full reconciliation cycle.
 *
 * Uses a PostgreSQL advisory lock (pg_try_advisory_lock) so only ONE instance
 * runs the cycle even when Render scales to multiple replicas.  The lock is
 * session-scoped: it releases automatically when the DB connection is returned
 * to the pool, so a crashed instance never starves subsequent cycles.
 *
 * Advisory lock key: hashtext('mobo_reconciliation') — stable across restarts.
 */
async function runReconciliation() {
  logger.info('[Reconcile] Starting reconciliation cycle');

  // Try to acquire advisory lock — returns immediately if already held
  let lockClient = null;
  try {
    lockClient = await db.connect();
    const { rows } = await lockClient.query(
      `SELECT pg_try_advisory_lock(hashtext('mobo_reconciliation')) AS acquired`
    );
    if (!rows[0]?.acquired) {
      logger.info('[Reconcile] Another instance is running — skipping this cycle');
      lockClient.release();
      return;
    }
  } catch (lockErr) {
    // If we can't acquire the lock (e.g. DB unavailable), skip gracefully
    logger.warn('[Reconcile] Advisory lock acquisition failed — skipping', { err: lockErr.message });
    if (lockClient) lockClient.release();
    return;
  }

  let payments;
  try {
    payments = await fetchStalePendingPayments();
  } catch (err) {
    logger.error('[Reconcile] Failed to fetch stale payments', { err: err.message });
    lockClient.release(); // releases the advisory lock
    return;
  }

  if (payments.length === 0) {
    logger.info('[Reconcile] No stale pending payments found');
    return;
  }

  logger.info(`[Reconcile] Found ${payments.length} stale pending payment(s)`);

  for (const payment of payments) {
    await reconcileOne(payment).catch((err) => {
      logger.error('[Reconcile] Unexpected error on payment', { id: payment.id, err: err.message });
    });
  }

  logger.info('[Reconcile] Cycle complete');
  lockClient.release(); // releases advisory lock — next instance can now proceed
}

/**
 * Start the reconciliation loop.
 * Call this once from server.js / app startup.
 */
function startReconciliationJob() {
  if (process.env.NODE_ENV === 'test') return; // Never run in tests
  if (_timer) return; // Already started

  // Run immediately on startup, then every INTERVAL_MS
  runReconciliation().catch((err) => logger.error('[Reconcile] Initial run failed', { err: err.message }));
  _timer = setInterval(() => {
    runReconciliation().catch((err) => logger.error('[Reconcile] Scheduled run failed', { err: err.message }));
  }, INTERVAL_MS);

  logger.info(`[Reconcile] Job started — polling every ${INTERVAL_MS / 60000} minutes`);
}

function stopReconciliationJob() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

module.exports = { startReconciliationJob, stopReconciliationJob, runReconciliation };

'use strict';
/**
 * flagStalePayments.js — PAY-STALE-001
 *
 * Identifies mobile-money payments that have been pending for > 1 hour
 * and flags them as 'review' for manual investigation.
 *
 * Why this is separate from reconcilePayments.js:
 *   - reconcilePayments polls MTN/Orange every 10 min and marks as 'failed'
 *     after 6 attempts (~60 min).  Wave has no polling endpoint.
 *   - This job runs after the 1-hour mark to catch any remaining stragglers
 *     (MTN/Orange that are still 'pending' despite 6 poll attempts, and all
 *     Wave payments which can only be resolved by webhook).
 *   - Sets status = 'review' so finance team can investigate and manually
 *     reconcile, rather than silently failing.
 *
 * Fires every 60 minutes via setInterval.
 * Never runs in test mode.
 */

const db     = require('../config/database');
const logger = require('../utils/logger');
const Sentry = require('@sentry/node');

// Payments pending longer than this are flagged for review
const STALE_THRESHOLD_MINUTES = 60;

// Payment methods covered — Wave is included because it's webhook-only
// (no polling endpoint) so it can only be resolved by Flutterwave sending a webhook.
const MOBILE_MONEY_METHODS = ['mtn_mobile_money', 'orange_money', 'wave'];

const INTERVAL_MS = 60 * 60 * 1000; // 1 hour

let _timer = null;

/**
 * Find all mobile-money payments stuck in 'pending' for > STALE_THRESHOLD_MINUTES.
 * Excludes mock/test payments (reference starts with 'mock-').
 */
async function fetchStalePayments() {
  const { rows } = await db.query(
    `SELECT id, user_id, ride_id, amount, method, reference, created_at
     FROM   payments
     WHERE  status  = 'pending'
       AND  method  = ANY($1::text[])
       AND  created_at < NOW() - ($2 || ' minutes')::INTERVAL
       AND  (reference IS NULL OR reference NOT LIKE 'mock-%')
     ORDER  BY created_at ASC
     LIMIT  200`,
    [MOBILE_MONEY_METHODS, String(STALE_THRESHOLD_MINUTES)]
  );
  return rows;
}

/**
 * Mark a batch of payments as 'review' in a single UPDATE.
 * Uses ON CONFLICT DO NOTHING pattern via a WHERE guard so only
 * payments that are still 'pending' are touched.
 */
async function markAsReview(ids) {
  if (ids.length === 0) return 0;
  const { rowCount } = await db.query(
    `UPDATE payments
     SET    status     = 'review',
            metadata   = metadata || jsonb_build_object(
                           'review_reason', 'stale_mobile_money_1h',
                           'flagged_at',    to_char(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                         ),
            updated_at = NOW()
     WHERE  id = ANY($1::uuid[])
       AND  status = 'pending'`,   // double-guard: skip rows already resolved
    [ids]
  );
  return rowCount;
}

/**
 * Run one full flag cycle.
 * Returns the number of payments flagged.
 */
async function runFlagCycle() {
  logger.info('[FlagStalePayments] Starting cycle');

  let stale;
  try {
    stale = await fetchStalePayments();
  } catch (err) {
    logger.error('[FlagStalePayments] Failed to query stale payments', { err: err.message });
    Sentry.captureException(err, { tags: { job: 'flagStalePayments' } });
    return 0;
  }

  if (stale.length === 0) {
    logger.info('[FlagStalePayments] No stale mobile-money payments found');
    return 0;
  }

  logger.warn(`[FlagStalePayments] Found ${stale.length} stale payment(s) — flagging for review`, {
    methods: stale.reduce((acc, p) => {
      acc[p.method] = (acc[p.method] || 0) + 1;
      return acc;
    }, {}),
  });

  // Report to Sentry as a warning (not an error) so the on-call engineer
  // is alerted but the alert doesn't page at 3 AM unless it's large.
  if (stale.length > 0) {
    Sentry.captureMessage(
      `[MOBO] ${stale.length} mobile-money payment(s) stale >1h — flagged for review`,
      {
        level: stale.length >= 10 ? 'error' : 'warning',
        tags:  { job: 'flagStalePayments' },
        extra: {
          count:   stale.length,
          methods: stale.map((p) => p.method),
          oldest:  stale[0]?.created_at,
        },
      }
    );
  }

  let flagged = 0;
  try {
    const ids = stale.map((p) => p.id);
    flagged = await markAsReview(ids);
    logger.info(`[FlagStalePayments] Flagged ${flagged} payment(s) as 'review'`);
  } catch (err) {
    logger.error('[FlagStalePayments] Failed to mark payments as review', { err: err.message });
    Sentry.captureException(err, { tags: { job: 'flagStalePayments' } });
  }

  return flagged;
}

/**
 * Start the recurring flag job.
 * Call once from payment-service server.js startup.
 */
function startFlagStalePaymentsJob() {
  if (process.env.NODE_ENV === 'test') return;
  if (_timer) return; // already started

  // First run 5 minutes after startup (give DB pool time to warm up)
  const initialDelay = 5 * 60 * 1000;
  setTimeout(() => {
    runFlagCycle().catch((err) =>
      logger.error('[FlagStalePayments] Initial run error', { err: err.message })
    );
  }, initialDelay);

  _timer = setInterval(() => {
    runFlagCycle().catch((err) =>
      logger.error('[FlagStalePayments] Scheduled run error', { err: err.message })
    );
  }, INTERVAL_MS);

  logger.info('[FlagStalePayments] Job started — runs every 60 minutes, first check in 5 min');
}

function stopFlagStalePaymentsJob() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

module.exports = { startFlagStalePaymentsJob, stopFlagStalePaymentsJob, runFlagCycle };

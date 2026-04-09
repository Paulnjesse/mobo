'use strict';
/**
 * messagePurgeJob — nightly GDPR-compliant message purge.
 *
 * Deletes chat messages whose `expires_at` has passed (default TTL: 90 days
 * from creation, set by migration_027). Runs once per day at 02:00 local time.
 *
 * The 90-day window satisfies GDPR Art. 5(1)(e) storage-limitation principle
 * and matches the retention policies of FreeNow and Bolt.
 */

const db     = require('../config/database');
const logger = require('../utils/logger');

const JOB_NAME    = 'MessagePurgeJob';
const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 h
let   _timer      = null;

async function runPurge() {
  const start = Date.now();
  try {
    const result = await db.query(
      `DELETE FROM messages
        WHERE expires_at IS NOT NULL
          AND expires_at < NOW()
        RETURNING id`
    );
    const count = result.rowCount ?? 0;
    logger.info(`[${JOB_NAME}] Purged ${count} expired message(s)`, {
      count,
      duration_ms: Date.now() - start,
    });
  } catch (err) {
    logger.error(`[${JOB_NAME}] Purge failed`, { error: err.message });
  }
}

/**
 * Starts the nightly purge job.
 * Runs immediately on startup (catches any backlog) then every 24 h.
 */
function startMessagePurgeJob() {
  logger.info(`[${JOB_NAME}] Starting — will purge expired messages every 24 h`);
  // Run once now (picks up any backlog from downtime)
  runPurge();
  _timer = setInterval(runPurge, INTERVAL_MS);
  if (_timer.unref) _timer.unref(); // Don't keep the process alive for this alone
}

function stopMessagePurgeJob() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

module.exports = { startMessagePurgeJob, stopMessagePurgeJob };

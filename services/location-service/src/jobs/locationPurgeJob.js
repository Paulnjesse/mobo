const logger = require('../utils/logger');
/**
 * locationPurgeJob.js
 *
 * GDPR Article 5(1)(e) — "storage limitation" principle.
 * Location history older than 90 days is personal data with no legitimate
 * retention basis. This job deletes it daily in batches to avoid long locks.
 *
 * Wired into server.js at startup via startLocationPurgeJob().
 */

const pool = require('../config/database');

const PURGE_INTERVAL_DAYS = parseInt(process.env.LOCATION_RETENTION_DAYS || '90', 10);
const BATCH_SIZE          = 5000;  // rows per delete to avoid long table locks

let _timer = null;

/**
 * Delete one batch of expired location rows.
 * Returns the number of rows deleted.
 */
async function purgeBatch() {
  const result = await pool.query(
    `DELETE FROM locations
     WHERE id IN (
       SELECT id FROM locations
       WHERE created_at < NOW() - ($1 || ' days')::INTERVAL
       LIMIT $2
     )`,
    [PURGE_INTERVAL_DAYS, BATCH_SIZE]
  );
  return result.rowCount;
}

/**
 * Run the full purge: loop in batches until nothing left to delete.
 */
async function runPurge() {
  const label = '[LocationPurge]';
  const cutoff = new Date(Date.now() - PURGE_INTERVAL_DAYS * 86_400_000).toISOString();
  logger.info(`${label} Starting purge — removing location rows older than ${PURGE_INTERVAL_DAYS} days (before ${cutoff})`);

  let totalDeleted = 0;
  let batch = 0;

  try {
    let deleted;
    do {
      batch++;
      deleted = await purgeBatch();
      totalDeleted += deleted;
      if (deleted > 0) {
        logger.info(`${label} Batch ${batch}: deleted ${deleted} rows (total so far: ${totalDeleted})`);
        // Yield briefly between large batches to reduce I/O pressure
        if (deleted === BATCH_SIZE) await new Promise((r) => setTimeout(r, 200));
      }
    } while (deleted === BATCH_SIZE);

    logger.info(`${label} Purge complete — ${totalDeleted} rows deleted across ${batch} batches`);
  } catch (err) {
    logger.error(`${label} Purge failed:`, err.message);
    // Non-fatal — will retry at next scheduled run
  }
}

/**
 * Schedule the purge to run once per day (default 02:00 UTC).
 * Call this at server startup.
 */
function startLocationPurgeJob() {
  if (_timer) return; // already started

  const RUN_HOUR_UTC = parseInt(process.env.LOCATION_PURGE_HOUR_UTC || '2', 10);

  function scheduleNext() {
    const now  = new Date();
    const next = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
      RUN_HOUR_UTC, 0, 0, 0
    ));
    // If today's slot has passed, schedule for tomorrow
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);

    const msUntilNext = next - now;
    logger.info(`[LocationPurge] Next run scheduled at ${next.toISOString()} (in ${Math.round(msUntilNext / 60000)} min)`);

    _timer = setTimeout(async () => {
      await runPurge();
      scheduleNext(); // re-schedule for the following day
    }, msUntilNext);

    // Don't let this timer prevent process exit
    if (_timer.unref) _timer.unref();
  }

  scheduleNext();
}

function stopLocationPurgeJob() {
  if (_timer) {
    clearTimeout(_timer);
    _timer = null;
  }
}

// Allow manual trigger via env var for testing/admin use
if (process.env.RUN_LOCATION_PURGE_NOW === 'true') {
  runPurge().then(() => process.exit(0)).catch((e) => { logger.error(e); process.exit(1); });
}

module.exports = { startLocationPurgeJob, stopLocationPurgeJob, runPurge };

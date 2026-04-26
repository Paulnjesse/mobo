'use strict';
/**
 * Stuck-ride timeout job
 *
 * Runs every 60 seconds. Finds rides stuck in 'accepted' or 'arriving' state
 * for more than 15 minutes and cancels them, then reassigns if possible.
 *
 * Uses a distributed lock so only one replica processes at a time.
 */

const db     = require('../config/database');
const logger = require('../utils/logger');
const { withLock } = require('../utils/distributedLock');
const { recordJobRun, recordJobPending } = require('../utils/jobMetrics');

const POLL_MS         = 60 * 1000;   // every 60 s
const LOCK_TTL_MS     = 55_000;      // lock expires before next tick
const STUCK_TIMEOUT   = 15;          // minutes before a ride is considered stuck

async function cancelStuckRides() {
  await withLock('stuck_ride_job', LOCK_TTL_MS, async () => {
    // Find rides stuck in accepted/arriving for > STUCK_TIMEOUT minutes
    const stuck = await db.query(
      `SELECT id, driver_id, rider_id, status
       FROM rides
       WHERE status IN ('accepted', 'arriving')
         AND updated_at < NOW() - INTERVAL '${STUCK_TIMEOUT} minutes'
       LIMIT 50`
    );

    recordJobPending('stuck_ride_job', stuck.rows.length);
    recordJobRun('stuck_ride_job');

    if (stuck.rows.length === 0) return;

    logger.info('[StuckRideJob] Found stuck rides', { count: stuck.rows.length });

    for (const ride of stuck.rows) {
      try {
        const client = await db.connect();
        try {
          await client.query('BEGIN');

          // Cancel the stuck ride
          await client.query(
            `UPDATE rides
             SET status = 'cancelled',
                 cancellation_reason = 'system_timeout',
                 cancelled_at = NOW(),
                 updated_at = NOW()
             WHERE id = $1 AND status IN ('accepted', 'arriving')`,
            [ride.id]
          );

          // Log the event
          await client.query(
            `INSERT INTO ride_events
               (ride_id, event_type, old_status, new_status, actor_id, actor_role, metadata)
             VALUES ($1, 'auto_cancelled', $2, 'cancelled', NULL, 'system', $3)`,
            [ride.id, ride.status, JSON.stringify({ reason: `Stuck in '${ride.status}' for >${STUCK_TIMEOUT} min` })]
          );

          // Free the driver
          if (ride.driver_id) {
            await client.query(
              `UPDATE drivers SET is_available = true, current_ride_id = NULL WHERE id = $1`,
              [ride.driver_id]
            );
          }

          await client.query('COMMIT');
          logger.info('[StuckRideJob] Cancelled stuck ride', { ride_id: ride.id, was: ride.status });
        } catch (innerErr) {
          await client.query('ROLLBACK');
          logger.warn('[StuckRideJob] Failed to cancel ride', { ride_id: ride.id, err: innerErr.message });
        } finally {
          client.release();
        }
      } catch (connErr) {
        logger.warn('[StuckRideJob] DB connection error', { err: connErr.message });
      }
    }
  });
}

let _timer = null;

function startStuckRideJob() {
  if (_timer) return;
  _timer = setInterval(async () => {
    try {
      await cancelStuckRides();
    } catch (err) {
      logger.warn('[StuckRideJob] Unhandled error', { err: err.message });
    }
  }, POLL_MS);
  logger.info('[StuckRideJob] Started — polling every 60 s, timeout threshold: 15 min');
}

function stopStuckRideJob() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

module.exports = { startStuckRideJob, stopStuckRideJob };

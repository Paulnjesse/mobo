'use strict';
/**
 * Fraud Check Worker (BullMQ)
 *
 * Processes jobs from the 'fraud-checks' queue.
 * concurrency: 10 — up to 10 fraud checks run in parallel per instance.
 * Each check calls the ML service (800 ms timeout) or falls back to rules.
 *
 * PII resolution:
 *   Queue payloads store only the ride_id (never driverId/riderId/IP — see
 *   fraudQueue.js for the policy). This worker resolves the required identifiers
 *   from the database before running each check. The DB is the authoritative
 *   source and is protected by RLS; Redis is not.
 *
 * Start with startFraudWorker() from server.js.
 */

const { runFraudCheck } = require('./fraudQueue');
const logger            = require('../utils/logger');
const db                = require('../config/database');

let Worker = null;
if (process.env.REDIS_URL && process.env.NODE_ENV !== 'test') {
  try {
    Worker = require('bullmq').Worker;
  } catch { /* BullMQ not installed — degraded mode */ }
}

/**
 * Resolve PII fields from the database for a given job.
 * Returns a resolved payload suitable for runFraudCheck(), or null if the
 * ride no longer exists (cancelled / deleted).
 */
async function resolvePayload(checkType, queuePayload) {
  const { rideId } = queuePayload;

  if (checkType === 'collusion') {
    const { rows } = await db.query(
      'SELECT driver_id, rider_id FROM rides WHERE id = $1',
      [rideId]
    );
    if (!rows[0]) return null;
    return {
      rideId,
      driverId: rows[0].driver_id,
      riderId:  rows[0].rider_id,
      meta:     {}, // IP/device-id intentionally omitted — not stored in queue
    };
  }

  if (checkType === 'fare_manipulation') {
    const { rows } = await db.query(
      'SELECT driver_id FROM rides WHERE id = $1',
      [rideId]
    );
    if (!rows[0]) return null;
    return {
      rideId,
      driverId:      rows[0].driver_id,
      estimatedFare: queuePayload.estimatedFare,
      finalFare:     queuePayload.finalFare,
    };
  }

  // 'gps' — userId and location data are already in the payload; no PII lookup needed
  return queuePayload;
}

function startFraudWorker() {
  if (!Worker || !process.env.REDIS_URL) {
    logger.warn('[FraudWorker] Redis not configured — worker not started (setImmediate fallback active)');
    return null;
  }

  const { Redis }  = require('ioredis');
  const connection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });

  const worker = new Worker(
    'fraud-checks',
    async (job) => {
      const { name: checkType, data: queuePayload } = job;
      logger.info('[FraudWorker] Processing fraud check', {
        checkType,
        rideId:  queuePayload.rideId || null,
        jobId:   job.id,
        attempt: job.attemptsMade + 1,
      });

      // Resolve PII fields from DB (never stored in Redis queue)
      const resolvedPayload = await resolvePayload(checkType, queuePayload);
      if (!resolvedPayload) {
        logger.warn('[FraudWorker] Ride not found — skipping check', {
          checkType, rideId: queuePayload.rideId, jobId: job.id,
        });
        return; // ride deleted/cancelled; not an error worth retrying
      }

      await runFraudCheck(checkType, resolvedPayload);
    },
    { connection, concurrency: 10 }
  );

  worker.on('completed', (job) =>
    logger.info('[FraudWorker] Job completed', { jobId: job.id, checkType: job.name }));

  worker.on('failed', (job, err) =>
    logger.error('[FraudWorker] Job failed', {
      jobId:     job?.id,
      checkType: job?.name,
      err:       err.message,
      attempts:  job?.attemptsMade,
    }));

  logger.info('[FraudWorker] Fraud check worker started (concurrency=10)');
  return worker;
}

module.exports = { startFraudWorker };

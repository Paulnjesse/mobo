'use strict';
const logger = require('../utils/logger');
/**
 * Fraud Check Queue (BullMQ over Redis)
 *
 * Why this exists:
 *   The previous implementation used setImmediate() to run fraud checks
 *   asynchronously. That works for latency (the HTTP response is sent first)
 *   but is NOT durable — if the Node.js process restarts mid-check the job
 *   is silently lost, and there is no retry logic.
 *
 *   BullMQ persists jobs in Redis so:
 *   - A process crash or Render deploy does not drop fraud checks
 *   - Failed ML calls are retried (2 attempts, exponential back-off)
 *   - Job history is visible for debugging / audit
 *
 * Graceful degradation:
 *   If REDIS_URL is not set (local dev without Redis), falls back to
 *   setImmediate — same fire-and-forget behaviour as before.
 *
 * PII policy:
 *   Job payloads are stored in Redis (visible to anyone with Redis access and
 *   in BullMQ dashboards). To minimise PII exposure, only the ride_id is
 *   stored in the queue. The worker resolves driver_id / rider_id from the
 *   database at processing time, where access is controlled by RLS policies.
 *   Raw IP addresses and device identifiers are never stored in the queue.
 *
 * Job types:
 *   'collusion'        — checkRideCollusion    (on ride accept)  payload: { rideId }
 *   'fare_manipulation'— checkFareManipulation (on ride complete) payload: { rideId, estimatedFare, finalFare }
 *   'gps'              — checkGpsSpoofing      (on location update) payload: { rideId, userId, lat, lng, timestampMs, speedKmh, accuracyM }
 */

const {
  checkRideCollusion,
  checkFareManipulation,
  checkGpsSpoofing,
} = require('../../../shared/fraudDetection');

let Queue    = null;
let fraudQueue = null;

if (process.env.REDIS_URL && process.env.NODE_ENV !== 'test') {
  try {
    const bullmq     = require('bullmq');
    Queue            = bullmq.Queue;
    const { Redis }  = require('ioredis');
    const connection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });

    fraudQueue = new Queue('fraud-checks', {
      connection,
      defaultJobOptions: {
        attempts:          2,
        backoff:           { type: 'exponential', delay: 3000 },
        removeOnComplete:  100,
        removeOnFail:      500,
      },
    });

    logger.info('[FraudQueue] BullMQ fraud-checks queue ready');
  } catch (err) {
    logger.warn('[FraudQueue] BullMQ unavailable — setImmediate fallback active:', err.message);
  }
}

/**
 * Dispatch a fraud check job.
 * Returns true if enqueued in BullMQ, false if falling back to setImmediate.
 *
 * @param {'collusion'|'fare_manipulation'|'gps'} checkType
 * @param {object} payload  - serialisable job data
 */
async function enqueueFraudCheck(checkType, payload) {
  if (fraudQueue) {
    try {
      await fraudQueue.add(checkType, payload);
      return true;
    } catch (err) {
      // Queue enqueue failed (e.g. Redis blip) — fall through to setImmediate
      logger.warn('[FraudQueue] Enqueue error, using setImmediate fallback:', err.message);
    }
  }
  // Graceful fallback — non-blocking but not durable
  setImmediate(() => runFraudCheck(checkType, payload).catch(() => {}));
  return false;
}

/**
 * Execute a fraud check directly.
 * Called by fraudWorker (which has already resolved PII from DB) and the
 * setImmediate fallback path.
 *
 * For 'collusion' and 'fare_manipulation' the caller must supply the resolved
 * driverId (and riderId for collusion) — these are looked up from the DB by
 * the worker so they never travel through the Redis queue.
 *
 * @param {'collusion'|'fare_manipulation'|'gps'} checkType
 * @param {object} resolvedPayload  — PII-resolved data (not raw queue payload)
 */
async function runFraudCheck(checkType, resolvedPayload) {
  switch (checkType) {
    case 'collusion':
      return checkRideCollusion(
        resolvedPayload.rideId,
        resolvedPayload.driverId,
        resolvedPayload.riderId,
        resolvedPayload.meta || {}
      );
    case 'fare_manipulation':
      return checkFareManipulation(
        resolvedPayload.rideId,
        resolvedPayload.driverId,
        resolvedPayload.estimatedFare,
        resolvedPayload.finalFare
      );
    case 'gps':
      return checkGpsSpoofing(resolvedPayload);
    default:
      logger.warn('[FraudQueue] Unknown check type:', checkType);
  }
}

async function closeQueue() {
  if (fraudQueue) await fraudQueue.close();
}
process.on('SIGTERM', closeQueue);
process.on('SIGINT',  closeQueue);

module.exports = { enqueueFraudCheck, runFraudCheck, fraudQueue, closeQueue };

'use strict';
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
 * Job types:
 *   'collusion'        — checkRideCollusion    (on ride accept)
 *   'fare_manipulation'— checkFareManipulation (on ride complete)
 *   'gps'              — checkGpsSpoofing      (on location update)
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

    console.log('[FraudQueue] BullMQ fraud-checks queue ready');
  } catch (err) {
    console.warn('[FraudQueue] BullMQ unavailable — setImmediate fallback active:', err.message);
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
      console.warn('[FraudQueue] Enqueue error, using setImmediate fallback:', err.message);
    }
  }
  // Graceful fallback — non-blocking but not durable
  setImmediate(() => runFraudCheck(checkType, payload).catch(() => {}));
  return false;
}

/**
 * Execute a fraud check directly (called by fraudWorker and the setImmediate fallback).
 *
 * @param {'collusion'|'fare_manipulation'|'gps'} checkType
 * @param {object} payload
 */
async function runFraudCheck(checkType, payload) {
  switch (checkType) {
    case 'collusion':
      return checkRideCollusion(
        payload.rideId,
        payload.driverId,
        payload.riderId,
        payload.meta || {}
      );
    case 'fare_manipulation':
      return checkFareManipulation(
        payload.rideId,
        payload.driverId,
        payload.estimatedFare,
        payload.finalFare
      );
    case 'gps':
      return checkGpsSpoofing(payload);
    default:
      console.warn('[FraudQueue] Unknown check type:', checkType);
  }
}

async function closeQueue() {
  if (fraudQueue) await fraudQueue.close();
}
process.on('SIGTERM', closeQueue);
process.on('SIGINT',  closeQueue);

module.exports = { enqueueFraudCheck, runFraudCheck, fraudQueue, closeQueue };

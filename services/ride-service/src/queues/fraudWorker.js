'use strict';
/**
 * Fraud Check Worker (BullMQ)
 *
 * Processes jobs from the 'fraud-checks' queue.
 * concurrency: 10 — up to 10 fraud checks run in parallel per instance.
 * Each check calls the ML service (800 ms timeout) or falls back to rules.
 *
 * Start with startFraudWorker() from server.js.
 */

const { runFraudCheck } = require('./fraudQueue');
const logger            = require('../utils/logger');

let Worker = null;
if (process.env.REDIS_URL && process.env.NODE_ENV !== 'test') {
  try {
    Worker = require('bullmq').Worker;
  } catch { /* BullMQ not installed — degraded mode */ }
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
      const { name: checkType, data: payload } = job;
      logger.info('[FraudWorker] Processing fraud check', {
        checkType,
        rideId:  payload.rideId  || null,
        jobId:   job.id,
        attempt: job.attemptsMade + 1,
      });
      await runFraudCheck(checkType, payload);
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

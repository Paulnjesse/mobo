'use strict';
const logger = require('../utils/logger');
/**
 * Payment Event Queue (BullMQ over Redis)
 * Decouples webhook processing from business logic.
 * Falls back to direct processing if Redis is unavailable.
 */
let Queue = null;
let paymentQueue = null;

if (process.env.REDIS_URL && process.env.NODE_ENV !== 'test') {
  try {
    const bullmq = require('bullmq');
    Queue = bullmq.Queue;
    const { Redis } = require('ioredis');
    const connection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
    paymentQueue = new Queue('payments', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });
    logger.info('[PaymentQueue] BullMQ queue initialized');
  } catch (e) {
    logger.warn('[PaymentQueue] BullMQ unavailable, falling back to direct processing:', e.message);
  }
}

/**
 * Add a payment event to the queue.
 * @param {string} eventType  e.g. 'mtn_webhook', 'orange_webhook', 'stripe_confirmed'
 * @param {object} payload    The event data
 */
async function enqueuePaymentEvent(eventType, payload) {
  if (paymentQueue) {
    await paymentQueue.add(eventType, payload, { jobId: payload.reference || undefined });
    return true;
  }
  return false; // caller handles direct processing
}

/**
 * Graceful shutdown — drains and closes queue connection.
 */
async function closeQueue() {
  if (paymentQueue) await paymentQueue.close();
}

process.on('SIGTERM', closeQueue);

module.exports = { enqueuePaymentEvent, closeQueue, paymentQueue };

'use strict';
/**
 * BullMQ Worker — processes queued payment events.
 * Start this as a separate process or alongside the main server.
 */
const db = require('../config/database');
const logger = require('../utils/logger');

let Worker = null;
if (process.env.REDIS_URL && process.env.NODE_ENV !== 'test') {
  try {
    const bullmq = require('bullmq');
    Worker = bullmq.Worker;
  } catch { /* BullMQ not installed */ }
}

async function processPaymentJob(job) {
  const { name: eventType, data: payload } = job;
  logger.info(`[PaymentWorker] Processing ${eventType}`, { reference: payload.reference, jobId: job.id });

  if (eventType === 'mtn_webhook' || eventType === 'orange_webhook') {
    const status = payload.status === 'SUCCESSFUL' || payload.status === '60019' ? 'completed' : 'failed';
    const reference = payload.externalId || payload.order_id;
    if (!reference) return;

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // SELECT FOR UPDATE locks the row so concurrent webhooks can't double-process
      const { rows } = await client.query(
        `SELECT id, ride_id, user_id, amount FROM payments
         WHERE reference = $1 AND status = 'pending'
         FOR UPDATE SKIP LOCKED`,
        [reference]
      );
      if (!rows[0]) {
        await client.query('ROLLBACK');
        logger.info(`[PaymentWorker] Payment ${reference} already processed`);
        return;
      }
      const payment = rows[0];

      await client.query(
        `UPDATE payments SET status = $1, updated_at = NOW() WHERE id = $2`,
        [status, payment.id]
      );
      if (status === 'completed') {
        await client.query(
          `UPDATE rides SET payment_status = 'paid', updated_at = NOW() WHERE id = $1`,
          [payment.ride_id]
        );
        logger.info(`[PaymentWorker] Payment ${reference} completed`, { rideId: payment.ride_id });
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error(`[PaymentWorker] Transaction rolled back for ${reference}`, { err: err.message });
      throw err; // BullMQ will retry the job
    } finally {
      client.release();
    }
  }
}

function startWorker() {
  if (!Worker || !process.env.REDIS_URL) {
    logger.warn('[PaymentWorker] Redis unavailable, worker not started');
    return null;
  }
  const { Redis } = require('ioredis');
  const connection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  const worker = new Worker('payments', processPaymentJob, { connection, concurrency: 5 });
  worker.on('completed', (job) => logger.info(`[PaymentWorker] Job ${job.id} done`));
  worker.on('failed', (job, err) => logger.error(`[PaymentWorker] Job ${job?.id} failed`, { err: err.message }));
  logger.info('[PaymentWorker] Worker started');
  return worker;
}

module.exports = { startWorker };

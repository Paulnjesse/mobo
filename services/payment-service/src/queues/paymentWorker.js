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
    const { rows } = await db.query(
      `SELECT id, ride_id, user_id, amount FROM payments WHERE reference = $1 AND status = 'pending'`,
      [reference]
    );
    if (!rows[0]) { logger.info(`[PaymentWorker] Payment ${reference} already processed`); return; }
    const payment = rows[0];
    await db.query(`UPDATE payments SET status = $1, updated_at = NOW() WHERE id = $2`, [status, payment.id]);
    if (status === 'completed') {
      await db.query(`UPDATE rides SET payment_status = 'paid', updated_at = NOW() WHERE id = $1`, [payment.ride_id]);
      logger.info(`[PaymentWorker] Payment ${reference} completed`, { rideId: payment.ride_id });
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

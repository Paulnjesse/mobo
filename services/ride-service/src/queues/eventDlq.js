'use strict';
/**
 * General-purpose Event Dead Letter Queue
 *
 * Handles failed ride/payment events (DB write failures, downstream service
 * errors) that are NOT push notifications.  Uses the same Redis sorted-set
 * pattern as the push DLQ so operational tooling is identical.
 *
 * Usage:
 *   const { enqueueEventRetry } = require('./eventDlq');
 *   await enqueueEventRetry('ride_event', { ride_id, event_type, ... });
 *
 * The worker drains automatically every 30 s.  On permanent failure (after
 * MAX_RETRIES) the event is written to the `dead_letter_events` DB table so
 * nothing is silently lost.
 */

const logger = require('../utils/logger');
const cache  = require('../utils/cache');
const db     = require('../config/database');

const EVENT_DLQ_KEY  = 'event:dlq';   // Redis ZSET — score = retry-at ms
const MAX_RETRIES    = 5;
const BACKOFF_BASE_S = 10;            // 10 s, 20 s, 40 s, 80 s, 160 s
const DRAIN_MS       = 30_000;

// ── Enqueue ───────────────────────────────────────────────────────────────────

/**
 * Enqueue a failed event for retry.
 *
 * @param {string} eventType   e.g. 'ride_event', 'payment_webhook', 'push'
 * @param {object} payload     Arbitrary JSON — will be re-delivered to handler
 * @param {number} [attempt=1] Current attempt number (1-based)
 * @param {Function} [handlerKey] String key identifying which handler to use
 */
async function enqueueEventRetry(eventType, payload, attempt = 1, handlerKey = null) {
  if (attempt > MAX_RETRIES) {
    logger.warn('[EventDLQ] Max retries exceeded — writing to dead_letter_events', { eventType, attempt });
    await _persistDeadLetter(eventType, payload, 'max_retries_exceeded');
    return;
  }

  const retryAfterMs = Date.now() + BACKOFF_BASE_S * Math.pow(2, attempt - 1) * 1000;
  const entry = JSON.stringify({ eventType, payload, attempt, handlerKey, enqueuedAt: Date.now() });

  try {
    await cache.zadd(EVENT_DLQ_KEY, retryAfterMs, entry);
    logger.info('[EventDLQ] Enqueued for retry', { eventType, attempt, retryAfterSec: Math.round((retryAfterMs - Date.now()) / 1000) });
  } catch (redisErr) {
    logger.warn('[EventDLQ] Redis unavailable — falling back to dead_letter_events', { err: redisErr.message });
    await _persistDeadLetter(eventType, payload, 'redis_unavailable');
  }
}

// ── Handler registry ──────────────────────────────────────────────────────────

/** Map handlerKey → async handler function registered at startup. */
const _handlers = new Map();

/**
 * Register a handler function for a given key.
 * @param {string}   key      Unique identifier, e.g. 'ride_event'
 * @param {Function} handler  async (payload) => void — throw to signal failure
 */
function registerHandler(key, handler) {
  _handlers.set(key, handler);
}

// ── Built-in handlers ─────────────────────────────────────────────────────────

/**
 * Built-in handler for ride_event: re-inserts into ride_events table.
 */
registerHandler('ride_event', async (payload) => {
  const { ride_id, event_type, old_status, new_status, actor_id, actor_role, metadata } = payload;
  await db.query(
    `INSERT INTO ride_events
       (ride_id, event_type, old_status, new_status, actor_id, actor_role, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [ride_id, event_type, old_status || null, new_status || null, actor_id || null, actor_role || null, JSON.stringify(metadata || {})]
  );
});

/**
 * Built-in handler for payment_event: re-inserts into payment_events table if it exists,
 * otherwise logs to notifications.
 */
registerHandler('payment_event', async (payload) => {
  const { payment_id, event_type, status, amount, user_id, metadata } = payload;
  // Try payment_events first; fall back to a structured log record
  try {
    await db.query(
      `INSERT INTO payment_events (payment_id, event_type, status, amount, metadata)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [payment_id, event_type, status || null, amount || null, JSON.stringify(metadata || {})]
    );
  } catch {
    // payment_events table may not exist in all deployments — persist to notifications
    if (user_id) {
      await db.query(
        `INSERT INTO notifications (user_id, type, title, body, data, is_read)
         VALUES ($1, 'payment_event_retry', 'Payment event recovered', $2, $3::jsonb, false)`,
        [user_id, event_type, JSON.stringify({ payment_id, event_type, status, amount, metadata })]
      );
    }
  }
});

// ── Drain ─────────────────────────────────────────────────────────────────────

async function drainEventDlq() {
  try {
    const now     = Date.now();
    const entries = await cache.zrangebyscore(EVENT_DLQ_KEY, 0, now);
    if (!entries || entries.length === 0) return;

    logger.info('[EventDLQ] Draining', { count: entries.length });

    for (const raw of entries) {
      let item;
      try { item = JSON.parse(raw); } catch { continue; }

      // Remove before processing — prevents double-processing on crash
      await cache.zrem(EVENT_DLQ_KEY, raw);

      const handler = item.handlerKey ? _handlers.get(item.handlerKey) : _handlers.get(item.eventType);

      if (!handler) {
        logger.warn('[EventDLQ] No handler registered — discarding', { eventType: item.eventType, handlerKey: item.handlerKey });
        await _persistDeadLetter(item.eventType, item.payload, 'no_handler');
        continue;
      }

      try {
        await handler(item.payload);
        logger.info('[EventDLQ] Retry succeeded', { eventType: item.eventType, attempt: item.attempt });
      } catch (err) {
        logger.warn('[EventDLQ] Retry failed', { eventType: item.eventType, attempt: item.attempt, err: err.message });
        await enqueueEventRetry(item.eventType, item.payload, (item.attempt || 1) + 1, item.handlerKey);
      }
    }
  } catch (err) {
    logger.warn('[EventDLQ] Drain error', { err: err.message });
  }
}

// ── Dead-letter persistence ───────────────────────────────────────────────────

async function _persistDeadLetter(eventType, payload, reason) {
  try {
    await db.query(
      `INSERT INTO dead_letter_events (event_type, payload, failure_reason, created_at)
       VALUES ($1, $2::jsonb, $3, NOW())`,
      [eventType, JSON.stringify(payload || {}), reason]
    );
  } catch (dbErr) {
    // Last resort: structured log so at least it shows in log aggregation
    logger.error('[EventDLQ] dead_letter_events write failed — event permanently lost', {
      eventType, payload, reason, err: dbErr.message,
    });
  }
}

// ── Worker lifecycle ──────────────────────────────────────────────────────────

let _drainTimer = null;

function startEventDlqWorker() {
  if (_drainTimer) return;
  _drainTimer = setInterval(async () => {
    try {
      await drainEventDlq();
    } catch (err) {
      logger.warn('[EventDLQ] Unhandled drain error', { err: err.message });
    }
  }, DRAIN_MS);
  logger.info('[EventDLQ] Worker started — draining every 30 s');
}

function stopEventDlqWorker() {
  if (_drainTimer) {
    clearInterval(_drainTimer);
    _drainTimer = null;
  }
}

module.exports = {
  enqueueEventRetry,
  registerHandler,
  drainEventDlq,
  startEventDlqWorker,
  stopEventDlqWorker,
};

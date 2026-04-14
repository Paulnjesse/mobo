'use strict';
/**
 * deliverySchedulerJob
 *
 * Runs every minute. Finds scheduled deliveries whose `scheduled_at` has
 * arrived and whose status is still 'pending', then emits a Socket.IO
 * event so the dispatcher (or driver-matching logic) can act on them.
 *
 * In production this would trigger the driver-matching service;
 * here it emits a `scheduled_delivery_ready` event to the `/deliveries`
 * namespace so connected clients can react immediately.
 */

const db     = require('../config/database');
const logger = require('../utils/logger');
const { withLock } = require('../utils/distributedLock');

const POLL_INTERVAL_MS = 60_000; // 1 minute
const LOCK_TTL_MS      = 55_000; // expires before next tick; crash-safe auto-release

/**
 * @param {import('socket.io').Server} io  — top-level Socket.IO server
 */
function startDeliverySchedulerJob(io) {
  logger.info('[DeliveryScheduler] Job started — polling every 60 s');

  const tick = async () => {
    try {
      // Find deliveries whose scheduled time has arrived (+/- 1 min window)
      const { rows } = await db.query(
        `SELECT id, sender_id, scheduled_at, delivery_type, package_size, pickup_address
           FROM deliveries
          WHERE status      = 'pending'
            AND scheduled_at IS NOT NULL
            AND scheduled_at <= NOW() + INTERVAL '1 minute'
            AND scheduled_at >= NOW() - INTERVAL '5 minutes'
         ORDER BY scheduled_at ASC
         LIMIT 50`
      );

      if (rows.length === 0) return;

      logger.info(`[DeliveryScheduler] ${rows.length} scheduled delivery/deliveries ready`);

      for (const delivery of rows) {
        // Emit to the delivery room so sender's app can show "Driver search started"
        if (io) {
          io.of('/deliveries')
            .to(`delivery:${delivery.id}`)
            .emit('scheduled_delivery_ready', {
              deliveryId:   delivery.id,
              scheduledAt:  delivery.scheduled_at,
              deliveryType: delivery.delivery_type,
              packageSize:  delivery.package_size,
              pickupAddress: delivery.pickup_address,
              timestamp:    Date.now(),
            });
        }

        // Log for monitoring / future integration with driver-matching service
        logger.info('[DeliveryScheduler] Scheduled delivery triggered', {
          deliveryId:  delivery.id,
          scheduledAt: delivery.scheduled_at,
        });
      }
    } catch (err) {
      logger.error('[DeliveryScheduler] tick failed', { error: err.message });
    }
  };

  // Wrap with distributed lock — prevents duplicate dispatches across scaled instances
  const lockedTick = () => withLock('lock:delivery-scheduler-job', LOCK_TTL_MS, tick);

  // Run immediately, then on interval
  lockedTick();
  const interval = setInterval(lockedTick, POLL_INTERVAL_MS);

  // Expose stop handle for clean shutdown
  return { stop: () => clearInterval(interval) };
}

module.exports = { startDeliverySchedulerJob };

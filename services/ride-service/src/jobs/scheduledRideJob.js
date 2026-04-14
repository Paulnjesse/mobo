/**
 * Feature 29 — Scheduled Ride Reminders & Auto-Dispatch
 *
 * Runs every 60 seconds and:
 *   1. Sends a 24-hour advance push reminder  (23h 45m → 24h 15m before departure)
 *   2. Sends a  1-hour advance push reminder  (55m → 65m before departure)
 *   3. Auto-dispatches rides due in ≤ 2 minutes by emitting `incoming_ride_request`
 *      to nearby online drivers via the location socket namespace.
 *
 * Reminder columns added in migration_014.sql:
 *   reminder_24h_sent  BOOLEAN DEFAULT false
 *   reminder_1h_sent   BOOLEAN DEFAULT false
 *   auto_dispatched_at TIMESTAMPTZ
 */

const db = require('../config/database');
const { notifyRiderDriverArrived } = require('../services/pushNotifications');
const { withLock } = require('../utils/distributedLock');

const POLL_MS    = 60 * 1000; // every 60 s
// Lock TTL: 55 s — expires before the next tick so one slow instance never
// permanently blocks the job. Two separate lock keys for two separate actions.
const LOCK_TTL_MS = 55_000;

// ── Push helper ─────────────────────────────────────────────────────────────
const { Expo } = require('expo-server-sdk');
const expo = new Expo();

async function sendPush(token, title, body, data = {}) {
  if (!token || !Expo.isExpoPushToken(token)) return;
  try {
    const chunks = expo.chunkPushNotifications([{ to: token, sound: 'default', title, body, data }]);
    for (const chunk of chunks) await expo.sendPushNotificationsAsync(chunk);
  } catch (err) {
    console.warn('[ScheduledRideJob] Push failed:', err.message);
  }
}

// ── Format time string ───────────────────────────────────────────────────────
function fmt(d) {
  return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Main job ─────────────────────────────────────────────────────────────────
async function runScheduledRideJob(io) {
  const now = new Date();

  try {
    // Fetch all upcoming scheduled rides that are still pending
    const { rows: rides } = await db.query(
      `SELECT r.*,
              u.push_token, u.full_name AS rider_name,
              u.phone      AS rider_phone
       FROM rides r
       JOIN users u ON u.id = r.rider_id
       WHERE r.is_scheduled = true
         AND r.status = 'pending'
         AND r.scheduled_at IS NOT NULL
         AND r.scheduled_at > NOW()
         AND r.scheduled_at < NOW() + INTERVAL '25 hours'`
    );

    for (const ride of rides) {
      const departMs = new Date(ride.scheduled_at).getTime() - now.getTime();
      const departMin = departMs / 60000;

      // ── 1. 24-hour reminder (window: 23h 45m – 24h 15m) ─────────────────
      if (!ride.reminder_24h_sent && departMin >= 23 * 60 + 45 && departMin <= 24 * 60 + 15) {
        await sendPush(
          ride.push_token,
          'Ride reminder — tomorrow',
          `Your ride is scheduled for ${fmt(ride.scheduled_at)} tomorrow. From: ${ride.pickup_address}`,
          { type: 'scheduled_reminder_24h', ride_id: ride.id }
        );
        await db.query(
          'UPDATE rides SET reminder_24h_sent = true WHERE id = $1',
          [ride.id]
        );
        console.log(`[ScheduledRideJob] 24h reminder sent for ride ${ride.id}`);
      }

      // ── 2. 1-hour reminder (window: 55m – 65m) ───────────────────────────
      if (!ride.reminder_1h_sent && departMin >= 55 && departMin <= 65) {
        await sendPush(
          ride.push_token,
          'Your ride is in 1 hour',
          `Departing ${fmt(ride.scheduled_at)} from ${ride.pickup_address}. Get ready!`,
          { type: 'scheduled_reminder_1h', ride_id: ride.id }
        );
        await db.query(
          'UPDATE rides SET reminder_1h_sent = true WHERE id = $1',
          [ride.id]
        );
        console.log(`[ScheduledRideJob] 1h reminder sent for ride ${ride.id}`);
      }

      // ── 3. Auto-dispatch (window: ≤ 2 minutes until departure) ──────────
      if (!ride.auto_dispatched_at && departMin <= 2 && departMin > -5) {
        await db.query(
          'UPDATE rides SET auto_dispatched_at = NOW(), status = $1 WHERE id = $2',
          ['searching', ride.id]
        );

        // Emit to nearby drivers via Socket.IO location namespace
        if (io) {
          const payload = {
            rideId: ride.id,
            pickup: {
              address: ride.pickup_address,
              lat: ride.pickup_location?.coordinates?.[1] ?? 0,
              lng: ride.pickup_location?.coordinates?.[0] ?? 0,
            },
            dropoff: {
              address: ride.dropoff_address,
              lat: ride.dropoff_location?.coordinates?.[1] ?? 0,
              lng: ride.dropoff_location?.coordinates?.[0] ?? 0,
            },
            rideType:       ride.ride_type,
            estimatedFare:  ride.estimated_fare,
            isScheduled:    true,
            scheduledAt:    ride.scheduled_at,
            riderName:      ride.rider_name,
          };

          // Broadcast to all connected drivers in the location namespace
          io.of('/location').emit('incoming_ride_request', payload);
        }

        // Notify rider that matching has started
        await sendPush(
          ride.push_token,
          'Finding your driver',
          `We\'re matching you with a driver for your ${fmt(ride.scheduled_at)} ride. Stay ready!`,
          { type: 'scheduled_dispatch', ride_id: ride.id }
        );

        console.log(`[ScheduledRideJob] Auto-dispatched ride ${ride.id}`);
      }
    }
  } catch (err) {
    console.error('[ScheduledRideJob] Error:', err.message);
  }
}

// ── Start the job ─────────────────────────────────────────────────────────────
function startScheduledRideJob(io) {
  console.log('[ScheduledRideJob] Started — polling every 60s');
  const tick = () => withLock('lock:scheduled-ride-job', LOCK_TTL_MS, () => runScheduledRideJob(io));
  tick(); // run immediately on startup
  setInterval(tick, POLL_MS);
}

module.exports = { startScheduledRideJob };

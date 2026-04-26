/**
 * MOBO Push Notification Service — ride-service
 * Ride-specific notification helpers built on top of Expo Push API.
 * Includes a Redis-backed Dead Letter Queue (DLQ) with exponential backoff retries.
 */

const logger = require('../utils/logger');

const { Expo } = require('expo-server-sdk');
const db    = require('../config/database');
const cache = require('../utils/cache');

const expo = new Expo();

// ---------------------------------------------------------------------------
// Push DLQ — Redis sorted set keyed by retry-at timestamp (score)
// ---------------------------------------------------------------------------
const DLQ_KEY       = 'push:dlq';          // Redis ZSET key
const MAX_RETRIES   = 3;                   // drop after 3 failed attempts
const BACKOFF_BASE  = 30;                  // seconds — doubles each attempt: 30s, 60s, 120s

/** Enqueue a failed push notification for retry. */
async function enqueuePushRetry(token, title, body, data, attempt = 1) {
  if (attempt > MAX_RETRIES) {
    logger.warn('[PushDLQ] Max retries exceeded — dropping notification', { token: token?.slice(-8), title });
    return;
  }
  const retryAfterMs = Date.now() + (BACKOFF_BASE * Math.pow(2, attempt - 1)) * 1000;
  const entry = JSON.stringify({ token, title, body, data, attempt });
  try {
    await cache.zadd(DLQ_KEY, retryAfterMs, entry);
    logger.info('[PushDLQ] Queued for retry', { attempt, retryAfterMs, title });
  } catch (redisErr) {
    logger.warn('[PushDLQ] Failed to enqueue retry', { err: redisErr.message });
  }
}

/** Drain DLQ — call periodically (e.g. every 60 s) to retry ready messages. */
async function drainPushDlq() {
  try {
    // Fetch all entries whose retry time has passed
    const now     = Date.now();
    const entries = await cache.zrangebyscore(DLQ_KEY, 0, now);
    if (!entries || entries.length === 0) return;

    for (const raw of entries) {
      let item;
      try { item = JSON.parse(raw); } catch { continue; }
      // Remove from queue before retrying (prevents re-processing on crash)
      await cache.zrem(DLQ_KEY, raw);
      const result = await _send(item.token, item.title, item.body, item.data, true);
      if (!result.success) {
        await enqueuePushRetry(item.token, item.title, item.body, item.data, (item.attempt || 1) + 1);
      }
    }
  } catch (err) {
    logger.warn('[PushDLQ] Drain error', { err: err.message });
  }
}

// Start DLQ drain on a 60-second interval (only once per process)
let _dlqTimer = null;
function startPushDlqWorker() {
  if (_dlqTimer) return;
  _dlqTimer = setInterval(drainPushDlq, 60_000);
  logger.info('[PushDLQ] Worker started — draining every 60 s');
}

// Auto-start when module is loaded (ride-service import starts the worker)
startPushDlqWorker();

// ---------------------------------------------------------------------------
// Core send helper (shared internally)
// ---------------------------------------------------------------------------

/**
 * @param {string}  token
 * @param {string}  title
 * @param {string}  body
 * @param {object}  data
 * @param {boolean} [isDlqRetry=false]  Skip re-enqueueing if this is already a retry
 */
async function _send(token, title, body, data = {}, isDlqRetry = false) {
  if (!token || !Expo.isExpoPushToken(token)) {
    logger.warn(`[RideNotification] Skipping invalid/missing token: ${token}`);
    return { success: false, error: 'Invalid or missing push token' };
  }

  const message = { to: token, sound: 'default', title, body, data };

  try {
    const chunks = expo.chunkPushNotifications([message]);
    let ticket = null;
    for (const chunk of chunks) {
      const result = await expo.sendPushNotificationsAsync(chunk);
      ticket = result[0];
      if (ticket.status === 'error') {
        logger.error('[RideNotification] Ticket error:', ticket.message, ticket.details);
        if (ticket.details?.error === 'DeviceNotRegistered') {
          _removeStalePushToken(token).catch(() => {});
        } else if (!isDlqRetry) {
          // Transient error — enqueue for retry
          await enqueuePushRetry(token, title, body, data, 1);
        }
      }
    }

    // Persist to notifications table if a user_id is supplied in data
    if (data.user_id) {
      try {
        await db.query(
          `INSERT INTO notifications (user_id, title, message, type, data)
           VALUES ($1, $2, $3, 'push', $4)`,
          [data.user_id, title, body, JSON.stringify({ token, ticket, ...data })]
        );
      } catch (dbErr) {
        logger.warn('[RideNotification] DB persist error:', dbErr.message);
      }
    }

    return { success: ticket?.status === 'ok', ticket };
  } catch (err) {
    logger.error('[RideNotification] Send error:', err.message);
    if (!isDlqRetry) {
      await enqueuePushRetry(token, title, body, data, 1);
    }
    return { success: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Ride-specific notification helpers
// ---------------------------------------------------------------------------

/**
 * notifyDriverNewRide(driverToken, rideDetails)
 * Sent to a driver when a new ride is available nearby.
 *
 * @param {string} driverToken
 * @param {{ ride_id: string, pickup_address: string, dropoff_address: string,
 *           estimated_fare: number, distance_km: number, user_id?: string }} rideDetails
 */
async function notifyDriverNewRide(driverToken, rideDetails) {
  const {
    ride_id,
    pickup_address = 'Pickup location',
    dropoff_address = 'Dropoff location',
    estimated_fare = 0,
    distance_km = 0
  } = rideDetails;

  return _send(
    driverToken,
    'New Ride Request!',
    `${pickup_address} → ${dropoff_address} · ${distance_km} km · ${estimated_fare.toLocaleString()} XAF`,
    { type: 'new_ride', ride_id, ...rideDetails }
  );
}

/**
 * notifyRiderDriverAccepted(riderToken, driverDetails)
 * Sent to the rider when a driver accepts their ride.
 *
 * @param {string} riderToken
 * @param {{ ride_id: string, driver_name: string, vehicle: string,
 *           eta_minutes: number, plate: string, user_id?: string }} driverDetails
 */
async function notifyRiderDriverAccepted(riderToken, driverDetails) {
  const {
    driver_name = 'Your driver',
    vehicle = '',
    eta_minutes = '–',
    plate = ''
  } = driverDetails;

  const plateStr = plate ? ` · ${plate}` : '';
  return _send(
    riderToken,
    'Driver on the way!',
    `${driver_name} is heading to you. ETA: ${eta_minutes} min${vehicleStr(vehicle)}${plateStr}.`,
    { type: 'driver_accepted', ...driverDetails }
  );
}

/**
 * notifyRiderDriverArrived(riderToken, details)
 * Sent to the rider when the driver marks themselves as arrived at the pickup.
 * Includes driver photo URL and plate number for safety verification.
 *
 * @param {string} riderToken
 * @param {{
 *   ride_id: string,
 *   driver_name: string,
 *   driver_photo_url?: string,
 *   plate: string,
 *   vehicle_color?: string,
 *   vehicle_make?: string,
 *   user_id?: string
 * }} details
 */
async function notifyRiderDriverArrived(riderToken, details) {
  const {
    driver_name = 'Your driver',
    plate = '',
    vehicle_color = '',
    vehicle_make = '',
    driver_photo_url,
  } = details;

  const vehicleDesc = [vehicle_color, vehicle_make].filter(Boolean).join(' ');
  const plateStr = plate ? ` · Plate: ${plate}` : '';
  const body = `${driver_name} is waiting for you${plateStr}${vehicleDesc ? ` in a ${vehicleDesc}` : ''}. Please verify the plate before boarding.`;

  return _send(
    riderToken,
    '🚗 Your driver has arrived!',
    body,
    {
      type: 'driver_arrived',
      driver_photo_url,   // Mobile app can display this in the notification or in-app banner
      plate,
      vehicle_color,
      vehicle_make,
      ...details,
    }
  );
}

/**
 * notifyRiderDriverArriving(riderToken, eta)
 * Sent to the rider when the driver is nearly at the pickup point.
 *
 * @param {string} riderToken
 * @param {{ ride_id: string, eta: number, user_id?: string }} details
 */
async function notifyRiderDriverArriving(riderToken, details) {
  const { eta = 1 } = details;
  return _send(
    riderToken,
    'Driver arriving soon!',
    `Your driver is ${eta} minute${eta !== 1 ? 's' : ''} away. Please be ready at the pickup point.`,
    { type: 'driver_arriving', ...details }
  );
}

/**
 * notifyRideCompleted(riderToken, fare)
 * Sent to the rider when the ride is marked completed.
 *
 * @param {string} riderToken
 * @param {{ ride_id: string, final_fare: number, points_earned: number, user_id?: string }} details
 */
async function notifyRideCompleted(riderToken, details) {
  const { final_fare = 0, points_earned = 0 } = details;
  return _send(
    riderToken,
    'Ride completed!',
    `You've arrived. Final fare: ${final_fare.toLocaleString()} XAF. +${points_earned} loyalty points earned.`,
    { type: 'ride_completed', ...details }
  );
}

/**
 * notifyNewMessage(receiverToken, details)
 * Sent to rider or driver when the other party sends a chat message.
 *
 * @param {string} receiverToken
 * @param {{ ride_id: string, sender_name: string, text: string,
 *           sender_role: string, user_id?: string }} details
 */
async function notifyNewMessage(receiverToken, details) {
  const { sender_name = 'Someone', text = '', sender_role = 'user' } = details;
  const roleLabel = sender_role === 'driver' ? 'Driver' : 'Rider';
  return _send(
    receiverToken,
    `New message from ${roleLabel}`,
    `${sender_name}: ${text.length > 80 ? text.slice(0, 77) + '…' : text}`,
    { type: 'new_message', ...details }
  );
}

/**
 * notifyRideRequested(parentToken, details)
 * Sent to a parent when their teen account books a ride.
 *
 * @param {string} parentToken
 * @param {{ ride_id: string, pickup_address: string, dropoff_address: string,
 *           ride_type: string, teen_id: string }} details
 */
async function notifyRideRequested(parentToken, details) {
  const { pickup_address = 'Unknown', dropoff_address = 'Unknown', ride_type = 'standard' } = details;
  return _send(
    parentToken,
    'Teen account booked a ride',
    `${pickup_address} → ${dropoff_address} (${ride_type})`,
    { type: 'teen_ride_requested', ...details }
  );
}

/**
 * notifyRideCancelled(token, reason)
 * Sent to either party when the ride is cancelled.
 *
 * @param {string} token
 * @param {{ ride_id: string, reason?: string, cancelled_by?: string, user_id?: string }} details
 */
async function notifyRideCancelled(token, details) {
  const { reason = 'No reason provided', cancelled_by = 'system' } = details;
  const who = cancelled_by === 'rider' ? 'The rider has cancelled.'
    : cancelled_by === 'driver' ? 'Your driver has cancelled. We will find you a new one.'
    : 'This ride has been cancelled.';

  return _send(
    token,
    'Ride Cancelled',
    `${who} Reason: ${reason}`,
    { type: 'ride_cancelled', ...details }
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function vehicleStr(vehicle) {
  return vehicle ? ` in a ${vehicle}` : '';
}

/**
 * Remove a stale push token from the users table.
 * Called automatically when Expo returns DeviceNotRegistered.
 *
 * @param {string} token
 */
async function _removeStalePushToken(token) {
  if (!token) return;
  try {
    await db.query(
      `UPDATE users
       SET expo_push_token = NULL,
           push_token      = NULL
       WHERE expo_push_token = $1 OR push_token = $1`,
      [token]
    );
    logger.info(`[RideNotification] Removed stale token: ${token.slice(0, 30)}...`);
  } catch (err) {
    logger.warn('[RideNotification] Failed to remove stale token:', err.message);
  }
}

module.exports = {
  notifyDriverNewRide,
  notifyRiderDriverAccepted,
  notifyRiderDriverArrived,
  notifyRiderDriverArriving,
  notifyRideCompleted,
  notifyRideCancelled,
  notifyNewMessage,
  notifyRideRequested,
  _removeStalePushToken,
  _send,
};

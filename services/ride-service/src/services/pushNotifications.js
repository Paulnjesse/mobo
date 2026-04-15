/**
 * MOBO Push Notification Service — ride-service
 * Ride-specific notification helpers built on top of Expo Push API.
 */

const logger = require('../utils/logger');

const { Expo } = require('expo-server-sdk');
const db = require('../config/database');

const expo = new Expo();

// ---------------------------------------------------------------------------
// Core send helper (shared internally)
// ---------------------------------------------------------------------------

async function _send(token, title, body, data = {}) {
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

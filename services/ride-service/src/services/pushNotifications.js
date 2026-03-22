/**
 * MOBO Push Notification Service — ride-service
 * Ride-specific notification helpers built on top of Expo Push API.
 */

const { Expo } = require('expo-server-sdk');
const db = require('../config/database');

const expo = new Expo();

// ---------------------------------------------------------------------------
// Core send helper (shared internally)
// ---------------------------------------------------------------------------

async function _send(token, title, body, data = {}) {
  if (!token || !Expo.isExpoPushToken(token)) {
    console.warn(`[RideNotification] Skipping invalid/missing token: ${token}`);
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
        console.error('[RideNotification] Ticket error:', ticket.message, ticket.details);
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
        console.warn('[RideNotification] DB persist error:', dbErr.message);
      }
    }

    return { success: ticket?.status === 'ok', ticket };
  } catch (err) {
    console.error('[RideNotification] Send error:', err.message);
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
// Helper
// ---------------------------------------------------------------------------
function vehicleStr(vehicle) {
  return vehicle ? ` in a ${vehicle}` : '';
}

module.exports = {
  notifyDriverNewRide,
  notifyRiderDriverAccepted,
  notifyRiderDriverArrived,
  notifyRiderDriverArriving,
  notifyRideCompleted,
  notifyRideCancelled,
};

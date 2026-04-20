/**
 * notifyContacts.js
 * Sends SMS (and optionally WhatsApp) to trusted contacts when a ride starts.
 * Requires env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
 * Falls back to console.log if Twilio is not configured (development mode).
 */

const logger = require('../utils/logger');
const twilio = (() => {
  try { return require('twilio'); } catch { return null; }
})();

const sendTripStartSMS = async ({ contacts, driverName, plate, vehicleColor, vehicleMake, shareUrl, eta }) => {
  const sid    = process.env.TWILIO_ACCOUNT_SID;
  const token  = process.env.TWILIO_AUTH_TOKEN;
  const from   = process.env.TWILIO_FROM_NUMBER;

  const message = `🚗 MOBO Ride Alert: Your contact just started a ride.\nDriver: ${driverName} | Vehicle: ${vehicleColor} ${vehicleMake} | Plate: ${plate}${eta ? ` | ETA: ${eta} min` : ''}.\nTrack live: ${shareUrl}`;

  if (!sid || !token || !from || !twilio) {
    // Dev mode: just log
    logger.info('[NotifyContacts] Twilio not configured — would send SMS to:', contacts.map(c => c.phone));
    logger.info('[NotifyContacts] Message:', message);
    return { sent: 0, simulated: contacts.length };
  }

  /* istanbul ignore next */
  const client = twilio(sid, token);
  /* istanbul ignore next */
  let sent = 0;
  /* istanbul ignore next */
  for (const contact of contacts) {
    try {
      await client.messages.create({ body: message, from, to: contact.phone });
      sent++;
    } catch (err) {
      logger.warn(`[NotifyContacts] SMS failed for ${contact.phone}:`, err.message);
    }
  }
  /* istanbul ignore next */
  return { sent, total: contacts.length };
};

const sendSOSSMS = async ({ contacts, triggeredBy, rideId, pickupAddress }) => {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_FROM_NUMBER;

  const message = `🆘 MOBO SOS ALERT: ${triggeredBy} has triggered an emergency SOS on ride #${rideId}. Last known location: ${pickupAddress}. Please check on them immediately or call emergency services (117).`;

  if (!sid || !token || !from || !twilio) {
    logger.info('[NotifyContacts] Twilio not configured — SOS SMS would be sent to:', contacts.map(c => c.phone));
    logger.info('[NotifyContacts] SOS Message:', message);
    return { sent: 0, simulated: contacts.length };
  }

  /* istanbul ignore next */
  const client = twilio(sid, token);
  /* istanbul ignore next */
  let sent = 0;
  /* istanbul ignore next */
  for (const contact of contacts) {
    try {
      await client.messages.create({ body: message, from, to: contact.phone });
      sent++;
    } catch (err) {
      logger.warn(`[NotifyContacts] SOS SMS failed for ${contact.phone}:`, err.message);
    }
  }
  /* istanbul ignore next */
  return { sent, total: contacts.length };
};

module.exports = { sendTripStartSMS, sendSOSSMS };

/**
 * notifyContacts.js
 * Sends SMS (and optionally WhatsApp) to trusted contacts when a ride starts.
 * Requires env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
 * Falls back to console.log if Twilio is not configured (development mode).
 */
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
    console.log('[NotifyContacts] Twilio not configured — would send SMS to:', contacts.map(c => c.phone));
    console.log('[NotifyContacts] Message:', message);
    return { sent: 0, simulated: contacts.length };
  }

  const client = twilio(sid, token);
  let sent = 0;
  for (const contact of contacts) {
    try {
      await client.messages.create({ body: message, from, to: contact.phone });
      sent++;
    } catch (err) {
      console.warn(`[NotifyContacts] SMS failed for ${contact.phone}:`, err.message);
    }
  }
  return { sent, total: contacts.length };
};

module.exports = { sendTripStartSMS };

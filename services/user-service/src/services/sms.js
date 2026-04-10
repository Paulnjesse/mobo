/**
 * MOBO SMS Service — user-service
 * Sends OTP and ride notifications via Twilio.
 * Gracefully falls back to console.log when Twilio credentials are absent (dev mode).
 */

const twilio = require('twilio');
const logger  = require('../utils/logger');

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER;

// Only initialise the real client when credentials are present and non-placeholder
function isConfigured() {
  return (
    !!ACCOUNT_SID &&
    !!AUTH_TOKEN &&
    !!FROM_NUMBER &&
    ACCOUNT_SID !== 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' &&
    ACCOUNT_SID.startsWith('AC')
  );
}

const client = isConfigured()
  ? twilio(ACCOUNT_SID, AUTH_TOKEN)
  : null;

/**
 * OTP message templates per language
 */
const OTP_TEMPLATES = {
  en: (otp) =>
    `Your MOBO verification code is: ${otp}. Valid for 10 minutes. Never share this code.`,
  fr: (otp) =>
    `Votre code de vérification MOBO est: ${otp}. Valide 10 minutes. Ne partagez jamais ce code.`,
  sw: (otp) =>
    `Nambari yako ya uthibitisho wa MOBO ni: ${otp}. Inaisha dakika 10. Usishiriki nambari hii.`
};

/**
 * Ride confirmation message templates per language
 */
const RIDE_CONFIRMED_TEMPLATES = {
  en: (d) =>
    `MOBO: Your ride is confirmed! Driver ${d.driver_name} (${d.vehicle}) is on the way. ETA: ${d.eta} min. Pickup OTP: ${d.pickup_otp}.`,
  fr: (d) =>
    `MOBO: Votre course est confirmée! Le chauffeur ${d.driver_name} (${d.vehicle}) arrive. ETA: ${d.eta} min. OTP de prise en charge: ${d.pickup_otp}.`,
  sw: (d) =>
    `MOBO: Safari yako imethibitishwa! Dereva ${d.driver_name} (${d.vehicle}) anakuja. ETA: ${d.eta} dakika. OTP ya kukupokea: ${d.pickup_otp}.`
};

/**
 * Ride summary message templates per language
 */
const RIDE_SUMMARY_TEMPLATES = {
  en: (d) =>
    `MOBO: Ride completed! Fare: ${d.fare} XAF. Distance: ${d.distance_km} km. Thank you for riding with MOBO!`,
  fr: (d) =>
    `MOBO: Course terminée! Tarif: ${d.fare} XAF. Distance: ${d.distance_km} km. Merci d'avoir voyagé avec MOBO!`,
  sw: (d) =>
    `MOBO: Safari imekamilika! Nauli: ${d.fare} XAF. Umbali: ${d.distance_km} km. Asante kwa kutumia MOBO!`
};

/**
 * Low-level send helper
 * @param {string} to   - E.164 phone number
 * @param {string} body - Message text
 * @returns {{ success: boolean, messageId?: string, mock?: boolean, error?: string }}
 */
async function _send(to, body) {
  if (!client) {
    console.log(`[MOBO SMS] DEV mode — to: ${to} | message: ${body}`);
    return { success: true, mock: true };
  }

  try {
    const message = await client.messages.create({
      body,
      from: FROM_NUMBER,
      to
    });
    return { success: true, messageId: message.sid };
  } catch (err) {
    logger.error({ err }, '[MOBO SMS] Twilio send error');
    return { success: false, mock: true, error: err.message };
  }
}

/**
 * sendOTP(phone, otp, language)
 * Sends an OTP verification code to the user.
 *
 * @param {string} phone    - E.164 phone number
 * @param {string} otp      - 6-digit code
 * @param {string} language - 'en' | 'fr' | 'sw'  (defaults to 'en')
 * @returns {{ success: boolean, messageId?: string, mock?: boolean, error?: string }}
 */
async function sendOTP(phone, otp, language = 'en') {
  const lang = OTP_TEMPLATES[language] ? language : 'en';
  const body = OTP_TEMPLATES[lang](otp);
  return _send(phone, body);
}

/**
 * sendRideConfirmation(phone, rideDetails, language)
 * Sent to the rider when a driver accepts their ride.
 *
 * @param {string} phone
 * @param {{ driver_name: string, vehicle: string, eta: number, pickup_otp: string }} rideDetails
 * @param {string} language
 */
async function sendRideConfirmation(phone, rideDetails, language = 'en') {
  const lang = RIDE_CONFIRMED_TEMPLATES[language] ? language : 'en';
  const body = RIDE_CONFIRMED_TEMPLATES[lang](rideDetails);
  return _send(phone, body);
}

/**
 * sendRideSummary(phone, rideDetails, language)
 * Sent to the rider after ride completion.
 *
 * @param {string} phone
 * @param {{ fare: number, distance_km: number, receipt_url?: string }} rideDetails
 * @param {string} language
 */
async function sendRideSummary(phone, rideDetails, language = 'en') {
  const lang = RIDE_SUMMARY_TEMPLATES[language] ? language : 'en';
  let body = RIDE_SUMMARY_TEMPLATES[lang](rideDetails);
  if (rideDetails.receipt_url) {
    body += ` Receipt: ${rideDetails.receipt_url}`;
  }
  return _send(phone, body);
}

/**
 * sendAlert(phone, message)
 * Generic alert — e.g. security warnings, account notices.
 *
 * @param {string} phone
 * @param {string} message
 */
async function sendAlert(phone, message) {
  const body = `MOBO Alert: ${message}`;
  return _send(phone, body);
}

module.exports = {
  sendOTP,
  sendRideConfirmation,
  sendRideSummary,
  sendAlert
};

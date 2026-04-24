'use strict';
/**
 * smsService.js — Twilio SMS fallback for critical ride events
 *
 * Used as a last resort when Expo push notification delivery fails
 * (expired FCM token, DeviceNotRegistered, network error on Expo's end).
 *
 * Only fires for CRITICAL_EVENTS: ride_cancelled, driver_arriving, payment_failed.
 * Non-critical events (new_message, receipt) are NOT retried via SMS to keep
 * costs down and avoid message fatigue.
 *
 * Falls back gracefully (logs a warning) when Twilio is not configured.
 */

const logger = require('../utils/logger');

const SID   = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FROM  = process.env.TWILIO_PHONE_NUMBER;

function isConfigured() {
  return !!SID && !!TOKEN && !!FROM
    && SID !== 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
    && SID.startsWith('AC');
}

const client = isConfigured()
  /* istanbul ignore next */
  ? require('twilio')(SID, TOKEN)
  : null;

/**
 * sendCriticalAlert(phone, message)
 * Low-level SMS send. Non-throwing — logs errors, never propagates.
 *
 * @param {string} phone   — E.164 format, e.g. +237612345678
 * @param {string} message — SMS body (max 160 chars recommended)
 */
async function sendCriticalAlert(phone, message) {
  if (!phone) return;

  if (!client) {
    logger.warn('[SMSFallback] Twilio not configured — skipping SMS to', phone.slice(0, 6) + '***');
    return;
  }

  try {
    await client.messages.create({ to: phone, from: FROM, body: message });
    logger.info('[SMSFallback] Sent critical SMS', { phone: phone.slice(0, 6) + '***' });
  } catch (err) {
    logger.warn('[SMSFallback] Twilio send error (non-fatal):', err.message);
  }
}

/**
 * notifyCancelled(phone, { driver_name?, reason?, language? })
 * SMS sent to rider/driver when the other party cancels and push failed.
 */
async function notifyCancelled(phone, { driver_name, reason, language = 'en' } = {}) {
  const msgs = {
    en: reason
      ? `MOBO: Your ride has been cancelled. Reason: ${reason}. Open the app to book a new ride.`
      : `MOBO: Your ride has been cancelled. Open the app to book a new ride.`,
    fr: reason
      ? `MOBO: Votre course a été annulée. Raison: ${reason}. Ouvrez l'appli pour en réserver une nouvelle.`
      : `MOBO: Votre course a été annulée. Ouvrez l'appli pour réserver une nouvelle course.`,
  };
  return sendCriticalAlert(phone, msgs[language] || msgs.en);
}

/**
 * notifyDriverArriving(phone, { eta_minutes?, language? })
 * SMS sent to rider when driver is arriving and push failed.
 */
async function notifyDriverArriving(phone, { eta_minutes = 1, language = 'en' } = {}) {
  const msgs = {
    en: `MOBO: Your driver is arriving in ${eta_minutes} min. Please be ready at the pickup point.`,
    fr: `MOBO: Votre chauffeur arrive dans ${eta_minutes} min. Veuillez vous préparer au point de rendez-vous.`,
  };
  return sendCriticalAlert(phone, msgs[language] || msgs.en);
}

/**
 * notifyPaymentFailed(phone, { amount?, language? })
 * SMS sent to rider when payment processing fails and push failed.
 */
async function notifyPaymentFailed(phone, { amount, language = 'en' } = {}) {
  const amtStr = amount ? ` of ${amount.toLocaleString()} XAF` : '';
  const msgs = {
    en: `MOBO: Your payment${amtStr} failed. Please update your payment method in the app.`,
    fr: `MOBO: Votre paiement${amtStr} a échoué. Veuillez mettre à jour votre moyen de paiement dans l'appli.`,
  };
  return sendCriticalAlert(phone, msgs[language] || msgs.en);
}

module.exports = { sendCriticalAlert, notifyCancelled, notifyDriverArriving, notifyPaymentFailed };

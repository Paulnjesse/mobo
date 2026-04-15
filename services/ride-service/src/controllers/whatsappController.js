/**
 * WhatsApp Booking Controller
 *
 * Handles inbound WhatsApp messages via webhook (Twilio or 360dialog/Meta Cloud API).
 * Implements a state-machine conversation for booking rides without the app.
 *
 * Gateway format (Twilio WhatsApp sandbox):
 *   POST body: { From, Body, NumMedia, ... }
 *   Respond with: TwiML <Response><Message>...</Message></Response>
 *
 * For Meta Cloud API (production), replace reply() with the Graph API send-message call.
 */

const logger = require('../utils/logger');
const db = require('../config/database');

// ── Session helpers ────────────────────────────────────────────────────────────
async function getSession(phone) {
  const { rows } = await db.query(
    `SELECT * FROM whatsapp_sessions WHERE phone = $1`,
    [phone]
  );
  return rows[0] || null;
}

async function upsertSession(phone, step, data = {}) {
  await db.query(
    `INSERT INTO whatsapp_sessions (phone, step, data, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (phone) DO UPDATE SET step = $2, data = $3, updated_at = NOW()`,
    [phone, step, JSON.stringify(data)]
  ).catch(() => {
    // Table may not exist in older environments — log and continue
    logger.warn('[whatsappController] whatsapp_sessions table not found — run migration_016.sql');
  });
}

async function clearSession(phone) {
  await db.query('DELETE FROM whatsapp_sessions WHERE phone = $1', [phone]).catch(() => {});
}

// ── Twiml reply helper ────────────────────────────────────────────────────────
function twimlReply(res, message) {
  res.set('Content-Type', 'text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`);
}

// ── Main webhook handler ──────────────────────────────────────────────────────
exports.handleWhatsApp = async (req, res) => {
  try {
    const phone = (req.body.From || '').replace('whatsapp:', '').trim();
    const body  = (req.body.Body || '').trim().toLowerCase();

    if (!phone) return res.status(400).send('Missing From');

    const session = await getSession(phone);
    const step = session?.step || 'menu';
    const data = session?.data ? (typeof session.data === 'object' ? session.data : JSON.parse(session.data)) : {};

    // ── Global reset ──────────────────────────────────────────────────────────
    if (body === 'cancel' || body === 'stop' || body === 'reset' || body === '0') {
      await clearSession(phone);
      return twimlReply(res, [
        '❌ Booking cancelled.',
        '',
        'Reply *1* to book a ride.',
        'Reply *2* to check your last ride.',
        'Reply *HELP* for assistance.',
      ].join('\n'));
    }

    if (body === 'help') {
      return twimlReply(res, [
        '🆘 *MOBO WhatsApp Help*',
        '',
        '• Reply *1* — Book a new ride',
        '• Reply *2* — Check active ride status',
        '• Reply *3* — Cancel latest ride',
        '• Reply *CANCEL* — Reset this conversation',
        '',
        'For emergencies call: *6200-0000*',
      ].join('\n'));
    }

    // ── Step: menu ────────────────────────────────────────────────────────────
    if (step === 'menu') {
      if (body === '1') {
        await upsertSession(phone, 'pickup', data);
        return twimlReply(res, [
          '🚗 *MOBO Ride Booking*',
          '',
          'Please type your *pickup location* (e.g. "Carrefour Melen, Yaoundé"):',
        ].join('\n'));
      }
      if (body === '2') {
        const ride = await db.query(
          `SELECT status, driver_id, estimated_fare FROM rides
           WHERE user_phone = $1 AND status NOT IN ('completed','cancelled')
           ORDER BY created_at DESC LIMIT 1`,
          [phone]
        ).catch(() => ({ rows: [] }));
        const r = ride.rows[0];
        if (!r) return twimlReply(res, '📭 No active ride found. Reply *1* to book a new ride.');
        return twimlReply(res, [
          `🚗 *Your ride status:* ${r.status.toUpperCase()}`,
          `💰 Estimated fare: ${r.estimated_fare?.toLocaleString() || '—'} XAF`,
          '',
          'Reply *3* to cancel this ride.',
          'Reply *CANCEL* to reset.',
        ].join('\n'));
      }
      if (body === '3') {
        await db.query(
          `UPDATE rides SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = 'WhatsApp cancel'
           WHERE user_phone = $1 AND status IN ('requested','accepted')`,
          [phone]
        ).catch(() => {});
        return twimlReply(res, '✅ Your ride has been cancelled. Reply *1* to book a new one.');
      }
      // Default: show menu
      return twimlReply(res, [
        `👋 Welcome to *MOBO* — ride-sharing across Cameroon!`,
        '',
        'Reply with a number:',
        '*1* — Book a new ride',
        '*2* — Check active ride',
        '*3* — Cancel latest ride',
        '*HELP* — Get help',
      ].join('\n'));
    }

    // ── Step: pickup ──────────────────────────────────────────────────────────
    if (step === 'pickup') {
      if (!body) return twimlReply(res, 'Please type your pickup location:');
      const newData = { ...data, pickup: req.body.Body.trim() };
      await upsertSession(phone, 'dropoff', newData);
      return twimlReply(res, [
        `📍 Pickup: *${newData.pickup}*`,
        '',
        'Now type your *destination* (dropoff location):',
      ].join('\n'));
    }

    // ── Step: dropoff ─────────────────────────────────────────────────────────
    if (step === 'dropoff') {
      if (!body) return twimlReply(res, 'Please type your destination:');
      const newData = { ...data, dropoff: req.body.Body.trim() };
      await upsertSession(phone, 'ride_type', newData);
      return twimlReply(res, [
        `📍 Pickup: *${newData.pickup}*`,
        `🏁 Dropoff: *${newData.dropoff}*`,
        '',
        'Choose your ride type:',
        '*1* — 🏍 Moto (fastest, 1 person) — ~500 XAF',
        '*2* — 🚗 Standard (sedan, 4 people) — ~1,500 XAF',
        '*3* — 🚙 XL (SUV, 6 people) — ~2,000 XAF',
      ].join('\n'));
    }

    // ── Step: ride_type ───────────────────────────────────────────────────────
    if (step === 'ride_type') {
      const typeMap = { '1': 'moto', '2': 'standard', '3': 'xl' };
      const rideType = typeMap[body];
      if (!rideType) return twimlReply(res, 'Reply *1*, *2*, or *3* to choose your ride type.');
      const newData = { ...data, ride_type: rideType };
      await upsertSession(phone, 'confirm', newData);
      const emojiMap = { moto: '🏍', standard: '🚗', xl: '🚙' };
      return twimlReply(res, [
        `✅ *Confirm your booking:*`,
        ``,
        `📍 From: ${newData.pickup}`,
        `🏁 To: ${newData.dropoff}`,
        `${emojiMap[rideType]} Ride: ${rideType.charAt(0).toUpperCase() + rideType.slice(1)}`,
        `💰 Payment: Cash on arrival`,
        ``,
        'Reply *YES* to confirm, *NO* to cancel.',
      ].join('\n'));
    }

    // ── Step: confirm ─────────────────────────────────────────────────────────
    if (step === 'confirm') {
      if (body === 'no') {
        await clearSession(phone);
        return twimlReply(res, '❌ Booking cancelled. Reply *1* to start again.');
      }
      if (body !== 'yes') {
        return twimlReply(res, 'Reply *YES* to confirm or *NO* to cancel.');
      }

      // Create the ride
      try {
        await db.query(
          `INSERT INTO rides (
            pickup_address, dropoff_address, ride_type, status,
            payment_method, user_phone, booked_via_ussd
          ) VALUES ($1, $2, $3, 'requested', 'cash', $4, false)`,
          [data.pickup, data.dropoff, data.ride_type || 'standard', phone]
        );
      } catch (dbErr) {
        logger.error('[whatsappController] ride insert error:', dbErr.message);
        // Don't fail — still confirm to user
      }

      await clearSession(phone);
      return twimlReply(res, [
        `🎉 *Ride booked!*`,
        ``,
        `📍 From: ${data.pickup}`,
        `🏁 To: ${data.dropoff}`,
        `🚗 Type: ${data.ride_type || 'Standard'}`,
        ``,
        `We're finding a driver nearby. You'll receive a confirmation once accepted.`,
        ``,
        `To cancel: Reply *3*`,
        `For help: Reply *HELP*`,
        ``,
        `_MOBO — Ride smarter across Cameroon 🇨🇲_`,
      ].join('\n'));
    }

    // ── Fallback ──────────────────────────────────────────────────────────────
    await clearSession(phone);
    return twimlReply(res, [
      '👋 Welcome to *MOBO*!',
      '',
      'Reply *1* to book a ride.',
      'Reply *HELP* for options.',
    ].join('\n'));

  } catch (err) {
    logger.error('[whatsappController]', err);
    res.status(500).send('Internal error');
  }
};

// ── Webhook signature validation (Twilio) ─────────────────────────────────────
exports.validateTwilio = (req, res, next) => {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    // Refuse to serve the endpoint if the secret is not configured
    return res.status(503).json({ error: 'Webhook not configured' });
  }

  const twilio = require('twilio');
  // Reconstruct the full URL Twilio signed — must match what Twilio sees exactly
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host  = req.headers['x-forwarded-host']  || req.headers.host;
  const url   = `${proto}://${host}${req.originalUrl}`;
  const signature = req.headers['x-twilio-signature'] || '';

  const valid = twilio.validateRequest(authToken, signature, url, req.body);
  if (!valid) {
    return res.status(403).json({ error: 'Invalid Twilio signature' });
  }
  next();
};

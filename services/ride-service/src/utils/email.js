const logger = require('./utils/logger');
/**
 * MOBO Email Utility — ride-service
 * Lightweight nodemailer wrapper for sending ride receipts.
 * Uses the same SMTP env vars as user-service.
 */

const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@mobo.app';

const COLORS = { primary: '#FF00BF', dark: '#1A1A2E', bg: '#F8F8FB', muted: '#6B7280', white: '#FFFFFF' };

let transporter = null;
if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

function wrapHtml(title, body) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
  <style>
    body{margin:0;padding:0;background:${COLORS.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif}
    .w{max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}
    .hd{background:${COLORS.dark};padding:28px 32px;text-align:center}
    .logo{color:${COLORS.primary};font-size:28px;font-weight:900;letter-spacing:2px}
    .bd{padding:32px;color:#1A1A2E;line-height:1.65}
    .bd h1{margin:0 0 16px;font-size:22px;font-weight:800}
    .bd p{margin:0 0 16px;font-size:15px;color:#374151}
    .row{display:flex;justify-content:space-between;border-top:1px solid #E5E7EB;padding:10px 0;font-size:14px}
    .ft{background:${COLORS.bg};padding:20px 32px;text-align:center;font-size:12px;color:${COLORS.muted}}
  </style></head><body>
  <div class="w">
    <div class="hd"><div class="logo">MOBO</div><div style="color:rgba(255,255,255,.6);font-size:13px;margin-top:4px">Your ride, your way</div></div>
    <div class="bd">${body}</div>
    <div class="ft">© ${new Date().getFullYear()} MOBO &nbsp;·&nbsp; <a href="https://mobo.app" style="color:${COLORS.primary};text-decoration:none">mobo.app</a></div>
  </div></body></html>`;
}

async function _send({ to, subject, html, text }) {
  if (!transporter) {
    logger.info(`[MOBO Email → ${to}] ${subject}\n${text}`);
    return;
  }
  await transporter.sendMail({ from: `"MOBO" <${FROM_EMAIL}>`, to, subject, html, text });
}

/**
 * sendRideReceiptEmail(email, details)
 * details: { rider_name, pickup_address, dropoff_address, distance_km,
 *            duration_minutes, fare, waiting_fee, tip_amount, currency,
 *            ride_type, driver_name, completed_at, receipt_id, language }
 */
async function sendRideReceiptEmail(email, details) {
  const {
    rider_name = 'Rider',
    pickup_address = '–',
    dropoff_address = '–',
    distance_km = 0,
    duration_minutes = 0,
    fare = 0,
    waiting_fee = 0,
    tip_amount = 0,
    currency = 'XAF',
    ride_type = 'standard',
    driver_name = '–',
    completed_at,
    receipt_id = '',
    language = 'en',
  } = details;

  const total = fare + (waiting_fee || 0) + (tip_amount || 0);
  const dateStr = completed_at
    ? new Date(completed_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
    : new Date().toLocaleString();

  const isEn = language !== 'fr' && language !== 'sw';
  const subject = isEn
    ? `MOBO Receipt — ${total.toLocaleString()} ${currency}`
    : language === 'fr'
    ? `Reçu MOBO — ${total.toLocaleString()} ${currency}`
    : `Risiti ya MOBO — ${total.toLocaleString()} ${currency}`;

  const heading = isEn ? 'Ride Receipt' : language === 'fr' ? 'Reçu de course' : 'Risiti ya Safari';
  const greeting = isEn
    ? `Hi ${rider_name}, thanks for riding with MOBO!`
    : language === 'fr'
    ? `Bonjour ${rider_name}, merci d'avoir utilisé MOBO !`
    : `Habari ${rider_name}, asante kwa kutumia MOBO!`;

  const bodyHtml = `
    <h1>${heading}</h1>
    <p>${greeting}</p>
    <div style="background:#F9FAFB;border-radius:12px;padding:20px;margin:20px 0">
      <div class="row"><span style="color:#6B7280">From</span><span>${pickup_address}</span></div>
      <div class="row"><span style="color:#6B7280">To</span><span>${dropoff_address}</span></div>
      <div class="row"><span style="color:#6B7280">Driver</span><span>${driver_name}</span></div>
      <div class="row"><span style="color:#6B7280">Type</span><span style="text-transform:capitalize">${ride_type}</span></div>
      <div class="row"><span style="color:#6B7280">Distance</span><span>${Number(distance_km).toFixed(1)} km</span></div>
      <div class="row"><span style="color:#6B7280">Duration</span><span>${duration_minutes} min</span></div>
      ${waiting_fee > 0 ? `<div class="row"><span style="color:#6B7280">Waiting fee</span><span>${waiting_fee.toLocaleString()} ${currency}</span></div>` : ''}
      ${tip_amount > 0 ? `<div class="row"><span style="color:#6B7280">Tip</span><span>${tip_amount.toLocaleString()} ${currency}</span></div>` : ''}
      <div class="row"><span style="color:#6B7280">Date</span><span>${dateStr}</span></div>
      <div class="row" style="border-top:2px solid #E5E7EB;margin-top:8px;padding-top:12px">
        <span style="font-weight:700;font-size:16px">Total</span>
        <span style="font-weight:900;font-size:18px;color:#FF00BF">${total.toLocaleString()} ${currency}</span>
      </div>
    </div>
    ${receipt_id ? `<p style="font-size:12px;color:#9CA3AF">Receipt ID: ${receipt_id}</p>` : ''}
  `;

  await _send({ to: email, subject, html: wrapHtml(subject, bodyHtml), text: `MOBO Receipt: ${total.toLocaleString()} ${currency}. ${pickup_address} → ${dropoff_address}.` });
}

module.exports = { sendRideReceiptEmail };

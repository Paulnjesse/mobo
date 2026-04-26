'use strict';
/**
 * phoneProxy.js — Phone number masking for MOBO ride context (shared utility)
 *
 * Masks counterparty phone numbers in ride API responses so riders never see
 * a driver's real number and vice versa.  For voice calls, the
 * callProxyController creates a Twilio Proxy session — this handles display only.
 */

function maskPhone(phone) {
  if (!phone) return null;
  const raw = String(phone).replace(/[\s\-().]/g, '');
  if (raw.length < 6) return '***';
  const showStart = raw.startsWith('+') ? 5 : 4;
  const showEnd   = 2;
  const maskLen   = Math.max(3, raw.length - showStart - showEnd);
  return raw.slice(0, showStart) + '*'.repeat(maskLen) + raw.slice(-showEnd);
}

function maskRidePhones(rideRow, requestingUserId, role) {
  if (!rideRow) return rideRow;
  const out = { ...rideRow };
  if (role === 'admin') return out;
  const isDriver = role === 'driver'
    || String(requestingUserId) === String(rideRow.driver_user_id);
  if (isDriver) {
    if ('rider_phone'  in out) out.rider_phone  = maskPhone(out.rider_phone);
    if ('driver_phone' in out) delete out.driver_phone;
  } else {
    if ('driver_phone' in out) out.driver_phone = maskPhone(out.driver_phone);
    if ('rider_phone'  in out) delete out.rider_phone;
  }
  return out;
}

module.exports = { maskPhone, maskRidePhones };

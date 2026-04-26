'use strict';
/**
 * phoneProxy.js — Phone number masking for MOBO ride context
 *
 * Masks counterparty phone numbers in API responses so riders never see a
 * driver's real number and vice versa.  Real phone numbers are only used
 * server-side for SMS delivery; the client always receives a masked version.
 *
 * For voice calls, the callProxyController.js creates a Twilio Proxy session
 * that routes calls through an anonymous relay number — this file handles
 * display masking only.
 *
 * Format examples:
 *   +237699123456  →  +2376*****56
 *   +2349012345678 →  +2349*****78
 *   0612345678     →  0612***78
 */

/**
 * Mask a phone number for display to counterparties.
 * Keeps country prefix visible, masks the middle, shows last 2 digits.
 *
 * @param {string|null} phone
 * @returns {string|null}
 */
function maskPhone(phone) {
  if (!phone) return null;
  const raw = String(phone).replace(/[\s\-().]/g, ''); // strip whitespace/punctuation
  if (raw.length < 6) return '***';

  const showStart = raw.startsWith('+') ? 5 : 4; // keep +237XX or 0621
  const showEnd   = 2;
  const maskLen   = Math.max(3, raw.length - showStart - showEnd);

  return raw.slice(0, showStart) + '*'.repeat(maskLen) + raw.slice(-showEnd);
}

/**
 * Apply phone masking to a ride row before sending it to a non-admin client.
 *
 * Rules:
 *  - Admin: sees full phones (no masking)
 *  - Rider (requestingUserId === ride.rider_id): sees masked driver_phone, no rider_phone
 *  - Driver (requestingUserId === ride.driver_user_id): sees masked rider_phone, no driver_phone
 *
 * @param {object} rideRow          — SQL row with rider_phone / driver_phone fields
 * @param {string} requestingUserId — ID of the authenticated caller
 * @param {string} role             — 'rider' | 'driver' | 'admin'
 * @returns {object}                — rideRow with phones appropriately masked/removed
 */
function maskRidePhones(rideRow, requestingUserId, role) {
  if (!rideRow) return rideRow;
  const out = { ...rideRow };

  if (role === 'admin') return out; // admins see everything

  const isDriver = role === 'driver'
    || String(requestingUserId) === String(rideRow.driver_user_id);

  if (isDriver) {
    // Driver sees rider's masked phone; own phone removed (they know it)
    if ('rider_phone'  in out) out.rider_phone  = maskPhone(out.rider_phone);
    if ('driver_phone' in out) delete out.driver_phone;
  } else {
    // Rider sees driver's masked phone; own phone removed
    if ('driver_phone' in out) out.driver_phone = maskPhone(out.driver_phone);
    if ('rider_phone'  in out) delete out.rider_phone;
  }

  return out;
}

module.exports = { maskPhone, maskRidePhones };

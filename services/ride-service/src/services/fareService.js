'use strict';
const { FARE_RATES, SUBSCRIPTION_DISCOUNTS, GEO } = require('../constants');

/**
 * Calculate the haversine distance between two lat/lng points.
 * @returns {number} distance in km
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return GEO.EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Estimate duration from distance (simple model: 3 min/km).
 * @param {number} distKm
 * @returns {number} minutes
 */
function estimateDuration(distKm) {
  return Math.max(3, Math.round(distKm * 3));
}

/**
 * Calculate a ride fare in XAF.
 *
 * @param {object} opts
 * @param {number} opts.distanceKm
 * @param {number} opts.durationMin
 * @param {number} [opts.surgeMultiplier=1.0]
 * @param {string} [opts.subscription='none']
 * @param {boolean} [opts.priceLocked=false]
 * @param {number|null} [opts.lockedFare=null]
 * @param {string} [opts.rideType='standard']
 * @returns {{ base, serviceFee, bookingFee, total, surgeMultiplier, discount }}
 */
function calculateFare({
  distanceKm,
  durationMin,
  surgeMultiplier = 1.0,
  subscription = 'none',
  priceLocked = false,
  lockedFare = null,
  rideType = 'standard',
}) {
  if (priceLocked && lockedFare) {
    return { base: lockedFare, serviceFee: 0, bookingFee: 0, total: lockedFare, surgeMultiplier, discount: 0 };
  }

  const rates = FARE_RATES[rideType] || FARE_RATES.standard;
  const raw = rates.base + rates.perKm * distanceKm + rates.perMin * durationMin;
  const surged = Math.round(raw * surgeMultiplier);
  const discount = SUBSCRIPTION_DISCOUNTS[subscription] || 0;
  const discounted = Math.round(surged * (1 - discount));
  const serviceFee = Math.round(discounted * 0.20);

  return {
    base: discounted,
    serviceFee,
    bookingFee: rates.bookingFee,
    total: discounted + serviceFee + rates.bookingFee,
    surgeMultiplier,
    discount,
  };
}

/**
 * Get fare estimate given pickup/dropoff coordinates.
 *
 * @param {object} pickupCoords  - { lat, lng }
 * @param {object} dropoffCoords - { lat, lng }
 * @param {object} [opts]
 * @returns {{ distanceKm, durationMin, fare }}
 */
function estimateFare(pickupCoords, dropoffCoords, opts = {}) {
  let distanceKm = 5;
  let durationMin = 15;

  if (pickupCoords && dropoffCoords) {
    distanceKm = haversineKm(pickupCoords.lat, pickupCoords.lng, dropoffCoords.lat, dropoffCoords.lng);
    durationMin = estimateDuration(distanceKm);
  }

  const fare = calculateFare({ distanceKm, durationMin, ...opts });
  return { distanceKm, durationMin, fare };
}

module.exports = { calculateFare, estimateFare, haversineKm, estimateDuration };

'use strict';
/**
 * mapsService.js — Google Maps Distance Matrix wrapper
 *
 * Calculates the driving ETA (in minutes) from a driver's current location
 * to the rider's pickup point. Results are cached in Redis (TTL 60s) so that
 * every second-level location update does not hammer the Maps API.
 *
 * Fallback: if GOOGLE_MAPS_API_KEY is absent or the API call fails, the
 * service falls back to a haversine-based estimate adjusted for average
 * African urban traffic speed (25 km/h).
 *
 * Used by: acceptRide (initial ETA), updateRideStatus 'arriving' (re-poll)
 */

const axios  = require('axios');
const cache  = require('../utils/cache');
const logger = require('../utils/logger');

// Read at call-time (not module-load) so tests can set/unset GOOGLE_MAPS_API_KEY
// via process.env without requiring jest.resetModules().
const MAPS_TIMEOUT_MS   = 3_000;   // fail fast — don't block ride acceptance
const CACHE_TTL_SECONDS = 60;      // re-use result for 60 s between location updates

/**
 * City-aware fallback speeds (km/h) for African markets — used when Google
 * Maps API is unavailable.  Values reflect observed average urban traffic.
 * Coordinates are bounding boxes [minLat, minLng, maxLat, maxLng].
 */
const CITY_SPEED_PROFILES = [
  { name: 'Lagos',    bbox: [6.35, 3.10, 6.70, 3.55],  speed: 12 }, // notorious gridlock
  { name: 'Douala',   bbox: [3.85, 9.60, 4.15, 9.85],  speed: 18 },
  { name: 'Nairobi',  bbox: [-1.40, 36.65, -1.10, 37.05], speed: 15 },
  { name: 'Yaoundé',  bbox: [3.78, 11.40, 3.95, 11.60], speed: 20 },
  { name: 'Abidjan',  bbox: [5.20, -4.10, 5.45, -3.85], speed: 17 },
  { name: 'Dakar',    bbox: [14.65, -17.55, 14.80, -17.35], speed: 16 },
  { name: 'Accra',    bbox: [5.50, -0.35, 5.70, -0.05], speed: 14 },
  { name: 'Kinshasa', bbox: [-4.55, 15.15, -4.20, 15.45], speed: 13 },
];
const DEFAULT_SPEED_KMH = 20; // conservative default for unknown African city

function getCitySpeed(lat, lng) {
  for (const c of CITY_SPEED_PROFILES) {
    const [minLat, minLng, maxLat, maxLng] = c.bbox;
    if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) return c.speed;
  }
  return DEFAULT_SPEED_KMH;
}

/**
 * Haversine distance in km between two {lat, lng} points.
 */
function haversineKm(origin, dest) {
  const R    = 6371;
  const dLat = (dest.lat - origin.lat) * Math.PI / 180;
  const dLon = (dest.lng - origin.lng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(origin.lat * Math.PI / 180)
          * Math.cos(dest.lat  * Math.PI / 180)
          * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Fallback ETA based on straight-line distance + average urban speed.
 * Adds a 20% detour factor to account for road curvature.
 *
 * @param {{ lat: number, lng: number }} origin  — driver location
 * @param {{ lat: number, lng: number }} dest    — pickup location
 * @returns {number} ETA in minutes (min 1, rounded up)
 */
function fallbackEtaMinutes(origin, dest) {
  const distKm  = haversineKm(origin, dest) * 1.2; // 20% detour factor for road curvature
  const speed   = getCitySpeed(origin.lat, origin.lng);
  const minutes = (distKm / speed) * 60;
  return Math.max(1, Math.ceil(minutes));
}

/**
 * Get driving ETA via Google Maps Distance Matrix API.
 *
 * @param {{ lat: number, lng: number }} origin  — driver current location
 * @param {{ lat: number, lng: number }} dest    — rider pickup location
 * @returns {Promise<{ eta_minutes: number, source: 'google'|'haversine' }>}
 */
async function getEtaMinutes(origin, dest) {
  // Cache key rounded to ~110 m grid (3 decimal places) to reuse nearby queries
  const cacheKey = `eta:${origin.lat.toFixed(3)},${origin.lng.toFixed(3)}`
                 + `:${dest.lat.toFixed(3)},${dest.lng.toFixed(3)}`;

  const cached = await cache.get(cacheKey);
  if (cached) return { ...cached, cached: true };

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  // If no Maps key configured, use haversine fallback immediately
  if (!apiKey || apiKey.startsWith('AIzaxxxxxx')) {
    const distKm    = haversineKm(origin, dest);
    const eta_minutes = fallbackEtaMinutes(origin, dest);
    return { eta_minutes, distance_km: Math.round(distKm * 10) / 10, source: 'haversine' };
  }

  try {
    const url = 'https://maps.googleapis.com/maps/api/distancematrix/json';
    const { data } = await axios.get(url, {
      timeout: MAPS_TIMEOUT_MS,
      params: {
        origins:        `${origin.lat},${origin.lng}`,
        destinations:   `${dest.lat},${dest.lng}`,
        mode:           'driving',
        units:          'metric',
        departure_time: 'now',            // enables real-time traffic data
        traffic_model:  'best_guess',     // best estimate based on historical + live traffic
        avoid:          'ferries',        // avoid ferries (Africa-specific)
        key:            apiKey,
      },
    });

    const element = data?.rows?.[0]?.elements?.[0];
    if (element?.status === 'OK') {
      // Prefer duration_in_traffic (real-time traffic) over static duration
      const durationSecs = element.duration_in_traffic?.value
                        ?? element.duration?.value;
      const distanceM    = element.distance?.value || 0;
      const eta_minutes  = Math.max(1, Math.ceil(durationSecs / 60));
      const distance_km  = Math.round(distanceM / 100) / 10; // one decimal
      const result = { eta_minutes, distance_km, distance_text: element.distance?.text || '', source: 'google' };
      await cache.set(cacheKey, result, CACHE_TTL_SECONDS);
      return result;
    }

    logger.warn('[MapsService] Distance Matrix element not OK', {
      status: element?.status,
      origin, dest,
    });
  } catch (err) {
    logger.warn('[MapsService] Distance Matrix API error — falling back to haversine', {
      err: err.message,
    });
  }

  // Haversine fallback when API fails
  const distKm      = haversineKm(origin, dest);
  const eta_minutes = fallbackEtaMinutes(origin, dest);
  return { eta_minutes, distance_km: Math.round(distKm * 10) / 10, source: 'haversine' };
}

module.exports = { getEtaMinutes, fallbackEtaMinutes, haversineKm };

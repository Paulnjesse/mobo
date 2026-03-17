/**
 * MOBO Mobile Maps Service
 * Google Places autocomplete, place details, and route directions.
 * All functions gracefully degrade when no API key is configured.
 */

import Constants from 'expo-constants';

// ---------------------------------------------------------------------------
// API key — set via app.json extra.googleMapsKey or env var
// ---------------------------------------------------------------------------
const GOOGLE_MAPS_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ||
  Constants.expoConfig?.extra?.googleMapsKey ||
  null;

function hasApiKey() {
  return (
    !!GOOGLE_MAPS_KEY &&
    GOOGLE_MAPS_KEY !== 'AIzaxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' &&
    GOOGLE_MAPS_KEY.startsWith('AIza')
  );
}

const BASE = 'https://maps.googleapis.com/maps/api';

/**
 * Internal fetch wrapper with timeout
 */
async function _fetch(url, timeout = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Places Autocomplete
// ---------------------------------------------------------------------------

/**
 * searchPlaces(query, location)
 * Returns an array of place suggestions for the autocomplete input.
 *
 * @param {string} query              - User's search text
 * @param {{ lat: number, lng: number }} location  - Bias results toward this location
 * @returns {Array<{ placeId: string, mainText: string, secondaryText: string, description: string }>}
 */
export async function searchPlaces(query, location = null) {
  if (!query || query.trim().length < 2) {
    return [];
  }

  if (!hasApiKey()) {
    console.log('[Maps] No API key — returning empty place suggestions for:', query);
    return [];
  }

  try {
    let url =
      `${BASE}/place/autocomplete/json` +
      `?input=${encodeURIComponent(query)}` +
      `&key=${GOOGLE_MAPS_KEY}` +
      `&language=en` +
      `&types=geocode|establishment`;

    if (location) {
      url += `&location=${location.lat},${location.lng}&radius=50000`;
    }

    const data = await _fetch(url);

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      throw new Error(`Places API status: ${data.status}`);
    }

    return (data.predictions || []).map((p) => ({
      placeId: p.place_id,
      mainText: p.structured_formatting?.main_text || p.description,
      secondaryText: p.structured_formatting?.secondary_text || '',
      description: p.description
    }));
  } catch (err) {
    console.error('[Maps] searchPlaces error:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Place Details
// ---------------------------------------------------------------------------

/**
 * getPlaceDetails(placeId)
 * Returns the coordinates and address for a Google Place ID.
 *
 * @param {string} placeId
 * @returns {{ lat: number, lng: number, address: string, name: string } | null}
 */
export async function getPlaceDetails(placeId) {
  if (!placeId) return null;

  if (!hasApiKey()) {
    console.log('[Maps] No API key — cannot fetch place details for:', placeId);
    return null;
  }

  try {
    const url =
      `${BASE}/place/details/json` +
      `?place_id=${encodeURIComponent(placeId)}` +
      `&fields=geometry,formatted_address,name` +
      `&key=${GOOGLE_MAPS_KEY}`;

    const data = await _fetch(url);

    if (data.status !== 'OK') {
      throw new Error(`Place Details API status: ${data.status}`);
    }

    const result = data.result;
    return {
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
      address: result.formatted_address,
      name: result.name
    };
  } catch (err) {
    console.error('[Maps] getPlaceDetails error:', err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Directions / Route
// ---------------------------------------------------------------------------

/**
 * getDirections(origin, destination)
 * Returns the encoded polyline and turn-by-turn steps for a route.
 *
 * @param {{ lat: number, lng: number }} origin
 * @param {{ lat: number, lng: number }} destination
 * @returns {{ polyline: string | null, steps: Array, distance_km: number, duration_minutes: number }}
 */
export async function getDirections(origin, destination) {
  if (!origin || !destination) {
    return { polyline: null, steps: [], distance_km: 0, duration_minutes: 0 };
  }

  if (!hasApiKey()) {
    console.log('[Maps] No API key — returning straight-line fallback for directions');
    const distanceKm = haversineDistance(
      origin.lat, origin.lng,
      destination.lat, destination.lng
    );
    return {
      polyline: null,
      steps: [],
      distance_km: Math.round(distanceKm * 100) / 100,
      duration_minutes: Math.round((distanceKm / 25) * 60),
      source: 'haversine_fallback'
    };
  }

  try {
    const url =
      `${BASE}/directions/json` +
      `?origin=${origin.lat},${origin.lng}` +
      `&destination=${destination.lat},${destination.lng}` +
      `&mode=driving` +
      `&key=${GOOGLE_MAPS_KEY}`;

    const data = await _fetch(url);

    if (data.status !== 'OK' || !data.routes || data.routes.length === 0) {
      throw new Error(`Directions API status: ${data.status}`);
    }

    const route = data.routes[0];
    const leg = route.legs[0];

    const steps = (leg.steps || []).map((step) => ({
      instruction: (step.html_instructions || '').replace(/<[^>]+>/g, ''),
      distance_m: step.distance.value,
      duration_s: step.duration.value,
      start: step.start_location,
      end: step.end_location
    }));

    return {
      polyline: route.overview_polyline?.points || null,
      steps,
      distance_km: Math.round((leg.distance.value / 1000) * 100) / 100,
      duration_minutes: Math.round(leg.duration.value / 60),
      source: 'google_maps'
    };
  } catch (err) {
    console.error('[Maps] getDirections error:', err.message);
    const distanceKm = haversineDistance(
      origin.lat, origin.lng,
      destination.lat, destination.lng
    );
    return {
      polyline: null,
      steps: [],
      distance_km: Math.round(distanceKm * 100) / 100,
      duration_minutes: Math.round((distanceKm / 25) * 60),
      source: 'haversine_fallback',
      error: err.message
    };
  }
}

// ---------------------------------------------------------------------------
// Haversine fallback (internal)
// ---------------------------------------------------------------------------

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

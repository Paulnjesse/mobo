const logger = require('../utils/logger');
/**
 * MOBO Google Maps Services — location-service
 * Wraps @googlemaps/google-maps-services-js with graceful fallbacks
 * when GOOGLE_MAPS_API_KEY is absent.
 */

let Client, mapsClient;
try {
  ({ Client } = require('@googlemaps/google-maps-services-js'));
  mapsClient = new Client({});
} catch (_loadErr) {
  // Graceful degradation: SDK unavailable (e.g. axios version mismatch in this env).
  // All Google Maps calls will fall through to mock/haversine paths.
  Client = null;
  mapsClient = null;
}

const API_KEY = process.env.GOOGLE_MAPS_API_KEY || null;

/**
 * Check whether a real API key is configured.
 * Returns false if the key is absent or still the placeholder string.
 */
function hasApiKey() {
  return (
    !!API_KEY &&
    API_KEY !== 'AIzaxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' &&
    API_KEY.startsWith('AIza')
  );
}

/**
 * getDirections(origin, destination)
 * origin / destination: { lat, lng }
 * Returns { distance_km, duration_minutes, polyline, steps }
 * Falls back to a straight-line estimate when no API key is present.
 */
async function getDirections(origin, destination) {
  if (!origin || !destination) {
    throw new Error('origin and destination are required');
  }

  if (!hasApiKey() || !mapsClient) {
    // Straight-line Haversine fallback
    const distanceKm = haversineDistance(
      origin.lat, origin.lng,
      destination.lat, destination.lng
    );
    const durationMinutes = Math.round((distanceKm / 25) * 60); // 25 km/h avg
    logger.info(
      `[GoogleMaps] No API key — using Haversine fallback: ${distanceKm.toFixed(2)} km`
    );
    return {
      distance_km: Math.round(distanceKm * 100) / 100,
      duration_minutes: durationMinutes,
      polyline: null,
      steps: [],
      source: 'haversine_fallback'
    };
  }

  try {
    const response = await mapsClient.directions({
      params: {
        origin: `${origin.lat},${origin.lng}`,
        destination: `${destination.lat},${destination.lng}`,
        mode: 'driving',
        key: API_KEY
      },
      timeout: 8000
    });

    const data = response.data;

    if (
      !data ||
      data.status !== 'OK' ||
      !data.routes ||
      data.routes.length === 0
    ) {
      throw new Error(`Directions API returned status: ${data?.status}`);
    }

    const route = data.routes[0];
    const leg = route.legs[0];

    const distanceMeters = leg.distance.value;
    const durationSeconds = leg.duration.value;

    const steps = (leg.steps || []).map((step) => ({
      instruction: step.html_instructions
        ? step.html_instructions.replace(/<[^>]+>/g, '')
        : '',
      distance_m: step.distance.value,
      duration_s: step.duration.value,
      start: {
        lat: step.start_location.lat,
        lng: step.start_location.lng
      },
      end: {
        lat: step.end_location.lat,
        lng: step.end_location.lng
      }
    }));

    return {
      distance_km: Math.round((distanceMeters / 1000) * 100) / 100,
      duration_minutes: Math.round(durationSeconds / 60),
      polyline: route.overview_polyline?.points || null,
      steps,
      source: 'google_maps'
    };
  } catch (err) {
    logger.error('[GoogleMaps] getDirections error:', err.message);
    // Fallback
    const distanceKm = haversineDistance(
      origin.lat, origin.lng,
      destination.lat, destination.lng
    );
    const durationMinutes = Math.round((distanceKm / 25) * 60);
    return {
      distance_km: Math.round(distanceKm * 100) / 100,
      duration_minutes: durationMinutes,
      polyline: null,
      steps: [],
      source: 'haversine_fallback',
      error: err.message
    };
  }
}

/**
 * getDistanceMatrix(origins, destinations)
 * origins: array of { lat, lng }
 * destinations: array of { lat, lng }
 * Returns array of ETA objects: [{ origin_index, destination_index, distance_km, duration_minutes }]
 * Falls back to Haversine when no key is present.
 */
async function getDistanceMatrix(origins, destinations) {
  if (!origins || !destinations || origins.length === 0 || destinations.length === 0) {
    return [];
  }

  if (!hasApiKey() || !mapsClient) {
    logger.info('[GoogleMaps] No API key — using Haversine fallback for Distance Matrix');
    const results = [];
    origins.forEach((origin, oi) => {
      destinations.forEach((dest, di) => {
        const distanceKm = haversineDistance(origin.lat, origin.lng, dest.lat, dest.lng);
        results.push({
          origin_index: oi,
          destination_index: di,
          distance_km: Math.round(distanceKm * 100) / 100,
          duration_minutes: Math.round((distanceKm / 25) * 60),
          source: 'haversine_fallback'
        });
      });
    });
    return results;
  }

  try {
    const originsStr = origins.map((o) => `${o.lat},${o.lng}`);
    const destinationsStr = destinations.map((d) => `${d.lat},${d.lng}`);

    const response = await mapsClient.distancematrix({
      params: {
        origins: originsStr,
        destinations: destinationsStr,
        mode: 'driving',
        key: API_KEY
      },
      timeout: 8000
    });

    const data = response.data;

    if (!data || data.status !== 'OK') {
      throw new Error(`Distance Matrix API returned status: ${data?.status}`);
    }

    const results = [];
    data.rows.forEach((row, oi) => {
      row.elements.forEach((element, di) => {
        if (element.status === 'OK') {
          results.push({
            origin_index: oi,
            destination_index: di,
            distance_km: Math.round((element.distance.value / 1000) * 100) / 100,
            duration_minutes: Math.round(element.duration.value / 60),
            source: 'google_maps'
          });
        } else {
          // Fallback for this pair
          const distanceKm = haversineDistance(
            origins[oi].lat, origins[oi].lng,
            destinations[di].lat, destinations[di].lng
          );
          results.push({
            origin_index: oi,
            destination_index: di,
            distance_km: Math.round(distanceKm * 100) / 100,
            duration_minutes: Math.round((distanceKm / 25) * 60),
            source: 'haversine_fallback',
            element_status: element.status
          });
        }
      });
    });

    return results;
  } catch (err) {
    logger.error('[GoogleMaps] getDistanceMatrix error:', err.message);
    // Full fallback
    const results = [];
    origins.forEach((origin, oi) => {
      destinations.forEach((dest, di) => {
        const distanceKm = haversineDistance(origin.lat, origin.lng, dest.lat, dest.lng);
        results.push({
          origin_index: oi,
          destination_index: di,
          distance_km: Math.round(distanceKm * 100) / 100,
          duration_minutes: Math.round((distanceKm / 25) * 60),
          source: 'haversine_fallback',
          error: err.message
        });
      });
    });
    return results;
  }
}

/**
 * geocodeAddress(address)
 * Returns { lat, lng, formatted_address } or null on failure
 */
async function geocodeAddress(address) {
  if (!address) return null;

  if (!hasApiKey() || !mapsClient) {
    logger.info(`[GoogleMaps] No API key — cannot geocode "${address}"`);
    return null;
  }

  try {
    const response = await mapsClient.geocode({
      params: {
        address,
        key: API_KEY
      },
      timeout: 8000
    });

    const data = response.data;

    if (
      !data ||
      data.status !== 'OK' ||
      !data.results ||
      data.results.length === 0
    ) {
      throw new Error(`Geocoding API returned status: ${data?.status}`);
    }

    const result = data.results[0];
    return {
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
      formatted_address: result.formatted_address,
      place_id: result.place_id
    };
  } catch (err) {
    logger.error('[GoogleMaps] geocodeAddress error:', err.message);
    return null;
  }
}

/**
 * reverseGeocode(lat, lng)
 * Returns a human-readable address string, or null on failure
 */
async function reverseGeocode(lat, lng) {
  if (lat === undefined || lng === undefined) return null;

  if (!hasApiKey() || !mapsClient) {
    logger.info(`[GoogleMaps] No API key — cannot reverse geocode ${lat},${lng}`);
    return null;
  }

  try {
    const response = await mapsClient.reverseGeocode({
      params: {
        latlng: `${lat},${lng}`,
        key: API_KEY
      },
      timeout: 8000
    });

    const data = response.data;

    if (
      !data ||
      data.status !== 'OK' ||
      !data.results ||
      data.results.length === 0
    ) {
      throw new Error(`Reverse Geocoding API returned status: ${data?.status}`);
    }

    return data.results[0].formatted_address;
  } catch (err) {
    logger.error('[GoogleMaps] reverseGeocode error:', err.message);
    return null;
  }
}

/**
 * Internal: Haversine distance in km
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

module.exports = {
  getDirections,
  getDistanceMatrix,
  geocodeAddress,
  reverseGeocode,
  hasApiKey
};

/**
 * Expo dynamic config — reads GOOGLE_MAPS_KEY from the environment at build/start time.
 *
 * Set the key in a .env file (Expo SDK 49+ loads it automatically):
 *
 *   EXPO_PUBLIC_GOOGLE_MAPS_KEY=AIzaXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
 *
 * The same key is used for:
 *   - Android native map tiles (config.android.config.googleMaps.apiKey)
 *   - iOS native map tiles  (config.ios.config.googleMapsApiKey)
 *   - JS-side Places / Directions API calls (extra.googleMapsKey)
 *
 * Required Google Cloud APIs to enable:
 *   Maps SDK for Android, Maps SDK for iOS,
 *   Places API, Directions API, Geocoding API
 */

const googleMapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY || '';
const isKeySet = googleMapsKey.startsWith('AIza');

if (!isKeySet) {
  console.warn(
    '[MOBO] EXPO_PUBLIC_GOOGLE_MAPS_KEY is not set. ' +
    'Maps, Places search and Directions will use the OpenStreetMap fallback. ' +
    'Create mobile/.env and add EXPO_PUBLIC_GOOGLE_MAPS_KEY=AIza...'
  );
}

// ─── Backend service URLs per build profile ──────────────────────────────────
// Set these in .env.development / .env.staging / .env.production
// and reference them via EXPO_PUBLIC_* (client-side) or EAS secrets (server-side).
const apiUrl = process.env.EXPO_PUBLIC_API_URL
  || 'https://mobo-api-gateway.onrender.com/api/v1';
const rideSocketUrl = process.env.EXPO_PUBLIC_RIDE_SOCKET_URL
  || 'https://mobo-ride-service.onrender.com';
const locationSocketUrl = process.env.EXPO_PUBLIC_LOCATION_SOCKET_URL
  || 'https://mobo-location-service.onrender.com';

module.exports = ({ config }) => ({
  ...config,

  ios: {
    ...config.ios,
    config: {
      ...config.ios?.config,
      googleMapsApiKey: googleMapsKey,
    },
  },

  android: {
    ...config.android,
    config: {
      ...config.android?.config,
      googleMaps: {
        apiKey: googleMapsKey,
      },
    },
  },

  extra: {
    ...config.extra,
    googleMapsKey,
    apiUrl,
    rideSocketUrl,
    locationSocketUrl,
    privacyUrl: 'https://www.mobo-ride.com/privacy',
    termsUrl:   'https://www.mobo-ride.com/terms',
  },
});

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
  },
});

import * as ExpoLocation from 'expo-location';
import api from './api';

export const locationService = {
  async requestPermissions() {
    const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
    return status === 'granted';
  },

  async requestBackgroundPermissions() {
    const { status } = await ExpoLocation.requestBackgroundPermissionsAsync();
    return status === 'granted';
  },

  async getLocation() {
    const granted = await this.requestPermissions();
    if (!granted) {
      throw new Error('Location permission denied');
    }
    const location = await ExpoLocation.getCurrentPositionAsync({
      accuracy: ExpoLocation.Accuracy.High,
    });
    return location;
  },

  async watchLocation(callback, options = {}) {
    const granted = await this.requestPermissions();
    if (!granted) {
      throw new Error('Location permission denied');
    }
    const subscription = await ExpoLocation.watchPositionAsync(
      {
        accuracy: ExpoLocation.Accuracy.High,
        timeInterval: 3000,
        distanceInterval: 10,
        ...options,
      },
      callback
    );
    return subscription;
  },

  async updateLocation(rideId, coords) {
    try {
      const response = await api.post('/location/update', {
        rideId,
        latitude: coords.latitude,
        longitude: coords.longitude,
        heading: coords.heading,
        speed: coords.speed,
      });
      return response.data;
    } catch (err) {
      console.warn('Failed to push location update:', err);
    }
  },

  async getNearbyDrivers(latitude, longitude, rideType) {
    const response = await api.get('/location/nearby-drivers', {
      params: { latitude, longitude, rideType },
    });
    return response.data;
  },

  async reverseGeocode(latitude, longitude) {
    try {
      const results = await ExpoLocation.reverseGeocodeAsync({ latitude, longitude });
      if (results && results.length > 0) {
        const place = results[0];
        const parts = [
          place.name,
          place.street,
          place.district,
          place.city,
          place.country,
        ].filter(Boolean);
        return parts.join(', ');
      }
      return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    } catch (err) {
      return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    }
  },

  async searchAddress(query) {
    try {
      const results = await ExpoLocation.geocodeAsync(query);
      return results;
    } catch (err) {
      console.warn('Geocode search failed:', err);
      return [];
    }
  },
};

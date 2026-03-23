import { create } from 'zustand';
import { ridesService } from '../services/rides';
import { locationService } from '../services/location';
import { connectSockets, disconnectSockets, rideSocket } from '../services/socket';

let locationInterval = null;
let joinedRideRoom = null;

export const useRideStore = create((set, get) => ({
  activeRide: null,
  nearbyDrivers: [],
  surgeInfo: null,
  fareEstimate: null,
  isLoading: false,
  error: null,
  socketsConnected: false,

  // -------------------------------------------------------------------------
  // Socket lifecycle — connect once
  // -------------------------------------------------------------------------
  initSockets: async () => {
    try {
      await connectSockets();
      set({ socketsConnected: true });
      console.log('[RideStore] Sockets connected');
    } catch (err) {
      console.warn('[RideStore] Socket connect failed:', err.message);
      set({ socketsConnected: false });
    }
  },

  disconnectSocketsOnLogout: () => {
    get().stopLocationTracking();
    joinedRideRoom = null;
    disconnectSockets();
    set({ socketsConnected: false });
    console.log('[RideStore] Sockets disconnected on logout');
  },

  // -------------------------------------------------------------------------
  // Ride Base Setters
  // -------------------------------------------------------------------------
  setActiveRide: (ride) => {
    set({ activeRide: ride });
    // Join room logic automatically triggers when activeRide is manually set
    if (ride && get().socketsConnected) {
      const rideId = ride._id || ride.id;
      if (rideId && joinedRideRoom !== rideId && rideSocket?.connected) {
        rideSocket.emit('join_ride', { rideId });
        joinedRideRoom = rideId;
        console.log(`[RideStore] Joined ride room for rideId=${rideId}`);
      }
    }
  },

  setSurgeInfo: (surgeInfo) => set({ surgeInfo }),

  // -------------------------------------------------------------------------
  // Ride Operations
  // -------------------------------------------------------------------------
  requestRide: async (rideData) => {
    set({ isLoading: true, error: null });
    try {
      const ride = await ridesService.requestRide(rideData);
      get().setActiveRide(ride);
      get().startLocationTracking(ride._id || ride.id);
      return ride;
    } catch (err) {
      set({ error: err.message || 'Failed to request ride' });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  cancelRide: async (rideId, reason) => {
    set({ isLoading: true, error: null });
    try {
      await ridesService.cancelRide(rideId, reason);
      get().stopLocationTracking();

      if (rideSocket?.connected) {
        rideSocket.emit('ride_cancelled', { rideId, reason: reason || 'Rider cancelled' });
      }

      set({ activeRide: null });
      joinedRideRoom = null;
    } catch (err) {
      set({ error: err.message || 'Failed to cancel ride' });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  getFareEstimate: async (pickup, dropoff, rideType, stops = []) => {
    set({ isLoading: true, error: null });
    try {
      const estimate = await ridesService.getFareEstimate(pickup, dropoff, rideType, stops);
      set({ fareEstimate: estimate });
      return estimate;
    } catch (err) {
      set({ error: err.message || 'Failed to get fare estimate' });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  getNearbyDrivers: async (latitude, longitude, rideType) => {
    try {
      const drivers = await ridesService.getNearbyDrivers(latitude, longitude, rideType);
      set({ nearbyDrivers: drivers || [] });
      return drivers;
    } catch (err) {
      console.warn('Failed to get nearby drivers:', err);
      return [];
    }
  },

  getSurgeInfo: async (latitude, longitude) => {
    try {
      const surge = await ridesService.getSurgeInfo(latitude, longitude);
      set({ surgeInfo: surge });
      return surge;
    } catch (err) {
      console.warn('Failed to get surge info:', err);
      return null;
    }
  },

  // -------------------------------------------------------------------------
  // Location Tracking
  // -------------------------------------------------------------------------
  updateLocation: async (rideId) => {
    try {
      const location = await locationService.getLocation();
      if (location) {
        await locationService.updateLocation(rideId, location.coords);
      }
    } catch (err) {
      console.warn('Failed to update location:', err);
    }
  },

  startLocationTracking: (rideId) => {
    if (locationInterval) clearInterval(locationInterval);
    locationInterval = setInterval(() => {
      get().updateLocation(rideId);
    }, 5000);
  },

  stopLocationTracking: () => {
    if (locationInterval) {
      clearInterval(locationInterval);
      locationInterval = null;
    }
  },

  refreshActiveRide: async (rideId) => {
    try {
      const ride = await ridesService.getRide(rideId);
      get().setActiveRide(ride);
      return ride;
    } catch (err) {
      console.warn('Failed to refresh ride:', err);
    }
  },

  clearActiveRide: () => {
    get().stopLocationTracking();
    set({ activeRide: null, fareEstimate: null });
    joinedRideRoom = null;
  },
}));

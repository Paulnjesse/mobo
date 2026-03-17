import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { ridesService } from '../services/rides';
import { locationService } from '../services/location';
import {
  connectSockets,
  disconnectSockets,
  rideSocket,
  locationSocket,
} from '../services/socket';

const RideContext = createContext(null);

export function RideProvider({ children }) {
  const [activeRide, setActiveRide] = useState(null);
  const [nearbyDrivers, setNearbyDrivers] = useState([]);
  const [surgeInfo, setSurgeInfo] = useState(null);
  const [fareEstimate, setFareEstimate] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Whether socket connections are currently established
  const [socketsConnected, setSocketsConnected] = useState(false);

  // REST-based location polling interval (kept as fallback)
  const locationInterval = useRef(null);

  // Track which ride room we have joined to avoid duplicate joins
  const joinedRideRoom = useRef(null);

  // -------------------------------------------------------------------------
  // Socket lifecycle — connect once on provider mount, disconnect on unmount
  // -------------------------------------------------------------------------
  useEffect(() => {
    const initSockets = async () => {
      try {
        await connectSockets();
        setSocketsConnected(true);
        console.log('[RideContext] Sockets connected');
      } catch (err) {
        console.warn('[RideContext] Socket connect failed:', err.message);
        setSocketsConnected(false);
      }
    };

    initSockets();

    return () => {
      // Do NOT disconnect here — sockets are shared across screens.
      // Disconnection is done explicitly via disconnectSocketsOnLogout().
    };
  }, []);

  // -------------------------------------------------------------------------
  // Join ride room whenever activeRide changes
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!activeRide) return;
    const rideId = activeRide._id || activeRide.id;
    if (!rideId || joinedRideRoom.current === rideId) return;

    if (rideSocket?.connected) {
      rideSocket.emit('join_ride', { rideId });
      joinedRideRoom.current = rideId;
      console.log(`[RideContext] Joined ride room for rideId=${rideId}`);
    }
  }, [activeRide, socketsConnected]);

  // -------------------------------------------------------------------------
  // Public: disconnect both sockets (call on logout)
  // -------------------------------------------------------------------------
  const disconnectSocketsOnLogout = useCallback(() => {
    stopLocationTracking();
    joinedRideRoom.current = null;
    disconnectSockets();
    setSocketsConnected(false);
    console.log('[RideContext] Sockets disconnected on logout');
  }, []);

  // -------------------------------------------------------------------------
  // Ride operations
  // -------------------------------------------------------------------------
  const requestRide = useCallback(async (rideData) => {
    setIsLoading(true);
    setError(null);
    try {
      const ride = await ridesService.requestRide(rideData);
      setActiveRide(ride);
      startLocationTracking(ride._id || ride.id);
      return ride;
    } catch (err) {
      setError(err.message || 'Failed to request ride');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const cancelRide = useCallback(async (rideId, reason) => {
    setIsLoading(true);
    setError(null);
    try {
      await ridesService.cancelRide(rideId, reason);
      stopLocationTracking();

      // Emit ride_cancelled via socket so the driver is notified instantly
      if (rideSocket?.connected) {
        rideSocket.emit('ride_cancelled', { rideId, reason: reason || 'Rider cancelled' });
      }

      setActiveRide(null);
      joinedRideRoom.current = null;
    } catch (err) {
      setError(err.message || 'Failed to cancel ride');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getFareEstimate = useCallback(async (pickup, dropoff, rideType) => {
    setIsLoading(true);
    setError(null);
    try {
      const estimate = await ridesService.getFareEstimate(pickup, dropoff, rideType);
      setFareEstimate(estimate);
      return estimate;
    } catch (err) {
      setError(err.message || 'Failed to get fare estimate');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getNearbyDrivers = useCallback(async (latitude, longitude, rideType) => {
    try {
      const drivers = await ridesService.getNearbyDrivers(latitude, longitude, rideType);
      setNearbyDrivers(drivers || []);
      return drivers;
    } catch (err) {
      console.warn('Failed to get nearby drivers:', err);
      return [];
    }
  }, []);

  const getSurgeInfo = useCallback(async (latitude, longitude) => {
    try {
      const surge = await ridesService.getSurgeInfo(latitude, longitude);
      setSurgeInfo(surge);
      return surge;
    } catch (err) {
      console.warn('Failed to get surge info:', err);
      return null;
    }
  }, []);

  // -------------------------------------------------------------------------
  // REST-based location update (fallback when socket is unavailable)
  // -------------------------------------------------------------------------
  const updateLocation = useCallback(async (rideId) => {
    try {
      const location = await locationService.getLocation();
      if (location) {
        await locationService.updateLocation(rideId, location.coords);
      }
    } catch (err) {
      console.warn('Failed to update location:', err);
    }
  }, []);

  const startLocationTracking = useCallback((rideId) => {
    if (locationInterval.current) {
      clearInterval(locationInterval.current);
    }
    locationInterval.current = setInterval(() => {
      updateLocation(rideId);
    }, 5000);
  }, [updateLocation]);

  const stopLocationTracking = useCallback(() => {
    if (locationInterval.current) {
      clearInterval(locationInterval.current);
      locationInterval.current = null;
    }
  }, []);

  const refreshActiveRide = useCallback(async (rideId) => {
    try {
      const ride = await ridesService.getRide(rideId);
      setActiveRide(ride);
      return ride;
    } catch (err) {
      console.warn('Failed to refresh ride:', err);
    }
  }, []);

  const clearActiveRide = useCallback(() => {
    stopLocationTracking();
    setActiveRide(null);
    setFareEstimate(null);
    joinedRideRoom.current = null;
  }, [stopLocationTracking]);

  return (
    <RideContext.Provider
      value={{
        activeRide,
        nearbyDrivers,
        surgeInfo,
        fareEstimate,
        isLoading,
        error,
        socketsConnected,
        // Ride operations
        requestRide,
        cancelRide,
        getFareEstimate,
        getNearbyDrivers,
        getSurgeInfo,
        updateLocation,
        refreshActiveRide,
        clearActiveRide,
        setActiveRide,
        setSurgeInfo,
        // Socket management
        disconnectSocketsOnLogout,
      }}
    >
      {children}
    </RideContext.Provider>
  );
}

export function useRide() {
  const ctx = useContext(RideContext);
  if (!ctx) throw new Error('useRide must be used inside RideProvider');
  return ctx;
}

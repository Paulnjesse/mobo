import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { ridesService } from '../services/rides';
import { locationService } from '../services/location';

const RideContext = createContext(null);

export function RideProvider({ children }) {
  const [activeRide, setActiveRide] = useState(null);
  const [nearbyDrivers, setNearbyDrivers] = useState([]);
  const [surgeInfo, setSurgeInfo] = useState(null);
  const [fareEstimate, setFareEstimate] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const locationInterval = useRef(null);

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
      setActiveRide(null);
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

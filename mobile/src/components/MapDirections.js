import React, { useState, useEffect } from 'react';
import { Polyline } from 'react-native-maps';
import Constants from 'expo-constants';
import { colors } from '../theme';

// Resolve API key the same way maps.js does
const GOOGLE_MAPS_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ||
  Constants.expoConfig?.extra?.googleMapsKey ||
  null;

function hasApiKey() {
  return !!GOOGLE_MAPS_KEY && GOOGLE_MAPS_KEY.startsWith('AIza');
}

/**
 * Draws a driving-route polyline on react-native-maps.
 * Props:
 *   origin      — { latitude, longitude }
 *   destination — { latitude, longitude }
 *   strokeColor — (optional) defaults to primary brand color
 *   strokeWidth — (optional) defaults to 4
 *
 * Falls back to a straight dashed line when:
 *   - Google Maps API key is absent / invalid
 *   - The Directions API returns an error
 */
export default function MapDirections({
  origin,
  destination,
  strokeColor = colors.primary,
  strokeWidth = 4,
}) {
  const [coordinates, setCoordinates] = useState([]);

  useEffect(() => {
    if (!origin || !destination) {
      setCoordinates([]);
      return;
    }
    fetchRoute(origin, destination);
  }, [origin?.latitude, origin?.longitude, destination?.latitude, destination?.longitude]);

  const fetchRoute = async (orig, dest) => {
    // ── Google Maps route ──────────────────────────────────────────────────
    if (hasApiKey()) {
      try {
        const originStr = `${orig.latitude},${orig.longitude}`;
        const destStr   = `${dest.latitude},${dest.longitude}`;
        const url =
          `https://maps.googleapis.com/maps/api/directions/json` +
          `?origin=${originStr}&destination=${destStr}` +
          `&mode=driving&key=${GOOGLE_MAPS_KEY}`;

        const response = await fetch(url, { signal: AbortSignal.timeout?.(8000) });
        const data     = await response.json();

        if (data.status === 'OK' && data.routes?.length > 0) {
          const points = decodePolyline(data.routes[0].overview_polyline.points);
          if (points.length >= 2) {
            setCoordinates(points);
            return;
          }
        } else {
          console.warn('[MapDirections] Directions API status:', data.status, data.error_message || '');
        }
      } catch (err) {
        console.warn('[MapDirections] Directions fetch failed:', err.message);
      }
    }

    // ── OpenStreetMap OSRM route (fallback) ─────────────────────────────────
    try {
      const url =
        `https://router.project-osrm.org/route/v1/driving/` +
        `${orig.longitude},${orig.latitude};${dest.longitude},${dest.latitude}` +
        `?overview=full&geometries=polyline`;

      const response = await fetch(url, { signal: AbortSignal.timeout?.(8000) });
      const data     = await response.json();

      if (data.code === 'Ok' && data.routes?.length > 0) {
        const points = decodePolyline(data.routes[0].geometry);
        if (points.length >= 2) {
          setCoordinates(points);
          return;
        }
      }
    } catch (err) {
      console.warn('[MapDirections] OSRM fallback failed:', err.message);
    }

    // ── Last resort: straight line ─────────────────────────────────────────
    setCoordinates([
      { latitude: orig.latitude,  longitude: orig.longitude },
      { latitude: dest.latitude,  longitude: dest.longitude },
    ]);
  };

  /**
   * Decode Google Maps / OSRM encoded polyline → array of { latitude, longitude }
   */
  const decodePolyline = (encoded) => {
    const points = [];
    let index = 0;
    let lat   = 0;
    let lng   = 0;

    while (index < encoded.length) {
      let shift  = 0;
      let result = 0;
      let byte;

      do {
        byte    = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift  += 5;
      } while (byte >= 0x20);

      const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
      lat += dlat;

      shift  = 0;
      result = 0;

      do {
        byte    = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift  += 5;
      } while (byte >= 0x20);

      const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
      lng += dlng;

      points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
    }

    return points;
  };

  if (!coordinates || coordinates.length < 2) return null;

  return (
    <Polyline
      coordinates={coordinates}
      strokeColor={strokeColor}
      strokeWidth={strokeWidth}
      lineDashPattern={null}
      lineCap="round"
      lineJoin="round"
    />
  );
}

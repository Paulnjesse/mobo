import React, { useState, useEffect } from 'react';
import { Polyline } from 'react-native-maps';
import { colors } from '../theme';

const GOOGLE_MAPS_API_KEY = 'YOUR_ANDROID_GOOGLE_MAPS_API_KEY';

/**
 * Draws a route polyline on react-native-maps.
 * Props: origin, destination, strokeColor, strokeWidth
 * Uses Google Maps Directions API with straight-line fallback.
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
  }, [origin, destination]);

  const fetchRoute = async (orig, dest) => {
    try {
      const originStr = `${orig.latitude},${orig.longitude}`;
      const destStr = `${dest.latitude},${dest.longitude}`;
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originStr}&destination=${destStr}&key=${GOOGLE_MAPS_API_KEY}&mode=driving`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'OK' && data.routes && data.routes.length > 0) {
        const points = decodePolyline(data.routes[0].overview_polyline.points);
        setCoordinates(points);
      } else {
        // Fallback: straight line between origin and destination
        setCoordinates([
          { latitude: orig.latitude, longitude: orig.longitude },
          { latitude: dest.latitude, longitude: dest.longitude },
        ]);
      }
    } catch (error) {
      // Fallback on error: straight line
      setCoordinates([
        { latitude: orig.latitude, longitude: orig.longitude },
        { latitude: dest.latitude, longitude: dest.longitude },
      ]);
    }
  };

  /**
   * Decode Google Maps encoded polyline string into array of lat/lng coords.
   */
  const decodePolyline = (encoded) => {
    let points = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < encoded.length) {
      let shift = 0;
      let result = 0;
      let byte;

      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);

      const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
      lat += dlat;

      shift = 0;
      result = 0;

      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
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

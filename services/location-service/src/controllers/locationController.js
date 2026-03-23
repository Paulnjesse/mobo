const db = require('../config/database');
const googleMaps = require('../services/googleMaps');
const cache = require('../utils/cache');
const { checkGpsSpoofing } = require('../../../shared/fraudDetection');
const { isEnabled } = require('../../../shared/featureFlags');

// In-memory per-user GPS state (speed violation streak, last known position)
// Evicted on process restart — acceptable for this use case
const _gpsState = new Map(); // userId → { lat, lng, ts, streak }

// Average city speed for ETA estimation (km/h) — used as fallback
const AVG_SPEED_KMH = 25;

/**
 * POST /location
 * Driver or rider updates their live location
 */
const updateLocation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { lat, lng, heading, speed, accuracy } = req.body;

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ success: false, message: 'lat and lng are required' });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({ success: false, message: 'Invalid coordinates' });
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({ success: false, message: 'Coordinates out of valid range' });
    }

    // ── GPS spoofing check (drivers only — riders have lower fraud surface) ──
    if (req.user.role === 'driver' && isEnabled('fraud_detection_v1')) {
      const prev = _gpsState.get(userId);
      const spoofCheck = await checkGpsSpoofing({
        userId,
        lat:                latitude,
        lng:                longitude,
        timestampMs:        Date.now(),
        prevLat:            prev?.lat,
        prevLng:            prev?.lng,
        prevTimestampMs:    prev?.ts,
        speedViolationStreak: prev?.streak || 0,
      });

      // Update in-memory state regardless of outcome
      _gpsState.set(userId, {
        lat: latitude,
        lng: longitude,
        ts:  Date.now(),
        streak: spoofCheck.ok ? 0 : (prev?.streak || 0) + 1,
      });

      if (!spoofCheck.ok) {
        return res.status(422).json({
          success: false,
          message: 'Location update rejected — anomalous GPS data detected',
          reason:  spoofCheck.reason,
        });
      }
    }

    // Insert into location history
    await db.query(
      `INSERT INTO locations (user_id, location, heading, speed, accuracy)
       VALUES ($1, ST_SetSRID(ST_Point($2, $3), 4326), $4, $5, $6)`,
      [userId, longitude, latitude,
       heading !== undefined ? parseFloat(heading) : null,
       speed !== undefined ? parseFloat(speed) : null,
       accuracy !== undefined ? parseFloat(accuracy) : null]
    );

    // If driver, update their real-time current_location
    if (req.user.role === 'driver') {
      const driverResult = await db.query(
        `UPDATE drivers
         SET current_location = ST_SetSRID(ST_Point($1, $2), 4326)
         WHERE user_id = $3
         RETURNING id, is_online`,
        [longitude, latitude, userId]
      );

      if (driverResult.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Driver profile not found' });
      }
    }

    res.json({
      success: true,
      message: 'Location updated',
      data: { lat: latitude, lng: longitude, timestamp: new Date().toISOString() }
    });
  } catch (err) {
    console.error('[UpdateLocation Error]', err);
    res.status(500).json({ success: false, message: 'Failed to update location' });
  }
};

/**
 * GET /location/:userId
 * Get latest location for a user/driver
 */
const getLocation = async (req, res) => {
  try {
    const { userId } = req.params;
    const requestingUserId = req.user.id;

    // Allow users to see their own location or drivers involved in their active ride
    if (userId !== requestingUserId && req.user.role !== 'admin') {
      const rideCheck = await db.query(
        `SELECT r.id FROM rides r
         LEFT JOIN drivers d ON r.driver_id = d.id
         WHERE (r.rider_id = $1 AND d.user_id = $2)
            OR (r.rider_id = $2 AND d.user_id = $1)
           AND r.status NOT IN ('completed','cancelled')`,
        [requestingUserId, userId]
      );

      if (rideCheck.rows.length === 0) {
        return res.status(403).json({ success: false, message: 'Not authorized to view this location' });
      }
    }

    const historyResult = await db.query(
      `SELECT
        ST_Y(location::geometry) AS lat,
        ST_X(location::geometry) AS lng,
        heading, speed, accuracy, recorded_at
       FROM locations
       WHERE user_id = $1
       ORDER BY recorded_at DESC
       LIMIT 1`,
      [userId]
    );

    if (historyResult.rows.length === 0) {
      const driverResult = await db.query(
        `SELECT
          ST_Y(current_location::geometry) AS lat,
          ST_X(current_location::geometry) AS lng,
          updated_at AS recorded_at
         FROM drivers
         WHERE user_id = $1 AND current_location IS NOT NULL`,
        [userId]
      );

      if (driverResult.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'No location data available' });
      }

      return res.json({
        success: true,
        data: { location: driverResult.rows[0] }
      });
    }

    res.json({
      success: true,
      data: { location: historyResult.rows[0] }
    });
  } catch (err) {
    console.error('[GetLocation Error]', err);
    res.status(500).json({ success: false, message: 'Failed to get location' });
  }
};

/**
 * GET /drivers/nearby
 * Find nearby available drivers using PostGIS ST_DWithin.
 * If Google Maps API key is available, enrich each driver with a real driving ETA
 * via the Distance Matrix API. Falls back to (distance_km / 30) * 60 minutes.
 */
const getNearbyDrivers = async (req, res) => {
  try {
    const { lat, lng, radius = 5000, ride_type, vehicle_type } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ success: false, message: 'lat and lng are required' });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const radiusMeters = parseFloat(radius);

    // Cache key quantizes coords to ~500m grid cells (1/200 degree ≈ 555m)
    const cacheKey = `nearby:${Math.round(latitude * 200) / 200}:${Math.round(longitude * 200) / 200}:${radiusMeters}`;
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({ success: false, message: 'Invalid coordinates' });
    }

    const rideTypeToVehicle = {
      standard: ['standard', 'comfort', 'luxury'],
      comfort: ['comfort', 'luxury'],
      luxury: ['luxury'],
      shared: ['standard', 'comfort', 'van'],
      bike: ['bike'],
      scooter: ['scooter'],
      delivery: ['standard', 'comfort', 'van', 'bike'],
      scheduled: ['standard', 'comfort', 'luxury']
    };

    let vehicleTypeFilter = null;
    if (ride_type && rideTypeToVehicle[ride_type]) {
      vehicleTypeFilter = rideTypeToVehicle[ride_type];
    } else if (vehicle_type) {
      vehicleTypeFilter = [vehicle_type];
    }

    let query = `
      SELECT
        d.id AS driver_id,
        u.id AS user_id,
        u.full_name,
        u.rating,
        u.profile_picture,
        v.id AS vehicle_id,
        v.make,
        v.model,
        v.year,
        v.vehicle_type,
        v.color,
        v.plate,
        v.seats,
        v.is_wheelchair_accessible,
        ST_Distance(
          d.current_location::geography,
          ST_SetSRID(ST_Point($1, $2), 4326)::geography
        ) / 1000 AS distance_km,
        ST_AsGeoJSON(d.current_location) AS location_geojson,
        d.acceptance_rate,
        d.total_earnings
      FROM drivers d
      JOIN users u ON d.user_id = u.id
      JOIN vehicles v ON d.vehicle_id = v.id
      WHERE
        d.is_online = true
        AND d.is_approved = true
        AND d.current_location IS NOT NULL
        AND v.is_active = true
        AND u.is_active = true
        AND u.is_suspended = false
        AND ST_DWithin(
          d.current_location::geography,
          ST_SetSRID(ST_Point($1, $2), 4326)::geography,
          $3
        )
    `;

    const params = [longitude, latitude, radiusMeters];

    if (vehicleTypeFilter && vehicleTypeFilter.length > 0) {
      params.push(vehicleTypeFilter);
      query += ` AND v.vehicle_type = ANY($${params.length})`;
    }

    query += ` ORDER BY distance_km ASC LIMIT 20`;

    const result = await db.query(query, params);

    // Build initial driver list with straight-line ETAs
    const drivers = result.rows.map((driver) => {
      const distanceKm = parseFloat(driver.distance_km);
      let locationData = null;
      if (driver.location_geojson) {
        const geojson = JSON.parse(driver.location_geojson);
        locationData = {
          lat: geojson.coordinates[1],
          lng: geojson.coordinates[0]
        };
      }
      return {
        ...driver,
        distance_km: Math.round(distanceKm * 100) / 100,
        eta_minutes: Math.round((distanceKm / AVG_SPEED_KMH) * 60) + 1,
        location: locationData,
        location_geojson: undefined,
        eta_source: 'straight_line_estimate'
      };
    });

    // Enrich with real Google Maps ETAs if key available
    if (googleMaps.hasApiKey() && drivers.length > 0) {
      try {
        const driverLocations = drivers
          .filter((d) => d.location)
          .map((d) => ({ lat: d.location.lat, lng: d.location.lng }));

        const userDestination = [{ lat: latitude, lng: longitude }];

        if (driverLocations.length > 0) {
          const matrix = await googleMaps.getDistanceMatrix(driverLocations, userDestination);

          // Map results back — origins in matrix correspond to filtered drivers
          let matrixIdx = 0;
          drivers.forEach((driver) => {
            if (!driver.location) return;
            const entry = matrix.find((m) => m.origin_index === matrixIdx);
            if (entry && entry.source === 'google_maps') {
              driver.eta_minutes = entry.duration_minutes;
              driver.distance_km = entry.distance_km;
              driver.eta_source = 'google_maps';
            }
            matrixIdx++;
          });
        }
      } catch (mapsErr) {
        console.error('[GetNearbyDrivers] Google Maps enrichment failed:', mapsErr.message);
        // Keep fallback ETAs — no crash
      }
    }

    const nearbyResponse = {
      success: true,
      data: {
        drivers,
        count: drivers.length,
        search_radius_m: radiusMeters,
        center: { lat: latitude, lng: longitude },
        eta_source: googleMaps.hasApiKey() ? 'google_maps' : 'straight_line_estimate'
      }
    };

    await cache.set(cacheKey, nearbyResponse, 15); // 15 second TTL (drivers move!)
    res.json(nearbyResponse);
  } catch (err) {
    console.error('[GetNearbyDrivers Error]', err);
    res.status(500).json({ success: false, message: 'Failed to get nearby drivers' });
  }
};

/**
 * GET /location/surge
 * Check if a location is inside a surge zone
 */
const checkSurgeZone = async (req, res) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ success: false, message: 'lat and lng are required' });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    const surgeCacheKey = `surge:${Math.round(latitude * 100) / 100}:${Math.round(longitude * 100) / 100}`;
    const cachedSurge = await cache.get(surgeCacheKey);
    if (cachedSurge !== null) {
      return res.json(cachedSurge);
    }

    const result = await db.query(
      `SELECT id, name, city, multiplier, starts_at, ends_at
       FROM surge_zones
       WHERE is_active = true
         AND ST_Within(
           ST_SetSRID(ST_Point($1, $2), 4326),
           zone
         )
         AND (starts_at IS NULL OR starts_at <= NOW())
         AND (ends_at IS NULL OR ends_at >= NOW())
       ORDER BY multiplier DESC
       LIMIT 1`,
      [longitude, latitude]
    );

    if (result.rows.length > 0) {
      const zone = result.rows[0];
      const surgeActiveResponse = {
        success: true,
        data: {
          surge_active: true,
          multiplier: parseFloat(zone.multiplier),
          zone_name: zone.name,
          city: zone.city,
          zone_id: zone.id,
          message: `High demand in ${zone.name}. Fares are ${zone.multiplier}x.`
        }
      };
      await cache.set(surgeCacheKey, surgeActiveResponse, 120); // 2 min TTL
      return res.json(surgeActiveResponse);
    }

    // Check peak hour surge (West Africa Time approximation)
    const nowUtc = new Date();
    const watHour = (nowUtc.getUTCHours() + 1) % 24;
    const isPeakMorning = watHour >= 7 && watHour <= 9;
    const isPeakEvening = watHour >= 17 && watHour <= 20;

    if (isPeakMorning || isPeakEvening) {
      const periodName = isPeakMorning ? 'morning rush hour' : 'evening rush hour';
      const peakHourResponse = {
        success: true,
        data: {
          surge_active: true,
          multiplier: 1.5,
          zone_name: 'Peak Hours',
          city: null,
          zone_id: null,
          message: `Fares are higher during ${periodName} (1.5x).`
        }
      };
      await cache.set(surgeCacheKey, peakHourResponse, 120); // 2 min TTL
      return res.json(peakHourResponse);
    }

    const noSurgeResponse = {
      success: true,
      data: {
        surge_active: false,
        multiplier: 1.0,
        zone_name: null,
        message: 'Normal pricing in this area.'
      }
    };
    await cache.set(surgeCacheKey, noSurgeResponse, 120); // 2 min TTL
    res.json(noSurgeResponse);
  } catch (err) {
    console.error('[CheckSurgeZone Error]', err);
    res.status(500).json({ success: false, message: 'Failed to check surge zone' });
  }
};

/**
 * GET /location/route/estimate
 * Calculate route estimate between two points.
 *
 * If GOOGLE_MAPS_API_KEY is set: calls Google Maps Directions API to get
 * real road distance, duration, encoded polyline, and turn-by-turn steps.
 * Falls back to PostGIS ST_Distance when no key is present.
 */
const getRouteEstimate = async (req, res) => {
  try {
    const {
      pickup_lat, pickup_lng,
      dropoff_lat, dropoff_lng,
      ride_type = 'standard'
    } = req.query;

    if (!pickup_lat || !pickup_lng || !dropoff_lat || !dropoff_lng) {
      return res.status(400).json({
        success: false,
        message: 'pickup_lat, pickup_lng, dropoff_lat, dropoff_lng are required'
      });
    }

    const pLat = parseFloat(pickup_lat);
    const pLng = parseFloat(pickup_lng);
    const dLat = parseFloat(dropoff_lat);
    const dLng = parseFloat(dropoff_lng);

    // ---------------------------------------------------------------------------
    // Route calculation — Google Maps preferred, PostGIS fallback
    // ---------------------------------------------------------------------------
    let distanceKm;
    let durationMinutes;
    let polyline = null;
    let steps = [];
    let routeSource = 'postgis';

    if (googleMaps.hasApiKey()) {
      try {
        const directions = await googleMaps.getDirections(
          { lat: pLat, lng: pLng },
          { lat: dLat, lng: dLng }
        );
        distanceKm = directions.distance_km;
        durationMinutes = directions.duration_minutes;
        polyline = directions.polyline;
        steps = directions.steps;
        routeSource = directions.source || 'google_maps';
      } catch (mapsErr) {
        console.error('[GetRouteEstimate] Google Maps error, using PostGIS fallback:', mapsErr.message);
      }
    }

    // PostGIS fallback (also runs if Google Maps failed)
    if (!distanceKm) {
      const distanceResult = await db.query(
        `SELECT
          ST_Distance(
            ST_SetSRID(ST_Point($1, $2), 4326)::geography,
            ST_SetSRID(ST_Point($3, $4), 4326)::geography
          ) / 1000 AS distance_km`,
        [pLng, pLat, dLng, dLat]
      );
      distanceKm = parseFloat(distanceResult.rows[0].distance_km);
      durationMinutes = Math.round((distanceKm / AVG_SPEED_KMH) * 60);
      routeSource = 'postgis';
    }

    // ---------------------------------------------------------------------------
    // Fare breakdown
    // ---------------------------------------------------------------------------
    const FARE_CONFIG = {
      base_fare: 1000,
      per_km: 700,
      per_minute: 100,
      booking_fee: 500,
      service_fee_rate: 0.20
    };

    const RIDE_TYPE_MULTIPLIERS = {
      standard: 1.0, shared: 0.75, comfort: 1.3,
      luxury: 2.0, bike: 0.6, scooter: 0.65,
      delivery: 1.1, scheduled: 1.05
    };

    const typeMultiplier = RIDE_TYPE_MULTIPLIERS[ride_type] || 1.0;
    const subtotal = Math.round(
      (FARE_CONFIG.base_fare + FARE_CONFIG.per_km * distanceKm + FARE_CONFIG.per_minute * durationMinutes)
      * typeMultiplier
    );
    const serviceFee = Math.round(subtotal * FARE_CONFIG.service_fee_rate);
    const total = subtotal + serviceFee + FARE_CONFIG.booking_fee;

    // Check surge
    const surgeResult = await db.query(
      `SELECT multiplier, name FROM surge_zones
       WHERE is_active = true
         AND ST_Within(ST_SetSRID(ST_Point($1, $2), 4326), zone)
         AND (starts_at IS NULL OR starts_at <= NOW())
         AND (ends_at IS NULL OR ends_at >= NOW())
       ORDER BY multiplier DESC LIMIT 1`,
      [pLng, pLat]
    );

    const surgeMultiplier = surgeResult.rows.length > 0
      ? parseFloat(surgeResult.rows[0].multiplier)
      : 1.0;

    res.json({
      success: true,
      data: {
        distance_km: Math.round(distanceKm * 100) / 100,
        estimated_duration_minutes: durationMinutes,
        ride_type,
        polyline,
        steps,
        route_source: routeSource,
        fare_breakdown: {
          base_fare: FARE_CONFIG.base_fare,
          distance_fare: Math.round(FARE_CONFIG.per_km * distanceKm),
          duration_fare: Math.round(FARE_CONFIG.per_minute * durationMinutes),
          type_multiplier: typeMultiplier,
          subtotal,
          service_fee: serviceFee,
          booking_fee: FARE_CONFIG.booking_fee,
          surge_multiplier: surgeMultiplier,
          surge_active: surgeMultiplier > 1.0,
          total: Math.round(total * surgeMultiplier),
          currency: 'XAF'
        }
      }
    });
  } catch (err) {
    console.error('[GetRouteEstimate Error]', err);
    res.status(500).json({ success: false, message: 'Failed to get route estimate' });
  }
};

/**
 * GET /rides/:id/route
 * Return the Google Maps polyline for an active ride.
 * Used by the mobile app to draw the route on the map.
 * If no polyline is stored, fetches a fresh one from Google Maps.
 */
const getRideRoute = async (req, res) => {
  try {
    const { id: rideId } = req.params;
    const userId = req.user.id;

    const rideResult = await db.query(
      `SELECT
        r.id,
        r.status,
        r.route_polyline,
        r.rider_id,
        ST_Y(r.pickup_location::geometry) AS pickup_lat,
        ST_X(r.pickup_location::geometry) AS pickup_lng,
        ST_Y(r.dropoff_location::geometry) AS dropoff_lat,
        ST_X(r.dropoff_location::geometry) AS dropoff_lng,
        d.user_id AS driver_user_id,
        ST_Y(d.current_location::geometry) AS driver_lat,
        ST_X(d.current_location::geometry) AS driver_lng
       FROM rides r
       LEFT JOIN drivers d ON r.driver_id = d.id
       WHERE r.id = $1`,
      [rideId]
    );

    if (rideResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ride not found' });
    }

    const ride = rideResult.rows[0];

    const isRider = ride.rider_id === userId;
    const isDriver = ride.driver_user_id === userId;
    const isAdmin = req.user.role === 'admin';

    if (!isRider && !isDriver && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this route' });
    }

    const pickup = { lat: parseFloat(ride.pickup_lat), lng: parseFloat(ride.pickup_lng) };
    const dropoff = { lat: parseFloat(ride.dropoff_lat), lng: parseFloat(ride.dropoff_lng) };
    const driverLocation = ride.driver_lat && ride.driver_lng
      ? { lat: parseFloat(ride.driver_lat), lng: parseFloat(ride.driver_lng) }
      : null;

    let polyline = ride.route_polyline || null;
    let steps = [];
    let routeSource = 'stored';
    let distanceKm = null;
    let durationMinutes = null;

    // If no stored polyline, try to get one from Google Maps
    if (!polyline && googleMaps.hasApiKey()) {
      try {
        const origin = driverLocation || pickup;
        const directions = await googleMaps.getDirections(origin, dropoff);
        polyline = directions.polyline;
        steps = directions.steps;
        distanceKm = directions.distance_km;
        durationMinutes = directions.duration_minutes;
        routeSource = directions.source || 'google_maps';

        // Store the polyline for future calls
        if (polyline) {
          await db.query(
            'UPDATE rides SET route_polyline = $1 WHERE id = $2',
            [polyline, rideId]
          );
        }
      } catch (mapsErr) {
        console.error('[GetRideRoute] Google Maps fetch failed:', mapsErr.message);
      }
    }

    const routeData = {
      ride_id: rideId,
      status: ride.status,
      pickup,
      dropoff,
      driver_location: driverLocation,
      polyline,
      steps,
      distance_km: distanceKm,
      duration_minutes: durationMinutes,
      route_source: routeSource
    };

    if (!polyline) {
      routeData.waypoints = [
        pickup,
        ...(driverLocation ? [driverLocation] : []),
        dropoff
      ];
      routeData.note = googleMaps.hasApiKey()
        ? 'Could not fetch Google Maps polyline — using waypoints.'
        : 'Set GOOGLE_MAPS_API_KEY for precise polylines.';
    }

    res.json({ success: true, data: { route: routeData } });
  } catch (err) {
    console.error('[GetRideRoute Error]', err);
    res.status(500).json({ success: false, message: 'Failed to get ride route' });
  }
};

/**
 * GET /location/history
 * Get location history for a user
 */
const getLocationHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 50, since } = req.query;

    let query = `
      SELECT
        ST_Y(location::geometry) AS lat,
        ST_X(location::geometry) AS lng,
        heading, speed, accuracy, recorded_at
      FROM locations
      WHERE user_id = $1
    `;
    const params = [userId];

    if (since) {
      params.push(new Date(since));
      query += ` AND recorded_at >= $${params.length}`;
    }

    params.push(parseInt(limit));
    query += ` ORDER BY recorded_at DESC LIMIT $${params.length}`;

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: {
        locations: result.rows,
        count: result.rows.length
      }
    });
  } catch (err) {
    console.error('[GetLocationHistory Error]', err);
    res.status(500).json({ success: false, message: 'Failed to get location history' });
  }
};

/**
 * POST /location/driver/status
 * Driver goes online/offline
 */
const updateDriverStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const { is_online } = req.body;

    if (is_online === undefined) {
      return res.status(400).json({ success: false, message: 'is_online is required' });
    }

    // When going online, check fatigue limits before allowing status change
    if (Boolean(is_online)) {
      const driverCheck = await db.query(
        'SELECT id, is_approved, online_since, total_trips_today FROM drivers WHERE user_id = $1',
        [userId]
      );

      if (driverCheck.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Driver profile not found' });
      }

      const drv = driverCheck.rows[0];

      if (!drv.is_approved) {
        return res.status(403).json({
          success: false,
          message: 'Your driver account is pending approval. You cannot go online yet.'
        });
      }

      const hoursOnline = drv.online_since
        ? (Date.now() - new Date(drv.online_since).getTime()) / (1000 * 60 * 60)
        : 0;

      if (hoursOnline >= 8 || (drv.total_trips_today || 0) >= 6) {
        return res.status(403).json({
          success: false,
          code: 'FATIGUE_BREAK_REQUIRED',
          message: hoursOnline >= 8
            ? `You've been driving for ${Math.floor(hoursOnline)} hours. Take a 15-minute break before going back online.`
            : `You've completed ${drv.total_trips_today} trips. Take a 15-minute break before continuing.`,
          hours_online: Math.round(hoursOnline * 10) / 10,
          trips_today: drv.total_trips_today || 0
        });
      }

      // Set online_since only if not already set (first time going online this session)
      const result = await db.query(
        `UPDATE drivers
         SET is_online = true,
             online_since = CASE WHEN online_since IS NULL THEN NOW() ELSE online_since END
         WHERE user_id = $1
         RETURNING id, is_online`,
        [userId]
      );

      return res.json({
        success: true,
        message: 'You are now online',
        data: { is_online: result.rows[0].is_online }
      });
    }

    // Going offline: clear online_since
    const result = await db.query(
      `UPDATE drivers SET is_online = false, online_since = NULL WHERE user_id = $1
       RETURNING id, is_online, is_approved`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Driver profile not found' });
    }

    res.json({
      success: true,
      message: 'You are now offline',
      data: { is_online: result.rows[0].is_online }
    });
  } catch (err) {
    console.error('[UpdateDriverStatus Error]', err);
    res.status(500).json({ success: false, message: 'Failed to update driver status' });
  }
};

module.exports = {
  updateLocation,
  getLocation,
  getNearbyDrivers,
  checkSurgeZone,
  getRouteEstimate,
  getRideRoute,
  getLocationHistory,
  updateDriverStatus
};

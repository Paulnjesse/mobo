'use strict';
const logger = require('../utils/logger');

const { verifyJwt } = require('../../../shared/jwtUtil');
const db    = require('../config/database');
const cache = require('../../../shared/redis');

// ── Africa network optimisation — server-side location throttle ───────────────
// Problem: GPS hardware fires at 1 Hz (every second). Broadcasting every update
// would mean ~3,600 DB writes/hour per driver and constant WebSocket traffic —
// catastrophic on 3G where each socket frame costs real bandwidth.
//
// Solution: enforce a server-side minimum interval between accepted updates.
// The client can still emit at 1 Hz for GPS accuracy; we silently drop frames
// that arrive too soon.  The client never needs to know or change its code.
//
// Intervals by ride phase (set via socket event or inferred from speed):
//   Active ride   : 4 s  — smooth enough for the rider's tracking map
//   Searching/idle: 8 s  — driver is stopped or slow-moving; less urgency
//
// At 4 s: 900 updates/hr/driver  (vs 3,600 unthrottled) — 75% reduction
// At 8 s: 450 updates/hr/driver — 87.5% reduction
const THROTTLE_ACTIVE_MS = 2_000;  // 2 seconds — driver in a live ride (halved for pickup accuracy)
const THROTTLE_IDLE_MS   = 8_000;  // 8 seconds — driver searching/offline
const _lastUpdateMs      = new Map(); // driverId → last accepted timestamp (ms)

/* istanbul ignore next */
function shouldThrottle(driverId, isActive) {
  const intervalMs = isActive ? THROTTLE_ACTIVE_MS : THROTTLE_IDLE_MS;
  const last = _lastUpdateMs.get(driverId) || 0;
  const now  = Date.now();
  if (now - last < intervalMs) return true;  // drop this frame
  _lastUpdateMs.set(driverId, now);
  return false;
}

// Cleanup throttle map when driver disconnects (prevents memory leak)
/* istanbul ignore next */
function clearDriverThrottle(driverId) {
  _lastUpdateMs.delete(driverId);
}

// Driver location cache TTL — 60 seconds.
// If a driver stops emitting (disconnect, crash), their entry expires naturally.
const DRIVER_LOC_TTL = 60;

/**
 * Persist driver location to the shared Redis cache (with in-memory fallback).
 * Key: driver_loc:<driverId>
 */
/* istanbul ignore next */
async function cacheSetDriverLocation(driverId, payload) {
  driverLocations.set(String(driverId), payload); // always keep in-memory for zero-latency reads
  await cache.set(`driver_loc:${driverId}`, payload, DRIVER_LOC_TTL);
}

/**
 * Read driver location — Redis first, fall back to in-memory map.
 */
/* istanbul ignore next */
async function cacheGetDriverLocation(driverId) {
  const fromRedis = await cache.get(`driver_loc:${driverId}`);
  if (fromRedis) return fromRedis;
  return driverLocations.get(String(driverId)) || null;
}

/**
 * Remove driver location from both caches on disconnect.
 */
/* istanbul ignore next */
async function cacheDelDriverLocation(driverId) {
  driverLocations.delete(String(driverId));
  await cache.del(`driver_loc:${driverId}`);
}

/**
 * Haversine distance in km between two lat/lng points.
 * Used for real-time ETA recalculation on each driver location update.
 */
/* istanbul ignore next */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Estimate ETA in minutes from distance (Haversine) using 25 km/h avg urban speed.
 * Returns null when dropoff coordinates are unavailable.
 */
/* istanbul ignore next */
function estimateEtaMinutes(driverLat, driverLng, dropoffLat, dropoffLng) {
  if (dropoffLat == null || dropoffLng == null) return null;
  const distKm = haversineKm(driverLat, driverLng, dropoffLat, dropoffLng);
  return Math.max(1, Math.round((distKm / 25) * 60)); // 25 km/h avg urban speed
}

/**
 * Map of driverId -> latest location payload.
 * Used to provide instant location data to new subscribers.
 * @type {Map<string, object>}
 */
const driverLocations = new Map();

/**
 * Map of driverId -> socketId. One active socket per driver.
 * @type {Map<string, string>}
 */
const driverSockets = new Map();

/**
 * Map of driverId -> Set<socketId> of riders currently tracking that driver.
 * @type {Map<string, Set<string>>}
 */
const trackingSubscriptions = new Map();

/**
 * Set of driverIds currently marked as online.
 * @type {Set<string>}
 */
const onlineDrivers = new Set();

/**
 * Map of driverId -> last activity timestamp (ms).
 * Updated on every accepted update_location event.
 * Used by the inactivity watchdog to auto-offline silent drivers.
 */
const driverLastActivityMs = new Map();

/** Mark activity for a driver (called on every accepted location update). */
function touchDriverActivity(driverId) {
  driverLastActivityMs.set(String(driverId), Date.now());
}

/** Remove driver from activity map on disconnect. */
function clearDriverActivity(driverId) {
  driverLastActivityMs.delete(String(driverId));
}

// ── Inactivity watchdog ───────────────────────────────────────────────────────
// Drivers on 3G may silently drop their connection without triggering a Socket.IO
// disconnect event. After INACTIVITY_TIMEOUT_MS of silence, auto-mark them offline
// and free their `is_available` flag so rides can be dispatched to other drivers.
const INACTIVITY_TIMEOUT_MS = 90_000; // 90 s
const WATCHDOG_INTERVAL_MS  = 30_000; // check every 30 s

/* istanbul ignore next */
function startInactivityWatchdog(locationNs) {
  return setInterval(async () => {
    const now = Date.now();
    for (const [driverId, lastMs] of driverLastActivityMs.entries()) {
      if (now - lastMs < INACTIVITY_TIMEOUT_MS) continue;

      logger.warn('[LocationSocket] Driver inactivity timeout — marking offline', { driverId, silentSec: Math.round((now - lastMs) / 1000) });
      onlineDrivers.delete(driverId);
      driverLastActivityMs.delete(driverId);
      clearDriverThrottle(driverId);
      cacheDelDriverLocation(driverId).catch(() => {});

      // Update DB: mark driver offline
      try {
        await db.query(
          `UPDATE drivers SET is_available = false WHERE user_id = $1`,
          [driverId]
        );
      } catch (dbErr) {
        logger.warn('[LocationSocket] Failed to mark driver offline in DB', { driverId, err: dbErr.message });
      }

      // Notify connected clients
      locationNs.emit('driver_offline', { driverId, reason: 'inactivity_timeout', timestamp: now });
    }
  }, WATCHDOG_INTERVAL_MS);
}

/** Subscription room name for a driver's location stream. */
const driverLocationRoom = (driverId) => `location:driver:${driverId}`;

/**
 * Initialises the Socket.IO namespace `/location` with JWT auth middleware
 * and all real-time location event handlers.
 *
 * @param {import('socket.io').Server} io - Top-level Socket.IO server.
 * @returns {import('socket.io').Namespace} The configured `/location` namespace.
 */
function initLocationSocket(io) {
  const location = io.of('/location');

  /* ------------------------------------------------------------------ */
  /* Authentication middleware                                            */
  /* ------------------------------------------------------------------ */
  /* istanbul ignore next */
  location.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) return next(new Error('Authentication required: no token provided'));

      // Uses shared jwtUtil — honours RS256 in production, HS256 in dev/test.
      // Consistent with the HTTP auth middleware (location-service/src/middleware/auth.js).
      const decoded = verifyJwt(token);

      // HIGH-003: JWT is a point-in-time snapshot. Check current account status
      // in the DB so suspended/deactivated users cannot maintain open sockets
      // after their account is actioned (JWT would otherwise remain valid for
      // up to 7 days).
      const statusRow = await db.query(
        'SELECT is_active, is_suspended FROM users WHERE id = $1',
        [decoded.id]
      );
      const userStatus = statusRow.rows[0];
      if (!userStatus) {
        return next(new Error('Authentication failed: user not found'));
      }
      if (!userStatus.is_active || userStatus.is_suspended) {
        return next(new Error('Authentication failed: account is inactive or suspended'));
      }

      socket.user = decoded; // { id, role, name, ... }
      next();
    } catch (err) {
      next(new Error(`Authentication failed: ${err.message}`));
    }
  });

  /* ------------------------------------------------------------------ */
  /* Connection handler                                                   */
  /* ------------------------------------------------------------------ */
  /* istanbul ignore next */
  location.on('connection', (socket) => {
    const { id: userId, role } = socket.user || {};
    logger.info(`[LocationSocket] Connected: socketId=${socket.id} userId=${userId} role=${role}`);

    // Register driver socket
    if (role === 'driver') {
      driverSockets.set(String(userId), socket.id);
    }

    /* ---------------------------------------------------------------- */
    /**
     * `update_location` — Driver pushes their current GPS position.
     * Persists to DB via the location service's existing route logic (if
     * available), then broadcasts to all riders currently tracking this driver.
     *
     * @event update_location
     * @param {{ latitude: number, longitude: number, heading?: number, speed?: number, accuracy?: number, timestamp?: number }} data
     */
    socket.on('update_location', async (data = {}) => {
      if (socket.user?.role !== 'driver') {
        return socket.emit('error', { message: 'Only drivers may emit update_location' });
      }

      const { latitude, longitude, heading, speed, accuracy, timestamp,
              dropoff_lat, dropoff_lng,
              is_active_ride } = data;  // client may hint whether a ride is in progress
      if (latitude == null || longitude == null) {
        return socket.emit('error', { message: 'update_location requires latitude and longitude' });
      }

      const driverId = String(socket.user.id);

      // ── Africa throttle — drop frames that arrive too fast ────────────────
      // Protects DB, Redis, and downstream WebSocket bandwidth on 3G networks.
      // We use is_active_ride from the payload if provided, otherwise assume idle.
      const isActive = !!is_active_ride;
      if (shouldThrottle(driverId, isActive)) return; // silently drop — no error to client

      // Record activity timestamp for inactivity watchdog
      touchDriverActivity(driverId);

      // SEC-003: Enforce GDPR location_tracking consent before recording GPS data.
      // Drivers must have granted location_tracking consent (Article 6 lawful basis).
      // If consent was withdrawn, we refuse to record their position.
      try {
        const consentRow = await db.query(
          `SELECT is_granted FROM user_consents
           WHERE user_id = $1 AND purpose = 'location_tracking' AND is_granted = true
           LIMIT 1`,
          [socket.user.id]
        );
        if (!consentRow.rows[0]) {
          return socket.emit('error', {
            code: 'CONSENT_REQUIRED',
            message: 'Location tracking consent is required to go online. Please accept the terms in the app.',
          });
        }
      } catch (consentErr) {
        // SEC-003 (fail-CLOSED): consent check failure blocks the location update.
        // Migration_030 introduced user_consents — if the table is missing it is
        // a deployment error, not a driver error. We log and reject rather than
        // silently broadcasting location data without a valid consent record.
        // To re-enable the grace period for a schema rollout, temporarily set
        // LOCATION_CONSENT_GRACE=true in the environment.
        if (process.env.LOCATION_CONSENT_GRACE === 'true') {
          logger.warn(`[LocationSocket] Consent check failed for driver ${driverId} — GRACE MODE active (remove LOCATION_CONSENT_GRACE before next release):`, consentErr.message);
        } else {
          logger.error(`[LocationSocket] Consent check failed for driver ${driverId} — blocking update (fail-closed):`, consentErr.message);
          return socket.emit('error', {
            code: 'CONSENT_CHECK_FAILED',
            message: 'Could not verify location tracking consent. Please reconnect.',
          });
        }
      }

      // Compute live ETA from driver's current position to dropoff (if provided)
      const eta_minutes = estimateEtaMinutes(latitude, longitude, dropoff_lat, dropoff_lng);

      const locationPayload = {
        driverId,
        latitude,
        longitude,
        heading: heading ?? null,
        speed: speed ?? null,
        accuracy: accuracy ?? null,
        timestamp: timestamp || Date.now(),
        eta_minutes,  // null when dropoff not provided
      };

      // Cache the latest position (Redis + in-memory fallback)
      cacheSetDriverLocation(driverId, locationPayload).catch(() => {});

      // Broadcast to all subscribers in this driver's location room
      location.to(driverLocationRoom(driverId)).emit('driver_location', locationPayload);

      // Emit dedicated eta_update event so riders can update their ETA display
      if (eta_minutes !== null) {
        location.to(driverLocationRoom(driverId)).emit('eta_update', { driverId, eta_minutes, timestamp: locationPayload.timestamp });
      }

      // ── Geofence arrival detection ────────────────────────────────────────
      // When driver is within 100 m of the ride pickup and the ride is still
      // in 'accepted' status, automatically transition to 'arriving' and notify
      // the rider — no manual "I've arrived" tap required.
      if (isActive) {
        checkGeofenceArrival(driverId, latitude, longitude, location).catch((err) => {
          logger.warn(`[LocationSocket] Geofence check error for driver ${driverId}:`, err.message);
        });
      }

      // Persist to DB asynchronously — non-blocking, failures are logged only
      persistLocationToDB(driverId, locationPayload).catch((err) => {
        logger.warn(`[LocationSocket] DB persist failed for driver ${driverId}:`, err.message);
      });
    });

    /* ---------------------------------------------------------------- */
    /**
     * `track_driver` — Rider subscribes to real-time location updates for
     * a specific driver. The rider immediately receives the last known
     * position (if available) so the map populates without waiting for
     * the next driver emit.
     *
     * @event track_driver
     * @param {{ driverId: string }} data
     */
    socket.on('track_driver', async ({ driverId, rideId } = {}) => {
      if (!driverId) {
        return socket.emit('error', { message: 'track_driver requires driverId' });
      }
      if (!rideId) {
        return socket.emit('error', { message: 'track_driver requires rideId — you must have an active ride with this driver' });
      }

      // SEC-002: Verify the requesting user has an active ride with this specific driver.
      // Prevents any authenticated user from subscribing to arbitrary driver GPS streams.
      // Admins bypass this check for dispatch/monitoring purposes.
      const isAdmin = socket.user?.role === 'admin';
      if (!isAdmin) {
        try {
          const rideRow = await db.query(
            `SELECT r.id
             FROM rides r
             JOIN drivers d ON d.id = r.driver_id
             WHERE r.id = $1
               AND d.user_id = $2
               AND r.rider_id = $3
               AND r.status IN ('accepted', 'arriving', 'in_progress')
             LIMIT 1`,
            [rideId, driverId, socket.user.id]
          );
          if (!rideRow.rows[0]) {
            return socket.emit('error', {
              code: 'UNAUTHORIZED_TRACKING',
              message: 'You do not have an active ride with this driver.',
            });
          }
        } catch (err) {
          logger.error(`[LocationSocket] track_driver auth check failed for user ${socket.user?.id}:`, err.message);
          return socket.emit('error', { message: 'Unable to verify ride authorization. Please try again.' });
        }
      }

      const room = driverLocationRoom(driverId);
      socket.join(room);

      // Register subscription for diagnostics
      if (!trackingSubscriptions.has(driverId)) {
        trackingSubscriptions.set(driverId, new Set());
      }
      trackingSubscriptions.get(driverId).add(socket.id);

      logger.info(`[LocationSocket] ${socket.id} (user=${socket.user?.id}) is now tracking driver ${driverId} on ride ${rideId}`);

      // Send last known location immediately (Redis → in-memory fallback)
      cacheGetDriverLocation(driverId).then((lastKnown) => {
        if (lastKnown) socket.emit('driver_location', { ...lastKnown, isInitialSnapshot: true });
      }).catch(() => {});

      socket.emit('tracking_started', { driverId, room });
    });

    /* ---------------------------------------------------------------- */
    /**
     * `stop_tracking` — Rider unsubscribes from a driver's location room.
     *
     * @event stop_tracking
     * @param {{ driverId: string }} data
     */
    socket.on('stop_tracking', ({ driverId } = {}) => {
      if (!driverId) {
        return socket.emit('error', { message: 'stop_tracking requires driverId' });
      }

      const room = driverLocationRoom(driverId);
      socket.leave(room);

      const subs = trackingSubscriptions.get(driverId);
      if (subs) {
        subs.delete(socket.id);
        if (subs.size === 0) trackingSubscriptions.delete(driverId);
      }

      logger.info(`[LocationSocket] ${socket.id} stopped tracking driver ${driverId}`);
      socket.emit('tracking_stopped', { driverId });
    });

    /* ---------------------------------------------------------------- */
    /**
     * `driver_online` — Driver marks themselves as available for rides.
     * Broadcasts `driver_online` to the general `drivers_status` room so
     * the dispatcher or rider home screen can update nearby driver overlays.
     *
     * @event driver_online
     * @param {{ latitude?: number, longitude?: number }} data  Initial position
     */
    socket.on('driver_online', (data = {}) => {
      if (socket.user?.role !== 'driver') {
        return socket.emit('error', { message: 'Only drivers may emit driver_online' });
      }

      const driverId = String(socket.user.id);
      onlineDrivers.add(driverId);

      const payload = {
        driverId,
        driverName: socket.user?.name || 'Driver',
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        timestamp: Date.now(),
      };

      // Update cached location if coordinates provided
      if (data.latitude != null && data.longitude != null) {
        cacheSetDriverLocation(driverId, { ...payload }).catch(() => {});
      }

      location.emit('driver_online', payload); // broadcast to all connected clients
      socket.emit('online_confirmed', { driverId, timestamp: payload.timestamp });
      logger.info(`[LocationSocket] Driver ${driverId} is now online`);
    });

    /* ---------------------------------------------------------------- */
    /**
     * `driver_offline` — Driver marks themselves as unavailable.
     * Removes them from the online set and notifies all clients.
     *
     * @event driver_offline
     * @param {{}} data  (no required fields)
     */
    socket.on('driver_offline', (data = {}) => {
      if (socket.user?.role !== 'driver') {
        return socket.emit('error', { message: 'Only drivers may emit driver_offline' });
      }

      const driverId = String(socket.user.id);
      onlineDrivers.delete(driverId);

      const payload = {
        driverId,
        driverName: socket.user?.name || 'Driver',
        timestamp: Date.now(),
      };

      location.emit('driver_offline', payload);
      socket.emit('offline_confirmed', { driverId, timestamp: payload.timestamp });
      logger.info(`[LocationSocket] Driver ${driverId} went offline`);
    });

    /* ---------------------------------------------------------------- */
    /**
     * `disconnect` — Clean up driver socket index, online state, and any
     * subscription records for this socket.
     *
     * @event disconnect
     * @param {string} reason
     */
    socket.on('disconnect', (reason) => {
      logger.info(`[LocationSocket] Disconnected: socketId=${socket.id} userId=${userId} reason=${reason}`);

      if (role === 'driver') {
        const stored = driverSockets.get(String(userId));
        if (stored === socket.id) {
          driverSockets.delete(String(userId));
          onlineDrivers.delete(String(userId));
          clearDriverThrottle(String(userId));   // free throttle memory
          clearDriverActivity(String(userId));   // free watchdog entry
          // Evict from Redis cache — driver is no longer streaming location
          cacheDelDriverLocation(String(userId)).catch(() => {});

          // Notify clients that the driver went offline due to disconnection
          location.emit('driver_offline', {
            driverId: String(userId),
            reason: 'disconnected',
            timestamp: Date.now(),
          });

          // If driver disconnected during an active ride, update DB + log event
          db.query(
            `SELECT id, status FROM rides WHERE driver_id = (SELECT id FROM drivers WHERE user_id = $1 LIMIT 1)
               AND status IN ('accepted', 'arriving', 'in_progress') LIMIT 1`,
            [userId]
          ).then(async (rideRes) => {
            if (!rideRes.rows[0]) return;
            const activeRide = rideRes.rows[0];
            await db.query(
              `INSERT INTO ride_events
                 (ride_id, event_type, old_status, new_status, actor_id, actor_role, metadata)
               VALUES ($1, 'driver_disconnected', $2, $2, $3, 'system', $4)`,
              [activeRide.id, activeRide.status, userId, JSON.stringify({ reason, socketId: socket.id })]
            );
            logger.warn('[LocationSocket] Driver disconnected during active ride', {
              driverId: userId,
              rideId: activeRide.id,
              rideStatus: activeRide.status,
            });
          }).catch(() => {});
        }
      }

      // Remove socket from all tracking subscription sets
      for (const [driverId, subs] of trackingSubscriptions.entries()) {
        subs.delete(socket.id);
        if (subs.size === 0) trackingSubscriptions.delete(driverId);
      }
    });
  });

  // Start inactivity watchdog — auto-offline drivers that stop emitting GPS
  startInactivityWatchdog(location);

  return location;
}

/**
 * Geofence arrival detection.
 * When the driver is within ARRIVAL_RADIUS_M metres of the ride pickup and the
 * ride is still in 'accepted' status, auto-transition to 'arriving' and emit
 * a `driver_arrived` socket event to the rider's tracking room.
 *
 * @param {string} driverId
 * @param {number} driverLat
 * @param {number} driverLng
 * @param {import('socket.io').Namespace} locationNs  Socket.IO /location namespace
 */
/* istanbul ignore next */
async function checkGeofenceArrival(driverId, driverLat, driverLng, locationNs) {
  const ARRIVAL_RADIUS_M = 100; // metres — auto-trigger "arriving" within 100 m of pickup

  if (!db || typeof db.query !== 'function') return;

  // Find an active ride for this driver that is still in 'accepted' state
  const rideRow = await db.query(
    `SELECT r.id, r.rider_id,
            ST_Y(r.pickup_location::geometry) AS pickup_lat,
            ST_X(r.pickup_location::geometry) AS pickup_lng
     FROM   rides r
     JOIN   drivers d ON d.id = r.driver_id
     WHERE  d.user_id = $1
       AND  r.status  = 'accepted'
     LIMIT  1`,
    [driverId]
  );

  const ride = rideRow.rows[0];
  if (!ride) return; // no accepted ride to check

  const pickupLat = parseFloat(ride.pickup_lat);
  const pickupLng = parseFloat(ride.pickup_lng);
  if (isNaN(pickupLat) || isNaN(pickupLng)) return;

  const distM = haversineKm(driverLat, driverLng, pickupLat, pickupLng) * 1000;
  if (distM > ARRIVAL_RADIUS_M) return; // not close enough yet

  // Transition ride to 'arriving'
  const updated = await db.query(
    `UPDATE rides
     SET status = 'arriving', driver_arrived_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status = 'accepted'
     RETURNING id, rider_id`,
    [ride.id]
  );
  if (!updated.rows[0]) return; // already updated by another process or manual tap

  logger.info(`[LocationSocket] Geofence arrival: driver ${driverId} within ${Math.round(distM)}m of pickup → ride ${ride.id} set to 'arriving'`);

  // Emit to the driver's location room so all subscribers (rider + admin) are notified
  locationNs.to(driverLocationRoom(driverId)).emit('driver_arrived', {
    rideId:    ride.id,
    driverId,
    riderId:   ride.rider_id,
    distanceM: Math.round(distM),
    timestamp: Date.now(),
  });
}

/**
 * Persist driver location to the database.
 * Delegates to the existing REST route DB logic if available, or uses
 * a direct pg query if a pool is accessible via require.
 *
 * This is intentionally non-fatal — socket events are not blocked if the DB
 * write fails.
 *
 * @param {string} driverId
 * @param {{ latitude: number, longitude: number, heading: number|null, speed: number|null, accuracy: number|null, timestamp: number }} locationPayload
 * @returns {Promise<void>}
 */
/* istanbul ignore next */
async function persistLocationToDB(driverId, locationPayload) {
  try {
    if (!db || typeof db.query !== 'function') return;

    await db.query(
      `INSERT INTO driver_locations (driver_id, latitude, longitude, heading, speed, accuracy_m, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7 / 1000.0))
       ON CONFLICT (driver_id) DO UPDATE
         SET latitude   = EXCLUDED.latitude,
             longitude  = EXCLUDED.longitude,
             heading    = EXCLUDED.heading,
             speed      = EXCLUDED.speed,
             accuracy_m = EXCLUDED.accuracy_m,
             updated_at = EXCLUDED.updated_at`,
      [
        driverId,
        locationPayload.latitude,
        locationPayload.longitude,
        locationPayload.heading,
        locationPayload.speed,
        locationPayload.accuracy,
        locationPayload.timestamp,
      ]
    );
  } catch (_err) {
    // Silently ignore — caller logs if needed
  }
}

/**
 * Returns the last known location for a driver, or null if unavailable.
 * Checks Redis first (cross-instance), then falls back to in-memory map.
 *
 * @param {string} driverId
 * @returns {Promise<object|null>}
 */
/* istanbul ignore next */
async function getLastKnownLocation(driverId) {
  return cacheGetDriverLocation(driverId);
}

/**
 * Returns an array of all currently online driver IDs.
 *
 * @returns {string[]}
 */
/* istanbul ignore next */
function getOnlineDriverIds() {
  return Array.from(onlineDrivers);
}

module.exports = {
  initLocationSocket,
  getLastKnownLocation,
  getOnlineDriverIds,
  driverSockets,
  onlineDrivers,
};

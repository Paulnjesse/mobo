'use strict';

const { verifyJwt } = require('../../../shared/jwtUtil');

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
  location.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) return next(new Error('Authentication required: no token provided'));

      // Uses shared jwtUtil — honours RS256 in production, HS256 in dev/test.
      // Consistent with the HTTP auth middleware (location-service/src/middleware/auth.js).
      const decoded = verifyJwt(token);
      socket.user = decoded; // { id, role, name, ... }
      next();
    } catch (err) {
      next(new Error(`Authentication failed: ${err.message}`));
    }
  });

  /* ------------------------------------------------------------------ */
  /* Connection handler                                                   */
  /* ------------------------------------------------------------------ */
  location.on('connection', (socket) => {
    const { id: userId, role } = socket.user || {};
    console.log(`[LocationSocket] Connected: socketId=${socket.id} userId=${userId} role=${role}`);

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

      const { latitude, longitude, heading, speed, accuracy, timestamp } = data;
      if (latitude == null || longitude == null) {
        return socket.emit('error', { message: 'update_location requires latitude and longitude' });
      }

      const driverId = String(socket.user.id);
      const locationPayload = {
        driverId,
        latitude,
        longitude,
        heading: heading ?? null,
        speed: speed ?? null,
        accuracy: accuracy ?? null,
        timestamp: timestamp || Date.now(),
      };

      // Cache the latest position
      driverLocations.set(driverId, locationPayload);

      // Broadcast to all subscribers in this driver's location room
      location.to(driverLocationRoom(driverId)).emit('driver_location', locationPayload);

      // Persist to DB asynchronously — non-blocking, failures are logged only
      persistLocationToDB(driverId, locationPayload).catch((err) => {
        console.warn(`[LocationSocket] DB persist failed for driver ${driverId}:`, err.message);
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
    socket.on('track_driver', ({ driverId } = {}) => {
      if (!driverId) {
        return socket.emit('error', { message: 'track_driver requires driverId' });
      }

      const room = driverLocationRoom(driverId);
      socket.join(room);

      // Register subscription for diagnostics
      if (!trackingSubscriptions.has(driverId)) {
        trackingSubscriptions.set(driverId, new Set());
      }
      trackingSubscriptions.get(driverId).add(socket.id);

      console.log(`[LocationSocket] ${socket.id} is now tracking driver ${driverId}`);

      // Send last known location immediately
      const lastKnown = driverLocations.get(String(driverId));
      if (lastKnown) {
        socket.emit('driver_location', { ...lastKnown, isInitialSnapshot: true });
      }

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

      console.log(`[LocationSocket] ${socket.id} stopped tracking driver ${driverId}`);
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
        driverLocations.set(driverId, { ...payload });
      }

      location.emit('driver_online', payload); // broadcast to all connected clients
      socket.emit('online_confirmed', { driverId, timestamp: payload.timestamp });
      console.log(`[LocationSocket] Driver ${driverId} is now online`);
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
      console.log(`[LocationSocket] Driver ${driverId} went offline`);
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
      console.log(`[LocationSocket] Disconnected: socketId=${socket.id} userId=${userId} reason=${reason}`);

      if (role === 'driver') {
        const stored = driverSockets.get(String(userId));
        if (stored === socket.id) {
          driverSockets.delete(String(userId));
          onlineDrivers.delete(String(userId));

          // Notify clients that the driver went offline due to disconnection
          location.emit('driver_offline', {
            driverId: String(userId),
            reason: 'disconnected',
            timestamp: Date.now(),
          });
        }
      }

      // Remove socket from all tracking subscription sets
      for (const [driverId, subs] of trackingSubscriptions.entries()) {
        subs.delete(socket.id);
        if (subs.size === 0) trackingSubscriptions.delete(driverId);
      }
    });
  });

  return location;
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
 * @param {{ latitude: number, longitude: number, heading: number|null, speed: number|null, timestamp: number }} locationPayload
 * @returns {Promise<void>}
 */
async function persistLocationToDB(driverId, locationPayload) {
  try {
    // Attempt to re-use the shared DB pool exported from the location service routes
    const db = require('../db');
    if (!db || typeof db.query !== 'function') return;

    await db.query(
      `INSERT INTO driver_locations (driver_id, latitude, longitude, heading, speed, updated_at)
       VALUES ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0))
       ON CONFLICT (driver_id) DO UPDATE
         SET latitude   = EXCLUDED.latitude,
             longitude  = EXCLUDED.longitude,
             heading    = EXCLUDED.heading,
             speed      = EXCLUDED.speed,
             updated_at = EXCLUDED.updated_at`,
      [
        driverId,
        locationPayload.latitude,
        locationPayload.longitude,
        locationPayload.heading,
        locationPayload.speed,
        locationPayload.timestamp,
      ]
    );
  } catch (_err) {
    // Silently ignore — caller logs if needed
  }
}

/**
 * Returns the last known location for a driver, or null if unavailable.
 *
 * @param {string} driverId
 * @returns {object|null}
 */
function getLastKnownLocation(driverId) {
  return driverLocations.get(String(driverId)) || null;
}

/**
 * Returns an array of all currently online driver IDs.
 *
 * @returns {string[]}
 */
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

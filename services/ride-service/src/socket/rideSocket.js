'use strict';
const logger = require('../utils/logger');

const { verifyJwt } = require('../../../shared/jwtUtil');
const db = require('../config/database');

/**
 * Map of rideId -> Set of socketIds currently in that ride room.
 * Used for diagnostics and targeted broadcasts.
 * @type {Map<string, Set<string>>}
 */
const rideRooms = new Map();

/**
 * Map of driverId -> socketId for direct driver targeting.
 * @type {Map<string, string>}
 */
const driverSockets = new Map();

/**
 * Map of riderId -> socketId for direct rider targeting.
 * @type {Map<string, string>}
 */
const riderSockets = new Map();

/**
 * Map of rideId -> NodeJS.Timeout for pending driver-response timers.
 * @type {Map<string, NodeJS.Timeout>}
 */
const requestTimeouts = new Map();

/** Room name helper — keeps room keys consistent across the service. */
const rideRoom = (rideId) => `ride:${rideId}`;

/**
 * Registers a socket in the ride room tracking map.
 * @param {string} rideId
 * @param {string} socketId
 */
function trackRideRoom(rideId, socketId) {
  if (!rideRooms.has(rideId)) rideRooms.set(rideId, new Set());
  rideRooms.get(rideId).add(socketId);
}

/**
 * Removes a socket from all ride room tracking entries.
 * @param {string} socketId
 */
function untrackSocket(socketId) {
  for (const [rideId, members] of rideRooms.entries()) {
    members.delete(socketId);
    if (members.size === 0) rideRooms.delete(rideId);
  }
}

/**
 * Initialises the Socket.IO namespace `/rides` with authentication
 * middleware and all ride-lifecycle event handlers.
 *
 * @param {import('socket.io').Server} io - The top-level Socket.IO server instance.
 * @returns {import('socket.io').Namespace} The configured `/rides` namespace.
 */
function initRideSocket(io) {
  const rides = io.of('/rides');

  /* ------------------------------------------------------------------ */
  /* Authentication middleware — verifies JWT on every new connection     */
  /* ------------------------------------------------------------------ */
  rides.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Authentication required: no token provided'));
      }

      // Uses shared jwtUtil — RS256 in production, HS256 in dev/test
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
  rides.on('connection', (socket) => {
    const { id: userId, role } = socket.user || {};
    logger.info(`[RideSocket] Connected: socketId=${socket.id} userId=${userId} role=${role}`);

    // Register driver / rider socket index
    if (role === 'driver') driverSockets.set(String(userId), socket.id);
    if (role === 'rider') riderSockets.set(String(userId), socket.id);

    /* ---------------------------------------------------------------- */
    /**
     * `join_ride` — Rider (or driver) subscribes to a specific ride room
     * so they receive all real-time events for that ride.
     *
     * @event join_ride
     * @param {{ rideId: string }} data
     */
    socket.on('join_ride', ({ rideId } = {}) => {
      if (!rideId) return socket.emit('error', { message: 'join_ride requires rideId' });
      const room = rideRoom(rideId);
      socket.join(room);
      trackRideRoom(rideId, socket.id);
      logger.info(`[RideSocket] ${socket.id} joined room ${room}`);
      socket.emit('joined_ride', { rideId, room });
    });

    /* ---------------------------------------------------------------- */
    /**
     * `driver_location_update` — Driver emits their current GPS coordinates
     * every ~5 s. The server broadcasts the position to everyone in the
     * ride room so the rider's map marker updates in real time.
     *
     * @event driver_location_update
     * @param {{ rideId: string, latitude: number, longitude: number, heading?: number, speed?: number, timestamp?: number }} data
     */
    socket.on('driver_location_update', (data = {}) => {
      const { rideId, latitude, longitude, heading, speed, timestamp } = data;
      if (!rideId || latitude == null || longitude == null) {
        return socket.emit('error', { message: 'driver_location_update requires rideId, latitude, longitude' });
      }
      if (socket.user?.role !== 'driver') {
        return socket.emit('error', { message: 'Only drivers may emit driver_location_update' });
      }

      const payload = {
        rideId,
        latitude,
        longitude,
        heading: heading ?? null,
        speed: speed ?? null,
        timestamp: timestamp || Date.now(),
        driverId: String(socket.user.id),
      };

      // Broadcast to everyone in the ride room EXCEPT the driver themselves
      socket.to(rideRoom(rideId)).emit('driver_location_update', payload);
    });

    /* ---------------------------------------------------------------- */
    /**
     * `ride_status_change` — Driver (or server logic) announces a status
     * transition: accepted → arriving → arrived → in_progress → completed.
     * Emitted to the entire ride room.
     *
     * @event ride_status_change
     * @param {{ rideId: string, status: string, driverId?: string, riderId?: string, meta?: object }} data
     */
    socket.on('ride_status_change', async (data = {}) => {
      const { rideId, status } = data;
      if (!rideId || !status) {
        return socket.emit('error', { message: 'ride_status_change requires rideId and status' });
      }

      const validStatuses = ['accepted', 'arriving', 'arrived', 'in_progress', 'completed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return socket.emit('error', { message: `Invalid status: ${status}` });
      }

      // Verify the socket user is an actual participant in this ride
      try {
        const userId = String(socket.user?.id);
        const { rows } = await db.query(
          `SELECT id FROM rides
           WHERE id = $1
             AND (
               rider_id = $2
               OR driver_id IN (SELECT id FROM drivers WHERE user_id = $2)
             )`,
          [rideId, userId]
        );
        if (rows.length === 0) {
          return socket.emit('error', { message: 'Unauthorized: you are not a participant in this ride' });
        }
      } catch (dbErr) {
        logger.error('[RideSocket] ride_status_change DB check failed:', dbErr.message);
        return socket.emit('error', { message: 'Authorization check failed' });
      }

      const payload = {
        rideId,
        status,
        changedBy: String(socket.user?.id),
        role: socket.user?.role,
        timestamp: Date.now(),
        meta: data.meta || {},
      };

      rides.to(rideRoom(rideId)).emit('ride_status_change', payload);
      logger.info(`[RideSocket] ride_status_change rideId=${rideId} status=${status}`);
    });

    /* ---------------------------------------------------------------- */
    /**
     * `driver_arriving` — Driver emits periodic ETA updates while en route
     * to the rider's pickup location.
     *
     * @event driver_arriving
     * @param {{ rideId: string, etaMinutes: number, etaSeconds?: number, distanceMeters?: number }} data
     */
    socket.on('driver_arriving', (data = {}) => {
      const { rideId, etaMinutes } = data;
      if (!rideId || etaMinutes == null) {
        return socket.emit('error', { message: 'driver_arriving requires rideId and etaMinutes' });
      }

      const payload = {
        rideId,
        etaMinutes,
        etaSeconds: data.etaSeconds ?? null,
        distanceMeters: data.distanceMeters ?? null,
        timestamp: Date.now(),
      };

      socket.to(rideRoom(rideId)).emit('driver_arriving', payload);
    });

    /* ---------------------------------------------------------------- */
    /**
     * `ride_cancelled` — Either party notifies the ride room that the ride
     * has been cancelled. All subscribers are informed and should navigate
     * away from the tracking screen.
     *
     * @event ride_cancelled
     * @param {{ rideId: string, reason?: string, cancelledBy?: string }} data
     */
    socket.on('ride_cancelled', (data = {}) => {
      const { rideId } = data;
      if (!rideId) return socket.emit('error', { message: 'ride_cancelled requires rideId' });

      const payload = {
        rideId,
        reason: data.reason || 'Ride cancelled',
        cancelledBy: data.cancelledBy || String(socket.user?.id),
        role: socket.user?.role,
        timestamp: Date.now(),
      };

      rides.to(rideRoom(rideId)).emit('ride_cancelled', payload);
      logger.info(`[RideSocket] ride_cancelled rideId=${rideId}`);
    });

    /* ---------------------------------------------------------------- */
    /**
     * `incoming_ride_request` — Server-side logic (or API) calls this to
     * push a new ride request to a specific driver's socket. The driver
     * has 15 seconds to respond before the request expires automatically.
     *
     * Can also be triggered directly from this handler for testing.
     *
     * @event incoming_ride_request
     * @param {{ driverId: string, rideId: string, pickup: object, dropoff: object, fare: number, distance: string, eta: string, rider: object }} data
     */
    socket.on('incoming_ride_request', (data = {}) => {
      const { driverId, rideId } = data;
      if (!driverId || !rideId) {
        return socket.emit('error', { message: 'incoming_ride_request requires driverId and rideId' });
      }

      const targetSocketId = driverSockets.get(String(driverId));
      if (!targetSocketId) {
        return socket.emit('error', { message: `Driver ${driverId} is not connected` });
      }

      const payload = {
        rideId,
        pickup: data.pickup,
        dropoff: data.dropoff,
        fare: data.fare,
        distance: data.distance,
        eta: data.eta,
        rider: data.rider,
        expiresIn: 15, // seconds
        timestamp: Date.now(),
      };

      rides.to(targetSocketId).emit('incoming_ride_request', payload);

      // Auto-expire after 15 seconds if no response
      const timeoutHandle = setTimeout(() => {
        requestTimeouts.delete(rideId);
        rides.to(targetSocketId).emit('ride_request_expired', { rideId, timestamp: Date.now() });
        logger.info(`[RideSocket] Ride request ${rideId} expired for driver ${driverId}`);
      }, 15000);

      requestTimeouts.set(rideId, timeoutHandle);
      logger.info(`[RideSocket] incoming_ride_request sent to driver ${driverId} for ride ${rideId}`);
    });

    /* ---------------------------------------------------------------- */
    /**
     * `driver_response` — Driver accepts or declines a ride request.
     * Clears the 15-second timeout and notifies the requesting rider.
     *
     * @event driver_response
     * @param {{ rideId: string, accepted: boolean, driverId?: string }} data
     */
    socket.on('driver_response', (data = {}) => {
      const { rideId, accepted } = data;
      if (!rideId || accepted == null) {
        return socket.emit('error', { message: 'driver_response requires rideId and accepted (boolean)' });
      }
      if (socket.user?.role !== 'driver') {
        return socket.emit('error', { message: 'Only drivers may emit driver_response' });
      }

      // Cancel the expiry timer
      const timer = requestTimeouts.get(rideId);
      if (timer) {
        clearTimeout(timer);
        requestTimeouts.delete(rideId);
      }

      const driverId = String(socket.user.id);
      const payload = {
        rideId,
        accepted,
        driverId,
        driverName: socket.user?.name || 'Driver',
        timestamp: Date.now(),
      };

      // Broadcast response to the ride room (rider is already subscribed or will join)
      rides.to(rideRoom(rideId)).emit('driver_response', payload);

      // Also emit back to the requesting socket for confirmation
      socket.emit('driver_response_sent', payload);
      logger.info(`[RideSocket] driver_response rideId=${rideId} accepted=${accepted} by driver=${driverId}`);
    });

    /* ---------------------------------------------------------------- */
    /**
     * `message` — In-app chat message between rider and driver within the
     * context of a specific ride. Broadcast to the ride room so both
     * parties receive it.
     *
     * @event message
     * @param {{ rideId: string, text: string, senderId?: string, senderName?: string, senderRole?: string }} data
     */
    socket.on('message', (data = {}) => {
      const { rideId, text } = data;
      if (!rideId || !text) {
        return socket.emit('error', { message: 'message requires rideId and text' });
      }
      if (text.length > 500) {
        return socket.emit('error', { message: 'Message too long (max 500 characters)' });
      }

      const payload = {
        rideId,
        text: text.trim(),
        senderId: String(socket.user?.id),
        senderName: socket.user?.name || 'Unknown',
        senderRole: socket.user?.role || 'unknown',
        messageId: `msg_${Date.now()}_${socket.id.slice(-4)}`,
        timestamp: Date.now(),
      };

      // Deliver to everyone in the room including sender (for optimistic confirmation)
      rides.to(rideRoom(rideId)).emit('message', payload);
    });

    /* ---------------------------------------------------------------- */
    /**
     * `disconnect` — Clean up all room memberships, driver/rider index
     * entries, and pending request timeouts owned by this socket.
     *
     * @event disconnect
     * @param {string} reason
     */
    socket.on('disconnect', (reason) => {
      logger.info(`[RideSocket] Disconnected: socketId=${socket.id} userId=${userId} reason=${reason}`);
      untrackSocket(socket.id);

      if (role === 'driver') {
        const stored = driverSockets.get(String(userId));
        if (stored === socket.id) driverSockets.delete(String(userId));
      }
      if (role === 'rider') {
        const stored = riderSockets.get(String(userId));
        if (stored === socket.id) riderSockets.delete(String(userId));
      }
    });
  });

  return rides;
}

/**
 * Utility: emit `incoming_ride_request` programmatically from REST route handlers
 * without needing a socket client to relay it.
 *
 * @param {import('socket.io').Server} io
 * @param {string} driverId
 * @param {object} rideRequestPayload
 */
function notifyDriver(io, driverId, rideRequestPayload) {
  const ridesNs = io.of('/rides');
  const targetSocketId = driverSockets.get(String(driverId));
  if (!targetSocketId) {
    logger.warn(`[RideSocket] notifyDriver: driver ${driverId} is not connected`);
    return false;
  }

  const payload = {
    ...rideRequestPayload,
    expiresIn: 15,
    timestamp: Date.now(),
  };

  ridesNs.to(targetSocketId).emit('incoming_ride_request', payload);

  // Auto-expire
  const { rideId } = rideRequestPayload;
  if (rideId) {
    const handle = setTimeout(() => {
      requestTimeouts.delete(rideId);
      ridesNs.to(targetSocketId).emit('ride_request_expired', { rideId, timestamp: Date.now() });
    }, 15000);
    requestTimeouts.set(rideId, handle);
  }

  return true;
}

/**
 * Utility: emit a ride status change from a REST route handler.
 *
 * @param {import('socket.io').Server} io
 * @param {string} rideId
 * @param {string} status
 * @param {object} [meta={}]
 */
function broadcastRideStatus(io, rideId, status, meta = {}) {
  io.of('/rides').to(rideRoom(rideId)).emit('ride_status_change', {
    rideId,
    status,
    meta,
    timestamp: Date.now(),
  });
}

module.exports = { initRideSocket, notifyDriver, broadcastRideStatus, driverSockets, riderSockets };

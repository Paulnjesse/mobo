'use strict';
/**
 * deliverySocket — Socket.IO namespace `/deliveries`.
 *
 * Real-time events for the full delivery feature:
 *   join_delivery            — sender/driver subscribes to a delivery room
 *   leave_delivery           — unsubscribe from a delivery room
 *   delivery_location_update — driver broadcasts GPS coordinates to sender
 *   delivery_status_update   — driver/server broadcasts status transitions
 *   delivery_completed       — final event emitted when delivery is marked delivered
 *
 * Rooms follow the pattern: `delivery:<deliveryId>`
 * JWT authentication uses shared jwtUtil (RS256 in production, HS256 in dev).
 */

const { verifyJwt } = require('../../../shared/jwtUtil');
const db             = require('../config/database');
const logger         = require('../utils/logger');

/**
 * Map of deliveryId -> Set<socketId> of sockets in that delivery room.
 * Used for diagnostics and connection tracking.
 * @type {Map<string, Set<string>>}
 */
const deliveryRooms = new Map();

/**
 * Map of driverId -> socketId for direct targeting.
 * @type {Map<string, string>}
 */
const driverSockets = new Map();

/** Room name helper. */
const deliveryRoom = (deliveryId) => `delivery:${deliveryId}`;

function trackRoom(deliveryId, socketId) {
  if (!deliveryRooms.has(deliveryId)) deliveryRooms.set(deliveryId, new Set());
  deliveryRooms.get(deliveryId).add(socketId);
}

function untrackSocket(socketId) {
  for (const [deliveryId, members] of deliveryRooms.entries()) {
    members.delete(socketId);
    if (members.size === 0) deliveryRooms.delete(deliveryId);
  }
}

/**
 * Initialises the `/deliveries` Socket.IO namespace.
 *
 * @param {import('socket.io').Server} io
 * @returns {import('socket.io').Namespace}
 */
function initDeliverySocket(io) {
  const deliveries = io.of('/deliveries');

  /* ------------------------------------------------------------------ */
  /* JWT Authentication middleware                                        */
  /* ------------------------------------------------------------------ */
  deliveries.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) return next(new Error('Authentication required: no token provided'));

      // Uses shared jwtUtil — RS256 in production, HS256 in dev/test
      const decoded = verifyJwt(token);
      socket.user   = decoded;
      next();
    } catch (err) {
      next(new Error(`Authentication failed: ${err.message}`));
    }
  });

  /* ------------------------------------------------------------------ */
  /* Connection handler                                                   */
  /* ------------------------------------------------------------------ */
  deliveries.on('connection', (socket) => {
    const { id: userId, role } = socket.user || {};
    logger.info(`[DeliverySocket] Connected: socketId=${socket.id} userId=${userId} role=${role}`);

    if (role === 'driver') driverSockets.set(String(userId), socket.id);

    /* ---------------------------------------------------------------- */
    /**
     * `join_delivery` — Sender or driver subscribes to a delivery room
     * to receive all real-time events for that delivery.
     *
     * @event join_delivery
     * @param {{ deliveryId: string }} data
     */
    socket.on('join_delivery', async ({ deliveryId } = {}) => {
      if (!deliveryId) return socket.emit('error', { message: 'join_delivery requires deliveryId' });

      // Verify caller is a participant in this delivery
      try {
        const userId = String(socket.user?.id);
        const { rows } = await db.query(
          `SELECT d.id
             FROM deliveries d
             LEFT JOIN drivers drv ON drv.id = d.driver_id
            WHERE d.id = $1
              AND (
                d.sender_id = $2
                OR drv.user_id = $2
                OR $3 = 'admin'
              )`,
          [deliveryId, userId, socket.user?.role || '']
        );
        if (rows.length === 0) {
          return socket.emit('error', { message: 'Unauthorized: you are not a participant in this delivery' });
        }
      } catch (dbErr) {
        logger.error('[DeliverySocket] join_delivery DB check failed', { error: dbErr.message });
        return socket.emit('error', { message: 'Authorization check failed' });
      }

      const room = deliveryRoom(deliveryId);
      socket.join(room);
      trackRoom(deliveryId, socket.id);
      logger.info(`[DeliverySocket] ${socket.id} joined room ${room}`);
      socket.emit('joined_delivery', { deliveryId, room });
    });

    /* ---------------------------------------------------------------- */
    /**
     * `leave_delivery` — Unsubscribe from a delivery room.
     *
     * @event leave_delivery
     * @param {{ deliveryId: string }} data
     */
    socket.on('leave_delivery', ({ deliveryId } = {}) => {
      if (!deliveryId) return;
      socket.leave(deliveryRoom(deliveryId));
      const members = deliveryRooms.get(deliveryId);
      if (members) {
        members.delete(socket.id);
        if (members.size === 0) deliveryRooms.delete(deliveryId);
      }
      socket.emit('left_delivery', { deliveryId });
    });

    /* ---------------------------------------------------------------- */
    /**
     * `delivery_location_update` — Driver broadcasts their GPS position
     * every ~5 s. Relayed to everyone in the delivery room.
     *
     * @event delivery_location_update
     * @param {{ deliveryId: string, latitude: number, longitude: number, heading?: number, speed?: number }} data
     */
    socket.on('delivery_location_update', (data = {}) => {
      if (socket.user?.role !== 'driver') {
        return socket.emit('error', { message: 'Only drivers may emit delivery_location_update' });
      }
      const { deliveryId, latitude, longitude, heading, speed } = data;
      if (!deliveryId || latitude == null || longitude == null) {
        return socket.emit('error', { message: 'delivery_location_update requires deliveryId, latitude, longitude' });
      }

      const payload = {
        deliveryId,
        latitude,
        longitude,
        heading:   heading ?? null,
        speed:     speed ?? null,
        timestamp: Date.now(),
        driverId:  String(socket.user.id),
      };

      // Broadcast to everyone in the room EXCEPT the driver themselves
      socket.to(deliveryRoom(deliveryId)).emit('delivery_location_update', payload);
    });

    /* ---------------------------------------------------------------- */
    /**
     * `delivery_status_update` — Driver announces a status transition.
     * The server HTTP layer also emits this via emitDeliveryEvent().
     *
     * @event delivery_status_update
     * @param {{ deliveryId: string, status: string, meta?: object }} data
     */
    socket.on('delivery_status_update', async (data = {}) => {
      const { deliveryId, status } = data;
      if (!deliveryId || !status) {
        return socket.emit('error', { message: 'delivery_status_update requires deliveryId and status' });
      }

      const VALID = ['driver_arriving', 'picked_up', 'in_transit', 'delivered', 'failed', 'cancelled'];
      if (!VALID.includes(status)) {
        return socket.emit('error', { message: `Invalid status: ${status}` });
      }

      // Confirm caller is the assigned driver or admin
      try {
        const userId = String(socket.user?.id);
        const { rows } = await db.query(
          `SELECT d.id FROM deliveries d
             LEFT JOIN drivers drv ON drv.id = d.driver_id
            WHERE d.id = $1 AND (drv.user_id = $2 OR $3 = 'admin')`,
          [deliveryId, userId, socket.user?.role || '']
        );
        if (rows.length === 0) {
          return socket.emit('error', { message: 'Unauthorized: not assigned to this delivery' });
        }
      } catch (dbErr) {
        logger.error('[DeliverySocket] delivery_status_update DB check failed', { error: dbErr.message });
        return socket.emit('error', { message: 'Authorization check failed' });
      }

      const payload = {
        deliveryId,
        status,
        changedBy: String(socket.user?.id),
        role:      socket.user?.role,
        timestamp: Date.now(),
        meta:      data.meta || {},
      };

      deliveries.to(deliveryRoom(deliveryId)).emit('delivery_status_update', payload);
      logger.info(`[DeliverySocket] delivery_status_update deliveryId=${deliveryId} status=${status}`);

      // Fire delivery_completed event on terminal state
      if (status === 'delivered') {
        deliveries.to(deliveryRoom(deliveryId)).emit('delivery_completed', {
          deliveryId,
          completedAt: Date.now(),
          message: 'Package delivered successfully. Please rate your driver.',
        });
      }
    });

    /* ---------------------------------------------------------------- */
    /* Disconnection cleanup                                              */
    /* ---------------------------------------------------------------- */
    socket.on('disconnect', (reason) => {
      const { id: userId, role } = socket.user || {};
      logger.info(`[DeliverySocket] Disconnected: socketId=${socket.id} userId=${userId} reason=${reason}`);
      if (role === 'driver') driverSockets.delete(String(userId));
      untrackSocket(socket.id);
    });
  });

  return deliveries;
}

/** Expose driverSockets map for targeting specific drivers from HTTP layer. */
function getDriverSocketId(driverId) {
  return driverSockets.get(String(driverId));
}

module.exports = { initDeliverySocket, getDriverSocketId };

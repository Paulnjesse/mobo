/**
 * MOBO Socket.IO Client Service
 *
 * Manages two persistent socket connections:
 *   - rideSocket  → connects to the ride-service  /rides     namespace
 *   - locationSocket → connects to the location-service /location namespace
 *
 * Both sockets authenticate via JWT (read from AsyncStorage on connect).
 * Reconnection is handled automatically by the Socket.IO client library.
 *
 * Usage:
 *   import { connectSockets, disconnectSockets, rideSocket, locationSocket } from './socket';
 *
 *   // Connect (typically called after login or on app resume)
 *   await connectSockets();
 *
 *   // Disconnect (typically called on logout)
 *   disconnectSockets();
 */

import { io } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------------------------------------------------------------------------
// Service URLs — override via environment / build config as needed
// ---------------------------------------------------------------------------
const RIDE_SOCKET_URL = 'https://mobo-ride-service.onrender.com';
const LOCATION_SOCKET_URL = 'https://mobo-location-service.onrender.com';

const TOKEN_KEY = '@mobo_token';

// ---------------------------------------------------------------------------
// Socket instances (created lazily on first connectSockets() call)
// ---------------------------------------------------------------------------
/** @type {import('socket.io-client').Socket|null} */
let rideSocket = null;

/** @type {import('socket.io-client').Socket|null} */
let locationSocket = null;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Reads the stored JWT from AsyncStorage.
 * Returns an empty string if no token is found.
 * @returns {Promise<string>}
 */
async function getToken() {
  try {
    return (await AsyncStorage.getItem(TOKEN_KEY)) || '';
  } catch {
    return '';
  }
}

/**
 * Creates a Socket.IO client with standard options.
 *
 * @param {string} url        Full service URL including namespace path.
 * @param {string} token      JWT bearer token for the `auth` handshake.
 * @param {string} label      Human-readable label used in log messages.
 * @returns {import('socket.io-client').Socket}
 */
function createSocket(url, token, label) {
  const socket = io(url, {
    // Send JWT in the auth object — the server reads socket.handshake.auth.token
    auth: { token },
    // Transport preference: prefer WebSocket, fall back to polling
    transports: ['websocket', 'polling'],
    // Automatically reconnect with exponential back-off
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    randomizationFactor: 0.5,
    // Connection timeout
    timeout: 20000,
    // Do NOT auto-connect — we call socket.connect() manually after setup
    autoConnect: false,
  });

  // --- Lifecycle logging ---
  socket.on('connect', () => {
    console.log(`[Socket:${label}] Connected — id: ${socket.id}`);
  });

  socket.on('disconnect', (reason) => {
    console.log(`[Socket:${label}] Disconnected — reason: ${reason}`);
  });

  socket.on('connect_error', (err) => {
    console.warn(`[Socket:${label}] Connection error — ${err.message}`);
  });

  socket.on('reconnect', (attempt) => {
    console.log(`[Socket:${label}] Reconnected after ${attempt} attempt(s)`);
  });

  socket.on('reconnect_attempt', (attempt) => {
    console.log(`[Socket:${label}] Reconnect attempt #${attempt}`);
  });

  socket.on('error', (err) => {
    console.error(`[Socket:${label}] Error — ${err?.message || err}`);
  });

  return socket;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Connects both the ride socket and location socket.
 * If sockets are already connected this is a no-op.
 * Reads the JWT from AsyncStorage automatically.
 *
 * @returns {Promise<{ rideSocket: import('socket.io-client').Socket, locationSocket: import('socket.io-client').Socket }>}
 */
async function connectSockets() {
  const token = await getToken();

  // --- Ride socket ---
  if (!rideSocket || !rideSocket.connected) {
    // Dispose stale instance before creating a new one
    if (rideSocket) {
      rideSocket.removeAllListeners();
      rideSocket.disconnect();
    }
    rideSocket = createSocket(`${RIDE_SOCKET_URL}/rides`, token, 'Ride');
    rideSocket.connect();
  }

  // --- Location socket ---
  if (!locationSocket || !locationSocket.connected) {
    if (locationSocket) {
      locationSocket.removeAllListeners();
      locationSocket.disconnect();
    }
    locationSocket = createSocket(`${LOCATION_SOCKET_URL}/location`, token, 'Location');
    locationSocket.connect();
  }

  return { rideSocket, locationSocket };
}

/**
 * Disconnects both sockets and clears the instances.
 * Should be called on user logout.
 */
function disconnectSockets() {
  if (rideSocket) {
    rideSocket.removeAllListeners();
    rideSocket.disconnect();
    rideSocket = null;
  }
  if (locationSocket) {
    locationSocket.removeAllListeners();
    locationSocket.disconnect();
    locationSocket = null;
  }
  console.log('[Socket] Both sockets disconnected and cleared');
}

// ---------------------------------------------------------------------------
// Convenience event helpers
// ---------------------------------------------------------------------------

/**
 * Subscribe to real-time driver location updates for a specific ride.
 * Automatically joins the ride room on the ride socket.
 *
 * @param {string}   rideId    The ride to track.
 * @param {Function} callback  Called with the location payload on each update.
 * @returns {Function} Unsubscribe function — call on component unmount.
 */
function onDriverLocation(rideId, callback) {
  if (!rideSocket) {
    console.warn('[Socket] onDriverLocation called before connectSockets()');
    return () => {};
  }

  // Join the ride room so the server routes updates here
  rideSocket.emit('join_ride', { rideId });
  rideSocket.on('driver_location_update', callback);

  return () => {
    rideSocket?.off('driver_location_update', callback);
  };
}

/**
 * Subscribe to ride status change events.
 *
 * @param {string}   rideId    The ride to monitor.
 * @param {Function} callback  Called with { rideId, status, timestamp, ... }.
 * @returns {Function} Unsubscribe function.
 */
function onRideStatus(rideId, callback) {
  if (!rideSocket) {
    console.warn('[Socket] onRideStatus called before connectSockets()');
    return () => {};
  }

  const handler = (data) => {
    // Filter to the specific ride if multiple rooms are active
    if (data.rideId === rideId) callback(data);
  };

  rideSocket.emit('join_ride', { rideId });
  rideSocket.on('ride_status_change', handler);

  return () => {
    rideSocket?.off('ride_status_change', handler);
  };
}

/**
 * Subscribe to incoming ride request events (driver side).
 *
 * @param {Function} callback  Called with the full ride request payload.
 * @returns {Function} Unsubscribe function.
 */
function onIncomingRide(callback) {
  if (!rideSocket) {
    console.warn('[Socket] onIncomingRide called before connectSockets()');
    return () => {};
  }

  rideSocket.on('incoming_ride_request', callback);
  return () => {
    rideSocket?.off('incoming_ride_request', callback);
  };
}

/**
 * Subscribe to in-app chat messages for a specific ride.
 *
 * @param {string}   rideId    The ride conversation to monitor.
 * @param {Function} callback  Called with the message payload.
 * @returns {Function} Unsubscribe function.
 */
function onMessage(rideId, callback) {
  if (!rideSocket) {
    console.warn('[Socket] onMessage called before connectSockets()');
    return () => {};
  }

  const handler = (data) => {
    if (data.rideId === rideId) callback(data);
  };

  rideSocket.on('message', handler);
  return () => {
    rideSocket?.off('message', handler);
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
export {
  // Socket instances (may be null before connectSockets is called)
  rideSocket,
  locationSocket,
  // Lifecycle
  connectSockets,
  disconnectSockets,
  // Event helpers
  onDriverLocation,
  onRideStatus,
  onIncomingRide,
  onMessage,
};

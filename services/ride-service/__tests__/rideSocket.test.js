'use strict';
/**
 * rideSocket.test.js — Socket.IO ride namespace
 *
 * Tests the exported utility functions and pure helpers:
 *   - notifyDriver (returns false when driver offline, true when connected)
 *   - broadcastRideStatus (emits to ride room)
 *   - driverSockets / riderSockets maps exported for inspection
 *
 * Event handler tests use mock Socket objects to simulate client connections.
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_minimum_32_chars_long_abc';

jest.mock('../src/config/database');
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), http: jest.fn(),
}));

// jwtUtil uses HS256 in test env (no RS256 keys set)
const { signToken } = require('../../shared/jwtUtil');

const db = require('../src/config/database');
const { initRideSocket, notifyDriver, broadcastRideStatus, driverSockets, riderSockets } = require('../src/socket/rideSocket');

// ─── Mock Socket.IO helpers ───────────────────────────────────────────────────

function makeSocket(overrides = {}) {
  const socket = {
    id:       `socket-${Date.now()}-${Math.random()}`,
    handshake: { auth: {}, headers: {} },
    user:     null,
    rooms:    new Set(),
    _emitted: [],
    _toTarget: null,
    emit:     jest.fn().mockImplementation(function (event, data) {
      socket._emitted.push({ event, data });
    }),
    join:     jest.fn().mockImplementation(function (room) { socket.rooms.add(room); }),
    to:       jest.fn().mockReturnThis(),
    on:       jest.fn(),
    ...overrides,
  };
  return socket;
}

function makeIo(nsFn = jest.fn()) {
  const nsOf = jest.fn();
  const nsObj = {
    to:   jest.fn().mockReturnThis(),
    emit: jest.fn(),
    use:  jest.fn(),
    on:   jest.fn(),
  };
  nsOf.mockReturnValue(nsObj);
  return { of: nsOf, _ns: nsObj };
}

// ─── notifyDriver ─────────────────────────────────────────────────────────────

describe('notifyDriver', () => {
  beforeEach(() => {
    driverSockets.clear();
    riderSockets.clear();
  });

  test('returns false when driver is not connected', () => {
    const { of: nsOf } = makeIo();
    const io = { of: nsOf };
    const result = notifyDriver(io, 'driver-not-online', { rideId: 'r1' });
    expect(result).toBe(false);
  });

  test('returns true and emits when driver is connected', () => {
    const nsObj = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
    const io = { of: jest.fn().mockReturnValue(nsObj) };

    const socketId = 'socket-driver-abc';
    driverSockets.set('driver-uuid-1', socketId);

    const result = notifyDriver(io, 'driver-uuid-1', {
      rideId: 'ride-xyz',
      pickup: { lat: 4.05, lng: 9.77 },
      fare:   5000,
    });

    expect(result).toBe(true);
    expect(nsObj.to).toHaveBeenCalledWith(socketId);
    expect(nsObj.emit).toHaveBeenCalledWith('incoming_ride_request', expect.objectContaining({
      rideId: 'ride-xyz',
      expiresIn: 15,
    }));

    driverSockets.delete('driver-uuid-1');
  });

  test('sets request timeout and emits ride_request_expired after delay', async () => {
    jest.useFakeTimers();
    const nsObj = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
    const io = { of: jest.fn().mockReturnValue(nsObj) };

    driverSockets.set('driver-timeout', 'socket-t');
    notifyDriver(io, 'driver-timeout', { rideId: 'ride-timeout', fare: 1000 });

    // Advance 15 seconds
    jest.advanceTimersByTime(15000);

    expect(nsObj.emit).toHaveBeenCalledWith('ride_request_expired', expect.objectContaining({
      rideId: 'ride-timeout',
    }));

    driverSockets.delete('driver-timeout');
    jest.useRealTimers();
  });
});

// ─── broadcastRideStatus ──────────────────────────────────────────────────────

describe('broadcastRideStatus', () => {
  test('emits ride_status_change to the ride room', () => {
    const nsObj = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
    const io = { of: jest.fn().mockReturnValue(nsObj) };

    broadcastRideStatus(io, 'ride-001', 'in_progress', { note: 'started' });

    expect(nsObj.to).toHaveBeenCalledWith('ride:ride-001');
    expect(nsObj.emit).toHaveBeenCalledWith('ride_status_change', expect.objectContaining({
      rideId:  'ride-001',
      status:  'in_progress',
      meta:    { note: 'started' },
    }));
  });

  test('defaults meta to empty object when omitted', () => {
    const nsObj = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
    const io = { of: jest.fn().mockReturnValue(nsObj) };

    broadcastRideStatus(io, 'ride-002', 'completed');

    expect(nsObj.emit).toHaveBeenCalledWith('ride_status_change', expect.objectContaining({
      meta: {},
    }));
  });
});

// ─── initRideSocket — auth middleware ────────────────────────────────────────

describe('initRideSocket — auth middleware', () => {
  function buildRidesNamespace() {
    let authMiddleware = null;
    const ns = {
      use: jest.fn().mockImplementation((fn) => { authMiddleware = fn; }),
      on:  jest.fn(),
      to:  jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };
    const io = { of: jest.fn().mockReturnValue(ns) };
    initRideSocket(io);
    return { ns, getMiddleware: () => authMiddleware };
  }

  test('rejects connection with no token', () => {
    const { getMiddleware } = buildRidesNamespace();
    const socket = makeSocket({ handshake: { auth: {}, headers: {} } });
    const next = jest.fn();
    getMiddleware()(socket, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0].message).toContain('no token');
  });

  test('accepts connection with valid JWT in auth.token', () => {
    const { getMiddleware } = buildRidesNamespace();
    const token = signToken({ id: 'user-1', role: 'rider' }, { expiresIn: '1h' });
    const socket = makeSocket({ handshake: { auth: { token }, headers: {} } });
    const next = jest.fn();
    getMiddleware()(socket, next);
    expect(next).toHaveBeenCalledWith(); // no error
    expect(socket.user.role).toBe('rider');
  });

  test('accepts Bearer token from Authorization header', () => {
    const { getMiddleware } = buildRidesNamespace();
    const token = signToken({ id: 'user-2', role: 'driver' }, { expiresIn: '1h' });
    const socket = makeSocket({
      handshake: { auth: {}, headers: { authorization: `Bearer ${token}` } },
    });
    const next = jest.fn();
    getMiddleware()(socket, next);
    expect(next).toHaveBeenCalledWith();
    expect(socket.user.id).toBe('user-2');
  });

  test('rejects invalid / tampered JWT', () => {
    const { getMiddleware } = buildRidesNamespace();
    const socket = makeSocket({ handshake: { auth: { token: 'bad.token.here' }, headers: {} } });
    const next = jest.fn();
    getMiddleware()(socket, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0].message).toContain('Authentication failed');
  });
});

// ─── initRideSocket — connection / event handlers ────────────────────────────

describe('initRideSocket — event handlers via mock socket', () => {
  let ns, handlers, connectionCb;

  beforeEach(() => {
    driverSockets.clear();
    riderSockets.clear();
    const registeredHandlers = {};

    ns = {
      use:  jest.fn(),
      on:   jest.fn().mockImplementation((event, cb) => { registeredHandlers[event] = cb; }),
      to:   jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };
    const io = { of: jest.fn().mockReturnValue(ns) };
    initRideSocket(io);
    connectionCb = registeredHandlers['connection'];
    handlers = {};
  });

  function buildSocket(role = 'rider', userId = 'u1') {
    const socket = makeSocket();
    socket.user = { id: userId, role, name: `Test ${role}` };
    socket.on.mockImplementation((event, fn) => { handlers[event] = fn; });
    return socket;
  }

  test('registers driver in driverSockets on connection', () => {
    const socket = buildSocket('driver', 'driver-1');
    connectionCb(socket);
    expect(driverSockets.get('driver-1')).toBe(socket.id);
  });

  test('registers rider in riderSockets on connection', () => {
    const socket = buildSocket('rider', 'rider-1');
    connectionCb(socket);
    expect(riderSockets.get('rider-1')).toBe(socket.id);
  });

  test('join_ride emits joined_ride and joins the room', () => {
    const socket = buildSocket('rider', 'rider-2');
    connectionCb(socket);
    handlers['join_ride']({ rideId: 'ride-abc' });
    expect(socket.join).toHaveBeenCalledWith('ride:ride-abc');
    expect(socket.emit).toHaveBeenCalledWith('joined_ride', { rideId: 'ride-abc', room: 'ride:ride-abc' });
  });

  test('join_ride with missing rideId emits error', () => {
    const socket = buildSocket();
    connectionCb(socket);
    handlers['join_ride']({});
    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.stringContaining('rideId') }));
  });

  test('driver_location_update emits to room (not throttled on first call)', () => {
    const driverId = `throttle-driver-${Date.now()}`;
    const socket = buildSocket('driver', driverId);
    connectionCb(socket);
    handlers['driver_location_update']({ rideId: 'ride-loc', latitude: 4.05, longitude: 9.77 });
    expect(socket.to).toHaveBeenCalledWith('ride:ride-loc');
  });

  test('driver_location_update from non-driver emits error', () => {
    const socket = buildSocket('rider', 'rider-3');
    connectionCb(socket);
    handlers['driver_location_update']({ rideId: 'ride-loc', latitude: 4, longitude: 9 });
    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.stringContaining('drivers') }));
  });

  test('ride_status_change with invalid status emits error', () => {
    const socket = buildSocket('driver', 'driver-2');
    connectionCb(socket);
    handlers['ride_status_change']({ rideId: 'ride-xyz', status: 'flying' });
    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.stringContaining('Invalid status') }));
  });

  test('ride_status_change with valid status queries DB for participant check', async () => {
    const socket = buildSocket('driver', 'driver-3');
    connectionCb(socket);
    db.query.mockResolvedValueOnce({ rows: [{ id: 'ride-3' }] }); // participant check passes
    await handlers['ride_status_change']({ rideId: 'ride-3', status: 'accepted' });
    expect(db.query).toHaveBeenCalled();
    expect(ns.to).toHaveBeenCalledWith('ride:ride-3');
    expect(ns.emit).toHaveBeenCalledWith('ride_status_change', expect.objectContaining({ status: 'accepted' }));
  });

  test('ride_cancelled emits to ride room via namespace', () => {
    const socket = buildSocket('rider', 'rider-4');
    connectionCb(socket);
    handlers['ride_cancelled']({ rideId: 'ride-cancel', reason: 'no driver' });
    // ride_cancelled uses rides.to() (namespace), not socket.to()
    expect(ns.to).toHaveBeenCalledWith('ride:ride-cancel');
    expect(ns.emit).toHaveBeenCalledWith('ride_cancelled', expect.objectContaining({ rideId: 'ride-cancel' }));
  });

  test('message with text > 500 chars emits error', () => {
    const socket = buildSocket('rider', 'rider-5');
    connectionCb(socket);
    handlers['message']({ rideId: 'ride-msg', text: 'a'.repeat(501) });
    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.stringContaining('too long') }));
  });

  test('message is broadcast to ride room', () => {
    const socket = buildSocket('rider', 'rider-6');
    connectionCb(socket);
    handlers['message']({ rideId: 'ride-msg', text: 'Hello driver!' });
    expect(ns.to).toHaveBeenCalledWith('ride:ride-msg');
    expect(ns.emit).toHaveBeenCalledWith('message', expect.objectContaining({ text: 'Hello driver!' }));
  });

  test('disconnect cleans up driverSockets entry', () => {
    const socket = buildSocket('driver', 'driver-dc');
    connectionCb(socket);
    expect(driverSockets.get('driver-dc')).toBe(socket.id);
    handlers['disconnect']('server namespace disconnect');
    expect(driverSockets.get('driver-dc')).toBeUndefined();
  });
});

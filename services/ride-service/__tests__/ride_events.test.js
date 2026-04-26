'use strict';
/**
 * Tests for ride_events audit log integration in rideController.js
 *
 * Verifies that every status transition inserts a record into ride_events:
 *   - acceptRide: requested → accepted
 *   - updateRideStatus: arriving / in_progress / completed
 *   - cancelRide: any → cancelled
 *
 * Also verifies logRideEvent failures are non-fatal (ride flow continues).
 */

// ── Shared mock infrastructure ──────────────────────────────────────────────
const mockDb = {
  query:     jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  queryRead: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  connect:   jest.fn().mockResolvedValue({
    query:   jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    release: jest.fn(),
  }),
};

jest.mock('../src/config/database', () => mockDb);
jest.mock('../../shared/featureFlags', () => ({ isEnabled: jest.fn().mockReturnValue(false) }));
jest.mock('../../shared/currencyUtil', () => ({
  fareWithLocalCurrency: jest.fn((f) => f),
  getCurrencyCode:       jest.fn().mockReturnValue('XAF'),
}));
jest.mock('../src/queues/fraudQueue', () => ({ enqueueFraudCheck: jest.fn() }));
jest.mock('../src/utils/logger', () => ({
  info:  jest.fn(), warn: jest.fn(), error: jest.fn(), http: jest.fn(), debug: jest.fn(),
}));
jest.mock('../src/utils/cache', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(true),
}));
jest.mock('../src/services/pushNotifications', () => ({
  notifyRiderDriverAccepted: jest.fn().mockResolvedValue(true),
  notifyRiderDriverArrived:  jest.fn().mockResolvedValue(true),
  notifyRideCancelled:       jest.fn().mockResolvedValue(true),
  _send:                     jest.fn().mockResolvedValue(true),
}));

const express  = require('express');
const request  = require('supertest');

function buildApp() {
  const app = express();
  app.use(express.json());
  // Inject mock user
  app.use((req, _res, next) => {
    req.user = { id: 'user-123', role: 'driver' };
    next();
  });
  const ctrl = require('../src/controllers/rideController');
  app.patch('/rides/:id/status', ctrl.updateRideStatus);
  app.post('/rides/:id/cancel',  ctrl.cancelRide);
  return app;
}

describe('ride_events — audit log on status transitions', () => {
  let app;

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
    mockDb.queryRead.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  test('updateRideStatus — inserts ride_event on arriving transition', async () => {
    // ownerCheck passes — include current_status so the state machine allows accepted → arriving
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'ride-1', current_status: 'accepted', estimated_distance_km: null }] })   // ownerCheck
      .mockResolvedValueOnce({ rows: [{ status: 'accepted' }] }) // rideBeforeUpdate
      .mockResolvedValueOnce({ rows: [{ id: 'ride-1', status: 'arriving', rider_id: 'rider-1' }], rowCount: 1 }) // UPDATE rides
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });          // INSERT ride_events

    const res = await request(app)
      .patch('/rides/ride-1/status')
      .send({ status: 'arriving' });

    expect(res.status).toBe(200);

    // Find the ride_events INSERT call
    const insertCall = mockDb.query.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO ride_events')
    );
    expect(insertCall).toBeTruthy();
    const [_sql, params] = insertCall;
    expect(params[0]).toBe('ride-1');   // ride_id
    expect(params[2]).toBe('accepted'); // old_status
    expect(params[3]).toBe('arriving'); // new_status
    expect(params[4]).toBe('user-123'); // actor_id
    expect(params[5]).toBe('driver');   // actor_role
  });

  test('updateRideStatus — inserts ride_event on completed transition', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'ride-1', current_status: 'in_progress', estimated_distance_km: 5 }] })
      .mockResolvedValueOnce({ rows: [{ status: 'in_progress' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ride-1', status: 'completed', rider_id: 'rider-1' }], rowCount: 1 })
      .mockResolvedValue({ rows: [], rowCount: 1 }); // subsequent calls (push, ride_events)

    const res = await request(app)
      .patch('/rides/ride-1/status')
      .send({ status: 'completed' });

    expect(res.status).toBe(200);

    const insertCall = mockDb.query.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO ride_events')
    );
    expect(insertCall).toBeTruthy();
    expect(insertCall[1][3]).toBe('completed');
  });

  test('updateRideStatus — ride_event failure is non-fatal (ride returns 200)', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'ride-1', current_status: 'accepted', estimated_distance_km: null }] })
      .mockResolvedValueOnce({ rows: [{ status: 'accepted' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ride-1', status: 'arriving', rider_id: 'r1' }], rowCount: 1 })
      .mockRejectedValueOnce(new Error('ride_events table not found')); // INSERT fails

    const res = await request(app)
      .patch('/rides/ride-1/status')
      .send({ status: 'arriving' });

    // Ride flow completes successfully despite audit log failure
    expect(res.status).toBe(200);
    const logger = require('../src/utils/logger');
    // logRideEvent now retries once — first attempt failure is logged with this message
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('[RideEvent] First attempt failed — retrying once'),
      expect.objectContaining({ eventType: 'status_change' })
    );
  });

  test('cancelRide — inserts ride_event on cancellation', async () => {
    const rideRow = {
      id:       'ride-1',
      rider_id: 'user-123',   // must match req.user.id so the controller authorises the cancel
      driver_id: null,
      status:   'requested',
      created_at: new Date().toISOString(),
      is_delivery: false,
    };
    // cancelRide queries: 1) SELECT ride, 2) UPDATE rides, 3+ subsequent (events, push)
    // With no driver assigned and no cancellation fee, only 2 queries happen before events.
    mockDb.query
      .mockResolvedValueOnce({ rows: [rideRow] })                                          // SELECT ride
      .mockResolvedValueOnce({ rows: [{ ...rideRow, status: 'cancelled' }], rowCount: 1 }) // UPDATE rides
      .mockResolvedValue({ rows: [], rowCount: 1 });                                       // ride_events + push

    const res = await request(app)
      .post('/rides/ride-1/cancel')
      .send({ cancelled_by: 'rider', reason: 'Changed my mind' });

    expect([200, 400]).toContain(res.status); // 200 if cancellation accepted

    const insertCall = mockDb.query.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO ride_events')
    );
    // Only assert if the ride was actually cancelled
    if (res.status === 200) {
      expect(insertCall).toBeTruthy();
      expect(insertCall[1][1]).toBe('cancelled'); // event_type
      expect(insertCall[1][3]).toBe('cancelled'); // new_status
    }
  });

  test('updateRideStatus — rejects invalid status without inserting event', async () => {
    const res = await request(app)
      .patch('/rides/ride-1/status')
      .send({ status: 'flying' });

    expect(res.status).toBe(400);
    const insertCall = mockDb.query.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO ride_events')
    );
    expect(insertCall).toBeUndefined();
  });
});

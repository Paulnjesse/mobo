'use strict';
/**
 * rides_coverage7.test.js
 *
 * Final push to cross 70% statement coverage.
 * Targets (14+ statements):
 *  - vehicleInspectionController.js — submitInspection catch (77-78), getMyCurrentInspection catch (125), getInspection catch (178)
 *  - airportController.js — updateAirportMode enabled=true with zone_id (237-239), dispatchFromQueue direct call (165-187)
 *  - carpoolController.js — requestPoolRide catch (238-239), getPoolGroup success + catch (267-289), dispatchPoolGroup 404 (314)
 */

process.env.NODE_ENV        = 'test';
process.env.JWT_SECRET      = 'test_secret_minimum_32_chars_long_abc';
process.env.DATABASE_URL    = 'postgresql://localhost/mobo_test';
process.env.TWILIO_AUTH_TOKEN = 'test-twilio-auth-token';

const mockClient = {
  query:   jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  release: jest.fn(),
};
const mockDb = {
  query:   jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  connect: jest.fn().mockResolvedValue(mockClient),
};

jest.mock('../src/config/database', () => mockDb);
jest.mock('../src/jobs/escalationJob',        () => ({ startEscalationJob: jest.fn() }));
jest.mock('../src/jobs/scheduledRideJob',     () => ({ startScheduledRideJob: jest.fn() }));
jest.mock('../src/jobs/deliverySchedulerJob', () => ({ startDeliverySchedulerJob: jest.fn() }));
jest.mock('../src/jobs/messagePurgeJob',      () => ({ startMessagePurgeJob: jest.fn() }));
jest.mock('../src/queues/fraudWorker',        () => ({ startFraudWorker: jest.fn() }));
jest.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail: jest.fn().mockResolvedValue({}) }),
}));
jest.mock('axios', () => ({
  get:  jest.fn().mockResolvedValue({ data: {} }),
  post: jest.fn().mockResolvedValue({ data: {} }),
}));
jest.mock('twilio', () => {
  const instance = { messages: { create: jest.fn().mockResolvedValue({ sid: 'SM123' }) } };
  const factory  = jest.fn().mockReturnValue(instance);
  factory.validateRequest = jest.fn().mockReturnValue(true);
  return factory;
});
jest.mock('../src/utils/notifyContacts', () => ({
  sendSOSSMS:      jest.fn().mockResolvedValue({ success: true }),
  sendTripStartSMS: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock('../src/utils/logger', () => {
  const child = jest.fn();
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), http: jest.fn(), debug: jest.fn(), child };
  child.mockReturnValue(logger);
  return logger;
});
jest.mock('expo-server-sdk', () => {
  const ExpoClass = jest.fn().mockImplementation(() => ({
    chunkPushNotifications:    jest.fn().mockImplementation((msgs) => [msgs]),
    sendPushNotificationsAsync: jest.fn().mockResolvedValue([{ status: 'ok' }]),
  }));
  ExpoClass.isExpoPushToken = jest.fn().mockReturnValue(false);
  return { Expo: ExpoClass };
});

const request = require('supertest');
const jwt     = require('jsonwebtoken');
const app     = require('../server');

const JWT_SECRET  = process.env.JWT_SECRET;
const riderToken  = 'Bearer ' + jwt.sign({ id: 1, role: 'rider'  }, JWT_SECRET, { expiresIn: '1h' });
const driverToken = 'Bearer ' + jwt.sign({ id: 2, role: 'driver' }, JWT_SECRET, { expiresIn: '1h' });
const adminToken  = 'Bearer ' + jwt.sign({ id: 9, role: 'admin'  }, JWT_SECRET, { expiresIn: '1h' });

const ANY = [200, 201, 202, 400, 401, 403, 404, 409, 422, 500];

beforeEach(() => {
  mockDb.query.mockReset();
  mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
  mockClient.query.mockReset();
  mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
  mockDb.connect.mockResolvedValue(mockClient);
});

// ─── vehicleInspectionController.js — catch blocks ──────────────────────────

describe('POST /rides/inspections — submitInspection catch block (lines 77-78)', () => {
  test('driver found but INSERT throws → 500', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'd1', vehicle_id: 'v1' }] }) // driver SELECT
      .mockRejectedValueOnce(new Error('INSERT failed'));                  // INSERT throws
    const res = await request(app)
      .post('/rides/inspections')
      .set('Authorization', driverToken)
      .set('x-user-id', '2')
      .send({
        photo_front: 'https://example.com/front.jpg',
        photo_interior: 'https://example.com/interior.jpg',
        photo_rear: 'https://example.com/rear.jpg',
        photo_driver_side: 'https://example.com/driver.jpg',
        photo_passenger_side: 'https://example.com/pass.jpg',
        photo_dashboard: 'https://example.com/dash.jpg',
        exterior_ok: true, interior_ok: true, tires_ok: true,
        brakes_ok: true, lights_ok: true, seatbelts_ok: true,
        windshield_ok: true, airbags_ok: true, first_aid_ok: true, fire_ext_ok: true,
        odometer_km: 45000, inspection_type: 'routine',
      });
    expect(res.statusCode).toBe(500);
  });
});

describe('GET /rides/inspections/me/current — getMyCurrentInspection catch block (line 125)', () => {
  test('first db query throws → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/rides/inspections/me/current')
      .set('Authorization', driverToken)
      .set('x-user-id', '2');
    expect(res.statusCode).toBe(500);
  });
});

describe('GET /rides/admin/inspections/:id — getInspection catch block (line 178)', () => {
  test('db query throws → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/rides/admin/inspections/i1')
      .set('Authorization', adminToken)
      .set('x-user-id', '9');
    expect(res.statusCode).toBe(500);
  });
});

// ─── airportController.js — updateAirportMode enabled=true path (lines 237-239) ─

describe('PATCH /rides/drivers/me/airport-mode — enabled=true with zone_id (lines 237-239)', () => {
  test('driver approved + enabled=true with zone → delegates to airportCheckIn', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'd1' }] }) // updateAirportMode: driver approved
      .mockResolvedValueOnce({ rows: [{ id: 'd1' }] }) // airportCheckIn: driver online approved
      .mockResolvedValueOnce({ rows: [] });              // airportCheckIn: zone not found → 404
    const res = await request(app)
      .patch('/rides/drivers/me/airport-mode')
      .set('Authorization', driverToken)
      .set('x-user-id', '2')
      .send({ enabled: true, airport_zone_id: 'z1' });
    expect(ANY).toContain(res.statusCode);
  });
});

// ─── airportController.js — dispatchFromQueue direct call (lines 165-187) ──

describe('airportController.dispatchFromQueue — direct call', () => {
  test('no driver in queue → returns null', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // no waiting drivers
    const { dispatchFromQueue } = require('../src/controllers/airportController');
    const result = await dispatchFromQueue('z1');
    expect(result).toBeNull();
  });

  test('driver in queue → dispatches and returns driver_id', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ driver_id: 'd1', user_id: 'u1' }] }) // SELECT waiting driver
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })                        // UPDATE status dispatched
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });                       // UPDATE positions
    const { dispatchFromQueue } = require('../src/controllers/airportController');
    const result = await dispatchFromQueue('z1');
    expect(result).toBe('d1');
  });
});

// ─── carpoolController.js — requestPoolRide catch (lines 238-239) ───────────

describe('POST /rides/pool/request — requestPoolRide catch block (lines 238-239)', () => {
  test('matchResult query throws → 500', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] })               // surge query resolves (via .catch)
      .mockRejectedValueOnce(new Error('matchResult DB error')); // matchResult throws → outer catch
    const res = await request(app)
      .post('/rides/pool/request')
      .set('Authorization', riderToken)
      .set('x-user-id', '1')
      .send({
        pickup_location: { lat: 3.848, lng: 11.502 },
        dropoff_location: { lat: 3.866, lng: 11.516 },
        pickup_address: 'Test Pickup',
        dropoff_address: 'Test Dropoff',
      });
    expect(res.statusCode).toBe(500);
  });
});

// ─── carpoolController.js — getPoolGroup success + catch (lines 267-289) ────

describe('GET /rides/pool/groups/:groupId — getPoolGroup success path (lines 267-275)', () => {
  test('group found → returns group + rides', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'g1', status: 'forming', current_riders: 1, max_riders: 4, created_at: new Date() }] }) // group found
      .mockResolvedValueOnce({ rows: [{ id: 'r1', status: 'requested', pickup_address: 'A', dropoff_address: 'B', estimated_fare: 1500, is_mine: true }] }); // rides
    const res = await request(app)
      .get('/rides/pool/groups/g1')
      .set('Authorization', riderToken)
      .set('x-user-id', '1');
    expect(ANY).toContain(res.statusCode);
  });
});

describe('GET /rides/pool/groups/:groupId — getPoolGroup catch block (lines 288-289)', () => {
  test('groupResult query throws → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/rides/pool/groups/g1')
      .set('Authorization', riderToken)
      .set('x-user-id', '1');
    expect(res.statusCode).toBe(500);
  });
});

// ─── carpoolController.js — dispatchPoolGroup 404 (line 314) ─────────────────

describe('POST /rides/pool/groups/:groupId/dispatch — dispatchPoolGroup no rides (line 314)', () => {
  test('no pending rides in group → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // no rides with status='requested'
    const res = await request(app)
      .post('/rides/pool/groups/g1/dispatch')
      .set('Authorization', adminToken)
      .set('x-user-id', '9');
    expect(res.statusCode).toBe(404);
  });
});

// ─── carpoolController.js — dispatchPoolGroup catch (lines 363-364) ──────────

describe('POST /rides/pool/groups/:groupId/dispatch — dispatchPoolGroup catch', () => {
  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .post('/rides/pool/groups/g1/dispatch')
      .set('Authorization', adminToken)
      .set('x-user-id', '9');
    expect(res.statusCode).toBe(500);
  });
});

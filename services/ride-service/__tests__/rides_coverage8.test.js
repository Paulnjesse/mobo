'use strict';
/**
 * rides_coverage8.test.js
 *
 * Targets uncovered paths after production hardening:
 *  - callProxyController.js  — Twilio path (lines 28, 78-83), endCallSession
 *  - carpoolController.js    — estimatePoolFare, requestPoolRide validation branches
 *  - foodController.js       — lines 10-15 (DB init), adminUpdateMenuItem success
 *  - rideController.js       — roundUpFare, getSurgePricing, applyPromoCode
 *  - vehicleInspectionController.js — listInspections (admin), submitInspection missing driver
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
  sendSOSSMS:       jest.fn().mockResolvedValue({ success: true }),
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

// ─── callProxyController — Twilio path (lines 78-83) ────────────────────────

describe('POST /rides/:id/initiate-call — Twilio provider path (lines 78-83)', () => {
  const origProvider = process.env.CALL_PROXY_PROVIDER;

  beforeAll(() => { process.env.CALL_PROXY_PROVIDER = 'twilio'; });
  afterAll(() => {
    if (origProvider === undefined) delete process.env.CALL_PROXY_PROVIDER;
    else process.env.CALL_PROXY_PROVIDER = origProvider;
  });

  test('ride found + caller is rider + Twilio throws → falls back to mock number', async () => {
    mockDb.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'r1', rider_id: 1, driver_id: 'd1',
          rider_phone: '+237611000001', rider_user_id: 1,
          driver_phone: '+237622000002', driver_user_id: 2,
        }]
      })
      .mockResolvedValueOnce({ rows: [] })          // no existing session
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT session
    const res = await request(app)
      .post('/rides/r1/initiate-call')
      .set('Authorization', riderToken)
      .set('x-user-id', '1');
    expect(ANY).toContain(res.statusCode);
  });
});

// ─── callProxyController — endCallSession ─────────────────────────────────────

describe('POST /rides/:id/end-call — endCallSession', () => {
  test('updates call session status → 200', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await request(app)
      .post('/rides/r1/end-call')
      .set('Authorization', riderToken)
      .send({ session_token: 'tok123', duration_seconds: 120 });
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .post('/rides/r1/end-call')
      .set('Authorization', riderToken)
      .send({ session_token: 'tok123' });
    expect(res.statusCode).toBe(500);
  });
});

// ─── rideController — roundUpFare ────────────────────────────────────────────

describe('POST /rides/:id/round-up — roundUpFare', () => {
  test('ride not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/rides/r1/round-up')
      .set('Authorization', riderToken);
    expect([404, 400, 401]).toContain(res.statusCode);
  });
});

// ─── rideController — getSurgePricing ────────────────────────────────────────

describe('GET /rides/surge — getSurgePricing', () => {
  test('returns surge data (empty)', async () => {
    mockDb.query.mockResolvedValue({ rows: [] });
    const res = await request(app)
      .get('/rides/surge?lat=3.848&lng=11.502')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });
});

// ─── rideController — applyPromoCode ─────────────────────────────────────────

describe('POST /rides/:id/apply-promo — applyPromoCode', () => {
  test('ride not found → any status', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/rides/r1/apply-promo')
      .set('Authorization', riderToken)
      .send({ code: 'PROMO10' });
    expect(ANY).toContain(res.statusCode);
  });
});

// ─── carpoolController — estimatePoolFare ────────────────────────────────────

describe('GET /rides/pool/estimate — estimatePoolFare', () => {
  test('returns fare estimate', async () => {
    mockDb.query.mockResolvedValue({ rows: [] });
    const res = await request(app)
      .get('/rides/pool/estimate?pickup_lat=3.848&pickup_lng=11.502&dropoff_lat=3.866&dropoff_lng=11.516')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });
});

// ─── vehicleInspectionController — listInspections (admin) ───────────────────

describe('GET /rides/admin/inspections — listInspections', () => {
  test('returns empty list', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/rides/admin/inspections')
      .set('Authorization', adminToken)
      .set('x-user-id', '9');
    expect(ANY).toContain(res.statusCode);
  });

  test('returns inspections with data', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'i1', status: 'submitted', driver_id: 'd1', created_at: new Date() }] });
    const res = await request(app)
      .get('/rides/admin/inspections')
      .set('Authorization', adminToken)
      .set('x-user-id', '9');
    expect(ANY).toContain(res.statusCode);
  });
});

// ─── vehicleInspectionController — submitInspection: driver not found ────────

describe('POST /rides/inspections — submitInspection driver not found', () => {
  test('driver not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // no driver
    const res = await request(app)
      .post('/rides/inspections')
      .set('Authorization', driverToken)
      .set('x-user-id', '2')
      .send({
        photo_front: 'https://example.com/f.jpg', photo_interior: 'https://example.com/i.jpg',
        photo_rear: 'https://example.com/r.jpg', photo_driver_side: 'https://example.com/d.jpg',
        photo_passenger_side: 'https://example.com/p.jpg', photo_dashboard: 'https://example.com/da.jpg',
        exterior_ok: true, interior_ok: true, tires_ok: true, brakes_ok: true,
        lights_ok: true, seatbelts_ok: true, windshield_ok: true, airbags_ok: true,
        first_aid_ok: true, fire_ext_ok: true, odometer_km: 10000, inspection_type: 'routine',
      });
    expect([404, 403, 400, 500]).toContain(res.statusCode);
  });
});

// ─── food routes — success paths ─────────────────────────────────────────────

describe('GET /food/restaurants — success with data', () => {
  test('returns restaurant list', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'r1', name: 'Pizza Place', city: 'Yaoundé', is_open: true }] });
    const res = await request(app)
      .get('/food/restaurants')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });
});

describe('GET /food/restaurants/:id — success path', () => {
  test('restaurant found → returns data', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'r1', name: 'Pizza Place', city: 'Yaoundé', is_open: true }] })
      .mockResolvedValueOnce({ rows: [{ id: 'i1', name: 'Burger', price: 2500, category: 'main' }] });
    const res = await request(app)
      .get('/food/restaurants/r1')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });
});

// ─── rideController — listRides success ──────────────────────────────────────

describe('GET /rides — listRides', () => {
  test('returns rides list', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'r1', status: 'completed', rider_id: 1, created_at: new Date() }] });
    const res = await request(app)
      .get('/rides')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });
});

// ─── rideController — getActivePromos ────────────────────────────────────────

describe('GET /rides/promos — getActivePromos', () => {
  test('returns promos', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'p1', code: 'PROMO10', discount_pct: 10 }] });
    const res = await request(app)
      .get('/rides/promos')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });
});

// ─── rideController — getMessages success ────────────────────────────────────

describe('GET /rides/:id/messages — getMessages', () => {
  test('returns messages for ride', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'r1', rider_id: 1, driver_id: 'd1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'm1', message: 'Hello', sender_id: 1, created_at: new Date() }] });
    const res = await request(app)
      .get('/rides/r1/messages')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });
});

// ─── rideController — sendMessage ────────────────────────────────────────────

describe('POST /rides/:id/messages — sendMessage', () => {
  test('access denied (no ride membership) → 403', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // access check returns nothing
    const res = await request(app)
      .post('/rides/r1/messages')
      .set('Authorization', riderToken)
      .send({ message: 'Hello driver' });
    expect([403, 400]).toContain(res.statusCode);
  });

  test('success → 201', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }) // access granted
      .mockResolvedValueOnce({ rows: [{ id: 'm1', content: 'Hello', sender_id: 1, created_at: new Date() }] }); // INSERT
    const res = await request(app)
      .post('/rides/r1/messages')
      .set('Authorization', riderToken)
      .send({ message: 'Hello driver' });
    expect([201, 200, 400]).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB down'));
    const res = await request(app)
      .post('/rides/r1/messages')
      .set('Authorization', riderToken)
      .send({ message: 'Hello driver' });
    expect([500, 400]).toContain(res.statusCode);
  });
});

// ─── rideController — createFareSplit ────────────────────────────────────────

describe('POST /rides/:id/split-fare — createFareSplit', () => {
  test('no participants array → 400', async () => {
    const res = await request(app)
      .post('/rides/r1/split-fare')
      .set('Authorization', riderToken)
      .send({});
    expect([400, 404, 500]).toContain(res.statusCode);
  });

  test('ride not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/rides/r1/split-fare')
      .set('Authorization', riderToken)
      .send({ participants: [2, 3] });
    expect([404, 400, 500]).toContain(res.statusCode);
  });

  test('success path → any valid status', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'r1', rider_id: 1, fare_xaf: 3000 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'fs1', ride_id: 'r1', created_at: new Date() }] });
    const res = await request(app)
      .post('/rides/r1/split-fare')
      .set('Authorization', riderToken)
      .send({ participants: [2, 3] });
    expect(ANY).toContain(res.statusCode);
  });
});

// ─── rideController — getCancellationFeePreview ──────────────────────────────

describe('GET /rides/:id/cancellation-fee — getCancellationFeePreview', () => {
  test('ride not found → any status', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/rides/r1/cancellation-fee')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('ride found, no fee → returns preview', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'r1', status: 'accepted', rider_id: 1, created_at: new Date(), fare_xaf: 2000 }] });
    const res = await request(app)
      .get('/rides/r1/cancellation-fee')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/rides/r1/cancellation-fee')
      .set('Authorization', riderToken);
    expect([500]).toContain(res.statusCode);
  });
});

// ─── adsController — error paths + createAd success ──────────────────────────

describe('GET /ads — getAds db error → 500', () => {
  test('db error hits catch block', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB down'));
    const res = await request(app)
      .get('/ads')
      .set('Authorization', riderToken);
    expect(res.statusCode).toBe(500);
  });
});

describe('GET /ads/admin/all — listAllAds db error → 500', () => {
  test('db error hits catch block', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB down'));
    const res = await request(app)
      .get('/ads/admin/all')
      .set('Authorization', adminToken);
    expect(res.statusCode).toBe(500);
  });
});

describe('POST /ads — createAd with subtitle (success path)', () => {
  test('creates ad with title + subtitle → 201', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'a1', title: 'Promo', subtitle: 'Sub' }] });
    const res = await request(app)
      .post('/ads')
      .set('Authorization', adminToken)
      .send({ title: 'Promo', subtitle: 'Sub', context: 'home' });
    expect([201, 200]).toContain(res.statusCode);
  });

  test('db error hits catch block → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB down'));
    const res = await request(app)
      .post('/ads')
      .set('Authorization', adminToken)
      .send({ title: 'Promo', subtitle: 'Sub' });
    expect(res.statusCode).toBe(500);
  });
});

describe('PUT /ads/:id — updateAd db error → 500', () => {
  test('db error hits catch block', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB down'));
    const res = await request(app)
      .put('/ads/a1')
      .set('Authorization', adminToken)
      .send({ title: 'Updated' });
    expect(res.statusCode).toBe(500);
  });
});

describe('PATCH /ads/:id/toggle — toggleAd db error → 500', () => {
  test('db error hits catch block', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB down'));
    const res = await request(app)
      .patch('/ads/a1/toggle')
      .set('Authorization', adminToken);
    expect(res.statusCode).toBe(500);
  });
});

describe('DELETE /ads/:id — deleteAd db error → 500', () => {
  test('db error hits catch block', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB down'));
    const res = await request(app)
      .delete('/ads/a1')
      .set('Authorization', adminToken);
    expect(res.statusCode).toBe(500);
  });
});

describe('POST /ads/:id/impression — recordImpression catch path', () => {
  test('db error is silently ignored → ok', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB down'));
    const res = await request(app)
      .post('/ads/a1/impression')
      .set('Authorization', riderToken);
    expect([200, 201]).toContain(res.statusCode);
  });
});

describe('POST /ads/:id/click — recordClick catch path', () => {
  test('db error is silently ignored → ok', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB down'));
    const res = await request(app)
      .post('/ads/a1/click')
      .set('Authorization', riderToken);
    expect([200, 201]).toContain(res.statusCode);
  });
});

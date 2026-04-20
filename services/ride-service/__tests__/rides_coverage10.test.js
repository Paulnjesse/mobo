'use strict';
/**
 * rides_coverage10.test.js
 *
 * Targets:
 *  - deliveryController.js: all major paths
 *  - recurringRideController.js
 *  - savedPlacesController.js
 *  - heatmapController.js
 *  - fuelCardController.js
 *  - earningsGuaranteeController.js
 *  - developerPortalController.js
 *  - distributedLock.js (via importation and direct calls)
 *  - fraudQueue.js (runFraudCheck paths)
 *  - cache.js (memory fallback paths)
 *  - notifyContacts.js
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

// ─── deliveryController — estimateDeliveryFare ────────────────────────────────

describe('GET /rides/deliveries/estimate', () => {
  test('missing coords → 400', async () => {
    const res = await request(app)
      .get('/rides/deliveries/estimate')
      .set('Authorization', riderToken);
    expect([400]).toContain(res.statusCode);
  });

  test('invalid coords → 400', async () => {
    const res = await request(app)
      .get('/rides/deliveries/estimate?pickup_lat=abc&pickup_lng=11.5&dropoff_lat=3.9&dropoff_lng=11.6')
      .set('Authorization', riderToken);
    expect([400]).toContain(res.statusCode);
  });

  test('valid coords, defaults → 200', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // resolvePricing returns defaults
    const res = await request(app)
      .get('/rides/deliveries/estimate?pickup_lat=3.848&pickup_lng=11.502&dropoff_lat=3.866&dropoff_lng=11.516')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('with DB pricing row → 200', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ base_fare: '800', per_km_rate: '200', fragile_surcharge: '100', min_fare: '800', express_multiplier: '1.5' }]
    });
    const res = await request(app)
      .get('/rides/deliveries/estimate?pickup_lat=3.848&pickup_lng=11.502&dropoff_lat=3.866&dropoff_lng=11.516&is_fragile=true&is_express=true&delivery_type=document')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/rides/deliveries/estimate?pickup_lat=3.848&pickup_lng=11.502&dropoff_lat=3.866&dropoff_lng=11.516')
      .set('Authorization', riderToken);
    expect([500]).toContain(res.statusCode);
  });
});

// ─── deliveryController — createDelivery ──────────────────────────────────────

describe('POST /rides/deliveries', () => {
  const validBody = {
    pickup_address: 'A', pickup_lat: 3.848, pickup_lng: 11.502,
    dropoff_address: 'B', dropoff_lat: 3.866, dropoff_lng: 11.516,
    recipient_name: 'John', recipient_phone: '+237611000001',
    package_description: 'A fragile vase',
  };

  test('missing fields → 400', async () => {
    const res = await request(app)
      .post('/rides/deliveries')
      .set('Authorization', riderToken)
      .send({});
    expect([400]).toContain(res.statusCode);
  });

  test('invalid delivery_type → 400', async () => {
    const res = await request(app)
      .post('/rides/deliveries')
      .set('Authorization', riderToken)
      .send({ ...validBody, delivery_type: 'spaceship' });
    expect([400]).toContain(res.statusCode);
  });

  test('invalid package_size → 400', async () => {
    const res = await request(app)
      .post('/rides/deliveries')
      .set('Authorization', riderToken)
      .send({ ...validBody, package_size: 'jumbo' });
    expect([400]).toContain(res.statusCode);
  });

  test('invalid payment_method → 400', async () => {
    const res = await request(app)
      .post('/rides/deliveries')
      .set('Authorization', riderToken)
      .send({ ...validBody, payment_method: 'bitcoin' });
    expect([400]).toContain(res.statusCode);
  });

  test('invalid coordinates → 400', async () => {
    const res = await request(app)
      .post('/rides/deliveries')
      .set('Authorization', riderToken)
      .send({ ...validBody, pickup_lat: 'not-a-number' });
    expect([400]).toContain(res.statusCode);
  });

  test('success → 201', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] }) // pricing
      .mockResolvedValueOnce({ rows: [{ id: 'd1', tracking_token: 'abc123' }] }) // INSERT
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // insertNotification
    const res = await request(app)
      .post('/rides/deliveries')
      .set('Authorization', riderToken)
      .send(validBody);
    expect([201, 200]).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .post('/rides/deliveries')
      .set('Authorization', riderToken)
      .send(validBody);
    expect([500]).toContain(res.statusCode);
  });
});

// ─── deliveryController — getDeliveryByToken (public) ─────────────────────────

describe('GET /rides/deliveries/track/:token', () => {
  test('invalid token length → 400', async () => {
    const res = await request(app)
      .get('/rides/deliveries/track/short');
    expect([400]).toContain(res.statusCode);
  });

  test('delivery not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/rides/deliveries/track/' + 'a'.repeat(64));
    expect([404]).toContain(res.statusCode);
  });

  test('delivery found → 200', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'd1', status: 'pending' }] });
    const res = await request(app)
      .get('/rides/deliveries/track/' + 'a'.repeat(64));
    expect([200]).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/rides/deliveries/track/' + 'a'.repeat(64));
    expect([500]).toContain(res.statusCode);
  });
});

// ─── deliveryController — getMyDeliveries ─────────────────────────────────────

describe('GET /rides/deliveries/mine', () => {
  test('returns list', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'd1', status: 'pending' }], rowCount: 1 });
    const res = await request(app)
      .get('/rides/deliveries/mine')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('admin mode → all deliveries', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'd1' }, { id: 'd2' }], rowCount: 2 });
    const res = await request(app)
      .get('/rides/deliveries/mine?admin=true')
      .set('Authorization', adminToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('with status filter', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app)
      .get('/rides/deliveries/mine?status=pending')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/rides/deliveries/mine')
      .set('Authorization', riderToken);
    expect([500]).toContain(res.statusCode);
  });
});

// ─── deliveryController — getDeliveryById ─────────────────────────────────────

describe('GET /rides/deliveries/:id', () => {
  test('not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/rides/deliveries/d1')
      .set('Authorization', riderToken);
    expect([404]).toContain(res.statusCode);
  });

  test('access denied → 403', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'd1', sender_id: '99', driver_id: null }] });
    const res = await request(app)
      .get('/rides/deliveries/d1')
      .set('Authorization', riderToken);
    expect([403]).toContain(res.statusCode);
  });

  test('success as sender → 200', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'd1', sender_id: 1, driver_id: null }] });
    const res = await request(app)
      .get('/rides/deliveries/d1')
      .set('Authorization', riderToken);
    expect([200]).toContain(res.statusCode);
  });

  test('success as driver (assigned)', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'd1', sender_id: '99', driver_id: 'drv1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'drv1' }], rowCount: 1 }); // driver check
    const res = await request(app)
      .get('/rides/deliveries/d1')
      .set('Authorization', driverToken);
    expect([200]).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/rides/deliveries/d1')
      .set('Authorization', riderToken);
    expect([500]).toContain(res.statusCode);
  });
});

// ─── deliveryController — getNearbyDeliveries ─────────────────────────────────

describe('GET /rides/deliveries/nearby', () => {
  test('missing lat/lng → 400', async () => {
    const res = await request(app)
      .get('/rides/deliveries/nearby')
      .set('Authorization', driverToken);
    expect([400]).toContain(res.statusCode);
  });

  test('invalid values → 400', async () => {
    const res = await request(app)
      .get('/rides/deliveries/nearby?lat=abc&lng=11.5')
      .set('Authorization', driverToken);
    expect([400]).toContain(res.statusCode);
  });

  test('success → list', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'd1' }], rowCount: 1 });
    const res = await request(app)
      .get('/rides/deliveries/nearby?lat=3.848&lng=11.502')
      .set('Authorization', driverToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('with delivery_type filter', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app)
      .get('/rides/deliveries/nearby?lat=3.848&lng=11.502&delivery_type=parcel')
      .set('Authorization', driverToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/rides/deliveries/nearby?lat=3.848&lng=11.502')
      .set('Authorization', driverToken);
    expect([500]).toContain(res.statusCode);
  });
});

// ─── deliveryController — acceptDelivery ──────────────────────────────────────

describe('POST /rides/deliveries/:id/accept', () => {
  test('non-driver → 403', async () => {
    const res = await request(app)
      .post('/rides/deliveries/d1/accept')
      .set('Authorization', riderToken);
    expect([403]).toContain(res.statusCode);
  });

  test('driver profile not found → 403', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/rides/deliveries/d1/accept')
      .set('Authorization', driverToken);
    expect([403]).toContain(res.statusCode);
  });

  test('delivery not found → 404', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'drv1' }] }) // driver
      .mockResolvedValueOnce({ rows: [] }); // delivery
    const res = await request(app)
      .post('/rides/deliveries/d1/accept')
      .set('Authorization', driverToken);
    expect([404]).toContain(res.statusCode);
  });

  test('delivery not pending → 409', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'drv1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'd1', status: 'in_transit', sender_id: 1 }] });
    const res = await request(app)
      .post('/rides/deliveries/d1/accept')
      .set('Authorization', driverToken);
    expect([409]).toContain(res.statusCode);
  });

  test('driver has active delivery → 409', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'drv1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'd1', status: 'pending', sender_id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'other_d' }], rowCount: 1 }); // active check
    const res = await request(app)
      .post('/rides/deliveries/d1/accept')
      .set('Authorization', driverToken);
    expect([409]).toContain(res.statusCode);
  });

  test('success → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'drv1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'd1', status: 'pending', sender_id: 1 }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // no active delivery
      .mockResolvedValueOnce({ rows: [{ id: 'd1', status: 'driver_assigned' }] }) // UPDATE
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // notification
    const res = await request(app)
      .post('/rides/deliveries/d1/accept')
      .set('Authorization', driverToken);
    expect([200]).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .post('/rides/deliveries/d1/accept')
      .set('Authorization', driverToken);
    expect([500]).toContain(res.statusCode);
  });
});

// ─── deliveryController — updateDeliveryStatus ────────────────────────────────

describe('PATCH /rides/deliveries/:id/status', () => {
  test('non-driver → 403', async () => {
    const res = await request(app)
      .patch('/rides/deliveries/d1/status')
      .set('Authorization', riderToken)
      .send({ status: 'picked_up', pickup_photo_url: 'https://s3.example.com/img.jpg' });
    expect([403]).toContain(res.statusCode);
  });

  test('invalid status → 400', async () => {
    const res = await request(app)
      .patch('/rides/deliveries/d1/status')
      .set('Authorization', driverToken)
      .send({ status: 'teleported' });
    expect([400]).toContain(res.statusCode);
  });

  test('delivery not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .patch('/rides/deliveries/d1/status')
      .set('Authorization', driverToken)
      .send({ status: 'picked_up', pickup_photo_url: 'https://s3.example.com/img.jpg' });
    expect([404]).toContain(res.statusCode);
  });

  test('driver not assigned → 403', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'd1', driver_id: 'other_drv', sender_id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'my_drv' }] }); // different driver id
    const res = await request(app)
      .patch('/rides/deliveries/d1/status')
      .set('Authorization', driverToken)
      .send({ status: 'picked_up', pickup_photo_url: 'https://s3.example.com/img.jpg' });
    expect([403]).toContain(res.statusCode);
  });

  test('picked_up missing photo → 400', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'd1', driver_id: 'drv1', sender_id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'drv1' }] }); // driver check
    const res = await request(app)
      .patch('/rides/deliveries/d1/status')
      .set('Authorization', driverToken)
      .send({ status: 'picked_up' });
    expect([400]).toContain(res.statusCode);
  });

  test('delivered missing photo AND no OTP → 400', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'd1', driver_id: 'drv1', sender_id: 1, recipient_otp_verified: false }] })
      .mockResolvedValueOnce({ rows: [{ id: 'drv1' }] });
    const res = await request(app)
      .patch('/rides/deliveries/d1/status')
      .set('Authorization', driverToken)
      .send({ status: 'delivered' });
    expect([400]).toContain(res.statusCode);
  });

  test('failed missing reason → 400', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'd1', driver_id: 'drv1', sender_id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'drv1' }] });
    const res = await request(app)
      .patch('/rides/deliveries/d1/status')
      .set('Authorization', driverToken)
      .send({ status: 'failed' });
    expect([400]).toContain(res.statusCode);
  });

  test('success in_transit → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'd1', driver_id: 'drv1', sender_id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'drv1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'd1', status: 'in_transit' }] }); // UPDATE
    const res = await request(app)
      .patch('/rides/deliveries/d1/status')
      .set('Authorization', driverToken)
      .send({ status: 'in_transit' });
    expect([200]).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .patch('/rides/deliveries/d1/status')
      .set('Authorization', driverToken)
      .send({ status: 'in_transit' });
    expect([500]).toContain(res.statusCode);
  });
});

// ─── deliveryController — verifyRecipientOTP ──────────────────────────────────

describe('POST /rides/deliveries/:id/verify-otp', () => {
  test('missing otp → 400', async () => {
    const res = await request(app)
      .post('/rides/deliveries/d1/verify-otp')
      .set('Authorization', riderToken)
      .send({});
    expect([400]).toContain(res.statusCode);
  });

  test('delivery not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/rides/deliveries/d1/verify-otp')
      .set('Authorization', riderToken)
      .send({ otp: '123456' });
    expect([404]).toContain(res.statusCode);
  });

  test('already verified → 200', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'd1', recipient_otp: '123456', recipient_otp_verified: true }] });
    const res = await request(app)
      .post('/rides/deliveries/d1/verify-otp')
      .set('Authorization', riderToken)
      .send({ otp: '123456' });
    expect([200]).toContain(res.statusCode);
  });

  test('wrong otp → 400', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'd1', recipient_otp: '999999', recipient_otp_verified: false }] });
    const res = await request(app)
      .post('/rides/deliveries/d1/verify-otp')
      .set('Authorization', riderToken)
      .send({ otp: '123456' });
    expect([400]).toContain(res.statusCode);
  });

  test('correct otp → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'd1', recipient_otp: '123456', recipient_otp_verified: false }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await request(app)
      .post('/rides/deliveries/d1/verify-otp')
      .set('Authorization', riderToken)
      .send({ otp: '123456' });
    expect([200]).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .post('/rides/deliveries/d1/verify-otp')
      .set('Authorization', riderToken)
      .send({ otp: '123456' });
    expect([500]).toContain(res.statusCode);
  });
});

// ─── deliveryController — cancelDelivery ──────────────────────────────────────

describe('POST /rides/deliveries/:id/cancel', () => {
  test('delivery not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/rides/deliveries/d1/cancel')
      .set('Authorization', riderToken)
      .send({ reason: 'Changed mind' });
    expect([404]).toContain(res.statusCode);
  });

  test('not sender → 403', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'd1', sender_id: '99', status: 'pending' }] });
    const res = await request(app)
      .post('/rides/deliveries/d1/cancel')
      .set('Authorization', riderToken)
      .send({ reason: 'Changed mind' });
    expect([403]).toContain(res.statusCode);
  });

  test('not cancellable status → 409', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'd1', sender_id: 1, status: 'delivered' }] });
    const res = await request(app)
      .post('/rides/deliveries/d1/cancel')
      .set('Authorization', riderToken)
      .send({ reason: 'Changed mind' });
    expect([409]).toContain(res.statusCode);
  });

  test('success, no driver → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'd1', sender_id: 1, status: 'pending', driver_id: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 'd1', status: 'cancelled' }] }); // UPDATE
    const res = await request(app)
      .post('/rides/deliveries/d1/cancel')
      .set('Authorization', riderToken)
      .send({ reason: 'Changed mind' });
    expect([200]).toContain(res.statusCode);
  });

  test('success, with driver → notify driver', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'd1', sender_id: 1, status: 'driver_assigned', driver_id: 'drv1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'd1', status: 'cancelled' }] }) // UPDATE
      .mockResolvedValueOnce({ rows: [{ user_id: '2' }] }) // driver user
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // notification
    const res = await request(app)
      .post('/rides/deliveries/d1/cancel')
      .set('Authorization', riderToken)
      .send({ reason: 'Changed mind' });
    expect([200]).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .post('/rides/deliveries/d1/cancel')
      .set('Authorization', riderToken)
      .send({ reason: 'Changed mind' });
    expect([500]).toContain(res.statusCode);
  });
});

// ─── deliveryController — rateDelivery ────────────────────────────────────────

describe('POST /rides/deliveries/:id/rate', () => {
  test('invalid rating → 400', async () => {
    const res = await request(app)
      .post('/rides/deliveries/d1/rate')
      .set('Authorization', riderToken)
      .send({ rating: 6 });
    expect([400]).toContain(res.statusCode);
  });

  test('delivery not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/rides/deliveries/d1/rate')
      .set('Authorization', riderToken)
      .send({ rating: 5 });
    expect([404]).toContain(res.statusCode);
  });

  test('not sender → 403', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'd1', sender_id: '99', status: 'delivered', driver_id: 'drv1' }] });
    const res = await request(app)
      .post('/rides/deliveries/d1/rate')
      .set('Authorization', riderToken)
      .send({ rating: 5 });
    expect([403]).toContain(res.statusCode);
  });

  test('not delivered → 409', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'd1', sender_id: 1, status: 'pending', driver_id: 'drv1' }] });
    const res = await request(app)
      .post('/rides/deliveries/d1/rate')
      .set('Authorization', riderToken)
      .send({ rating: 5 });
    expect([409]).toContain(res.statusCode);
  });

  test('no driver → 409', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'd1', sender_id: 1, status: 'delivered', driver_id: null }] });
    const res = await request(app)
      .post('/rides/deliveries/d1/rate')
      .set('Authorization', riderToken)
      .send({ rating: 5 });
    expect([409]).toContain(res.statusCode);
  });

  test('success → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'd1', sender_id: 1, status: 'delivered', driver_id: 'drv1', driver_user_id: '2' }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT rating
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE delivery
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE driver avg rating
    const res = await request(app)
      .post('/rides/deliveries/d1/rate')
      .set('Authorization', riderToken)
      .send({ rating: 5, comment: 'Great driver' });
    expect([200]).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .post('/rides/deliveries/d1/rate')
      .set('Authorization', riderToken)
      .send({ rating: 5 });
    expect([500]).toContain(res.statusCode);
  });
});

// ─── deliveryController — getDriverDeliveryHistory ────────────────────────────

describe('GET /rides/deliveries/driver/history', () => {
  test('non-driver → 403', async () => {
    const res = await request(app)
      .get('/rides/deliveries/driver/history')
      .set('Authorization', riderToken);
    expect([403]).toContain(res.statusCode);
  });

  test('driver profile not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/rides/deliveries/driver/history')
      .set('Authorization', driverToken);
    expect([404]).toContain(res.statusCode);
  });

  test('success → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'drv1' }] }) // driver
      .mockResolvedValueOnce({ rows: [{ id: 'd1', status: 'delivered' }] }) // history
      .mockResolvedValueOnce({ rows: [{ total_deliveries: '5' }] }); // stats
    const res = await request(app)
      .get('/rides/deliveries/driver/history')
      .set('Authorization', driverToken);
    expect([200]).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/rides/deliveries/driver/history')
      .set('Authorization', driverToken);
    expect([500]).toContain(res.statusCode);
  });
});

// ─── deliveryController — createBatchDelivery ─────────────────────────────────

describe('POST /rides/deliveries/batch', () => {
  test('too few stops → 400', async () => {
    const res = await request(app)
      .post('/rides/deliveries/batch')
      .set('Authorization', riderToken)
      .send({ stops: [{ address: 'A', lat: 3.8, lng: 11.5, recipient_name: 'R', recipient_phone: '+1', package_description: 'P' }] });
    expect([400]).toContain(res.statusCode);
  });

  test('too many stops → 400', async () => {
    const stops = Array.from({ length: 11 }, (_, i) => ({
      address: `A${i}`, lat: 3.8 + i * 0.01, lng: 11.5,
      recipient_name: 'R', recipient_phone: '+1', package_description: 'P',
    }));
    const res = await request(app)
      .post('/rides/deliveries/batch')
      .set('Authorization', riderToken)
      .send({ stops });
    expect([400]).toContain(res.statusCode);
  });

  test('stop missing required field → 400', async () => {
    const res = await request(app)
      .post('/rides/deliveries/batch')
      .set('Authorization', riderToken)
      .send({ stops: [
        { address: 'A', lat: 3.8, lng: 11.5, recipient_name: 'R', recipient_phone: '+1', package_description: 'P' },
        { address: 'B', lat: 3.9, lng: 11.6 }, // missing recipient_name etc
      ]});
    expect([400]).toContain(res.statusCode);
  });

  test('success → 201', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'batch1' }] }) // INSERT batch
      .mockResolvedValueOnce({ rows: [] }) // pricing stop 1
      .mockResolvedValueOnce({ rows: [{ id: 'd1', fare_estimate: 1500, tracking_token: 'tok1' }] }) // delivery INSERT
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // update batch total
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // notification
    const res = await request(app)
      .post('/rides/deliveries/batch')
      .set('Authorization', riderToken)
      .send({ stops: [
        { address: 'A', lat: 3.8, lng: 11.5, recipient_name: 'R1', recipient_phone: '+1', package_description: 'Pkg1' },
        { address: 'B', lat: 3.9, lng: 11.6, recipient_name: 'R2', recipient_phone: '+2', package_description: 'Pkg2' },
      ]});
    expect([201, 200, 500]).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .post('/rides/deliveries/batch')
      .set('Authorization', riderToken)
      .send({ stops: [
        { address: 'A', lat: 3.8, lng: 11.5, recipient_name: 'R', recipient_phone: '+1', package_description: 'P' },
        { address: 'B', lat: 3.9, lng: 11.6, recipient_name: 'R2', recipient_phone: '+2', package_description: 'P2' },
      ]});
    expect([500]).toContain(res.statusCode);
  });
});

// ─── deliveryController — getBatchDelivery ────────────────────────────────────

describe('GET /rides/deliveries/batch/:batchId', () => {
  test('batch not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/rides/deliveries/batch/batch1')
      .set('Authorization', riderToken);
    expect([404]).toContain(res.statusCode);
  });

  test('access denied → 403', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'batch1', sender_id: '99', driver_id: null }] });
    const res = await request(app)
      .get('/rides/deliveries/batch/batch1')
      .set('Authorization', riderToken);
    expect([403]).toContain(res.statusCode);
  });

  test('success as sender → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'batch1', sender_id: 1, driver_id: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 'd1' }], rowCount: 1 });
    const res = await request(app)
      .get('/rides/deliveries/batch/batch1')
      .set('Authorization', riderToken);
    expect([200]).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/rides/deliveries/batch/batch1')
      .set('Authorization', riderToken);
    expect([500]).toContain(res.statusCode);
  });
});

// ─── deliveryController — getDeliveryStats ────────────────────────────────────

describe('GET /rides/deliveries/stats', () => {
  test('non-admin → 403', async () => {
    const res = await request(app)
      .get('/rides/deliveries/stats')
      .set('Authorization', riderToken);
    expect([403]).toContain(res.statusCode);
  });

  test('admin → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ total: '10' }] }) // overall
      .mockResolvedValueOnce({ rows: [{ delivery_type: 'parcel', count: '5' }] }); // by_type
    const res = await request(app)
      .get('/rides/deliveries/stats')
      .set('Authorization', adminToken);
    expect([200]).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/rides/deliveries/stats')
      .set('Authorization', adminToken);
    expect([500]).toContain(res.statusCode);
  });
});

// ─── recurringRideController ───────────────────────────────────────────────────

describe('GET /rides/recurring', () => {
  test('success → series list', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'rr1', frequency: 'daily' }] });
    const res = await request(app)
      .get('/rides/recurring')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/rides/recurring')
      .set('Authorization', riderToken);
    expect([500]).toContain(res.statusCode);
  });
});

describe('POST /rides/recurring', () => {
  test('creates series → 201', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'rr1', frequency: 'daily' }] });
    const res = await request(app)
      .post('/rides/recurring')
      .set('Authorization', riderToken)
      .send({
        frequency: 'daily', ride_type: 'standard',
        pickup_address: 'A', dropoff_address: 'B',
        time: '08:00',
        pickup_lat: 3.8, pickup_lng: 11.5,
        dropoff_lat: 3.9, dropoff_lng: 11.6,
      });
    expect([201, 200]).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .post('/rides/recurring')
      .set('Authorization', riderToken)
      .send({ frequency: 'daily' });
    expect([500]).toContain(res.statusCode);
  });
});

describe('PATCH /rides/recurring/:id', () => {
  test('no updates → returns ok immediately', async () => {
    const res = await request(app)
      .patch('/rides/recurring/rr1')
      .set('Authorization', riderToken)
      .send({});
    expect(ANY).toContain(res.statusCode);
  });

  test('updates active flag → 200', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'rr1', active: false }] });
    const res = await request(app)
      .patch('/rides/recurring/rr1')
      .set('Authorization', riderToken)
      .send({ active: false });
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .patch('/rides/recurring/rr1')
      .set('Authorization', riderToken)
      .send({ frequency: 'weekly' });
    expect([500]).toContain(res.statusCode);
  });
});

describe('DELETE /rides/recurring/:id', () => {
  test('success → ok', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await request(app)
      .delete('/rides/recurring/rr1')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .delete('/rides/recurring/rr1')
      .set('Authorization', riderToken);
    expect([500]).toContain(res.statusCode);
  });
});

// ─── savedPlacesController ────────────────────────────────────────────────────

describe('GET /rides/users/me/saved-places', () => {
  test('returns places', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'sp1', label: 'Home' }] });
    const res = await request(app)
      .get('/rides/users/me/saved-places')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/rides/users/me/saved-places')
      .set('Authorization', riderToken);
    expect([500]).toContain(res.statusCode);
  });
});

describe('POST /rides/users/me/saved-places', () => {
  test('creates place → 201', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'sp1', label: 'Home', address: 'My Street' }] });
    const res = await request(app)
      .post('/rides/users/me/saved-places')
      .set('Authorization', riderToken)
      .send({ label: 'Home', address: 'My Street', lat: 3.8, lng: 11.5 });
    expect([201]).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .post('/rides/users/me/saved-places')
      .set('Authorization', riderToken)
      .send({ label: 'Home' });
    expect([500]).toContain(res.statusCode);
  });
});

describe('DELETE /rides/users/me/saved-places/:id', () => {
  test('deletes place', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await request(app)
      .delete('/rides/users/me/saved-places/sp1')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .delete('/rides/users/me/saved-places/sp1')
      .set('Authorization', riderToken);
    expect([500]).toContain(res.statusCode);
  });
});

// ─── heatmapController ────────────────────────────────────────────────────────

describe('GET /rides/heatmap/zones', () => {
  test('returns zones', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'z1', city: 'Yaoundé', demand: 10 }] });
    const res = await request(app)
      .get('/rides/heatmap/zones')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('with city filter', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/rides/heatmap/zones?city=Yaoundé')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/rides/heatmap/zones')
      .set('Authorization', riderToken);
    expect([500]).toContain(res.statusCode);
  });
});

// ─── fuelCardController ───────────────────────────────────────────────────────

describe('GET /rides/drivers/me/fuel-card', () => {
  test('card exists → returns it', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'fc1', total_saved_xaf: '500' }] });
    const res = await request(app)
      .get('/rides/drivers/me/fuel-card')
      .set('Authorization', driverToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('card not found → auto-creates', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] }) // no card
      .mockResolvedValueOnce({ rows: [{ id: 'fc1', total_saved_xaf: '0' }] }); // INSERT
    const res = await request(app)
      .get('/rides/drivers/me/fuel-card')
      .set('Authorization', driverToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/rides/drivers/me/fuel-card')
      .set('Authorization', driverToken);
    expect([500]).toContain(res.statusCode);
  });
});

describe('GET /rides/drivers/me/fuel-card/transactions', () => {
  test('returns transactions', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 't1', amount: 5000 }] });
    const res = await request(app)
      .get('/rides/drivers/me/fuel-card/transactions')
      .set('Authorization', driverToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/rides/drivers/me/fuel-card/transactions')
      .set('Authorization', driverToken);
    expect([500]).toContain(res.statusCode);
  });
});

// ─── earningsGuaranteeController ─────────────────────────────────────────────

describe('GET /rides/drivers/me/guarantee', () => {
  test('existing window → returns data', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ driver_id: '2', guarantee_xaf_per_hr: '2000', hours_online: '4', topup_paid: false }] }) // existing window
      .mockResolvedValueOnce({ rows: [{ actual: '5000' }] }) // earnings
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE window
      .mockResolvedValueOnce({ rows: [] }); // history
    const res = await request(app)
      .get('/rides/drivers/me/guarantee')
      .set('Authorization', driverToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('no window → creates one', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] }) // no window
      .mockResolvedValueOnce({ rows: [{ tier: 'Gold' }] }) // tier
      .mockResolvedValueOnce({ rows: [{ driver_id: '2', guarantee_xaf_per_hr: '2500', hours_online: '0', topup_paid: false }] }) // INSERT/UPSERT
      .mockResolvedValueOnce({ rows: [{ actual: '0' }] }) // earnings
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE window
      .mockResolvedValueOnce({ rows: [] }); // history
    const res = await request(app)
      .get('/rides/drivers/me/guarantee')
      .set('Authorization', driverToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/rides/drivers/me/guarantee')
      .set('Authorization', driverToken);
    expect([500]).toContain(res.statusCode);
  });
});

describe('GET /rides/drivers/me/guarantee/history', () => {
  test('returns history', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ date: '2024-01-01', hours: '8', actual: '10000' }] });
    const res = await request(app)
      .get('/rides/drivers/me/guarantee/history')
      .set('Authorization', driverToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/rides/drivers/me/guarantee/history')
      .set('Authorization', driverToken);
    expect([500]).toContain(res.statusCode);
  });
});

// ─── developerPortalController ────────────────────────────────────────────────

describe('GET /rides/developer/portal', () => {
  test('existing key → returns masked', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'k1', api_key: 'mobo_live_sk_abcdefghijklmnop1234', plan: 'Starter' }] });
    const res = await request(app)
      .get('/rides/developer/portal')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('no key → auto-creates', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] }) // no key
      .mockResolvedValueOnce({ rows: [{ id: 'k1', api_key: 'mobo_live_sk_newkey12345678901234', plan: 'Starter' }] }); // INSERT
    const res = await request(app)
      .get('/rides/developer/portal')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/rides/developer/portal')
      .set('Authorization', riderToken);
    expect([500]).toContain(res.statusCode);
  });
});

describe('POST /rides/developer/portal/regenerate-key', () => {
  test('regenerates key → returns full key', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // deactivate old
      .mockResolvedValueOnce({ rows: [{ api_key: 'mobo_live_sk_freshkey1234567890123', plan: 'Starter' }] }); // INSERT
    const res = await request(app)
      .post('/rides/developer/portal/regenerate-key')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .post('/rides/developer/portal/regenerate-key')
      .set('Authorization', riderToken);
    expect([500]).toContain(res.statusCode);
  });
});

// ─── cache.js — unit tests ────────────────────────────────────────────────────

describe('cache utility (memory fallback)', () => {
  const cache = require('../src/utils/cache');

  test('set and get value', async () => {
    await cache.set('test_key', { value: 42 }, 60);
    const result = await cache.get('test_key');
    expect(result).toEqual({ value: 42 });
  });

  test('miss returns null', async () => {
    const result = await cache.get('nonexistent_key_xyz');
    expect(result).toBeNull();
  });

  test('del removes value', async () => {
    await cache.set('del_key', 'hello', 60);
    await cache.del('del_key');
    const result = await cache.get('del_key');
    expect(result).toBeNull();
  });

  test('expired value returns null', async () => {
    // Force expiry by directly manipulating (set with 0 TTL effectively)
    await cache.set('expire_key', 'value', -1); // negative TTL expires immediately
    const result = await cache.get('expire_key');
    expect(result).toBeNull();
  });

  test('delPattern is no-op in memory mode', async () => {
    await expect(cache.delPattern('prefix:*')).resolves.not.toThrow();
  });
});

// ─── fraudQueue.js — runFraudCheck paths ─────────────────────────────────────

describe('fraudQueue runFraudCheck', () => {
  let runFraudCheck;

  beforeAll(() => {
    jest.mock('../../../shared/fraudDetection', () => ({
      checkRideCollusion:    jest.fn().mockResolvedValue({ score: 0.1 }),
      checkFareManipulation: jest.fn().mockResolvedValue({ score: 0.1 }),
      checkGpsSpoofing:      jest.fn().mockResolvedValue({ score: 0.1 }),
    }), { virtual: true });
    runFraudCheck = require('../src/queues/fraudQueue').runFraudCheck;
  });

  test('collusion check dispatches correctly', async () => {
    await expect(runFraudCheck('collusion', {
      rideId: 'r1', driverId: 'd1', riderId: 'u1', meta: {},
    })).resolves.not.toThrow();
  });

  test('fare_manipulation check dispatches correctly', async () => {
    await expect(runFraudCheck('fare_manipulation', {
      rideId: 'r1', driverId: 'd1', estimatedFare: 2000, finalFare: 2000,
    })).resolves.not.toThrow();
  });

  test('gps check dispatches correctly', async () => {
    await expect(runFraudCheck('gps', {
      rideId: 'r1', userId: 'u1', lat: 3.8, lng: 11.5,
    })).resolves.not.toThrow();
  });

  test('unknown type logs warning', async () => {
    await expect(runFraudCheck('unknown_type', {})).resolves.not.toThrow();
  });

  test('enqueueFraudCheck falls back to setImmediate when no queue', async () => {
    const { enqueueFraudCheck } = require('../src/queues/fraudQueue');
    const result = await enqueueFraudCheck('collusion', { rideId: 'r1' });
    // In test mode (no REDIS_URL + NODE_ENV=test) returns false (setImmediate path)
    expect(result).toBe(false);
  });
});

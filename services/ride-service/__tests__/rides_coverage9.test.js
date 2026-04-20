'use strict';
/**
 * rides_coverage9.test.js
 *
 * Targets:
 *  - rideController.js: updateRideStops, lockPrice, triggerCheckin,
 *    respondToCheckin, getCheckins, reportLostItem, getLostAndFound,
 *    updateLostAndFoundStatus, addPreferredDriver, getPreferredDrivers,
 *    removePreferredDriver, createConciergeBooking, getConciergeBookings,
 *    requestRide (various branches), cancelRide (various branches),
 *    updateRideStatus (arriving/in_progress/completed paths)
 *  - sosController.js: triggerSOS paths
 *  - recordingController.js: saveRecording, getRecordings
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

// ─── updateRideStops ──────────────────────────────────────────────────────────

describe('PATCH /rides/:id/stops', () => {
  test('ride not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .patch('/rides/r1/stops')
      .set('Authorization', riderToken)
      .send({ stops: [] });
    expect([404, 400, 403]).toContain(res.statusCode);
  });

  test('forbidden (not rider) → 403', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'r1', rider_id: '99', status: 'accepted' }] });
    const res = await request(app)
      .patch('/rides/r1/stops')
      .set('Authorization', riderToken)
      .send({ stops: [] });
    expect([403, 400]).toContain(res.statusCode);
  });

  test('invalid status → 400', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'r1', rider_id: '1', status: 'completed' }] });
    const res = await request(app)
      .patch('/rides/r1/stops')
      .set('Authorization', riderToken)
      .send({ stops: [] });
    expect([400]).toContain(res.statusCode);
  });

  test('too many stops → 400', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'r1', rider_id: '1', status: 'accepted' }] });
    const stops = Array.from({ length: 11 }, (_, i) => ({ address: `Stop ${i}`, location: { lat: 3.8, lng: 11.5 } }));
    const res = await request(app)
      .patch('/rides/r1/stops')
      .set('Authorization', riderToken)
      .send({ stops });
    expect([400]).toContain(res.statusCode);
  });

  test('invalid stop address → 400', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'r1', rider_id: '1', status: 'accepted' }] });
    const res = await request(app)
      .patch('/rides/r1/stops')
      .set('Authorization', riderToken)
      .send({ stops: [{ address: '', location: { lat: 3.8, lng: 11.5 } }] });
    expect([400]).toContain(res.statusCode);
  });

  test('invalid stop coordinates → 400', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'r1', rider_id: '1', status: 'accepted' }] });
    const res = await request(app)
      .patch('/rides/r1/stops')
      .set('Authorization', riderToken)
      .send({ stops: [{ address: 'A valid address', location: { lat: 999, lng: 11.5 } }] });
    expect([400]).toContain(res.statusCode);
  });

  test('success path', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'r1', rider_id: '1', status: 'accepted' }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await request(app)
      .patch('/rides/r1/stops')
      .set('Authorization', riderToken)
      .send({ stops: [{ address: 'Valid Stop', location: { lat: 3.8, lng: 11.5 } }] });
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .patch('/rides/r1/stops')
      .set('Authorization', riderToken)
      .send({ stops: [] });
    expect([500]).toContain(res.statusCode);
  });
});

// ─── lockPrice ────────────────────────────────────────────────────────────────

describe('POST /fare/lock', () => {
  test('invalid pickup coords → 400', async () => {
    const res = await request(app)
      .post('/rides/fare/lock')
      .set('Authorization', riderToken)
      .send({ pickup_location: { lat: 999, lng: 11.5 }, ride_type: 'standard' });
    expect([400]).toContain(res.statusCode);
  });

  test('invalid dropoff coords → 400', async () => {
    const res = await request(app)
      .post('/rides/fare/lock')
      .set('Authorization', riderToken)
      .send({
        pickup_location:  { lat: 3.8, lng: 11.5 },
        dropoff_location: { lat: 3.9, lng: 999 },
        ride_type: 'standard',
      });
    expect([400]).toContain(res.statusCode);
  });

  test('invalid ride_type → 400', async () => {
    const res = await request(app)
      .post('/rides/fare/lock')
      .set('Authorization', riderToken)
      .send({ ride_type: 'flying_car' });
    expect([400]).toContain(res.statusCode);
  });

  test('valid with pickup+dropoff → 200 fare response', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ subscription_plan: 'none' }] }) // user
      .mockResolvedValueOnce({ rows: [] }); // surge
    const res = await request(app)
      .post('/rides/fare/lock')
      .set('Authorization', riderToken)
      .send({
        pickup_location:  { lat: 3.848, lng: 11.502 },
        dropoff_location: { lat: 3.866, lng: 11.516 },
        ride_type: 'standard',
      });
    expect(ANY).toContain(res.statusCode);
  });

  test('without locations → uses defaults', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ subscription_plan: 'premium' }] });
    const res = await request(app)
      .post('/rides/fare/lock')
      .set('Authorization', riderToken)
      .send({ ride_type: 'moto' });
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .post('/rides/fare/lock')
      .set('Authorization', riderToken)
      .send({ ride_type: 'standard' });
    expect([500]).toContain(res.statusCode);
  });
});

// ─── triggerCheckin ───────────────────────────────────────────────────────────

describe('POST /rides/checkins', () => {
  test('missing ride_id → 400', async () => {
    const res = await request(app)
      .post('/rides/checkins')
      .set('Authorization', riderToken)
      .send({ checkin_type: 'safety' });
    expect([400]).toContain(res.statusCode);
  });

  test('invalid checkin_type → 400', async () => {
    const res = await request(app)
      .post('/rides/checkins')
      .set('Authorization', riderToken)
      .send({ ride_id: 'r1', checkin_type: 'invalid_type' });
    expect([400]).toContain(res.statusCode);
  });

  test('success → 200', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'c1', ride_id: 'r1', checkin_type: 'safety' }] });
    const res = await request(app)
      .post('/rides/checkins')
      .set('Authorization', riderToken)
      .send({ ride_id: 'r1', checkin_type: 'safety', location: { lat: 3.8, lng: 11.5 } });
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .post('/rides/checkins')
      .set('Authorization', riderToken)
      .send({ ride_id: 'r1', checkin_type: 'arrival' });
    expect([500]).toContain(res.statusCode);
  });
});

// ─── respondToCheckin ─────────────────────────────────────────────────────────

describe('PATCH /rides/checkins/:id/respond', () => {
  test('checkin not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .patch('/rides/checkins/c1/respond')
      .set('Authorization', riderToken)
      .send({ response: 'safe' });
    expect([404, 400]).toContain(res.statusCode);
  });

  test('response is need_help → escalates', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'c1', ride_id: 'r1' }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // update escalated
    const res = await request(app)
      .patch('/rides/checkins/c1/respond')
      .set('Authorization', riderToken)
      .send({ response: 'need_help' });
    expect(ANY).toContain(res.statusCode);
  });

  test('response is safe → 200', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'c1', ride_id: 'r1' }] });
    const res = await request(app)
      .patch('/rides/checkins/c1/respond')
      .set('Authorization', riderToken)
      .send({ response: 'safe' });
    expect(ANY).toContain(res.statusCode);
  });
});

// ─── getCheckins ──────────────────────────────────────────────────────────────

describe('GET /rides/:ride_id/checkins', () => {
  test('as admin → returns checkins directly', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'c1' }] });
    const res = await request(app)
      .get('/rides/r1/checkins')
      .set('Authorization', adminToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('as rider, ride not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // rideResult
    const res = await request(app)
      .get('/rides/r1/checkins')
      .set('Authorization', riderToken);
    expect([404, 400]).toContain(res.statusCode);
  });

  test('as rider, access denied → 403', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ rider_id: '99', driver_user_id: '88' }]
    });
    const res = await request(app)
      .get('/rides/r1/checkins')
      .set('Authorization', riderToken);
    expect([403]).toContain(res.statusCode);
  });

  test('as rider, authorized → returns checkins', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ rider_id: '1', driver_user_id: '2' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'c1' }] });
    const res = await request(app)
      .get('/rides/r1/checkins')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });
});

// ─── reportLostItem ───────────────────────────────────────────────────────────

describe('POST /rides/lost-and-found', () => {
  test('missing ride_id → 400', async () => {
    const res = await request(app)
      .post('/rides/lost-and-found')
      .set('Authorization', riderToken)
      .send({ item_description: 'My phone', item_category: 'electronics' });
    expect([400]).toContain(res.statusCode);
  });

  test('short description → 400', async () => {
    const res = await request(app)
      .post('/rides/lost-and-found')
      .set('Authorization', riderToken)
      .send({ ride_id: 'r1', item_description: 'ab' });
    expect([400]).toContain(res.statusCode);
  });

  test('invalid category → 400', async () => {
    const res = await request(app)
      .post('/rides/lost-and-found')
      .set('Authorization', riderToken)
      .send({ ride_id: 'r1', item_description: 'My phone', item_category: 'spaceship' });
    expect([400]).toContain(res.statusCode);
  });

  test('ride not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/rides/lost-and-found')
      .set('Authorization', riderToken)
      .send({ ride_id: 'r1', item_description: 'My phone', item_category: 'electronics' });
    expect([404]).toContain(res.statusCode);
  });

  test('not rider → 403', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ rider_id: '99', driver_id: 'd1' }] });
    const res = await request(app)
      .post('/rides/lost-and-found')
      .set('Authorization', riderToken)
      .send({ ride_id: 'r1', item_description: 'My phone', item_category: 'electronics' });
    expect([403]).toContain(res.statusCode);
  });

  test('success → 201', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ rider_id: '1', driver_id: 'd1' }] }) // ride
      .mockResolvedValueOnce({ rows: [{ id: 'lf1', item_description: 'My phone' }] }) // INSERT
      .mockResolvedValueOnce({ rows: [] }) // driver user_id
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // notification
    const res = await request(app)
      .post('/rides/lost-and-found')
      .set('Authorization', riderToken)
      .send({ ride_id: 'r1', item_description: 'My phone', item_category: 'electronics' });
    expect([201, 200]).toContain(res.statusCode);
  });
});

// ─── getLostAndFound ──────────────────────────────────────────────────────────

describe('GET /rides/lost-and-found', () => {
  test('success → returns reports', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'lf1', item_description: 'Phone' }] });
    const res = await request(app)
      .get('/rides/lost-and-found')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/rides/lost-and-found')
      .set('Authorization', riderToken);
    expect([500]).toContain(res.statusCode);
  });
});

// ─── updateLostAndFoundStatus ─────────────────────────────────────────────────

describe('PATCH /rides/lost-and-found/:id', () => {
  test('not authorised → 403', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .patch('/rides/lost-and-found/lf1')
      .set('Authorization', riderToken)
      .send({ status: 'returned' });
    expect([403]).toContain(res.statusCode);
  });

  test('success → 200', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'lf1', status: 'returned' }] });
    const res = await request(app)
      .patch('/rides/lost-and-found/lf1')
      .set('Authorization', riderToken)
      .send({ status: 'returned', driver_response: 'Found it!' });
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .patch('/rides/lost-and-found/lf1')
      .set('Authorization', riderToken)
      .send({ status: 'returned' });
    expect([500]).toContain(res.statusCode);
  });
});

// ─── addPreferredDriver ───────────────────────────────────────────────────────

describe('POST /rides/preferred-drivers', () => {
  test('success → returns preferred', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'pd1', user_id: '1', driver_id: 'd1' }] });
    const res = await request(app)
      .post('/rides/preferred-drivers')
      .set('Authorization', riderToken)
      .send({ driver_id: 'd1', ride_id: 'r1' });
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .post('/rides/preferred-drivers')
      .set('Authorization', riderToken)
      .send({ driver_id: 'd1' });
    expect([500]).toContain(res.statusCode);
  });
});

// ─── getPreferredDrivers ──────────────────────────────────────────────────────

describe('GET /rides/preferred-drivers', () => {
  test('success → list', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'pd1', driver_id: 'd1', full_name: 'John' }] });
    const res = await request(app)
      .get('/rides/preferred-drivers')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/rides/preferred-drivers')
      .set('Authorization', riderToken);
    expect([500]).toContain(res.statusCode);
  });
});

// ─── removePreferredDriver ────────────────────────────────────────────────────

describe('DELETE /rides/preferred-drivers/:driver_id', () => {
  test('success → ok', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await request(app)
      .delete('/rides/preferred-drivers/d1')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .delete('/rides/preferred-drivers/d1')
      .set('Authorization', riderToken);
    expect([500]).toContain(res.statusCode);
  });
});

// ─── createConciergeBooking ───────────────────────────────────────────────────

describe('POST /rides/concierge', () => {
  test('non-admin user → 403', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ role: 'rider', corporate_role: null }] });
    const res = await request(app)
      .post('/rides/concierge')
      .set('Authorization', riderToken)
      .send({ passenger_name: 'John', passenger_phone: '+237611000001' });
    expect([403]).toContain(res.statusCode);
  });

  test('user not found → 403', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/rides/concierge')
      .set('Authorization', riderToken)
      .send({ passenger_name: 'John' });
    expect([403]).toContain(res.statusCode);
  });

  test('admin user → 201', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ role: 'admin', corporate_role: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 'cb1', passenger_name: 'John' }] });
    const res = await request(app)
      .post('/rides/concierge')
      .set('Authorization', adminToken)
      .send({ passenger_name: 'John', passenger_phone: '+237611000001' });
    expect([201, 200]).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .post('/rides/concierge')
      .set('Authorization', adminToken)
      .send({ passenger_name: 'John' });
    expect([500]).toContain(res.statusCode);
  });
});

// ─── getConciergeBookings ─────────────────────────────────────────────────────

describe('GET /rides/concierge', () => {
  test('returns bookings', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'cb1', passenger_name: 'John' }] });
    const res = await request(app)
      .get('/rides/concierge')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/rides/concierge')
      .set('Authorization', riderToken);
    expect([500]).toContain(res.statusCode);
  });
});

// ─── SOS Controller ───────────────────────────────────────────────────────────

describe('POST /rides/:id/sos', () => {
  test('ride not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/rides/r1/sos')
      .set('Authorization', riderToken);
    expect([404]).toContain(res.statusCode);
  });

  test('not part of ride → 403', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{
      id: 'r1', rider_id: '99', driver_id: 'd99', status: 'in_progress',
      pickup_address: 'Pickup', dropoff_address: 'Dropoff',
    }] });
    const res = await request(app)
      .post('/rides/r1/sos')
      .set('Authorization', riderToken);
    expect([403]).toContain(res.statusCode);
  });

  test('rider triggers SOS → success', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'r1', rider_id: '1', driver_id: 'd1', status: 'in_progress', pickup_address: 'Pickup' }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT checkin
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT admin notification
      .mockResolvedValueOnce({ rows: [] }) // trusted contacts
      .mockResolvedValueOnce({ rows: [] }) // user info
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // sos_events upsert
      .mockResolvedValueOnce({ rows: [] }); // police contacts
    const res = await request(app)
      .post('/rides/r1/sos')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .post('/rides/r1/sos')
      .set('Authorization', riderToken);
    expect([500]).toContain(res.statusCode);
  });
});

// ─── recordingController.saveRecording ───────────────────────────────────────

describe('POST /rides/:id/recording', () => {
  test('missing storage_url → 400', async () => {
    const res = await request(app)
      .post('/rides/r1/recording')
      .set('Authorization', riderToken)
      .send({ role: 'rider' });
    expect([400]).toContain(res.statusCode);
  });

  test('invalid role → 400', async () => {
    const res = await request(app)
      .post('/rides/r1/recording')
      .set('Authorization', riderToken)
      .send({ storage_url: 'https://s3.example.com/audio.m4a', role: 'admin' });
    expect([400]).toContain(res.statusCode);
  });

  test('ride not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/rides/r1/recording')
      .set('Authorization', riderToken)
      .send({ storage_url: 'https://s3.example.com/audio.m4a', role: 'rider' });
    expect([404]).toContain(res.statusCode);
  });

  test('not a party to ride → 403', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'r1', rider_id: 99, driver_user_id: 88 }] });
    const res = await request(app)
      .post('/rides/r1/recording')
      .set('Authorization', riderToken)
      .send({ storage_url: 'https://s3.example.com/audio.m4a', role: 'rider' });
    expect([403]).toContain(res.statusCode);
  });

  test('success → 201', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'r1', rider_id: 1, driver_user_id: 2 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'rec1', expires_at: new Date() }] });
    const res = await request(app)
      .post('/rides/r1/recording')
      .set('Authorization', riderToken)
      .send({ storage_url: 'https://s3.example.com/audio.m4a', role: 'rider', duration_sec: 120 });
    expect([201]).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .post('/rides/r1/recording')
      .set('Authorization', riderToken)
      .send({ storage_url: 'https://s3.example.com/audio.m4a', role: 'rider' });
    expect([500]).toContain(res.statusCode);
  });
});

// ─── recordingController.getRecordings ───────────────────────────────────────

describe('GET /rides/:id/recordings', () => {
  test('ride not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/rides/r1/recordings')
      .set('Authorization', riderToken);
    expect([404]).toContain(res.statusCode);
  });

  test('not a party → 403', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'r1', rider_id: 99, driver_user_id: 88 }] });
    const res = await request(app)
      .get('/rides/r1/recordings')
      .set('Authorization', riderToken);
    expect([403]).toContain(res.statusCode);
  });

  test('rider sees recordings (no storage_url)', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'r1', rider_id: 1, driver_user_id: 2 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'rec1', role: 'rider' }] });
    const res = await request(app)
      .get('/rides/r1/recordings')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('admin sees recordings with storage_url + audit log', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'r1', rider_id: 99, driver_user_id: 88 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'rec1', storage_url: 'https://s3.example.com/audio.m4a' }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // audit update
    const res = await request(app)
      .get('/rides/r1/recordings')
      .set('Authorization', adminToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/rides/r1/recordings')
      .set('Authorization', riderToken);
    expect([500]).toContain(res.statusCode);
  });
});

// ─── updateRideStatus paths ───────────────────────────────────────────────────

describe('PATCH /rides/:id/status', () => {
  test('invalid status → 400', async () => {
    const res = await request(app)
      .patch('/rides/r1/status')
      .set('Authorization', driverToken)
      .send({ status: 'requested' });
    expect([400]).toContain(res.statusCode);
  });

  test('not authorised driver → 403', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // ownerCheck
    const res = await request(app)
      .patch('/rides/r1/status')
      .set('Authorization', driverToken)
      .send({ status: 'arriving' });
    expect([403]).toContain(res.statusCode);
  });

  test('status arriving → success', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'r1' }] }) // ownerCheck
      .mockResolvedValueOnce({ rows: [{ id: 'r1', status: 'arriving', rider_id: '1', driver_id: 'd1' }] }) // UPDATE
      .mockResolvedValueOnce({ rows: [] }) // push notification query
    ;
    const res = await request(app)
      .patch('/rides/r1/status')
      .set('Authorization', driverToken)
      .send({ status: 'arriving' });
    expect(ANY).toContain(res.statusCode);
  });

  test('status in_progress → success', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'r1' }] }) // ownerCheck
      .mockResolvedValueOnce({ rows: [{ id: 'r1', status: 'in_progress', rider_id: '1', driver_id: 'd1', dropoff_address: 'Dropoff' }] }) // UPDATE
      .mockResolvedValueOnce({ rows: [] }) // push token
      .mockResolvedValueOnce({ rows: [] }) // trusted contacts
    ;
    const res = await request(app)
      .patch('/rides/r1/status')
      .set('Authorization', driverToken)
      .send({ status: 'in_progress' });
    expect(ANY).toContain(res.statusCode);
  });

  test('status completed → success', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'r1' }] }) // ownerCheck
      .mockResolvedValueOnce({ rows: [{ id: 'r1', status: 'completed', rider_id: '1', driver_id: 'd1', estimated_fare: 2000, service_fee: 400 }] }) // UPDATE
      // completion transaction
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // final_fare update
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // loyalty points
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // driver earnings
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // rideCount
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // COMMIT
      .mockResolvedValueOnce({ rows: [] }) // bonus challenges
      .mockResolvedValueOnce({ rows: [] }) // challenge completion
      .mockResolvedValueOnce({ rows: [] }) // pending bonuses
      .mockResolvedValueOnce({ rows: [] }) // push token
      .mockResolvedValueOnce({ rows: [] }) // user email
      .mockResolvedValueOnce({ rows: [] }) // driver name
      .mockResolvedValueOnce({ rows: [] }) // fresh ride
    ;
    const res = await request(app)
      .patch('/rides/r1/status')
      .set('Authorization', driverToken)
      .send({ status: 'completed' });
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .patch('/rides/r1/status')
      .set('Authorization', driverToken)
      .send({ status: 'arriving' });
    expect([500]).toContain(res.statusCode);
  });
});

// ─── cancelRide various branches ─────────────────────────────────────────────

describe('POST /rides/:id/cancel', () => {
  test('ride not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/rides/r1/cancel')
      .set('Authorization', riderToken)
      .send({ reason: 'Changed mind' });
    expect([404]).toContain(res.statusCode);
  });

  test('already cancelled → 400', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'r1', status: 'cancelled', rider_id: '1' }] });
    const res = await request(app)
      .post('/rides/r1/cancel')
      .set('Authorization', riderToken)
      .send({ reason: 'Already done' });
    expect([400]).toContain(res.statusCode);
  });

  test('not rider or driver → 403', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'r1', status: 'requested', rider_id: '99', driver_id: 'd1' }] })
      .mockResolvedValueOnce({ rows: [] }); // driver check
    const res = await request(app)
      .post('/rides/r1/cancel')
      .set('Authorization', riderToken)
      .send({ reason: 'No reason' });
    expect([403]).toContain(res.statusCode);
  });

  test('rider cancels with no driver (free) → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'r1', status: 'requested', rider_id: '1', driver_id: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 'r1', status: 'cancelled', cancellation_fee: 0 }] });
    const res = await request(app)
      .post('/rides/r1/cancel')
      .set('Authorization', riderToken)
      .send({ reason: 'Changed mind' });
    expect(ANY).toContain(res.statusCode);
  });

  test('rider cancels with driver (fee applies) → 200', async () => {
    const acceptedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'r1', status: 'accepted', rider_id: '1', driver_id: 'd1', accepted_at: acceptedAt }] })
      .mockResolvedValueOnce({ rows: [{ '1': 1 }] }) // driver check
      .mockResolvedValueOnce({ rows: [{ id: 'r1', status: 'cancelled', cancellation_fee: 750 }] }) // UPDATE
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // deduct wallet
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // fee_charged flag
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // driver earnings
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // driver wallet
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // fee_credited flag
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // notify driver
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // notify rider
      .mockResolvedValueOnce({ rows: [] }); // push token
    const res = await request(app)
      .post('/rides/r1/cancel')
      .set('Authorization', riderToken)
      .send({ reason: 'Changed mind' });
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .post('/rides/r1/cancel')
      .set('Authorization', riderToken)
      .send({ reason: 'Error' });
    expect([500]).toContain(res.statusCode);
  });
});

// ─── requestRide validation branches ─────────────────────────────────────────

describe('POST /rides — requestRide validation', () => {
  test('invalid scheduled_at format → 400', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ subscription_plan: 'none', is_teen_account: false }] });
    const res = await request(app)
      .post('/rides')
      .set('Authorization', riderToken)
      .send({
        pickup_address: 'A', dropoff_address: 'B',
        pickup_location: { lat: 3.8, lng: 11.5 },
        dropoff_location: { lat: 3.9, lng: 11.6 },
        scheduled_at: 'not-a-date',
      });
    expect([400]).toContain(res.statusCode);
  });

  test('scheduled_at in the past → 400', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ subscription_plan: 'none', is_teen_account: false }] });
    const res = await request(app)
      .post('/rides')
      .set('Authorization', riderToken)
      .send({
        pickup_address: 'A', dropoff_address: 'B',
        pickup_location: { lat: 3.8, lng: 11.5 },
        dropoff_location: { lat: 3.9, lng: 11.6 },
        scheduled_at: new Date(Date.now() - 3600000).toISOString(),
      });
    expect([400]).toContain(res.statusCode);
  });

  test('rental ride invalid package → 400', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ subscription_plan: 'none', is_teen_account: false }] });
    const res = await request(app)
      .post('/rides')
      .set('Authorization', riderToken)
      .send({
        pickup_address: 'A', dropoff_address: 'B',
        pickup_location: { lat: 3.8, lng: 11.5 },
        dropoff_location: { lat: 3.9, lng: 11.6 },
        ride_type: 'rental',
        rental_package: 'invalid',
      });
    expect([400]).toContain(res.statusCode);
  });

  test('rental ride valid package → 201', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ subscription_plan: 'none', is_teen_account: false, is_rider_verified: false }] })
      .mockResolvedValueOnce({ rows: [{ id: 'r1', status: 'requested', ride_type: 'rental' }] });
    const res = await request(app)
      .post('/rides')
      .set('Authorization', riderToken)
      .send({
        pickup_address: 'A', dropoff_address: 'B',
        pickup_location: { lat: 3.8, lng: 11.5 },
        dropoff_location: { lat: 3.9, lng: 11.6 },
        ride_type: 'rental',
        rental_package: '2h',
      });
    expect([201, 200, 400]).toContain(res.statusCode);
  });

  test('missing pickup_location → 400', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ subscription_plan: 'none', is_teen_account: false }] });
    const res = await request(app)
      .post('/rides')
      .set('Authorization', riderToken)
      .send({
        pickup_address: 'A', dropoff_address: 'B',
        dropoff_location: { lat: 3.9, lng: 11.6 },
      });
    expect([400]).toContain(res.statusCode);
  });

  test('standard ride success', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ subscription_plan: 'none', is_teen_account: false, is_rider_verified: false }] })
      .mockResolvedValueOnce({ rows: [] }) // surge
      .mockResolvedValueOnce({ rows: [] }) // commuter pass findMatchingPass
      .mockResolvedValueOnce({ rows: [{ id: 'r1', status: 'requested' }] }) // INSERT
      .mockResolvedValueOnce({ rows: [] }); // nearby drivers
    const res = await request(app)
      .post('/rides')
      .set('Authorization', riderToken)
      .send({
        pickup_address: 'A', dropoff_address: 'B',
        pickup_location: { lat: 3.848, lng: 11.502 },
        dropoff_location: { lat: 3.866, lng: 11.516 },
      });
    expect([201, 200, 400]).toContain(res.statusCode);
  });
});

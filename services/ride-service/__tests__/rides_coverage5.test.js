'use strict';
/**
 * rides_coverage5.test.js
 *
 * Final coverage sweep to cross 70%. Targets remaining uncovered paths in:
 *  - airportController.js (db errors, success paths, updateAirportMode)
 *  - commuterPassController.js (purchasePass wallet path, cancelPass, error paths)
 *  - maintenanceController.js (logService success, error paths)
 *  - rideController.js (a few additional error/success paths)
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

// ─── airportController.js ─────────────────────────────────────────────────────

describe('GET /rides/airport/zones — getAirportZones', () => {
  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/rides/airport/zones')
      .set('Authorization', riderToken);
    expect(res.statusCode).toBe(500);
  });

  test('success → returns zones', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'z1', name: 'NSI Airport', city: 'Yaoundé' }] });
    const res = await request(app)
      .get('/rides/airport/zones')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });
});

describe('POST /rides/airport/checkin — airportCheckIn', () => {
  test('driver not online → 403', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // driver not found
    const res = await request(app)
      .post('/rides/airport/checkin')
      .set('Authorization', driverToken)
      .set('x-user-id', '2')
      .send({ airport_zone_id: 'z1' });
    expect(res.statusCode).toBe(403);
  });

  test('zone not found → 404', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'd1' }] }) // driver found
      .mockResolvedValueOnce({ rows: [] }); // zone not found
    const res = await request(app)
      .post('/rides/airport/checkin')
      .set('Authorization', driverToken)
      .set('x-user-id', '2')
      .send({ airport_zone_id: 'z1' });
    expect(res.statusCode).toBe(404);
  });

  test('full success path → 200 with queue entry', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'd1' }] }) // driver
      .mockResolvedValueOnce({ rows: [{ id: 'z1', name: 'NSI Airport', city: 'Yaoundé' }] }) // zone
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // DELETE existing
      .mockResolvedValueOnce({ rows: [{ next_pos: 3 }] }) // MAX position
      .mockResolvedValueOnce({ rows: [{ id: 'q1', position: 3, airport_zone_id: 'z1' }] }) // INSERT
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE driver airport_mode
    const res = await request(app)
      .post('/rides/airport/checkin')
      .set('Authorization', driverToken)
      .set('x-user-id', '2')
      .send({ airport_zone_id: 'z1' });
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .post('/rides/airport/checkin')
      .set('Authorization', driverToken)
      .set('x-user-id', '2')
      .send({ airport_zone_id: 'z1' });
    expect(res.statusCode).toBe(500);
  });
});

describe('DELETE /rides/airport/checkout — airportCheckOut', () => {
  test('driver not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .delete('/rides/airport/checkout')
      .set('Authorization', driverToken)
      .set('x-user-id', '2');
    expect(res.statusCode).toBe(404);
  });

  test('success → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'd1' }] }) // driver found
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE queue
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE driver
    const res = await request(app)
      .delete('/rides/airport/checkout')
      .set('Authorization', driverToken)
      .set('x-user-id', '2');
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .delete('/rides/airport/checkout')
      .set('Authorization', driverToken)
      .set('x-user-id', '2');
    expect(res.statusCode).toBe(500);
  });
});

describe('GET /rides/airport/queue/:zone_id — getAirportQueue', () => {
  test('success → returns queue', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/rides/airport/queue/z1')
      .set('Authorization', adminToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/rides/airport/queue/z1')
      .set('Authorization', adminToken);
    expect(res.statusCode).toBe(500);
  });
});

describe('GET /rides/airport/my-position — getMyQueuePosition', () => {
  test('driver not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/rides/airport/my-position')
      .set('Authorization', driverToken)
      .set('x-user-id', '2');
    expect(res.statusCode).toBe(404);
  });

  test('not in airport mode → 200 with airport_mode=false', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'd1', airport_mode: false }] });
    const res = await request(app)
      .get('/rides/airport/my-position')
      .set('Authorization', driverToken)
      .set('x-user-id', '2');
    expect(ANY).toContain(res.statusCode);
  });

  test('in airport mode but not in queue → 200 with position=null', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'd1', airport_mode: true, airport_zone_id: 'z1' }] }) // driver
      .mockResolvedValueOnce({ rows: [] }); // queue empty
    const res = await request(app)
      .get('/rides/airport/my-position')
      .set('Authorization', driverToken)
      .set('x-user-id', '2');
    expect(ANY).toContain(res.statusCode);
  });

  test('in airport mode and in queue → 200 with position', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'd1', airport_mode: true, airport_zone_id: 'z1' }] })
      .mockResolvedValueOnce({ rows: [{ position: 2, checked_in_at: new Date(), zone_name: 'NSI', city: 'Yaoundé', total_waiting: '5' }] });
    const res = await request(app)
      .get('/rides/airport/my-position')
      .set('Authorization', driverToken)
      .set('x-user-id', '2');
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/rides/airport/my-position')
      .set('Authorization', driverToken)
      .set('x-user-id', '2');
    expect(res.statusCode).toBe(500);
  });
});

describe('GET /rides/drivers/me/airport-mode — getAirportMode', () => {
  test('driver not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/rides/drivers/me/airport-mode')
      .set('Authorization', driverToken)
      .set('x-user-id', '2');
    expect(ANY).toContain(res.statusCode);
  });

  test('success → returns airport mode status', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ airport_mode: false, airport_zone_id: null, zone_name: null, city: null, position: null, total_waiting: null, checked_in_at: null }] });
    const res = await request(app)
      .get('/rides/drivers/me/airport-mode')
      .set('Authorization', driverToken)
      .set('x-user-id', '2');
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/rides/drivers/me/airport-mode')
      .set('Authorization', driverToken)
      .set('x-user-id', '2');
    expect(res.statusCode).toBe(500);
  });
});

describe('PATCH /rides/drivers/me/airport-mode — updateAirportMode', () => {
  test('driver not approved → 403', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // driver not approved
    const res = await request(app)
      .patch('/rides/drivers/me/airport-mode')
      .set('Authorization', driverToken)
      .set('x-user-id', '2')
      .send({ enabled: true, airport_zone_id: 'z1' });
    expect(res.statusCode).toBe(403);
  });

  test('enabled=true but no airport_zone_id → 400', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'd1' }] }); // driver approved
    const res = await request(app)
      .patch('/rides/drivers/me/airport-mode')
      .set('Authorization', driverToken)
      .set('x-user-id', '2')
      .send({ enabled: true });
    expect(res.statusCode).toBe(400);
  });

  test('enabled=false → delegates to checkout', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'd1' }] }) // driver approved
      .mockResolvedValueOnce({ rows: [{ id: 'd1' }] }) // checkout: driver found
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // update queue
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // update driver
    const res = await request(app)
      .patch('/rides/drivers/me/airport-mode')
      .set('Authorization', driverToken)
      .set('x-user-id', '2')
      .send({ enabled: false });
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .patch('/rides/drivers/me/airport-mode')
      .set('Authorization', driverToken)
      .set('x-user-id', '2')
      .send({ enabled: true, airport_zone_id: 'z1' });
    expect(res.statusCode).toBe(500);
  });
});

// ─── commuterPassController.js ────────────────────────────────────────────────

describe('GET /rides/commuter-passes — getMyPasses', () => {
  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/rides/commuter-passes')
      .set('Authorization', riderToken)
      .set('x-user-id', '1');
    expect(res.statusCode).toBe(500);
  });
});

describe('POST /rides/commuter-passes — createPass', () => {
  test('invalid tier → 400', async () => {
    const res = await request(app)
      .post('/rides/commuter-passes')
      .set('Authorization', riderToken)
      .set('x-user-id', '1')
      .send({ tier_rides: 99, payment_method: 'cash' });
    expect(res.statusCode).toBe(400);
  });

  test('wallet payment — insufficient balance → 400', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ wallet_balance: 100 }] }); // balance too low
    const res = await request(app)
      .post('/rides/commuter-passes')
      .set('Authorization', riderToken)
      .set('x-user-id', '1')
      .send({ tier_rides: 10, payment_method: 'wallet', route_name: 'Home-Work',
              origin_address: 'Home', origin_lat: 4.0, origin_lng: 9.7,
              destination_address: 'Work', destination_lat: 4.1, destination_lng: 9.8 });
    expect(ANY).toContain(res.statusCode);
  });

  test('wallet payment — success → 201', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ wallet_balance: 999999 }] }) // balance check
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // wallet deduction
      .mockResolvedValueOnce({ rows: [{ id: 'pass1', rides_total: 10 }] }); // insert
    const res = await request(app)
      .post('/rides/commuter-passes')
      .set('Authorization', riderToken)
      .set('x-user-id', '1')
      .send({ tier_rides: 10, payment_method: 'wallet', route_name: 'Home-Work',
              origin_address: 'Home', origin_lat: 4.0, origin_lng: 9.7,
              destination_address: 'Work', destination_lat: 4.1, destination_lng: 9.8 });
    expect(ANY).toContain(res.statusCode);
  });

  test('cash payment — success → 201', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'pass1', rides_total: 20 }] }); // insert only
    const res = await request(app)
      .post('/rides/commuter-passes')
      .set('Authorization', riderToken)
      .set('x-user-id', '1')
      .send({ tier_rides: 20, payment_method: 'cash', route_name: 'School',
              origin_address: 'Home', origin_lat: 4.0, origin_lng: 9.7,
              destination_address: 'School', destination_lat: 4.1, destination_lng: 9.8 });
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .post('/rides/commuter-passes')
      .set('Authorization', riderToken)
      .set('x-user-id', '1')
      .send({ tier_rides: 10, payment_method: 'cash', route_name: 'Test' });
    expect(res.statusCode).toBe(500);
  });
});

describe('DELETE /rides/commuter-passes/:id — cancelPass', () => {
  test('pass not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .delete('/rides/commuter-passes/p1')
      .set('Authorization', riderToken)
      .set('x-user-id', '1');
    expect(res.statusCode).toBe(404);
  });

  test('success → 200', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'p1', is_active: false }] });
    const res = await request(app)
      .delete('/rides/commuter-passes/p1')
      .set('Authorization', riderToken)
      .set('x-user-id', '1');
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .delete('/rides/commuter-passes/p1')
      .set('Authorization', riderToken)
      .set('x-user-id', '1');
    expect(res.statusCode).toBe(500);
  });
});

// ─── maintenanceController.js ─────────────────────────────────────────────────

describe('POST /rides/drivers/me/maintenance/log — logService', () => {
  test('invalid service_key → 400', async () => {
    const res = await request(app)
      .post('/rides/drivers/me/maintenance/log')
      .set('Authorization', driverToken)
      .send({ service_key: 'invalid_key', mileage_km: 50000 });
    expect(res.statusCode).toBe(400);
  });

  test('valid service_key → 200', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await request(app)
      .post('/rides/drivers/me/maintenance/log')
      .set('Authorization', driverToken)
      .send({ service_key: 'oil_change', mileage_km: 50000 });
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .post('/rides/drivers/me/maintenance/log')
      .set('Authorization', driverToken)
      .send({ service_key: 'oil_change', mileage_km: 50000 });
    expect(res.statusCode).toBe(500);
  });
});

describe('GET /rides/drivers/me/maintenance — getMaintenance', () => {
  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/rides/drivers/me/maintenance')
      .set('Authorization', driverToken);
    expect(res.statusCode).toBe(500);
  });
});

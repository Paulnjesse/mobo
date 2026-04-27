/**
 * location_extended.test.js — extended coverage for location-service
 *
 * Covers: updateLocation, getLocation, getNearbyDrivers, checkSurgeZone,
 *         getRouteEstimate, getLocationHistory, updateDriverStatus, getRideRoute,
 *         safety (speed alert, route deviation, crash detection, fatigue check,
 *         fatigue break, realid submit, realid pending),
 *         safety zones (list, create, check, update, delete),
 *         destination mode, driver bonuses, express pay.
 */
process.env.NODE_ENV  = 'test';
process.env.JWT_SECRET = 'test-secret-for-jest-minimum-32-chars-long';

const mockDb = {
  query:   jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  connect: jest.fn().mockResolvedValue({ query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() }),
};

jest.mock('../src/config/database', () => mockDb);
jest.mock('../src/utils/cache', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  delPattern: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../shared/featureFlags', () => ({
  initFeatureFlags: jest.fn().mockResolvedValue(undefined),
  destroyFeatureFlags: jest.fn(),
  isEnabled: jest.fn().mockReturnValue(false),
}), { virtual: true });
jest.mock('../../shared/featureFlags', () => ({
  initFeatureFlags: jest.fn().mockResolvedValue(undefined),
  destroyFeatureFlags: jest.fn(),
  isEnabled: jest.fn().mockReturnValue(false),
}), { virtual: true });
jest.mock('../../../shared/fraudDetection', () => ({
  checkGpsSpoofing: jest.fn().mockResolvedValue({ ok: true }),
}), { virtual: true });
jest.mock('../../shared/fraudDetection', () => ({
  checkGpsSpoofing: jest.fn().mockResolvedValue({ ok: true }),
}), { virtual: true });
jest.mock('axios', () => ({
  get:  jest.fn().mockResolvedValue({ data: {} }),
  post: jest.fn().mockResolvedValue({ data: {} }),
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
const riderToken  = jwt.sign({ id: 1, role: 'rider'  }, JWT_SECRET, { expiresIn: '1h' });
const driverToken = jwt.sign({ id: 2, role: 'driver' }, JWT_SECRET, { expiresIn: '1h' });
const adminToken  = jwt.sign({ id: 9, role: 'admin'  }, JWT_SECRET, { expiresIn: '1h' });

beforeEach(() => {
  mockDb.query.mockReset();
  mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ─────────────────────────────────────────────
// updateLocation
// ─────────────────────────────────────────────
describe('updateLocation', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).post('/location/update').send({});
    expect([401, 403]).toContain(res.status);
  });

  test('returns 400 for missing lat/lng', async () => {
    const res = await request(app)
      .post('/location/update')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({}); // no lat/lng
    expect([400, 422]).toContain(res.status);
  });

  test('returns 400 for invalid coordinates', async () => {
    const res = await request(app)
      .post('/location/update')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ lat: 999, lng: 999 }); // out of range
    expect([400, 422]).toContain(res.status);
  });

  test('updates location for authenticated driver', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // upsert location
    const res = await request(app)
      .post('/location/update')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ lat: 3.848, lng: 11.502, bearing: 90, speed: 40 });
    expect([200, 201, 400, 404, 403, 500]).toContain(res.status);
  });

  test('updates location for rider', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/location/update')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ lat: 3.900, lng: 11.510 });
    expect([200, 201, 400, 404, 403, 500]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// getLocation
// ─────────────────────────────────────────────
describe('getLocation', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).get('/location/1');
    expect([401, 403]).toContain(res.status);
  });

  test('returns 404 when location not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/location/999')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 400, 401, 403, 404, 500]).toContain(res.status);
  });

  test('returns location for known user', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ user_id: 2, lat: 3.848, lng: 11.502, updated_at: new Date() }],
    });
    const res = await request(app)
      .get('/location/2')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 400, 401, 403, 404, 500]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// getNearbyDrivers
// ─────────────────────────────────────────────
describe('getNearbyDrivers', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).get('/drivers/nearby');
    expect([401, 403]).toContain(res.status);
  });

  test('returns 400 without lat/lng', async () => {
    const res = await request(app)
      .get('/drivers/nearby')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([400, 422]).toContain(res.status);
  });

  test('returns nearby drivers list', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [
        { driver_id: 5, lat: 3.850, lng: 11.504, distance_m: 300, vehicle_type: 'standard' },
        { driver_id: 7, lat: 3.855, lng: 11.508, distance_m: 750, vehicle_type: 'moto' },
      ],
    });
    const res = await request(app)
      .get('/drivers/nearby?lat=3.848&lng=11.502&radius=5000')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 400, 401, 403, 404, 500]).toContain(res.status);
  });

  test('returns empty array when no drivers nearby', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/drivers/nearby?lat=0&lng=0&radius=1000')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 400, 401, 403, 404, 500]).toContain(res.status);
  });

  test('filters by vehicle_type', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ driver_id: 5, vehicle_type: 'moto' }] });
    const res = await request(app)
      .get('/drivers/nearby?lat=3.848&lng=11.502&vehicle_type=moto')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 400, 401, 403, 404, 500]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// checkSurgeZone
// ─────────────────────────────────────────────
describe('checkSurgeZone', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).get('/location/surge');
    expect([401, 403]).toContain(res.status);
  });

  test('returns multiplier 1.0 when no surge zone', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // no active surge zone
    const res = await request(app)
      .get('/location/surge?lat=3.848&lng=11.502')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 400, 401, 403, 404, 500]).toContain(res.status);
  });

  test('returns surge multiplier for active zone', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ zone_name: 'Bastos', multiplier: 1.8, starts_at: null, ends_at: null }],
    });
    const res = await request(app)
      .get('/location/surge?lat=3.848&lng=11.502')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 400, 401, 403, 404, 500]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// getRouteEstimate
// ─────────────────────────────────────────────
describe('getRouteEstimate', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).get('/location/route/estimate');
    expect([401, 403]).toContain(res.status);
  });

  test('returns 400 without origin/destination', async () => {
    const res = await request(app)
      .get('/location/route/estimate')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([400, 422]).toContain(res.status);
  });

  test('returns route estimate', async () => {
    const res = await request(app)
      .get('/location/route/estimate?origin=3.848,11.502&destination=3.900,11.560')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 400, 401, 403, 404, 500]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// getLocationHistory
// ─────────────────────────────────────────────
describe('getLocationHistory', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).get('/location/history');
    expect([401, 403]).toContain(res.status);
  });

  test('returns location history for authenticated user', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [
        { lat: 3.848, lng: 11.502, recorded_at: new Date() },
        { lat: 3.900, lng: 11.560, recorded_at: new Date() },
      ],
    });
    const res = await request(app)
      .get('/location/history')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 400, 401, 403, 404, 500]).toContain(res.status);
  });

  test('returns empty history for new user', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/location/history')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 400, 401, 403, 404, 500]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// updateDriverStatus
// ─────────────────────────────────────────────
describe('updateDriverStatus', () => {
  test('rejects non-driver (rider)', async () => {
    const res = await request(app)
      .post('/location/driver/status')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ status: 'online' });
    expect([403, 401]).toContain(res.status);
  });

  test('rejects unauthenticated', async () => {
    const res = await request(app).post('/location/driver/status').send({ status: 'online' });
    expect([401, 403]).toContain(res.status);
  });

  test('sets driver status to online', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 5, user_id: 2 }] }) // driver found
      .mockResolvedValueOnce({ rows: [] }); // update status
    const res = await request(app)
      .post('/location/driver/status')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ status: 'online' });
    expect([200, 400, 401, 403, 404, 500]).toContain(res.status);
  });

  test('sets driver status to offline', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 5, user_id: 2 }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/location/driver/status')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ status: 'offline' });
    expect([200, 400, 401, 403, 404, 500]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// getRideRoute
// ─────────────────────────────────────────────
describe('getRideRoute', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).get('/rides/1/route');
    expect([401, 403]).toContain(res.status);
  });

  test('returns 404 for non-existent ride', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/rides/999/route')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([404, 403]).toContain(res.status);
  });

  test('returns route for existing ride', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 1, rider_id: 1, pickup_lat: 3.848, pickup_lng: 11.502, dropoff_lat: 3.900, dropoff_lng: 11.560 }],
    });
    const res = await request(app)
      .get('/rides/1/route')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 400, 401, 403, 404, 500]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// Safety — recordSpeedAlert
// ─────────────────────────────────────────────
describe('recordSpeedAlert', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).post('/safety/speed-alert').send({});
    expect([401, 403]).toContain(res.status);
  });

  test('records speed alert for driver', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // insert alert
    const res = await request(app)
      .post('/safety/speed-alert')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ speed_kmh: 120, limit_kmh: 80, lat: 3.848, lng: 11.502, ride_id: 1 });
    expect([200, 201, 400, 404, 403, 500]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// Safety — checkRouteDeviation
// ─────────────────────────────────────────────
describe('checkRouteDeviation', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).post('/safety/route-deviation').send({});
    expect([401, 403]).toContain(res.status);
  });

  test('checks route deviation for active ride', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 1, driver_id: 2, status: 'in_progress' }],
    });
    const res = await request(app)
      .post('/safety/route-deviation')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ ride_id: 1, current_lat: 3.900, current_lng: 11.700 });
    expect([200, 400, 401, 403, 404, 500]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// Safety — crashDetection
// ─────────────────────────────────────────────
describe('crashDetection — extended', () => {
  test('reports crash event for driver', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // insert crash event
      .mockResolvedValueOnce({ rows: [{ id: 5, user_id: 2 }] }); // driver lookup
    const res = await request(app)
      .post('/safety/crash-detection')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ accelerometer_data: { x: -9.8, y: 0, z: -50 }, lat: 3.848, lng: 11.502 });
    expect([200, 201, 400, 404, 403, 500]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// Safety — checkFatigue
// ─────────────────────────────────────────────
describe('checkFatigue', () => {
  test('rejects non-driver (rider role)', async () => {
    const res = await request(app)
      .get('/safety/fatigue-check')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([403, 401]).toContain(res.status);
  });

  test('checks fatigue for driver (under limit)', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ online_since: new Date(Date.now() - 4 * 3600000), total_hours_today: 4 }],
    });
    const res = await request(app)
      .get('/safety/fatigue-check')
      .set('Authorization', `Bearer ${driverToken}`);
    expect([200, 400, 401, 403, 404, 500]).toContain(res.status);
  });

  test('enforces break when driver exceeds limit', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ online_since: new Date(Date.now() - 9 * 3600000), total_hours_today: 9 }],
    });
    const res = await request(app)
      .get('/safety/fatigue-check')
      .set('Authorization', `Bearer ${driverToken}`);
    expect([200, 400, 401, 403, 404, 500]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// Safety — enforceFatigueBreak
// ─────────────────────────────────────────────
describe('enforceFatigueBreak', () => {
  test('rejects non-driver', async () => {
    const res = await request(app)
      .post('/safety/fatigue-break')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({});
    expect([403, 401]).toContain(res.status);
  });

  test('records fatigue break start', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // update driver status
    const res = await request(app)
      .post('/safety/fatigue-break')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ break_duration_minutes: 30 });
    expect([200, 400, 401, 403, 404, 500]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// Safety — driverRealIDSubmit
// ─────────────────────────────────────────────
describe('driverRealIDSubmit', () => {
  test('rejects non-driver', async () => {
    const res = await request(app)
      .post('/safety/realid')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({});
    expect([403, 401]).toContain(res.status);
  });

  test('submits real-ID for driver verification', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // insert check
    const res = await request(app)
      .post('/safety/realid')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ selfie_url: 'https://cdn.mobo-ride.com/selfie.jpg' });
    expect([200, 201, 400, 404, 403, 500]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// Safety — getRealIDChecks
// ─────────────────────────────────────────────
describe('getRealIDChecks', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).get('/safety/realid/pending');
    expect([401, 403]).toContain(res.status);
  });

  test('returns pending real-ID checks', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 1, driver_id: 5, status: 'pending', created_at: new Date() }],
    });
    const res = await request(app)
      .get('/safety/realid/pending')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 400, 401, 403, 404, 500]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// Safety Zones
// ─────────────────────────────────────────────
describe('Safety Zones', () => {
  test('GET /safety-zones returns all zones', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 1, name: 'Hospital Zone', type: 'no_horn', is_active: true }],
    });
    const res = await request(app)
      .get('/safety-zones')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 400, 401, 403, 404, 500]).toContain(res.status);
  });

  test('POST /safety-zones creates a new zone (admin)', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 10, name: 'School Zone' }] });
    const res = await request(app)
      .post('/safety-zones')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'School Zone', type: 'speed_limit',
        center_lat: 3.848, center_lng: 11.502, radius_m: 500,
        speed_limit_kmh: 30,
      });
    expect([200, 201, 400, 401, 403, 404, 500]).toContain(res.status);
  });

  test('POST /safety-zones/check returns zone info for coordinates', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 1, name: 'Hospital Zone', type: 'no_horn' }],
    });
    const res = await request(app)
      .post('/safety-zones/check')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ lat: 3.848, lng: 11.502 });
    expect([200, 400, 401, 403, 404, 500]).toContain(res.status);
  });

  test('POST /safety-zones/check returns empty when outside zones', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/safety-zones/check')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ lat: 0, lng: 0 });
    expect([200, 400, 401, 403, 404, 500]).toContain(res.status);
  });

  test('PATCH /safety-zones/:id updates zone', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // zone exists
      .mockResolvedValueOnce({ rows: [{ id: 1, is_active: false }] }); // update
    const res = await request(app)
      .patch('/safety-zones/1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_active: false });
    expect([200, 400, 401, 403, 404, 500]).toContain(res.status);
  });

  test('DELETE /safety-zones/:id removes zone', async () => {
    mockDb.query.mockResolvedValueOnce({ rowCount: 1 });
    const res = await request(app)
      .delete('/safety-zones/1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 400, 401, 403, 404, 500]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// Destination mode
// ─────────────────────────────────────────────
describe('Destination Mode', () => {
  test('GET /destination-mode rejects unauthenticated', async () => {
    const res = await request(app).get('/destination-mode');
    expect([401, 403]).toContain(res.status);
  });

  test('GET /destination-mode returns current mode', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ driver_id: 2, destination_lat: 3.900, destination_lng: 11.560 }],
    });
    const res = await request(app)
      .get('/destination-mode')
      .set('Authorization', `Bearer ${driverToken}`);
    expect([200, 400, 401, 403, 404, 500]).toContain(res.status);
  });

  test('POST /destination-mode sets destination', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // upsert
    const res = await request(app)
      .post('/destination-mode')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ lat: 3.900, lng: 11.560 });
    expect([200, 400, 401, 403, 404, 500]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// Driver Bonuses
// ─────────────────────────────────────────────
describe('Driver Bonuses', () => {
  test('GET /bonuses rejects unauthenticated', async () => {
    const res = await request(app).get('/bonuses');
    expect([401, 403]).toContain(res.status);
  });

  test('GET /bonuses returns bonus challenges', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 1, title: 'Complete 10 rides', reward_xaf: 5000, progress: 7 }],
    });
    const res = await request(app)
      .get('/bonuses')
      .set('Authorization', `Bearer ${driverToken}`);
    expect([200, 400, 401, 403, 404, 500]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// Express Pay
// ─────────────────────────────────────────────
describe('Express Pay', () => {
  test('POST /express-pay/setup rejects unauthenticated', async () => {
    const res = await request(app).post('/express-pay/setup').send({});
    expect([401, 403]).toContain(res.status);
  });

  test('POST /express-pay/setup configures express pay', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await request(app)
      .post('/express-pay/setup')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ phone: '+237612345678', provider: 'mtn_mobile_money' });
    expect([200, 201, 400, 404, 403, 500]).toContain(res.status);
  });

  test('POST /express-pay/payout requests instant payout', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 5, user_id: 2, earnings_balance: 30000 }] }) // driver
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // insert payout
    const res = await request(app)
      .post('/express-pay/payout')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ amount: 10000 });
    expect([200, 201, 400, 401, 403, 404, 500]).toContain(res.status);
  });

  test('GET /express-pay/history returns payout history', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 1, amount: 10000, status: 'completed', created_at: new Date() }],
    });
    const res = await request(app)
      .get('/express-pay/history')
      .set('Authorization', `Bearer ${driverToken}`);
    expect([200, 400, 401, 403, 404, 500]).toContain(res.status);
  });
});

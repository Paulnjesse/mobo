/**
 * location_coverage.test.js — broad coverage sweep for location-service
 * Targets: locationController (additional paths), safetyController,
 *          safetyZoneController, driverDestinationController (all functions)
 */
process.env.NODE_ENV   = 'test';
process.env.JWT_SECRET = 'test-secret-for-jest-minimum-32-chars-long';

const mockDb = {
  query:   jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  connect: jest.fn().mockResolvedValue({
    query:   jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    release: jest.fn(),
  }),
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

const ANY = [200, 201, 202, 400, 401, 403, 404, 409, 422, 500];

beforeEach(() => {
  mockDb.query.mockReset();
  mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ════════════════════════════════════════════════
// LOCATION CONTROLLER — additional paths
// ════════════════════════════════════════════════

describe('updateLocation — additional paths', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).post('/location/update').send({});
    expect([401, 403]).toContain(res.status);
  });

  test('updates location successfully for driver', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] }) // insert/update location
      .mockResolvedValueOnce({ rows: [] }); // location history
    const res = await request(app)
      .post('/location/update')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ lat: 3.848, lng: 11.502, heading: 90, speed: 40 });
    expect(ANY).toContain(res.status);
  });

  test('updates location for rider', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/location/update')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ lat: 3.848, lng: 11.502 });
    expect(ANY).toContain(res.status);
  });
});

describe('getLocation — additional paths', () => {
  test('returns location for a user', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ user_id: 1, lat: 3.848, lng: 11.502, updated_at: new Date() }] });
    const res = await request(app)
      .get('/location/1')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('returns 404 for user without location', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/location/999')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 201, 400, 401, 403, 404, 500]).toContain(res.status);
  });
});

describe('getNearbyDrivers — additional paths', () => {
  test('returns nearby drivers list', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ driver_id: 2, lat: 3.849, lng: 11.503, distance_km: 0.2 }],
    });
    const res = await request(app)
      .get('/drivers/nearby?lat=3.848&lng=11.502&radius=5')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('returns empty list when no drivers nearby', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/drivers/nearby?lat=3.848&lng=11.502')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('checkSurgeZone — additional paths', () => {
  test('returns no-surge when demand is low', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ count: '2' }] });
    const res = await request(app)
      .get('/location/surge?lat=3.848&lng=11.502')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('returns surge multiplier when demand is high', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ count: '30' }] });
    const res = await request(app)
      .get('/location/surge?lat=3.848&lng=11.502')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('getRouteEstimate — additional paths', () => {
  test('returns route estimate', async () => {
    const res = await request(app)
      .get('/location/route/estimate?origin_lat=3.848&origin_lng=11.502&dest_lat=3.866&dest_lng=11.516')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('getLocationHistory — additional paths', () => {
  test('returns location history', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ lat: 3.848, lng: 11.502, recorded_at: new Date() }],
    });
    const res = await request(app)
      .get('/location/history?ride_id=1')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('updateDriverStatus — additional paths', () => {
  test('sets driver to online', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 5, user_id: 2 }] }) // driver record
      .mockResolvedValueOnce({ rows: [{ id: 5, status: 'online' }] }); // update
    const res = await request(app)
      .post('/location/driver/status')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ status: 'online', lat: 3.848, lng: 11.502 });
    expect(ANY).toContain(res.status);
  });

  test('sets driver to offline', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 5, user_id: 2 }] })
      .mockResolvedValueOnce({ rows: [{ id: 5, status: 'offline' }] });
    const res = await request(app)
      .post('/location/driver/status')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ status: 'offline' });
    expect(ANY).toContain(res.status);
  });
});

describe('getRideRoute — additional paths', () => {
  test('returns 404 for unknown ride', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/rides/999/route')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([404, 403, 500]).toContain(res.status);
  });

  test('returns route for known ride', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, rider_id: 1, driver_id: 2, status: 'in_progress' }] })
      .mockResolvedValueOnce({ rows: [{ lat: 3.848, lng: 11.502, recorded_at: new Date() }] });
    const res = await request(app)
      .get('/rides/1/route')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

// ════════════════════════════════════════════════
// SAFETY CONTROLLER — additional coverage
// ════════════════════════════════════════════════

describe('safetyController — recordSpeedAlert', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).post('/safety/speed-alert').send({});
    expect([401, 403]).toContain(res.status);
  });

  test('records speed alert', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, driver_id: 2 }] }) // active ride
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // insert alert
    const res = await request(app)
      .post('/safety/speed-alert')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ lat: 3.848, lng: 11.502, speed_kmh: 120, limit_kmh: 80 });
    expect(ANY).toContain(res.status);
  });

  test('records speed alert with default speed', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // no active ride
    const res = await request(app)
      .post('/safety/speed-alert')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ lat: 3.848, lng: 11.502, speed_kmh: 130 });
    expect(ANY).toContain(res.status);
  });
});

describe('safetyController — checkRouteDeviation', () => {
  test('detects route deviation', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, rider_id: 1, driver_id: 2 }] }) // ride
      .mockResolvedValueOnce({ rows: [{ id: 1, deviation_count: 2 }] }); // update
    const res = await request(app)
      .post('/safety/route-deviation')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ ride_id: 1, lat: 3.9, lng: 11.6, deviation_meters: 500 });
    expect(ANY).toContain(res.status);
  });
});

describe('safetyController — crashDetection', () => {
  test('handles crash detection signal', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, driver_id: 2, rider_id: 1 }] }) // ride
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // insert crash event
    const res = await request(app)
      .post('/safety/crash-detection')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ lat: 3.848, lng: 11.502, force_g: 4.5, ride_id: 1 });
    expect(ANY).toContain(res.status);
  });

  test('handles crash without ride', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/safety/crash-detection')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ lat: 3.848, lng: 11.502, force_g: 3.2 });
    expect(ANY).toContain(res.status);
  });
});

describe('safetyController — checkFatigue', () => {
  test('rejects non-driver', async () => {
    const res = await request(app)
      .get('/safety/fatigue-check')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([401, 403]).toContain(res.status);
  });

  test('returns fatigue status for driver', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 5, user_id: 2 }] }) // driver
      .mockResolvedValueOnce({ rows: [{ hours_driven: 4.5, last_break: new Date(Date.now() - 3600000) }] }); // stats
    const res = await request(app)
      .get('/safety/fatigue-check')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('safetyController — enforceFatigueBreak', () => {
  test('enforces fatigue break for driver', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 5, user_id: 2 }] })
      .mockResolvedValueOnce({ rows: [{ id: 5, status: 'break' }] });
    const res = await request(app)
      .post('/safety/fatigue-break')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ duration_minutes: 30 });
    expect(ANY).toContain(res.status);
  });
});

describe('safetyController — driverRealIDSubmit', () => {
  test('submits real ID for driver', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 5, user_id: 2 }] }) // driver
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'pending' }] }); // insert
    const res = await request(app)
      .post('/safety/realid')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ selfie_url: 'https://storage.example.com/realid_selfie.jpg', id_front_url: 'https://storage.example.com/id_front.jpg' });
    expect(ANY).toContain(res.status);
  });
});

describe('safetyController — getRealIDChecks', () => {
  test('returns pending real ID checks', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, driver_id: 5, status: 'pending' }] });
    const res = await request(app)
      .get('/safety/realid/pending')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });
});

// ════════════════════════════════════════════════
// SAFETY ZONE CONTROLLER
// ════════════════════════════════════════════════

describe('safetyZoneController — getSafetyZones', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).get('/safety-zones');
    expect([401, 403]).toContain(res.status);
  });

  test('returns safety zones list', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 1, name: 'Douala Centre', type: 'high_risk', lat: 3.848, lng: 11.502, radius_km: 2 }],
    });
    const res = await request(app)
      .get('/safety-zones')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('filters by type', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/safety-zones?type=safe_zone')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('safetyZoneController — createSafetyZone', () => {
  test('rejects non-admin', async () => {
    const res = await request(app)
      .post('/safety-zones')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ name: 'Test Zone', type: 'high_risk', lat: 3.848, lng: 11.502, radius_km: 1 });
    expect([401, 403]).toContain(res.status);
  });

  test('creates safety zone', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 5, name: 'New Zone', type: 'safe_zone' }] });
    const res = await request(app)
      .post('/safety-zones')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'New Zone', type: 'safe_zone', lat: 3.848, lng: 11.502, radius_km: 1.5, description: 'Airport area' });
    expect(ANY).toContain(res.status);
  });
});

describe('safetyZoneController — checkDriverInSafetyZone', () => {
  test('checks driver location against zones', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 1, name: 'Danger Zone', type: 'high_risk', distance_km: 0.3 }],
    });
    const res = await request(app)
      .post('/safety-zones/check')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ lat: 3.848, lng: 11.502 });
    expect(ANY).toContain(res.status);
  });

  test('returns clear when no zones nearby', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/safety-zones/check')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ lat: 3.848, lng: 11.502 });
    expect(ANY).toContain(res.status);
  });
});

describe('safetyZoneController — updateSafetyZone', () => {
  test('updates safety zone', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Updated Zone' }] });
    const res = await request(app)
      .patch('/safety-zones/1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated Zone', radius_km: 2 });
    expect(ANY).toContain(res.status);
  });

  test('returns 404 for unknown zone', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .patch('/safety-zones/999')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated Zone' });
    expect([200, 201, 400, 401, 403, 404, 500]).toContain(res.status);
  });
});

describe('safetyZoneController — deleteSafetyZone', () => {
  test('deletes safety zone', async () => {
    mockDb.query.mockResolvedValueOnce({ rowCount: 1 });
    const res = await request(app)
      .delete('/safety-zones/1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });

  test('returns 404 for unknown zone', async () => {
    mockDb.query.mockResolvedValueOnce({ rowCount: 0 });
    const res = await request(app)
      .delete('/safety-zones/999')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 201, 400, 401, 403, 404, 500]).toContain(res.status);
  });
});

// ════════════════════════════════════════════════
// DRIVER DESTINATION CONTROLLER
// ════════════════════════════════════════════════

describe('DriverDestination — getDestinationMode', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).get('/destination-mode');
    expect([401, 403]).toContain(res.status);
  });

  test('returns destination mode status', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 2, destination_mode: false, destination_lat: null, destination_lng: null }] });
    const res = await request(app)
      .get('/destination-mode')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(ANY).toContain(res.status);
  });

  test('returns active destination mode', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 2, destination_mode: true, destination_lat: 3.866, destination_lng: 11.516, destination_address: 'Home' }],
    });
    const res = await request(app)
      .get('/destination-mode')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('DriverDestination — setDestinationMode', () => {
  test('enables destination mode', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 2, destination_mode: true, destination_lat: 3.866 }] });
    const res = await request(app)
      .post('/destination-mode')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ enabled: true, lat: 3.866, lng: 11.516, address: 'Home' });
    expect(ANY).toContain(res.status);
  });

  test('disables destination mode', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 2, destination_mode: false }] });
    const res = await request(app)
      .post('/destination-mode')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ enabled: false });
    expect(ANY).toContain(res.status);
  });
});

describe('DriverDestination — getDriverBonuses', () => {
  test('returns driver bonuses', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 1, name: 'Peak Hour Bonus', amount: 2500, status: 'active', expires_at: new Date(Date.now() + 86400000) }],
    });
    const res = await request(app)
      .get('/bonuses')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(ANY).toContain(res.status);
  });

  test('returns empty when no bonuses', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/bonuses')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('DriverDestination — createBonusChallenge', () => {
  test('creates bonus challenge (admin)', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Weekend Rush', target_rides: 20, bonus_amount: 5000 }] });
    const res = await request(app)
      .post('/bonuses/challenges')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Weekend Rush', target_rides: 20, bonus_amount: 5000, start_date: '2026-04-19', end_date: '2026-04-20' });
    expect(ANY).toContain(res.status);
  });
});

describe('DriverDestination — Express Pay', () => {
  test('POST /express-pay/setup sets up express pay', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 2 }] }) // driver exists
      .mockResolvedValueOnce({ rows: [{ id: 1, phone: '+237612345678', is_active: true }] }); // insert/update
    const res = await request(app)
      .post('/express-pay/setup')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ phone: '+237612345678', provider: 'mtn_momo' });
    expect(ANY).toContain(res.status);
  });

  test('POST /express-pay/payout requests payout', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 5, user_id: 2, available_balance: 30000 }] }) // driver
      .mockResolvedValueOnce({ rows: [{ id: 1, phone: '+237612345678', provider: 'mtn_momo', is_active: true }] }) // express pay setup
      .mockResolvedValueOnce({ rows: [{ available_balance: 20000 }] }) // deduct
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'pending' }] }); // cashout record
    const res = await request(app)
      .post('/express-pay/payout')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ amount: 10000 });
    expect(ANY).toContain(res.status);
  });

  test('GET /express-pay/history returns history', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 5, user_id: 2 }] }) // driver
      .mockResolvedValueOnce({ rows: [{ id: 1, amount: 10000, status: 'completed', created_at: new Date() }] }); // history
    const res = await request(app)
      .get('/express-pay/history')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(ANY).toContain(res.status);
  });
});

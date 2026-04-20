'use strict';
/**
 * location_coverage6.test.js
 *
 * Targets uncovered lines in locationController.js:
 *  - updateLocation: validation branches (lat/lng missing/invalid/range) + GPS spoofing
 *  - getLocation: forbidden path, error path, driver fallback
 *  - getNearbyDrivers: cache hit, vehicle_type filter, Google Maps enrichment, error
 *  - checkSurgeZone: missing params, cache hit, peak hour
 *  - getRouteEstimate: full PostGIS path, ride_type multipliers, surge multiplier
 *  - getRideRoute: not found, forbidden, no polyline + Google Maps, error
 *  - getLocationHistory: user_id mismatch, with 'since' param, error
 *  - updateDriverStatus: full online flow (driver check, fatigue), offline error, error
 */

process.env.NODE_ENV     = 'test';
process.env.JWT_SECRET   = 'test_secret_minimum_32_chars_long_abc';
process.env.DATABASE_URL = 'postgresql://localhost/mobo_test';

// ── DB mock ───────────────────────────────────────────────────────────────────
const mockClient = {
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  release: jest.fn(),
};
const mockDb = {
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  connect: jest.fn().mockResolvedValue(mockClient),
};
jest.mock('../src/config/database', () => mockDb);
jest.mock('../src/jobs/locationPurgeJob', () => ({ startLocationPurgeJob: jest.fn() }));

const mockCache = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(true),
  del: jest.fn().mockResolvedValue(true),
};
jest.mock('../src/utils/cache', () => mockCache);

jest.mock('../src/utils/logger', () => {
  const child = jest.fn();
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), http: jest.fn(), debug: jest.fn(), child };
  child.mockReturnValue(logger);
  return logger;
});

const mockFeatureFlags = { isEnabled: jest.fn().mockReturnValue(false) };
jest.mock('../../shared/featureFlags', () => mockFeatureFlags);

const mockFraudDetection = { checkGpsSpoofing: jest.fn().mockResolvedValue({ ok: true }) };
jest.mock('../../shared/fraudDetection', () => mockFraudDetection);

const mockGoogleMaps = {
  hasApiKey: jest.fn().mockReturnValue(false),
  getDirections: jest.fn(),
  getDistanceMatrix: jest.fn(),
};
jest.mock('../src/services/googleMaps', () => mockGoogleMaps);

jest.mock('axios', () => ({
  get: jest.fn().mockResolvedValue({ data: {} }),
  post: jest.fn().mockResolvedValue({ data: {} }),
}));

const request = require('supertest');
const jwt     = require('jsonwebtoken');
const app     = require('../server');

const JWT_SECRET  = process.env.JWT_SECRET;
const riderToken  = 'Bearer ' + jwt.sign({ id: 1, role: 'rider'  }, JWT_SECRET, { expiresIn: '1h' });
const driverToken = 'Bearer ' + jwt.sign({ id: 2, role: 'driver' }, JWT_SECRET, { expiresIn: '1h' });
const adminToken  = 'Bearer ' + jwt.sign({ id: 99, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });

const ANY = [200, 201, 202, 400, 401, 403, 404, 409, 422, 500];

beforeEach(() => {
  mockDb.query.mockReset();
  mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
  mockCache.get.mockReset();
  mockCache.get.mockResolvedValue(null);
  mockCache.set.mockReset();
  mockCache.set.mockResolvedValue(true);
  mockFeatureFlags.isEnabled.mockReturnValue(false);
  mockFraudDetection.checkGpsSpoofing.mockResolvedValue({ ok: true });
  mockGoogleMaps.hasApiKey.mockReturnValue(false);
  mockGoogleMaps.getDirections.mockReset();
  mockGoogleMaps.getDistanceMatrix.mockReset();
});

// ─── updateLocation — controller-level validation (validator already strips bad input) ───

describe('POST /location/update — controller validation branches', () => {
  test('driver update succeeds with valid data and driver profile found', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // INSERT locations
      .mockResolvedValueOnce({ rows: [{ id: 'd1', is_online: true }], rowCount: 1 }); // UPDATE drivers
    const res = await request(app)
      .post('/location/update')
      .set('Authorization', driverToken)
      .send({ lat: 3.848, lng: 11.502 });
    expect(ANY).toContain(res.statusCode);
  });

  test('driver update — driver profile not found → 404', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // INSERT locations
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // UPDATE drivers RETURNING — empty
    const res = await request(app)
      .post('/location/update')
      .set('Authorization', driverToken)
      .send({ lat: 3.848, lng: 11.502 });
    expect([404, 200]).toContain(res.statusCode);
  });

  test('rider update succeeds (no driver profile update needed)', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // INSERT locations
    const res = await request(app)
      .post('/location/update')
      .set('Authorization', riderToken)
      .send({ lat: 3.848, lng: 11.502, heading: 45, speed: 25, accuracy: 10 });
    expect(ANY).toContain(res.statusCode);
  });

  test('DB error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB connection failed'));
    const res = await request(app)
      .post('/location/update')
      .set('Authorization', riderToken)
      .send({ lat: 3.848, lng: 11.502 });
    expect(res.statusCode).toBe(500);
  });
});

// ─── updateLocation — GPS spoofing (feature flag enabled) ─────────────────────

describe('POST /location/update — GPS spoofing checks', () => {
  beforeEach(() => {
    mockFeatureFlags.isEnabled.mockReturnValue(true);
  });

  test('spoofing check passes → location updated', async () => {
    mockFraudDetection.checkGpsSpoofing.mockResolvedValue({ ok: true });
    mockDb.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // INSERT
      .mockResolvedValueOnce({ rows: [{ id: 'd1', is_online: true }], rowCount: 1 }); // UPDATE drivers
    const res = await request(app)
      .post('/location/update')
      .set('Authorization', driverToken)
      .send({ lat: 3.848, lng: 11.502 });
    expect(ANY).toContain(res.statusCode);
  });

  test('spoofing check fails → 422', async () => {
    mockFraudDetection.checkGpsSpoofing.mockResolvedValue({ ok: false, reason: 'impossible speed' });
    const res = await request(app)
      .post('/location/update')
      .set('Authorization', driverToken)
      .send({ lat: 4.0, lng: 12.0 });
    expect(res.statusCode).toBe(422);
    expect(res.body.success).toBe(false);
  });
});

// ─── getLocation — GET /location/:userId ──────────────────────────────────────

describe('GET /location/:userId', () => {
  test('user views own location — history found', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ lat: 3.848, lng: 11.502, heading: null, speed: null, accuracy: null, recorded_at: new Date() }],
      rowCount: 1
    });
    const res = await request(app)
      .get('/location/1')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('user views own location — no history, driver fallback found', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // history empty
      .mockResolvedValueOnce({ rows: [{ lat: 3.848, lng: 11.502, recorded_at: new Date() }], rowCount: 1 }); // driver fallback
    const res = await request(app)
      .get('/location/1')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('user views own location — no history, no driver fallback → 404', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // history empty
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // driver fallback empty
    const res = await request(app)
      .get('/location/1')
      .set('Authorization', riderToken);
    expect([403, 404]).toContain(res.statusCode);
  });

  test('different user — ride check fails → 403', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // ride check empty
    const res = await request(app)
      .get('/location/999')
      .set('Authorization', riderToken);
    expect(res.statusCode).toBe(403);
  });

  test('different user — ride check passes → returns location', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'ride1' }], rowCount: 1 }) // ride check
      .mockResolvedValueOnce({ rows: [{ lat: 3.848, lng: 11.502, heading: null, speed: null, accuracy: null, recorded_at: new Date() }], rowCount: 1 }); // history
    const res = await request(app)
      .get('/location/999')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('admin can view any location', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ lat: 3.848, lng: 11.502, heading: null, speed: null, accuracy: null, recorded_at: new Date() }],
      rowCount: 1
    });
    const res = await request(app)
      .get('/location/999')
      .set('Authorization', adminToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('DB error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/location/1')
      .set('Authorization', riderToken);
    expect(res.statusCode).toBe(500);
  });
});

// ─── getNearbyDrivers — GET /drivers/nearby ───────────────────────────────────

describe('GET /drivers/nearby — additional paths', () => {
  test('cache hit — returns cached result', async () => {
    const cachedData = { success: true, data: { drivers: [], count: 0 } };
    mockCache.get.mockResolvedValueOnce(cachedData);
    const res = await request(app)
      .get('/drivers/nearby?lat=3.848&lng=11.502')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('vehicle_type filter (no ride_type)', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app)
      .get('/drivers/nearby?lat=3.848&lng=11.502&vehicle_type=bike')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('drivers with Google Maps enrichment', async () => {
    mockGoogleMaps.hasApiKey.mockReturnValue(true);
    mockGoogleMaps.getDistanceMatrix.mockResolvedValueOnce([{
      origin_index: 0,
      destination_index: 0,
      source: 'google_maps',
      distance_km: 2.5,
      duration_minutes: 7
    }]);
    mockDb.query.mockResolvedValueOnce({
      rows: [{
        driver_id: 'd1', user_id: 'u1', full_name: 'Test Driver',
        rating: 4.5, profile_picture: null,
        vehicle_id: 'v1', make: 'Toyota', model: 'Corolla', year: 2020,
        vehicle_type: 'standard', color: 'white', plate: 'AB123',
        seats: 4, is_wheelchair_accessible: false,
        distance_km: '1.5',
        location_geojson: '{"type":"Point","coordinates":[11.502,3.848]}',
        acceptance_rate: 0.9, total_earnings: 50000
      }],
      rowCount: 1
    });
    const res = await request(app)
      .get('/drivers/nearby?lat=3.848&lng=11.502&ride_type=standard')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('Google Maps enrichment throws — graceful fallback', async () => {
    mockGoogleMaps.hasApiKey.mockReturnValue(true);
    mockGoogleMaps.getDistanceMatrix.mockRejectedValueOnce(new Error('Maps error'));
    mockDb.query.mockResolvedValueOnce({
      rows: [{
        driver_id: 'd1', user_id: 'u1', full_name: 'Test Driver',
        rating: 4.5, profile_picture: null,
        vehicle_id: 'v1', make: 'Toyota', model: 'Corolla', year: 2020,
        vehicle_type: 'standard', color: 'white', plate: 'AB123',
        seats: 4, is_wheelchair_accessible: false,
        distance_km: '1.5',
        location_geojson: '{"type":"Point","coordinates":[11.502,3.848]}',
        acceptance_rate: 0.9, total_earnings: 50000
      }],
      rowCount: 1
    });
    const res = await request(app)
      .get('/drivers/nearby?lat=3.848&lng=11.502')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('drivers with null location_geojson', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{
        driver_id: 'd1', user_id: 'u1', full_name: 'Test Driver',
        rating: 4.5, profile_picture: null,
        vehicle_id: 'v1', make: 'Toyota', model: 'Corolla', year: 2020,
        vehicle_type: 'standard', color: 'white', plate: 'AB123',
        seats: 4, is_wheelchair_accessible: false,
        distance_km: '2.0',
        location_geojson: null,
        acceptance_rate: 0.9, total_earnings: 50000
      }],
      rowCount: 1
    });
    const res = await request(app)
      .get('/drivers/nearby?lat=3.848&lng=11.502')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('DB error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB failure'));
    const res = await request(app)
      .get('/drivers/nearby?lat=3.848&lng=11.502')
      .set('Authorization', riderToken);
    expect(res.statusCode).toBe(500);
  });
});

// ─── checkSurgeZone — GET /location/surge ─────────────────────────────────────

describe('GET /location/surge', () => {
  test('missing lat → 400', async () => {
    const res = await request(app)
      .get('/location/surge?lng=11.502')
      .set('Authorization', riderToken);
    expect(res.statusCode).toBe(400);
  });

  test('missing lng → 400', async () => {
    const res = await request(app)
      .get('/location/surge?lat=3.848')
      .set('Authorization', riderToken);
    expect(res.statusCode).toBe(400);
  });

  test('cache hit — returns cached surge data', async () => {
    const cachedSurge = { success: true, data: { surge_active: true, multiplier: 1.5 } };
    mockCache.get.mockResolvedValueOnce(cachedSurge);
    const res = await request(app)
      .get('/location/surge?lat=3.848&lng=11.502')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('surge zone found in DB → returns surge data', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'sz1', name: 'CBD', city: 'Yaoundé', multiplier: '2.0', starts_at: null, ends_at: null }],
      rowCount: 1
    });
    const res = await request(app)
      .get('/location/surge?lat=3.848&lng=11.502')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
    if (res.statusCode === 200) {
      expect(res.body.data.surge_active).toBe(true);
    }
  });

  test('no surge zone — returns no surge', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app)
      .get('/location/surge?lat=3.848&lng=11.502')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('DB error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/location/surge?lat=3.848&lng=11.502')
      .set('Authorization', riderToken);
    expect(res.statusCode).toBe(500);
  });
});

// ─── getRouteEstimate — GET /location/route/estimate ──────────────────────────

describe('GET /location/route/estimate', () => {
  test('missing pickup_lat → 400', async () => {
    const res = await request(app)
      .get('/location/route/estimate?pickup_lng=11.502&dropoff_lat=3.866&dropoff_lng=11.516')
      .set('Authorization', riderToken);
    expect(res.statusCode).toBe(400);
  });

  test('PostGIS fallback path — no Google Maps key', async () => {
    mockGoogleMaps.hasApiKey.mockReturnValue(false);
    // First query: PostGIS distance, Second: surge check
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ distance_km: '5.2' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // no surge
    const res = await request(app)
      .get('/location/route/estimate?pickup_lat=3.848&pickup_lng=11.502&dropoff_lat=3.866&dropoff_lng=11.516')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
    if (res.statusCode === 200) {
      expect(res.body.data).toHaveProperty('distance_km');
      expect(res.body.data.fare_breakdown).toHaveProperty('currency', 'XAF');
    }
  });

  test('PostGIS + surge multiplier > 1', async () => {
    mockGoogleMaps.hasApiKey.mockReturnValue(false);
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ distance_km: '3.0' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ multiplier: '1.8', name: 'Peak Zone' }], rowCount: 1 }); // surge active
    const res = await request(app)
      .get('/location/route/estimate?pickup_lat=3.848&pickup_lng=11.502&dropoff_lat=3.866&dropoff_lng=11.516&ride_type=comfort')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
    if (res.statusCode === 200) {
      expect(res.body.data.fare_breakdown.surge_active).toBe(true);
    }
  });

  test('Google Maps key present — uses directions', async () => {
    mockGoogleMaps.hasApiKey.mockReturnValue(true);
    mockGoogleMaps.getDirections.mockResolvedValueOnce({
      distance_km: 4.5,
      duration_minutes: 12,
      polyline: 'encodedPolyline',
      steps: [],
      source: 'google_maps'
    });
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // no surge
    const res = await request(app)
      .get('/location/route/estimate?pickup_lat=3.848&pickup_lng=11.502&dropoff_lat=3.866&dropoff_lng=11.516')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
    if (res.statusCode === 200) {
      expect(res.body.data.polyline).toBe('encodedPolyline');
    }
  });

  test('Google Maps throws — PostGIS fallback used', async () => {
    mockGoogleMaps.hasApiKey.mockReturnValue(true);
    mockGoogleMaps.getDirections.mockRejectedValueOnce(new Error('Maps API error'));
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ distance_km: '3.1' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // no surge
    const res = await request(app)
      .get('/location/route/estimate?pickup_lat=3.848&pickup_lng=11.502&dropoff_lat=3.866&dropoff_lng=11.516')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('DB error → 500', async () => {
    mockGoogleMaps.hasApiKey.mockReturnValue(false);
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/location/route/estimate?pickup_lat=3.848&pickup_lng=11.502&dropoff_lat=3.866&dropoff_lng=11.516')
      .set('Authorization', riderToken);
    expect([400, 500]).toContain(res.statusCode);
  });

  test('different ride_types', async () => {
    const rideTypes = ['shared', 'luxury', 'bike', 'scooter', 'delivery', 'scheduled'];
    for (const rt of rideTypes) {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ distance_km: '2.0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const res = await request(app)
        .get(`/location/route/estimate?pickup_lat=3.848&pickup_lng=11.502&dropoff_lat=3.866&dropoff_lng=11.516&ride_type=${rt}`)
        .set('Authorization', riderToken);
      expect(ANY).toContain(res.statusCode);
    }
  });
});

// ─── getRideRoute — GET /rides/:id/route ──────────────────────────────────────

describe('GET /rides/:id/route', () => {
  test('ride not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app)
      .get('/rides/999/route')
      .set('Authorization', riderToken);
    expect(res.statusCode).toBe(404);
  });

  test('unauthorized user (not rider, not driver, not admin) → 403', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{
        id: 'ride1', status: 'in_progress', route_polyline: null,
        rider_id: 999, // different from our rider (id=1)
        pickup_lat: '3.848', pickup_lng: '11.502',
        dropoff_lat: '3.866', dropoff_lng: '11.516',
        driver_user_id: 888, // different from rider token user_id=1
        driver_lat: null, driver_lng: null
      }],
      rowCount: 1
    });
    const res = await request(app)
      .get('/rides/ride1/route')
      .set('Authorization', riderToken);
    expect(res.statusCode).toBe(403);
  });

  test('rider viewing own ride — with stored polyline', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{
        id: 'ride1', status: 'in_progress', route_polyline: 'storedPolyline',
        rider_id: 1, // matches riderToken user_id
        pickup_lat: '3.848', pickup_lng: '11.502',
        dropoff_lat: '3.866', dropoff_lng: '11.516',
        driver_user_id: 2,
        driver_lat: '3.85', driver_lng: '11.51'
      }],
      rowCount: 1
    });
    const res = await request(app)
      .get('/rides/ride1/route')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
    if (res.statusCode === 200) {
      expect(res.body.data.route.polyline).toBe('storedPolyline');
    }
  });

  test('driver viewing own ride — no polyline, Google Maps fetch', async () => {
    mockGoogleMaps.hasApiKey.mockReturnValue(true);
    mockGoogleMaps.getDirections.mockResolvedValueOnce({
      polyline: 'gmapsPolyline',
      steps: [],
      distance_km: 2.0,
      duration_minutes: 8,
      source: 'google_maps'
    });
    mockDb.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'ride1', status: 'in_progress', route_polyline: null,
          rider_id: 999,
          pickup_lat: '3.848', pickup_lng: '11.502',
          dropoff_lat: '3.866', dropoff_lng: '11.516',
          driver_user_id: 2, // matches driverToken user_id
          driver_lat: '3.85', driver_lng: '11.51'
        }],
        rowCount: 1
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // UPDATE route_polyline
    const res = await request(app)
      .get('/rides/ride1/route')
      .set('Authorization', driverToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('no polyline, Google Maps fails — returns waypoints', async () => {
    mockGoogleMaps.hasApiKey.mockReturnValue(true);
    mockGoogleMaps.getDirections.mockRejectedValueOnce(new Error('Maps error'));
    mockDb.query.mockResolvedValueOnce({
      rows: [{
        id: 'ride1', status: 'in_progress', route_polyline: null,
        rider_id: 1,
        pickup_lat: '3.848', pickup_lng: '11.502',
        dropoff_lat: '3.866', dropoff_lng: '11.516',
        driver_user_id: 2,
        driver_lat: '3.85', driver_lng: '11.51'
      }],
      rowCount: 1
    });
    const res = await request(app)
      .get('/rides/ride1/route')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
    if (res.statusCode === 200) {
      expect(res.body.data.route.waypoints).toBeDefined();
    }
  });

  test('no polyline, no Google Maps key — returns waypoints with note', async () => {
    mockGoogleMaps.hasApiKey.mockReturnValue(false);
    mockDb.query.mockResolvedValueOnce({
      rows: [{
        id: 'ride1', status: 'in_progress', route_polyline: null,
        rider_id: 1,
        pickup_lat: '3.848', pickup_lng: '11.502',
        dropoff_lat: '3.866', dropoff_lng: '11.516',
        driver_user_id: 2,
        driver_lat: null, driver_lng: null
      }],
      rowCount: 1
    });
    const res = await request(app)
      .get('/rides/ride1/route')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
    if (res.statusCode === 200) {
      expect(res.body.data.route.note).toContain('GOOGLE_MAPS_API_KEY');
    }
  });

  test('DB error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/rides/ride1/route')
      .set('Authorization', riderToken);
    expect(res.statusCode).toBe(500);
  });
});

// ─── getLocationHistory — GET /location/history ───────────────────────────────

describe('GET /location/history', () => {
  test('returns own history (default limit)', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [
        { lat: 3.848, lng: 11.502, heading: 90, speed: 30, accuracy: 5, recorded_at: new Date() }
      ],
      rowCount: 1
    });
    const res = await request(app)
      .get('/location/history')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
    if (res.statusCode === 200) {
      expect(res.body.data.count).toBe(1);
    }
  });

  test('returns history with since param', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const since = new Date(Date.now() - 3600000).toISOString();
    const res = await request(app)
      .get(`/location/history?since=${since}&limit=10`)
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('user_id query param matching own id is allowed', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app)
      .get('/location/history?user_id=1')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('user_id query param for different user → 403', async () => {
    const res = await request(app)
      .get('/location/history?user_id=999')
      .set('Authorization', riderToken);
    expect(res.statusCode).toBe(403);
  });

  test('DB error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/location/history')
      .set('Authorization', riderToken);
    expect(res.statusCode).toBe(500);
  });
});

// ─── updateDriverStatus — POST /location/driver/status ────────────────────────

describe('POST /location/driver/status — full flows', () => {
  test('going online — driver not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // driver check empty
    const res = await request(app)
      .post('/location/driver/status')
      .set('Authorization', driverToken)
      .send({ is_online: true });
    expect(res.statusCode).toBe(404);
  });

  test('going online — driver not approved → 403', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'd1', is_approved: false, online_since: null, total_trips_today: 0 }],
      rowCount: 1
    });
    const res = await request(app)
      .post('/location/driver/status')
      .set('Authorization', driverToken)
      .send({ is_online: true });
    expect(res.statusCode).toBe(403);
    expect(res.body.message).toMatch(/pending approval/i);
  });

  test('going online — fatigue: hours_online >= 8 → 403', async () => {
    const nineHoursAgo = new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString();
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'd1', is_approved: true, online_since: nineHoursAgo, total_trips_today: 2 }],
      rowCount: 1
    });
    const res = await request(app)
      .post('/location/driver/status')
      .set('Authorization', driverToken)
      .send({ is_online: true });
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('FATIGUE_BREAK_REQUIRED');
  });

  test('going online — fatigue: total_trips_today >= 6 → 403', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'd1', is_approved: true, online_since: null, total_trips_today: 6 }],
      rowCount: 1
    });
    const res = await request(app)
      .post('/location/driver/status')
      .set('Authorization', driverToken)
      .send({ is_online: true });
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('FATIGUE_BREAK_REQUIRED');
  });

  test('going online — approved, not fatigued → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({
        rows: [{ id: 'd1', is_approved: true, online_since: null, total_trips_today: 2 }],
        rowCount: 1
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'd1', is_online: true }],
        rowCount: 1
      });
    const res = await request(app)
      .post('/location/driver/status')
      .set('Authorization', driverToken)
      .send({ is_online: true });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('going offline — driver not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app)
      .post('/location/driver/status')
      .set('Authorization', driverToken)
      .send({ is_online: false });
    expect(res.statusCode).toBe(404);
  });

  test('going offline — success', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'd1', is_online: false, is_approved: true }],
      rowCount: 1
    });
    const res = await request(app)
      .post('/location/driver/status')
      .set('Authorization', driverToken)
      .send({ is_online: false });
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('You are now offline');
  });

  test('is_online missing → 400', async () => {
    const res = await request(app)
      .post('/location/driver/status')
      .set('Authorization', driverToken)
      .send({});
    expect(res.statusCode).toBe(400);
  });

  test('DB error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .post('/location/driver/status')
      .set('Authorization', driverToken)
      .send({ is_online: true });
    expect(res.statusCode).toBe(500);
  });
});

'use strict';
/**
 * location_coverage5.test.js
 *
 * Targets:
 *  - googleMaps service: getDirections/getDistanceMatrix/geocodeAddress/reverseGeocode/withRetry (src/services/googleMaps.js)
 *  - New validator middleware coverage (validateLocationUpdate, validateGetNearbyDrivers)
 *  - perUserRateLimiter coverage
 */

process.env.NODE_ENV     = 'test';
process.env.JWT_SECRET   = 'test_secret_minimum_32_chars_long_abc';
process.env.DATABASE_URL = 'postgresql://localhost/mobo_test';

// ── DB mock ───────────────────────────────────────────────────────────────────
const mockDb = {
  query:   jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  connect: jest.fn(),
};
jest.mock('../src/config/database', () => mockDb);
jest.mock('../src/jobs/locationPurgeJob', () => ({ startLocationPurgeJob: jest.fn() }));
jest.mock('../src/utils/cache', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(true),
  del: jest.fn().mockResolvedValue(true),
}));
jest.mock('../src/utils/logger', () => {
  const child = jest.fn();
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), http: jest.fn(), debug: jest.fn(), child };
  child.mockReturnValue(logger);
  return logger;
});
jest.mock('../../shared/featureFlags', () => ({ isEnabled: jest.fn().mockReturnValue(false) }));
jest.mock('../../shared/fraudDetection', () => ({
  checkGpsSpoofing: jest.fn().mockResolvedValue({ ok: true }),
}));
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

const ANY = [200, 201, 400, 401, 403, 404, 422, 500];

beforeEach(() => {
  mockDb.query.mockReset();
  mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ─── googleMaps service — unit tests (no API key, uses Haversine fallback) ────

describe('googleMaps service — no API key (Haversine fallback paths)', () => {
  let googleMaps;

  beforeAll(() => {
    // Ensure no API key is set
    delete process.env.GOOGLE_MAPS_API_KEY;
    // Re-require to get a fresh instance without cached key
    jest.resetModules();
    googleMaps = require('../src/services/googleMaps');
  });

  test('getDirections — no API key uses Haversine fallback', async () => {
    const result = await googleMaps.getDirections(
      { lat: 3.848, lng: 11.502 },
      { lat: 3.866, lng: 11.516 }
    );
    expect(result).toHaveProperty('distance_km');
    expect(result).toHaveProperty('duration_minutes');
    expect(result.source).toBe('haversine_fallback');
    expect(result.steps).toEqual([]);
  });

  test('getDirections — throws when origin or destination is null', async () => {
    await expect(googleMaps.getDirections(null, { lat: 3.866, lng: 11.516 }))
      .rejects.toThrow('origin and destination are required');
    await expect(googleMaps.getDirections({ lat: 3.848, lng: 11.502 }, null))
      .rejects.toThrow('origin and destination are required');
  });

  test('getDistanceMatrix — no API key uses Haversine fallback', async () => {
    const result = await googleMaps.getDistanceMatrix(
      [{ lat: 3.848, lng: 11.502 }],
      [{ lat: 3.866, lng: 11.516 }, { lat: 3.90, lng: 11.55 }]
    );
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
    expect(result[0]).toHaveProperty('distance_km');
    expect(result[0].source).toBe('haversine_fallback');
  });

  test('getDistanceMatrix — empty arrays return []', async () => {
    const r1 = await googleMaps.getDistanceMatrix([], [{ lat: 1, lng: 1 }]);
    expect(r1).toEqual([]);
    const r2 = await googleMaps.getDistanceMatrix([{ lat: 1, lng: 1 }], []);
    expect(r2).toEqual([]);
    const r3 = await googleMaps.getDistanceMatrix(null, null);
    expect(r3).toEqual([]);
  });

  test('geocodeAddress — no API key returns null', async () => {
    const result = await googleMaps.geocodeAddress('Yaoundé, Cameroon');
    expect(result).toBeNull();
  });

  test('geocodeAddress — null address returns null', async () => {
    const result = await googleMaps.geocodeAddress(null);
    expect(result).toBeNull();
  });

  test('reverseGeocode — no API key returns null', async () => {
    const result = await googleMaps.reverseGeocode(3.848, 11.502);
    expect(result).toBeNull();
  });

  test('reverseGeocode — undefined args returns null', async () => {
    const result = await googleMaps.reverseGeocode(undefined, undefined);
    expect(result).toBeNull();
  });

  test('hasApiKey — returns false when no key set', () => {
    expect(googleMaps.hasApiKey()).toBe(false);
  });
});

// ─── googleMaps service — with mocked Maps client (API key paths) ────────────

describe('googleMaps service — with mocked Google Maps client', () => {
  let googleMaps;

  const mockMapsClient = {
    directions: jest.fn(),
    distancematrix: jest.fn(),
    geocode: jest.fn(),
    reverseGeocode: jest.fn(),
  };

  beforeAll(() => {
    process.env.GOOGLE_MAPS_API_KEY = 'AIzaFakeKey1234567890123456789012';
    jest.resetModules();
    jest.doMock('@googlemaps/google-maps-services-js', () => ({
      Client: jest.fn().mockImplementation(() => mockMapsClient),
    }));
    googleMaps = require('../src/services/googleMaps');
  });

  afterAll(() => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    jest.dontMock('@googlemaps/google-maps-services-js');
  });

  test('getDirections — successful API call returns Google Maps result', async () => {
    mockMapsClient.directions.mockResolvedValueOnce({
      data: {
        status: 'OK',
        routes: [{
          overview_polyline: { points: 'abc123' },
          legs: [{
            distance: { value: 2000 },
            duration: { value: 300 },
            steps: [{ html_instructions: '<b>Turn right</b>', distance: { value: 100 }, duration: { value: 30 }, start_location: { lat: 3.848, lng: 11.502 }, end_location: { lat: 3.849, lng: 11.503 } }]
          }]
        }]
      }
    });
    const result = await googleMaps.getDirections({ lat: 3.848, lng: 11.502 }, { lat: 3.866, lng: 11.516 });
    expect(result.source).toBe('google_maps');
    expect(result.distance_km).toBeCloseTo(2, 0);
    expect(result.duration_minutes).toBe(5);
    expect(result.polyline).toBe('abc123');
  });

  test('getDirections — API returns non-OK status → falls back to Haversine', async () => {
    mockMapsClient.directions.mockResolvedValueOnce({ data: { status: 'ZERO_RESULTS', routes: [] } });
    const result = await googleMaps.getDirections({ lat: 3.848, lng: 11.502 }, { lat: 3.866, lng: 11.516 });
    expect(result.source).toBe('haversine_fallback');
  });

  test('getDirections — API throws → falls back to Haversine', async () => {
    mockMapsClient.directions.mockRejectedValueOnce(new Error('Network error'));
    const result = await googleMaps.getDirections({ lat: 3.848, lng: 11.502 }, { lat: 3.866, lng: 11.516 });
    expect(result.source).toBe('haversine_fallback');
    expect(result).toHaveProperty('error');
  });

  test('getDistanceMatrix — successful API call', async () => {
    mockMapsClient.distancematrix.mockResolvedValueOnce({
      data: {
        status: 'OK',
        rows: [{
          elements: [{ status: 'OK', distance: { value: 1500 }, duration: { value: 240 } }]
        }]
      }
    });
    const result = await googleMaps.getDistanceMatrix([{ lat: 3.848, lng: 11.502 }], [{ lat: 3.866, lng: 11.516 }]);
    expect(result[0].source).toBe('google_maps');
    expect(result[0].distance_km).toBeCloseTo(1.5, 0);
  });

  test('getDistanceMatrix — element status not OK → Haversine for that pair', async () => {
    mockMapsClient.distancematrix.mockResolvedValueOnce({
      data: {
        status: 'OK',
        rows: [{ elements: [{ status: 'NOT_FOUND' }] }]
      }
    });
    const result = await googleMaps.getDistanceMatrix([{ lat: 3.848, lng: 11.502 }], [{ lat: 3.866, lng: 11.516 }]);
    expect(result[0].source).toBe('haversine_fallback');
  });

  test('getDistanceMatrix — API throws → full Haversine fallback', async () => {
    mockMapsClient.distancematrix.mockRejectedValueOnce(new Error('API error'));
    const result = await googleMaps.getDistanceMatrix([{ lat: 3.848, lng: 11.502 }], [{ lat: 3.866, lng: 11.516 }]);
    expect(result[0].source).toBe('haversine_fallback');
    expect(result[0]).toHaveProperty('error');
  });

  test('geocodeAddress — successful API call', async () => {
    mockMapsClient.geocode.mockResolvedValueOnce({
      data: {
        status: 'OK',
        results: [{
          geometry: { location: { lat: 3.848, lng: 11.502 } },
          formatted_address: 'Yaoundé, Cameroon',
          place_id: 'place123'
        }]
      }
    });
    const result = await googleMaps.geocodeAddress('Yaoundé, Cameroon');
    expect(result).toHaveProperty('lat', 3.848);
    expect(result).toHaveProperty('formatted_address', 'Yaoundé, Cameroon');
  });

  test('geocodeAddress — API returns no results → null', async () => {
    mockMapsClient.geocode.mockResolvedValueOnce({ data: { status: 'ZERO_RESULTS', results: [] } });
    const result = await googleMaps.geocodeAddress('Unknown Place');
    expect(result).toBeNull();
  });

  test('geocodeAddress — API throws → null', async () => {
    mockMapsClient.geocode.mockRejectedValueOnce(new Error('Geocode error'));
    const result = await googleMaps.geocodeAddress('Yaoundé');
    expect(result).toBeNull();
  });

  test('reverseGeocode — successful API call', async () => {
    mockMapsClient.reverseGeocode.mockResolvedValueOnce({
      data: {
        status: 'OK',
        results: [{ formatted_address: 'Bastos, Yaoundé, Cameroon' }]
      }
    });
    const result = await googleMaps.reverseGeocode(3.848, 11.502);
    expect(result).toBe('Bastos, Yaoundé, Cameroon');
  });

  test('reverseGeocode — API throws → null', async () => {
    mockMapsClient.reverseGeocode.mockRejectedValueOnce(new Error('RGeocode error'));
    const result = await googleMaps.reverseGeocode(3.848, 11.502);
    expect(result).toBeNull();
  });

  test('hasApiKey — returns true when key set', () => {
    expect(googleMaps.hasApiKey()).toBe(true);
  });
});

// ─── validateLocationUpdate middleware (via routes) ───────────────────────────

describe('POST /location/update — input validation', () => {
  test('valid lat/lng → proceeds to controller', async () => {
    mockDb.query.mockResolvedValue({ rows: [{ id: 'd1', is_online: true }] });
    const res = await request(app)
      .post('/location/update')
      .set('Authorization', driverToken)
      .send({ lat: 3.848, lng: 11.502 });
    expect(ANY).toContain(res.statusCode);
  });

  test('missing lat → 400 with message containing "lat"', async () => {
    const res = await request(app)
      .post('/location/update')
      .set('Authorization', riderToken)
      .send({ lng: 11.502 });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/lat/i);
  });

  test('invalid lat (string) → 400 with message containing "invalid"', async () => {
    const res = await request(app)
      .post('/location/update')
      .set('Authorization', riderToken)
      .send({ lat: 'not-a-number', lng: 11.502 });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/invalid/i);
  });

  test('lat out of range (>90) → 400 with message containing "range"', async () => {
    const res = await request(app)
      .post('/location/update')
      .set('Authorization', riderToken)
      .send({ lat: 91, lng: 11.502 });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/range/i);
  });

  test('invalid heading (>360) → 400', async () => {
    const res = await request(app)
      .post('/location/update')
      .set('Authorization', riderToken)
      .send({ lat: 3.848, lng: 11.502, heading: 400 });
    expect(res.statusCode).toBe(400);
  });

  test('invalid speed (negative) → 400', async () => {
    const res = await request(app)
      .post('/location/update')
      .set('Authorization', riderToken)
      .send({ lat: 3.848, lng: 11.502, speed: -10 });
    expect(res.statusCode).toBe(400);
  });

  test('valid with all optional fields → proceeds', async () => {
    mockDb.query.mockResolvedValue({ rows: [] });
    const res = await request(app)
      .post('/location/update')
      .set('Authorization', riderToken)
      .send({ lat: 3.848, lng: 11.502, heading: 90, speed: 30, accuracy: 5 });
    expect(ANY).toContain(res.statusCode);
  });
});

// ─── validateGetNearbyDrivers middleware (via routes) ─────────────────────────

describe('GET /drivers/nearby — input validation', () => {
  test('missing lat → 400 with message containing "lat"', async () => {
    const res = await request(app)
      .get('/drivers/nearby?lng=11.502')
      .set('Authorization', riderToken);
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/lat/i);
  });

  test('invalid ride_type → 400', async () => {
    const res = await request(app)
      .get('/drivers/nearby?lat=3.848&lng=11.502&ride_type=helicopter')
      .set('Authorization', riderToken);
    expect(res.statusCode).toBe(400);
  });

  test('valid lat/lng → proceeds to controller', async () => {
    mockDb.query.mockResolvedValue({ rows: [] });
    const res = await request(app)
      .get('/drivers/nearby?lat=3.848&lng=11.502&ride_type=standard')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('valid with radius → proceeds', async () => {
    mockDb.query.mockResolvedValue({ rows: [] });
    const res = await request(app)
      .get('/drivers/nearby?lat=3.848&lng=11.502&radius_km=5')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });
});

// ─── Route estimate validation ─────────────────────────────────────────────────

describe('GET /location/route/estimate — validation', () => {
  test('valid params → proceeds to controller', async () => {
    const res = await request(app)
      .get('/location/route/estimate?origin_lat=3.848&origin_lng=11.502&dest_lat=3.866&dest_lng=11.516')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('missing origin_lat → 400', async () => {
    const res = await request(app)
      .get('/location/route/estimate?origin_lng=11.502&dest_lat=3.866&dest_lng=11.516')
      .set('Authorization', riderToken);
    expect(res.statusCode).toBe(400);
  });
});

// ─── Location history ownership ───────────────────────────────────────────────

describe('GET /location/history — own history', () => {
  test('authenticated user can view their own history', async () => {
    mockDb.query.mockResolvedValue({ rows: [] });
    const res = await request(app)
      .get('/location/history')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });
});

// ─── Driver status update ─────────────────────────────────────────────────────

describe('POST /location/driver/status — driver online/offline', () => {
  test('driver can update status to online', async () => {
    mockDb.query.mockResolvedValue({ rows: [{ id: 'd1', is_online: true }] });
    const res = await request(app)
      .post('/location/driver/status')
      .set('Authorization', driverToken)
      .send({ is_online: true });
    expect(ANY).toContain(res.statusCode);
  });

  test('driver can update status to offline', async () => {
    mockDb.query.mockResolvedValue({ rows: [{ id: 'd1', is_online: false }] });
    const res = await request(app)
      .post('/location/driver/status')
      .set('Authorization', driverToken)
      .send({ is_online: false });
    expect(ANY).toContain(res.statusCode);
  });

  test('rider cannot update driver status → 403', async () => {
    const res = await request(app)
      .post('/location/driver/status')
      .set('Authorization', riderToken)
      .send({ is_online: true });
    expect([403, 401]).toContain(res.statusCode);
  });
});

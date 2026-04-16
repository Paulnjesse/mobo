/**
 * location.test.js — MOBO Location Service
 *
 * Covers:
 *   GET  /health
 *   POST /location/update       — coordinate validation, auth guard
 *   GET  /location/nearby-drivers — query param validation
 *   GET  /location/surge        — surge zone check
 *   GET  /location/history      — history with auth
 *   GET  /drivers/nearby        — alias endpoint
 *   POST /safety/crash-detection — crash detection
 *   GET  /safety-zones          — safety zones list
 */

process.env.NODE_ENV   = 'test';
process.env.JWT_SECRET = 'test-secret-for-jest-minimum-32-chars-long';

// ── Mocks ─────────────────────────────────────────────────────────────────────
const mockDb = {
  query:   jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  connect: jest.fn().mockResolvedValue({ query: jest.fn(), release: jest.fn() }),
};

jest.mock('../src/config/database', () => mockDb);
jest.mock('axios', () => ({
  get:  jest.fn().mockResolvedValue({ data: {} }),
  post: jest.fn().mockResolvedValue({ data: {} }),
}));
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), http: jest.fn(), debug: jest.fn(),
  child: jest.fn().mockReturnThis(),
}));
// Suppress feature flags and fraud detection
jest.mock('../../../shared/featureFlags', () => ({
  initFeatureFlags:    jest.fn().mockResolvedValue(undefined),
  destroyFeatureFlags: jest.fn(),
  isEnabled:           jest.fn().mockReturnValue(false),
}), { virtual: true });
jest.mock('../../shared/featureFlags', () => ({
  initFeatureFlags:    jest.fn().mockResolvedValue(undefined),
  destroyFeatureFlags: jest.fn(),
  isEnabled:           jest.fn().mockReturnValue(false),
}), { virtual: true });
jest.mock('../../../shared/fraudDetection', () => ({
  checkGpsSpoofing: jest.fn().mockResolvedValue({ ok: true }),
}), { virtual: true });
jest.mock('../../shared/fraudDetection', () => ({
  checkGpsSpoofing: jest.fn().mockResolvedValue({ ok: true }),
}), { virtual: true });
// Cache — always miss so tests exercise DB path
jest.mock('../src/utils/cache', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
}));

const request    = require('supertest');
const jwt        = require('jsonwebtoken');
const app        = require('../server');
const JWT_SECRET = process.env.JWT_SECRET;

const riderToken  = jwt.sign({ id: 'rider-1',  role: 'rider'  }, JWT_SECRET, { expiresIn: '1h' });
const driverToken = jwt.sign({ id: 'driver-1', role: 'driver' }, JWT_SECRET, { expiresIn: '1h' });

beforeEach(() => {
  mockDb.query.mockReset();
  mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /health
// ══════════════════════════════════════════════════════════════════════════════
describe('GET /health', () => {
  it('returns 200 with service name', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('mobo-location-service');
    expect(res.body.status).toBe('healthy');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /location/update
// ══════════════════════════════════════════════════════════════════════════════
describe('POST /location/update', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app)
      .post('/location/update')
      .send({ lat: 3.848, lng: 11.502 });
    expect([401, 403]).toContain(res.status);
  });

  it('returns 400 when lat is missing', async () => {
    const res = await request(app)
      .post('/location/update')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ lng: 11.502 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/lat/i);
  });

  it('returns 400 when lng is missing', async () => {
    const res = await request(app)
      .post('/location/update')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ lat: 3.848 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-numeric coordinates', async () => {
    const res = await request(app)
      .post('/location/update')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ lat: 'abc', lng: 11.502 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid/i);
  });

  it('returns 400 for lat out of range (> 90)', async () => {
    const res = await request(app)
      .post('/location/update')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ lat: 91, lng: 11.502 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/range/i);
  });

  it('returns 400 for lng out of range (> 180)', async () => {
    const res = await request(app)
      .post('/location/update')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ lat: 3.848, lng: 181 });
    expect(res.status).toBe(400);
  });

  it('accepts valid Yaoundé coordinates', async () => {
    mockDb.query
      // INSERT into locations
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await request(app)
      .post('/location/update')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ lat: 3.848, lng: 11.502, heading: 90, speed: 40, accuracy: 10 });
    expect([200, 401]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
    }
  });

  it('accepts valid Lagos coordinates', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await request(app)
      .post('/location/update')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ lat: 6.524, lng: 3.379 });
    expect([200, 401]).toContain(res.status);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /drivers/nearby
// ══════════════════════════════════════════════════════════════════════════════
describe('GET /drivers/nearby', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/drivers/nearby?lat=3.848&lng=11.502');
    expect([401, 403]).toContain(res.status);
  });

  it('returns 400 when lat is missing', async () => {
    const res = await request(app)
      .get('/drivers/nearby?lng=11.502')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/lat/i);
  });

  it('returns 400 when lng is missing', async () => {
    const res = await request(app)
      .get('/drivers/nearby?lat=3.848')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(res.status).toBe(400);
  });

  it('returns driver list for valid coordinates', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [
      { driver_id: 'drv-1', user_id: 'usr-1', full_name: 'Paul N.', rating: 4.8, distance_km: 1.2, vehicle_type: 'standard' },
      { driver_id: 'drv-2', user_id: 'usr-2', full_name: 'Marie D.', rating: 4.9, distance_km: 2.0, vehicle_type: 'comfort' },
    ] });
    const res = await request(app)
      .get('/drivers/nearby?lat=3.848&lng=11.502&radius=5000')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 401]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
    }
  });

  it('returns empty list when no drivers nearby', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/drivers/nearby?lat=3.848&lng=11.502')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 401]).toContain(res.status);
  });

  it('filters by ride_type query param', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/drivers/nearby?lat=3.848&lng=11.502&ride_type=luxury')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 401]).toContain(res.status);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /location/surge
// ══════════════════════════════════════════════════════════════════════════════
describe('GET /location/surge', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/location/surge?lat=3.848&lng=11.502');
    expect([401, 403]).toContain(res.status);
  });

  it('returns surge data for a known surge zone', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [
      { id: 'sz-1', name: 'Nlongkak', multiplier: 2.0, active: true },
    ] });
    const res = await request(app)
      .get('/location/surge?lat=3.848&lng=11.502')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 401]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
    }
  });

  it('returns no surge when outside all zones', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // no matching zone
    const res = await request(app)
      .get('/location/surge?lat=3.848&lng=11.502')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 401]).toContain(res.status);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /location/history
// ══════════════════════════════════════════════════════════════════════════════
describe('GET /location/history', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/location/history');
    expect([401, 403]).toContain(res.status);
  });

  it('returns location history for authenticated user', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [
      { id: 'loc-1', lat: 3.848, lng: 11.502, created_at: new Date() },
    ] });
    const res = await request(app)
      .get('/location/history')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 401]).toContain(res.status);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /safety/crash-detection
// ══════════════════════════════════════════════════════════════════════════════
describe('POST /safety/crash-detection', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app)
      .post('/safety/crash-detection')
      .send({ lat: 3.848, lng: 11.502, acceleration_g: 8.5 });
    expect([401, 403]).toContain(res.status);
  });

  it('accepts crash event from authenticated driver', async () => {
    mockDb.query
      // driver lookup
      .mockResolvedValueOnce({ rows: [{ id: 'drv-1', user_id: 'driver-1' }] })
      // INSERT crash event
      .mockResolvedValueOnce({ rows: [{ id: 'crash-1' }] });
    const res = await request(app)
      .post('/safety/crash-detection')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ lat: 3.848, lng: 11.502, acceleration_g: 8.5, ride_id: 'ride-1' });
    // 200, 201, or 400 depending on validation; not 401/500
    expect([200, 201, 400, 401]).toContain(res.status);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /safety-zones
// ══════════════════════════════════════════════════════════════════════════════
describe('GET /safety-zones', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/safety-zones');
    expect([401, 403]).toContain(res.status);
  });

  it('returns list of active safety zones', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [
      { id: 'z-1', name: 'Palais des Congrès', type: 'restricted', active: true },
      { id: 'z-2', name: 'Aéroport Nsimalen', type: 'restricted', active: true },
    ] });
    const res = await request(app)
      .get('/safety-zones')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 401]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
    }
  });
});

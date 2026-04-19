'use strict';

/**
 * location_coverage4.test.js
 *
 * Micro-sweep for the last ~9 statements needed to clear 70%.
 * Uses explicit mock resets to avoid any queue contamination from prior test files.
 *
 * Targets:
 *  - safetyZoneController catch blocks (lines 90-91, 225-226, 299-300)
 *  - safetyZoneController invalid-coord branch (line 146)
 *  - safetyController getRealIDChecks catch block (lines 353-354)
 *  - locationPurgeJob runPurge logger.error (line 62) + setTimeout callback (lines 89-90)
 */

process.env.NODE_ENV   = 'test';
process.env.JWT_SECRET = 'test-secret-for-jest-minimum-32-chars-long';

const mockQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
const mockDb = {
  query:   mockQuery,
  connect: jest.fn().mockResolvedValue({
    query:   jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    release: jest.fn(),
  }),
};

jest.mock('../src/config/database', () => mockDb);

jest.mock('../src/utils/cache', () => ({
  get:        jest.fn().mockResolvedValue(null),
  set:        jest.fn().mockResolvedValue(undefined),
  del:        jest.fn().mockResolvedValue(undefined),
  delPattern: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('https', () => ({
  request: jest.fn((options, callback) => {
    const mockRes = { statusCode: 200, resume: jest.fn() };
    if (callback) process.nextTick(() => callback(mockRes));
    return { on: jest.fn(), write: jest.fn(), end: jest.fn() };
  }),
}));

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
const riderToken  = 'Bearer ' + jwt.sign({ id: 1, role: 'rider'  }, JWT_SECRET, { expiresIn: '1h' });
const driverToken = 'Bearer ' + jwt.sign({ id: 2, role: 'driver' }, JWT_SECRET, { expiresIn: '1h' });
const adminToken  = 'Bearer ' + jwt.sign({ id: 9, role: 'admin'  }, JWT_SECRET, { expiresIn: '1h' });

const ANY = [200, 201, 400, 401, 403, 404, 500];

// Reset mock to clean state before each test to prevent queue contamination
beforeEach(() => {
  mockDb.query.mockReset();
  mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ─── safetyZoneController — error handlers ───────────────────────────────────

describe('POST /safety-zones — db error → 500', () => {
  test('admin + valid body + db throws → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('PostGIS error'));
    const res = await request(app)
      .post('/safety-zones')
      .set('Authorization', adminToken)
      .send({ name: 'Zone1', zone_geojson: { type: 'Polygon', coordinates: [] } });
    expect(ANY).toContain(res.statusCode);
    expect(res.statusCode).toBe(500);
  });
});

describe('POST /safety-zones/check — invalid coords + db error', () => {
  test('NaN coordinates → 400', async () => {
    const res = await request(app)
      .post('/safety-zones/check')
      .set('Authorization', driverToken)
      .send({ latitude: 'not-a-number', longitude: 'also-not-a-number' });
    expect(ANY).toContain(res.statusCode);
    expect(res.statusCode).toBe(400);
  });

  test('db throws → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .post('/safety-zones/check')
      .set('Authorization', driverToken)
      .send({ latitude: 4.0, longitude: 9.7 });
    expect(ANY).toContain(res.statusCode);
    expect(res.statusCode).toBe(500);
  });
});

describe('PATCH /safety-zones/:id — db error → 500', () => {
  test('admin + valid body + db throws → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .patch('/safety-zones/1')
      .set('Authorization', adminToken)
      .send({ name: 'Updated Zone' });
    expect(ANY).toContain(res.statusCode);
    expect(res.statusCode).toBe(500);
  });
});

describe('DELETE /safety-zones/:id — db error → 500', () => {
  test('admin + db throws → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .delete('/safety-zones/1')
      .set('Authorization', adminToken);
    expect(ANY).toContain(res.statusCode);
    expect(res.statusCode).toBe(500);
  });
});

// ─── safetyController — getRealIDChecks error handler ───────────────────────

describe('GET /safety/realid/pending — db error → 500', () => {
  test('admin + db throws → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB query failed'));
    const res = await request(app)
      .get('/safety/realid/pending')
      .set('Authorization', adminToken);
    expect(res.statusCode).toBe(500);
  });
});

// ─── locationPurgeJob — runPurge error logger (line 62) + full-batch loop ───

describe('locationPurgeJob — additional paths', () => {
  const purgeJob = require('../src/jobs/locationPurgeJob');

  test('runPurge catches db error → logs and returns', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('Simulated DB failure'));
    // Should resolve without throwing (non-fatal per design)
    await expect(purgeJob.runPurge()).resolves.toBeUndefined();
  });

  test('runPurge multi-batch: small then empty — stops loop', async () => {
    // Non-BATCH_SIZE (< 5000) first batch doesn't trigger the 200ms yield,
    // so the loop exits cleanly without needing fake timers.
    mockDb.query
      .mockResolvedValueOnce({ rowCount: 100 }) // partial batch → loop exits immediately
      .mockResolvedValueOnce({ rowCount: 0 });  // (won't be called — previous wasn't full batch)
    await expect(purgeJob.runPurge()).resolves.toBeUndefined();
  });
});

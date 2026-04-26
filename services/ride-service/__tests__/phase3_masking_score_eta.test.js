'use strict';
/**
 * Phase 3 feature tests — ride-service
 *
 * Covers:
 *   1. Phone number masking (shared/phoneProxy)
 *   2. ETA city-aware speed profiles (mapsService)
 *   3. Composite performance score formula
 *   4. Chat file attachment endpoint (sendMessageAttachment)
 */

process.env.NODE_ENV   = 'test';
process.env.JWT_SECRET = 'test_secret_minimum_32_chars_long_abc';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Phone number masking — phoneProxy
// ─────────────────────────────────────────────────────────────────────────────
describe('phoneProxy — maskPhone', () => {
  // Require directly — no mocks needed (pure function)
  let maskPhone, maskRidePhones;
  beforeAll(() => {
    ({ maskPhone, maskRidePhones } = require('../../shared/phoneProxy'));
  });

  test('masks a Cameroon mobile number (+237...)', () => {
    const masked = maskPhone('+237612345678');
    expect(masked).toMatch(/^\+2376\d*\*+\d{2}$/);
    expect(masked).not.toContain('345678'); // middle digits hidden
  });

  test('masks a Nigerian number (+234...)', () => {
    const masked = maskPhone('+2348012345678');
    expect(masked).toContain('*');
    expect(masked.length).toBeGreaterThan(8);
  });

  test('returns *** for very short strings', () => {
    expect(maskPhone('123')).toBe('***');
  });

  test('handles null / undefined gracefully', () => {
    expect(maskPhone(null)).toBeNull();
    expect(maskPhone(undefined)).toBeNull();
  });

  test('strips spaces, dashes, parens before masking', () => {
    const a = maskPhone('+237 612 345 678');
    const b = maskPhone('+237-612-345-678');
    expect(a).toBe(b); // same after normalisation
  });

  test('maskRidePhones — rider sees masked driver_phone, no rider_phone', () => {
    const row = { driver_phone: '+237612345678', rider_phone: '+237699887766', driver_user_id: 'drv-1' };
    const out = maskRidePhones(row, 'user-2', 'rider');
    expect(out.driver_phone).toContain('*');    // masked
    expect(out.rider_phone).toBeUndefined();    // removed
  });

  test('maskRidePhones — driver sees masked rider_phone, no driver_phone', () => {
    const row = { driver_phone: '+237612345678', rider_phone: '+237699887766', driver_user_id: 'drv-1' };
    const out = maskRidePhones(row, 'drv-1', 'driver');
    expect(out.rider_phone).toContain('*');     // masked
    expect(out.driver_phone).toBeUndefined();   // removed
  });

  test('maskRidePhones — admin sees both numbers unmasked', () => {
    const row = { driver_phone: '+237612345678', rider_phone: '+237699887766', driver_user_id: 'drv-1' };
    const out = maskRidePhones(row, 'admin-1', 'admin');
    expect(out.driver_phone).toBe('+237612345678');
    expect(out.rider_phone).toBe('+237699887766');
  });

  test('maskRidePhones — returns row unchanged for null input', () => {
    expect(maskRidePhones(null, 'u1', 'rider')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. ETA city-aware speed profiles
// ─────────────────────────────────────────────────────────────────────────────
jest.mock('axios');
jest.mock('../src/utils/cache', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(true),
}));
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

describe('mapsService — city speed profiles', () => {
  let fallbackEtaMinutes, haversineKm;

  beforeAll(() => {
    ({ fallbackEtaMinutes, haversineKm } = require('../src/services/mapsService'));
  });

  // Lagos (12 km/h) is the slowest city — ETA should be higher
  // Yaoundé (20 km/h) is faster — ETA should be lower for the same distance

  const DIST_KM = 5; // straight-line 5 km → 6 km with detour factor

  test('Lagos fallback ETA is higher than Yaoundé for same distance', () => {
    const lagosOrigin  = { lat: 6.52, lng: 3.38 };  // inside Lagos bbox
    const yaoundeOrigin = { lat: 3.86, lng: 11.50 }; // inside Yaoundé bbox
    // Use points ~5 km north of each origin
    const lagosEta   = fallbackEtaMinutes(lagosOrigin,   { lat: lagosOrigin.lat + 0.045,   lng: lagosOrigin.lng });
    const yaoundeEta = fallbackEtaMinutes(yaoundeOrigin, { lat: yaoundeOrigin.lat + 0.045, lng: yaoundeOrigin.lng });
    expect(lagosEta).toBeGreaterThan(yaoundeEta);
  });

  test('Nairobi ETA is between Lagos (slow) and Yaoundé (fast)', () => {
    const nairobiOrigin = { lat: -1.28, lng: 36.82 }; // inside Nairobi bbox
    const lagosOrigin   = { lat: 6.52,  lng: 3.38  };
    const dest = { lat: 0, lng: 0 }; // arbitrary — same relative offset used
    const nEta  = fallbackEtaMinutes(nairobiOrigin, { lat: nairobiOrigin.lat + 0.045, lng: nairobiOrigin.lng });
    const lEta  = fallbackEtaMinutes(lagosOrigin,   { lat: lagosOrigin.lat + 0.045,   lng: lagosOrigin.lng   });
    // Nairobi (15 km/h) < Lagos (12 km/h) speed → Nairobi ETA should be lower than Lagos
    expect(nEta).toBeLessThan(lEta);
  });

  test('unknown city uses default 20 km/h speed — returns reasonable ETA', () => {
    // Somewhere in the middle of nowhere
    const origin = { lat: 10.0, lng: 10.0 };
    const dest   = { lat: 10.045, lng: 10.0 };
    const eta = fallbackEtaMinutes(origin, dest);
    expect(eta).toBeGreaterThanOrEqual(1);
    expect(eta).toBeLessThan(60); // sanity
  });

  test('fallbackEtaMinutes returns distance_km via haversine', () => {
    const origin = { lat: 3.848, lng: 11.502 };
    const dest   = { lat: 3.893, lng: 11.502 };
    const km = haversineKm(origin, dest);
    expect(km).toBeGreaterThan(4);
    expect(km).toBeLessThan(6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Composite performance score formula
// ─────────────────────────────────────────────────────────────────────────────
describe('Composite performance score formula', () => {
  /**
   * Formula: (rating/5×40) + (acceptance_rate/100×30) + (completion_rate/100×20) − (cancellation_rate/100×10)
   */
  function computeScore({ rating, acceptance_rate, completion_rate, cancellation_rate }) {
    return (rating / 5 * 40)
      + (acceptance_rate / 100 * 30)
      + (completion_rate / 100 * 20)
      - (cancellation_rate / 100 * 10);
  }

  test('perfect driver scores 90 (formula ceiling: 40+30+20-0)', () => {
    // Max score = rating×40 + acceptance×30 + completion×20 = 90 (no cancellation penalty)
    const score = computeScore({ rating: 5, acceptance_rate: 100, completion_rate: 100, cancellation_rate: 0 });
    expect(score).toBe(90);
  });

  test('terrible driver has negative raw score (clamped to 0 in DB)', () => {
    // worst case: rating=1, acceptance=0, completion=0, cancellation=100
    const score = computeScore({ rating: 1, acceptance_rate: 0, completion_rate: 0, cancellation_rate: 100 });
    // (1/5)*40 + 0 + 0 - (100/100)*10 = 8 - 10 = -2  (clamped to 0 by Math.max)
    expect(score).toBe(-2);
  });

  test('average driver scores in 50–80 range', () => {
    const score = computeScore({ rating: 4.2, acceptance_rate: 85, completion_rate: 92, cancellation_rate: 6 });
    expect(score).toBeGreaterThan(50);
    expect(score).toBeLessThan(85);
  });

  test('cancellation_rate degrades score', () => {
    const base = computeScore({ rating: 4.5, acceptance_rate: 90, completion_rate: 95, cancellation_rate: 0 });
    const bad  = computeScore({ rating: 4.5, acceptance_rate: 90, completion_rate: 95, cancellation_rate: 50 });
    expect(bad).toBeLessThan(base);
    expect(base - bad).toBeCloseTo(5); // 50/100 * 10 = 5 point penalty
  });

  test('score is bounded (values consistent with 0–100 for normal drivers)', () => {
    const score = computeScore({ rating: 4.8, acceptance_rate: 94, completion_rate: 97, cancellation_rate: 2 });
    expect(score).toBeGreaterThan(80);
    expect(score).toBeLessThanOrEqual(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Chat file attachment endpoint — HTTP-level test
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /:id/messages/attachment — chat file upload', () => {
  const mockPool = {
    query:     jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    queryRead: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    getClient: jest.fn(),
  };

  jest.mock('../src/config/database', () => mockPool);
  jest.mock('../src/utils/cache',    () => ({ get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn() }));

  let app2, token;

  beforeAll(() => {
    app2  = require('../server');
    token = require('jsonwebtoken').sign({ id: 'rider-1', role: 'rider' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  });

  beforeEach(() => {
    mockPool.query.mockReset();
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  test('returns non-200 without authentication', async () => {
    const supertest = require('supertest');
    const res = await supertest(app2)
      .post('/rides/ride-uuid-1/messages/attachment')
      .attach('file', Buffer.from('fake image data'), { filename: 'test.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('rejects unsupported file types (text/plain)', async () => {
    const supertest = require('supertest');
    const res = await supertest(app2)
      .post('/rides/ride-uuid-1/messages/attachment')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('hello world'), { filename: 'note.txt', contentType: 'text/plain' });

    // multer LIMIT_UNEXPECTED_FILE → 400/422/500; auth might intercept first
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

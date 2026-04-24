'use strict';
/**
 * Tests for mapsService.js
 *
 * Verifies:
 *   1. Returns Google Maps ETA when API key is set and call succeeds
 *   2. Falls back to haversine when API call fails
 *   3. Falls back to haversine when API key is missing
 *   4. Falls back to haversine when element status is not OK
 *   5. Uses duration_in_traffic when available
 *   6. Returns cached result on second call (same grid cell)
 *   7. haversineKm / fallbackEtaMinutes are correct for a known pair
 */

process.env.NODE_ENV   = 'test';
process.env.JWT_SECRET = 'test_secret_minimum_32_chars_long_abc';

// Mock axios before requiring the module
jest.mock('axios');
const axios = require('axios');

// Mock the cache module
jest.mock('../src/utils/cache', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(true),
}));

jest.mock('../src/utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

const { getEtaMinutes, fallbackEtaMinutes, haversineKm } = require('../src/services/mapsService');
const cache = require('../src/utils/cache');

// Yaoundé city centre → ~3 km north
const ORIGIN = { lat: 3.848, lng: 11.502 };
const DEST   = { lat: 3.875, lng: 11.502 };

function makeApiResponse(durationSecs, withTraffic = false) {
  return {
    data: {
      rows: [{
        elements: [{
          status: 'OK',
          duration: { value: durationSecs },
          ...(withTraffic ? { duration_in_traffic: { value: durationSecs - 60 } } : {}),
        }],
      }],
    },
  };
}

describe('mapsService — getEtaMinutes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cache.get.mockResolvedValue(null);
    // Ensure API key env var is set for tests that exercise the Google path
    process.env.GOOGLE_MAPS_API_KEY = 'AIzaTestKey123';
  });

  afterEach(() => {
    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  test('returns Google ETA when API succeeds (no traffic data)', async () => {
    axios.get.mockResolvedValueOnce(makeApiResponse(600)); // 10 minutes
    const result = await getEtaMinutes(ORIGIN, DEST);
    expect(result.eta_minutes).toBe(10);
    expect(result.source).toBe('google');
  });

  test('uses duration_in_traffic when available', async () => {
    // duration=600s (10min), duration_in_traffic=540s (9min — 600-60=540)
    axios.get.mockResolvedValueOnce(makeApiResponse(600, true));
    const result = await getEtaMinutes(ORIGIN, DEST);
    expect(result.eta_minutes).toBe(9); // ceil(540/60) = 9
    expect(result.source).toBe('google');
  });

  test('caches result and returns it on second call', async () => {
    axios.get.mockResolvedValueOnce(makeApiResponse(300)); // 5 minutes
    await getEtaMinutes(ORIGIN, DEST);
    expect(cache.set).toHaveBeenCalled();

    // Second call — cache returns a value
    cache.get.mockResolvedValueOnce({ eta_minutes: 5, source: 'google' });
    const result = await getEtaMinutes(ORIGIN, DEST);
    expect(result.cached).toBe(true);
    expect(result.eta_minutes).toBe(5);
    expect(axios.get).toHaveBeenCalledTimes(1); // no second API call
  });

  test('falls back to haversine when API call fails', async () => {
    axios.get.mockRejectedValueOnce(new Error('ETIMEDOUT'));
    const result = await getEtaMinutes(ORIGIN, DEST);
    expect(result.source).toBe('haversine');
    expect(result.eta_minutes).toBeGreaterThanOrEqual(1);
  });

  test('falls back to haversine when element status is not OK', async () => {
    axios.get.mockResolvedValueOnce({
      data: { rows: [{ elements: [{ status: 'ZERO_RESULTS' }] }] },
    });
    const result = await getEtaMinutes(ORIGIN, DEST);
    expect(result.source).toBe('haversine');
  });

  test('falls back to haversine when API key is absent', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    const result = await getEtaMinutes(ORIGIN, DEST);
    expect(result.source).toBe('haversine');
    expect(axios.get).not.toHaveBeenCalled();
  });

  test('falls back to haversine when API key is placeholder', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'AIzaxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    const result = await getEtaMinutes(ORIGIN, DEST);
    expect(result.source).toBe('haversine');
    expect(axios.get).not.toHaveBeenCalled();
  });

  test('minimum ETA is 1 minute even for very close locations', async () => {
    axios.get.mockResolvedValueOnce(makeApiResponse(30)); // 30 seconds
    const result = await getEtaMinutes(ORIGIN, ORIGIN); // same point
    expect(result.eta_minutes).toBeGreaterThanOrEqual(1);
  });
});

describe('haversineKm / fallbackEtaMinutes', () => {
  test('haversineKm returns near-zero for same point', () => {
    expect(haversineKm(ORIGIN, ORIGIN)).toBeCloseTo(0, 5);
  });

  test('haversineKm returns ~3 km for Yaoundé north offset', () => {
    const km = haversineKm(ORIGIN, DEST);
    expect(km).toBeGreaterThan(2.5);
    expect(km).toBeLessThan(3.5);
  });

  test('fallbackEtaMinutes minimum is 1', () => {
    const eta = fallbackEtaMinutes(ORIGIN, ORIGIN);
    expect(eta).toBe(1);
  });

  test('fallbackEtaMinutes for ~3 km at 25 km/h is ~9 min (with detour)', () => {
    const eta = fallbackEtaMinutes(ORIGIN, DEST);
    // 3 km * 1.2 detour / 25 km/h * 60 = ~8.6 min → ceiled to 9
    expect(eta).toBeGreaterThanOrEqual(8);
    expect(eta).toBeLessThanOrEqual(12);
  });
});

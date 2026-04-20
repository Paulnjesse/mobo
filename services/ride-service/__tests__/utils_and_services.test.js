'use strict';
/**
 * utils_and_services.test.js
 *
 * Direct unit tests for pure utility / service modules:
 *   - src/utils/errors.js     — custom error classes
 *   - src/services/fareService.js — fare calculation, haversine, estimates
 *   - src/services/rideService.js — DB service layer (mocked DB)
 */

process.env.NODE_ENV     = 'test';
process.env.JWT_SECRET   = 'test_secret_minimum_32_chars_long_abc';
process.env.DATABASE_URL = 'postgresql://localhost/mobo_test';

// ─── Mock logger before anything else ────────────────────────────────────────
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  child: jest.fn().mockReturnThis(),
}));

// ─── Mock DB for rideService tests ───────────────────────────────────────────
const mockDb = {
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
};
jest.mock('../src/config/database', () => mockDb);

// ─── errors.js ───────────────────────────────────────────────────────────────
describe('errors.js — custom error classes', () => {
  let errors;
  beforeAll(() => { errors = require('../src/utils/errors'); });

  test('AppError sets statusCode, code, isOperational', () => {
    const e = new errors.AppError('test message', 418, 'TEAPOT');
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toBe('test message');
    expect(e.statusCode).toBe(418);
    expect(e.code).toBe('TEAPOT');
    expect(e.isOperational).toBe(true);
    expect(e.name).toBe('AppError');
  });

  test('AppError uses defaults when called with message only', () => {
    const e = new errors.AppError('oops');
    expect(e.statusCode).toBe(500);
    expect(e.code).toBe('INTERNAL_ERROR');
  });

  test('ValidationError is 400 with VALIDATION_ERROR code', () => {
    const e = new errors.ValidationError('bad input', [{ field: 'email' }]);
    expect(e.statusCode).toBe(400);
    expect(e.code).toBe('VALIDATION_ERROR');
    expect(e.fields).toEqual([{ field: 'email' }]);
    expect(e).toBeInstanceOf(errors.AppError);
  });

  test('ValidationError defaults to empty fields array', () => {
    const e = new errors.ValidationError('bad');
    expect(e.fields).toEqual([]);
  });

  test('NotFoundError is 404', () => {
    const e = new errors.NotFoundError('Ride');
    expect(e.statusCode).toBe(404);
    expect(e.message).toContain('Ride');
    expect(e.code).toBe('NOT_FOUND');
  });

  test('NotFoundError uses default resource name', () => {
    const e = new errors.NotFoundError();
    expect(e.message).toContain('Resource');
  });

  test('UnauthorizedError is 401', () => {
    const e = new errors.UnauthorizedError('login required');
    expect(e.statusCode).toBe(401);
    expect(e.code).toBe('UNAUTHORIZED');
  });

  test('UnauthorizedError uses default message', () => {
    const e = new errors.UnauthorizedError();
    expect(e.message).toBe('Authentication required');
  });

  test('ForbiddenError is 403', () => {
    const e = new errors.ForbiddenError('no access');
    expect(e.statusCode).toBe(403);
    expect(e.code).toBe('FORBIDDEN');
  });

  test('ForbiddenError uses default message', () => {
    const e = new errors.ForbiddenError();
    expect(e.message).toContain('permission');
  });

  test('ConflictError is 409', () => {
    const e = new errors.ConflictError('duplicate');
    expect(e.statusCode).toBe(409);
    expect(e.code).toBe('CONFLICT');
  });

  test('RateLimitError is 429', () => {
    const e = new errors.RateLimitError();
    expect(e.statusCode).toBe(429);
    expect(e.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  test('ServiceUnavailableError is 503', () => {
    const e = new errors.ServiceUnavailableError('Redis');
    expect(e.statusCode).toBe(503);
    expect(e.message).toContain('Redis');
    expect(e.code).toBe('SERVICE_UNAVAILABLE');
  });

  test('ServiceUnavailableError uses default service name', () => {
    const e = new errors.ServiceUnavailableError();
    expect(e.message).toContain('Service');
  });

  test('PaymentError is 402', () => {
    const e = new errors.PaymentError('card declined', 'stripe');
    expect(e.statusCode).toBe(402);
    expect(e.code).toBe('PAYMENT_FAILED');
    expect(e.provider).toBe('stripe');
  });

  test('PaymentError defaults provider to null', () => {
    const e = new errors.PaymentError('failed');
    expect(e.provider).toBeNull();
  });
});

// ─── fareService.js ──────────────────────────────────────────────────────────
describe('fareService.js', () => {
  let fareService;
  beforeAll(() => { fareService = require('../src/services/fareService'); });

  describe('haversineKm', () => {
    test('same point → 0 km', () => {
      const d = fareService.haversineKm(3.848, 11.502, 3.848, 11.502);
      expect(d).toBeCloseTo(0, 1);
    });

    test('Yaoundé to Douala ≈ 190 km', () => {
      const d = fareService.haversineKm(3.848, 11.502, 4.061, 9.778);
      expect(d).toBeGreaterThan(150);
      expect(d).toBeLessThan(300);
    });

    test('north to south', () => {
      const d = fareService.haversineKm(0, 0, 10, 0);
      expect(d).toBeGreaterThan(1000);
    });
  });

  describe('estimateDuration', () => {
    test('returns minimum 3 minutes for short distance', () => {
      expect(fareService.estimateDuration(0.5)).toBe(3);
    });

    test('10 km → 30 minutes', () => {
      expect(fareService.estimateDuration(10)).toBe(30);
    });

    test('rounds correctly', () => {
      expect(fareService.estimateDuration(5)).toBe(15);
    });
  });

  describe('calculateFare', () => {
    test('standard fare with no surge', () => {
      const result = fareService.calculateFare({ distanceKm: 5, durationMin: 15 });
      expect(result.total).toBeGreaterThan(0);
      expect(Number.isInteger(result.total)).toBe(true);
      expect(result.surgeMultiplier).toBe(1.0);
      expect(result.discount).toBe(0);
    });

    test('returns locked fare when priceLocked + lockedFare given', () => {
      const result = fareService.calculateFare({
        distanceKm: 10, durationMin: 30,
        priceLocked: true, lockedFare: 5000,
      });
      expect(result.total).toBe(5000);
      expect(result.base).toBe(5000);
      expect(result.serviceFee).toBe(0);
      expect(result.bookingFee).toBe(0);
    });

    test('surge multiplier increases fare', () => {
      const base   = fareService.calculateFare({ distanceKm: 5, durationMin: 15 });
      const surged = fareService.calculateFare({ distanceKm: 5, durationMin: 15, surgeMultiplier: 2.0 });
      expect(surged.total).toBeGreaterThan(base.total);
    });

    test('premium ride type uses premium rates', () => {
      const standard = fareService.calculateFare({ distanceKm: 5, durationMin: 15, rideType: 'standard' });
      const premium  = fareService.calculateFare({ distanceKm: 5, durationMin: 15, rideType: 'premium' });
      // Premium should cost more than or equal to standard
      expect(premium.total).toBeGreaterThanOrEqual(standard.total);
    });

    test('subscription discount reduces fare', () => {
      const base      = fareService.calculateFare({ distanceKm: 10, durationMin: 20, subscription: 'none' });
      const discounted = fareService.calculateFare({ distanceKm: 10, durationMin: 20, subscription: 'monthly' });
      expect(discounted.base).toBeLessThanOrEqual(base.base);
    });

    test('unknown ride type falls back to standard rates', () => {
      const result = fareService.calculateFare({ distanceKm: 5, durationMin: 15, rideType: 'unicorn' });
      const standard = fareService.calculateFare({ distanceKm: 5, durationMin: 15, rideType: 'standard' });
      expect(result.total).toBe(standard.total);
    });
  });

  describe('estimateFare', () => {
    test('uses default 5 km / 15 min when no coords given', () => {
      const r = fareService.estimateFare(null, null);
      expect(r.distanceKm).toBe(5);
      expect(r.durationMin).toBe(15);
      expect(r.fare.total).toBeGreaterThan(0);
    });

    test('calculates distance from real coordinates', () => {
      const r = fareService.estimateFare(
        { lat: 3.848, lng: 11.502 },
        { lat: 3.900, lng: 11.560 }
      );
      expect(r.distanceKm).toBeGreaterThan(0);
      expect(r.fare.total).toBeGreaterThan(0);
    });
  });
});

// ─── rideService.js ──────────────────────────────────────────────────────────
describe('rideService.js', () => {
  let rideService;
  beforeEach(() => {
    mockDb.query.mockReset();
    mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
    jest.resetModules();
    // Re-require after reset so mockDb changes are picked up
    rideService = require('../src/services/rideService');
  });

  describe('findActiveRide', () => {
    test('returns ride when found for rider', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'r1', status: 'in_progress' }] });
      const result = await rideService.findActiveRide(1, 'rider');
      expect(result).toEqual({ id: 'r1', status: 'in_progress' });
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('rider_id'),
        [1]
      );
    });

    test('returns null when no active ride', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const result = await rideService.findActiveRide(2, 'rider');
      expect(result).toBeNull();
    });

    test('uses driver_id column for driver role', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'r2', status: 'accepted' }] });
      await rideService.findActiveRide(5, 'driver');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('driver_id'),
        [5]
      );
    });
  });

  describe('getRideById', () => {
    test('returns ride when found', async () => {
      const mockRide = { id: 'r1', status: 'completed', rider_name: 'Alice' };
      mockDb.query.mockResolvedValueOnce({ rows: [mockRide] });
      const result = await rideService.getRideById('r1');
      expect(result).toEqual(mockRide);
    });

    test('returns null when not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const result = await rideService.getRideById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('updateRideStatus', () => {
    test('updates status to completed and returns row', async () => {
      const updated = { id: 'r1', status: 'completed' };
      mockDb.query.mockResolvedValueOnce({ rows: [updated] });
      const result = await rideService.updateRideStatus('r1', 'completed');
      expect(result).toEqual(updated);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE rides'),
        expect.arrayContaining(['completed', 'r1'])
      );
    });

    test('includes driverId in update when provided', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'r1', status: 'accepted', driver_id: 'd1' }] });
      await rideService.updateRideStatus('r1', 'accepted', { driverId: 'd1' });
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('driver_id'),
        expect.arrayContaining(['accepted', 'd1', 'r1'])
      );
    });

    test('includes actualFare in update when provided', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'r1', status: 'completed', actual_fare: 3500 }] });
      await rideService.updateRideStatus('r1', 'completed', { actualFare: 3500 });
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('actual_fare'),
        expect.arrayContaining(['completed', 3500, 'r1'])
      );
    });

    test('returns null when ride not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const result = await rideService.updateRideStatus('bad-id', 'cancelled');
      expect(result).toBeNull();
    });

    test('handles arriving status (no timestamp column)', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'r1', status: 'arriving' }] });
      const result = await rideService.updateRideStatus('r1', 'arriving');
      expect(result).toEqual({ id: 'r1', status: 'arriving' });
    });
  });

  describe('getRideHistory', () => {
    test('returns paginated ride history for rider', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'r1' }, { id: 'r2' }] });
      const result = await rideService.getRideHistory(1, 'rider', { limit: 10, offset: 0 });
      expect(result.total).toBe(3);
      expect(result.rides).toHaveLength(2);
    });

    test('uses rider_id column for rider role', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });
      await rideService.getRideHistory(1, 'rider');
      expect(mockDb.query).toHaveBeenNthCalledWith(1,
        expect.stringContaining('r.rider_id'),
        expect.any(Array)
      );
    });

    test('uses d.user_id column for driver role', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });
      await rideService.getRideHistory(2, 'driver');
      expect(mockDb.query).toHaveBeenNthCalledWith(1,
        expect.stringContaining('d.user_id'),
        expect.any(Array)
      );
    });

    test('uses default pagination when not provided', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });
      const result = await rideService.getRideHistory(1);
      expect(result.total).toBe(0);
      expect(result.rides).toHaveLength(0);
    });
  });
});

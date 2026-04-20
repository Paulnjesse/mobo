'use strict';
/**
 * payment_services.test.js
 *
 * Direct unit tests for:
 *   - src/utils/errors.js      — custom error classes
 *   - src/services/paymentService.js — wallet, payment, loyalty functions
 */

process.env.NODE_ENV     = 'test';
process.env.JWT_SECRET   = 'test_secret_minimum_32_chars_long_abc';
process.env.DATABASE_URL = 'postgresql://localhost/mobo_test';

jest.mock('../src/utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  child: jest.fn().mockReturnThis(),
}));

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

  test('AppError uses defaults', () => {
    const e = new errors.AppError('oops');
    expect(e.statusCode).toBe(500);
    expect(e.code).toBe('INTERNAL_ERROR');
  });

  test('ValidationError is 400', () => {
    const e = new errors.ValidationError('bad input', [{ field: 'email' }]);
    expect(e.statusCode).toBe(400);
    expect(e.code).toBe('VALIDATION_ERROR');
    expect(e.fields).toEqual([{ field: 'email' }]);
  });

  test('ValidationError defaults to empty fields', () => {
    const e = new errors.ValidationError('bad');
    expect(e.fields).toEqual([]);
  });

  test('NotFoundError is 404', () => {
    const e = new errors.NotFoundError('Payment');
    expect(e.statusCode).toBe(404);
    expect(e.code).toBe('NOT_FOUND');
    expect(e.message).toContain('Payment');
  });

  test('NotFoundError default resource', () => {
    const e = new errors.NotFoundError();
    expect(e.message).toContain('Resource');
  });

  test('UnauthorizedError is 401', () => {
    const e = new errors.UnauthorizedError('token expired');
    expect(e.statusCode).toBe(401);
    expect(e.code).toBe('UNAUTHORIZED');
  });

  test('UnauthorizedError default message', () => {
    const e = new errors.UnauthorizedError();
    expect(e.message).toBe('Authentication required');
  });

  test('ForbiddenError is 403', () => {
    const e = new errors.ForbiddenError('no access');
    expect(e.statusCode).toBe(403);
    expect(e.code).toBe('FORBIDDEN');
  });

  test('ForbiddenError default message', () => {
    const e = new errors.ForbiddenError();
    expect(e.message).toContain('permission');
  });

  test('ConflictError is 409', () => {
    const e = new errors.ConflictError('duplicate payment');
    expect(e.statusCode).toBe(409);
    expect(e.code).toBe('CONFLICT');
  });

  test('RateLimitError is 429', () => {
    const e = new errors.RateLimitError();
    expect(e.statusCode).toBe(429);
    expect(e.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  test('ServiceUnavailableError is 503', () => {
    const e = new errors.ServiceUnavailableError('Stripe');
    expect(e.statusCode).toBe(503);
    expect(e.message).toContain('Stripe');
    expect(e.code).toBe('SERVICE_UNAVAILABLE');
  });

  test('ServiceUnavailableError default', () => {
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

// ─── paymentService.js ────────────────────────────────────────────────────────
describe('paymentService.js', () => {
  let svc;

  beforeEach(() => {
    mockDb.query.mockReset();
    mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
    jest.resetModules();
    // Re-require after resetModules so fresh instance picks up mockDb
    svc = require('../src/services/paymentService');
  });

  describe('getOrCreateWallet', () => {
    test('upserts and returns wallet', async () => {
      const wallet = { id: 'w1', user_id: 1, balance: 0, currency: 'XAF' };
      mockDb.query.mockResolvedValueOnce({ rows: [wallet] });
      const result = await svc.getOrCreateWallet(1);
      expect(result).toEqual(wallet);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT'),
        [1]
      );
    });
  });

  describe('creditWallet', () => {
    test('credits wallet and inserts transaction', async () => {
      const updatedWallet = { id: 'w1', user_id: 1, balance: 500 };
      mockDb.query
        .mockResolvedValueOnce({ rows: [updatedWallet] })  // UPDATE wallets
        .mockResolvedValueOnce({ rows: [] });               // INSERT transaction
      const result = await svc.creditWallet(1, 500, 'refund');
      expect(result).toEqual(updatedWallet);
    });

    test('throws when wallet not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // UPDATE returns nothing
      await expect(svc.creditWallet(99, 500)).rejects.toThrow('Wallet not found');
    });

    test('uses custom db client', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ id: 'w1', balance: 1000 }] })
          .mockResolvedValueOnce({ rows: [] }),
      };
      const result = await svc.creditWallet(1, 200, 'bonus', mockClient);
      expect(mockClient.query).toHaveBeenCalledTimes(2);
      expect(result.balance).toBe(1000);
    });
  });

  describe('debitWallet', () => {
    test('debits wallet when sufficient balance', async () => {
      const updatedWallet = { id: 'w1', user_id: 1, balance: 4500 };
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ balance: '5000' }] }) // SELECT balance
        .mockResolvedValueOnce({ rows: [updatedWallet] })        // UPDATE wallets
        .mockResolvedValueOnce({ rows: [] });                    // INSERT transaction
      const result = await svc.debitWallet(1, 500, 'ride payment');
      expect(result).toEqual(updatedWallet);
    });

    test('throws when wallet not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // SELECT returns nothing
      await expect(svc.debitWallet(99, 500)).rejects.toThrow('Wallet not found');
    });

    test('throws when insufficient balance', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ balance: '100' }] });
      await expect(svc.debitWallet(1, 500)).rejects.toThrow('Insufficient wallet balance');
    });
  });

  describe('recordPayment', () => {
    test('inserts payment and returns it', async () => {
      const payment = { id: 'pay1', ride_id: 'r1', amount: 3000, status: 'pending' };
      mockDb.query.mockResolvedValueOnce({ rows: [payment] });
      const result = await svc.recordPayment({
        rideId: 'r1', userId: 1, amount: 3000, method: 'wallet', status: 'pending',
      });
      expect(result).toEqual(payment);
    });
  });

  describe('updatePaymentStatus', () => {
    test('updates and returns payment', async () => {
      const updated = { id: 'pay1', status: 'completed' };
      mockDb.query.mockResolvedValueOnce({ rows: [updated] });
      const result = await svc.updatePaymentStatus('pay1', 'completed', { provider: 'mtn' });
      expect(result).toEqual(updated);
    });
  });

  describe('findPaymentByReference', () => {
    test('returns payment when found', async () => {
      const payment = { id: 'pay1', reference: 'REF-123' };
      mockDb.query.mockResolvedValueOnce({ rows: [payment] });
      const result = await svc.findPaymentByReference('REF-123');
      expect(result).toEqual(payment);
    });

    test('returns null when not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const result = await svc.findPaymentByReference('NONEXISTENT');
      expect(result).toBeNull();
    });
  });

  describe('getLoyaltyPoints', () => {
    test('returns points when user has loyalty record', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ points: 150, tier: 'gold' }] });
      const result = await svc.getLoyaltyPoints(1);
      expect(result).toEqual({ points: 150, tier: 'gold' });
    });

    test('returns default when no loyalty record', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const result = await svc.getLoyaltyPoints(99);
      expect(result).toEqual({ points: 0, tier: 'bronze' });
    });
  });

  describe('awardRidePoints', () => {
    test('inserts/updates loyalty points and transaction', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // INSERT ON CONFLICT
        .mockResolvedValueOnce({ rows: [] }); // INSERT transaction
      await svc.awardRidePoints(1, 'r1');
      expect(mockDb.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('redeemPoints', () => {
    test('redeems points and credits wallet', async () => {
      const wallet = { id: 'w1', balance: 500 };
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ points: 200 }] }) // SELECT loyalty
        .mockResolvedValueOnce({ rows: [] })                 // UPDATE loyalty points
        .mockResolvedValueOnce({ rows: [wallet] })           // creditWallet UPDATE wallets
        .mockResolvedValueOnce({ rows: [] });                // creditWallet INSERT transaction
      const result = await svc.redeemPoints(1, 100);
      expect(result.pointsRedeemed).toBe(100);
      expect(result.xafCredited).toBe(500); // 100 * 5
    });

    test('throws when insufficient loyalty points', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ points: 50 }] }); // only 50 points
      await expect(svc.redeemPoints(1, 100)).rejects.toThrow('Insufficient loyalty points');
    });

    test('throws when no loyalty record', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // no loyalty record
      await expect(svc.redeemPoints(1, 50)).rejects.toThrow('Insufficient loyalty points');
    });
  });
});

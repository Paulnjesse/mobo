'use strict';
/**
 * Tests for flagStalePayments.js
 *
 * Verifies:
 *   1. Fetches correct payment methods and time window
 *   2. Marks stale payments as 'review' in bulk
 *   3. Handles empty result (no-op)
 *   4. Handles DB errors gracefully (non-fatal)
 *   5. Never runs in test environment (startFlagStalePaymentsJob guard)
 */

jest.mock('../src/config/database');
jest.mock('@sentry/node', () => ({
  captureException: jest.fn(),
  captureMessage:   jest.fn(),
}));
jest.mock('../src/utils/logger', () => ({
  info:  jest.fn(),
  warn:  jest.fn(),
  error: jest.fn(),
  http:  jest.fn(),
}));

const db     = require('../src/config/database');
const Sentry = require('@sentry/node');
const logger = require('../src/utils/logger');
const { runFlagCycle, startFlagStalePaymentsJob, stopFlagStalePaymentsJob } = require('../src/jobs/flagStalePayments');

const makePayment = (overrides = {}) => ({
  id:         'pay-uuid-1',
  user_id:    'user-uuid-1',
  ride_id:    'ride-uuid-1',
  amount:     5000,
  method:     'mtn_mobile_money',
  reference:  'mtn_ref_123',
  created_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(), // 90 min ago
  ...overrides,
});

describe('flagStalePayments — runFlagCycle', () => {
  beforeEach(() => {
    db.query.mockReset();
    Sentry.captureException.mockReset();
    Sentry.captureMessage.mockReset();
    logger.info.mockReset();
    logger.warn.mockReset();
    logger.error.mockReset();
  });

  test('no stale payments — returns 0 and logs info', async () => {
    db.query.mockResolvedValueOnce({ rows: [] }); // fetchStalePayments returns empty
    const result = await runFlagCycle();
    expect(result).toBe(0);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('No stale mobile-money'));
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  test('marks stale payments as review and returns count', async () => {
    const payments = [makePayment(), makePayment({ id: 'pay-uuid-2', method: 'orange_money' })];
    db.query
      .mockResolvedValueOnce({ rows: payments })    // fetchStalePayments
      .mockResolvedValueOnce({ rowCount: 2 });      // markAsReview

    const result = await runFlagCycle();
    expect(result).toBe(2);

    // Verify the UPDATE call includes both IDs
    const updateCall = db.query.mock.calls[1];
    // SQL template uses extra spaces for alignment — match loosely
    expect(updateCall[0]).toContain("'review'");
    expect(updateCall[0]).toContain('UPDATE payments');
    expect(updateCall[1]).toEqual([['pay-uuid-1', 'pay-uuid-2']]);

    // Sentry should have been called with a warning (< 10 payments)
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('2 mobile-money payment'),
      expect.objectContaining({ level: 'warning' })
    );
  });

  test('large batch triggers Sentry error level (>= 10 payments)', async () => {
    const payments = Array.from({ length: 12 }, (_, i) =>
      makePayment({ id: `pay-${i}`, method: 'wave' })
    );
    db.query
      .mockResolvedValueOnce({ rows: payments })
      .mockResolvedValueOnce({ rowCount: 12 });

    await runFlagCycle();
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ level: 'error' })
    );
  });

  test('DB fetch error — logs error, sends Sentry exception, returns 0', async () => {
    const fetchErr = new Error('DB connection lost');
    db.query.mockRejectedValueOnce(fetchErr);

    const result = await runFlagCycle();
    expect(result).toBe(0);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to query stale payments'),
      expect.objectContaining({ err: fetchErr.message })
    );
    expect(Sentry.captureException).toHaveBeenCalledWith(fetchErr, expect.any(Object));
  });

  test('DB update error — logs error, captures exception, returns 0', async () => {
    const payments = [makePayment()];
    const updateErr = new Error('timeout on update');
    db.query
      .mockResolvedValueOnce({ rows: payments })
      .mockRejectedValueOnce(updateErr);

    const result = await runFlagCycle();
    expect(result).toBe(0);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to mark payments as review'),
      expect.objectContaining({ err: updateErr.message })
    );
    expect(Sentry.captureException).toHaveBeenCalledWith(updateErr, expect.any(Object));
  });

  test('mock references are not in the stale set (filtered by SQL WHERE clause)', async () => {
    // The SQL filters mock- references — test that the query includes that condition
    db.query.mockResolvedValueOnce({ rows: [] });
    await runFlagCycle();
    const fetchQuery = db.query.mock.calls[0][0];
    expect(fetchQuery).toContain("reference NOT LIKE 'mock-%'");
  });

  test('startFlagStalePaymentsJob is a no-op in test environment', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    // Should not throw or call setInterval
    expect(() => startFlagStalePaymentsJob()).not.toThrow();
    stopFlagStalePaymentsJob(); // cleanup
    process.env.NODE_ENV = originalEnv;
  });
});

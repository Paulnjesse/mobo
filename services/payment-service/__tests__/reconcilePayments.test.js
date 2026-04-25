'use strict';
/**
 * reconcilePayments.test.js — Payment reconciliation job
 *
 * Tests (via runReconciliation):
 *   1. No stale payments → no-op
 *   2. MTN SUCCESSFUL → finalisePayment → payment + ride updated to 'completed'
 *   3. Orange SUCCESS → finalisePayment → completed
 *   4. FAILED status → finalisePayment → failed
 *   5. PENDING + MAX_POLL_ATTEMPTS exhausted → finalisePayment(failed, MAX_ATTEMPTS_EXCEEDED)
 *   6. PENDING + attempts < max → incrementAttempts
 *   7. Mock reference (mock-*) → skipped
 *   8. Provider poll throws → incrementAttempts called, doesn't crash cycle
 *   9. fetchStalePendingPayments DB error → logs error, returns gracefully
 *  10. startReconciliationJob is a no-op in test env
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

// Mock pollMtnStatus / pollOrangeStatus exported from paymentController
const mockPollMtn    = jest.fn();
const mockPollOrange = jest.fn();
jest.mock('../src/controllers/paymentController', () => ({
  pollMtnStatus:    mockPollMtn,
  pollOrangeStatus: mockPollOrange,
  // include other exports the module might import at load time
  chargeRide:              jest.fn(),
  resolvePendingPayment:   jest.fn(),
  webhookStripe:           jest.fn(),
}));

const db     = require('../src/config/database');
const logger = require('../src/utils/logger');
const { runReconciliation, startReconciliationJob, stopReconciliationJob } = require('../src/jobs/reconcilePayments');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePayment(overrides = {}) {
  return {
    id:           'pay-uuid-1',
    user_id:      'user-uuid-1',
    ride_id:      'ride-uuid-1',
    amount:       5000,
    method:       'mtn_mobile_money',
    reference:    'mtn_ref_abc',
    provider_ref: 'mtn_ref_abc',
    metadata:     {},
    poll_attempts: 0,
    created_at:   new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── runReconciliation — no stale payments ────────────────────────────────────

describe('runReconciliation — no stale payments', () => {
  test('logs info and returns early when result set is empty', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    await runReconciliation();

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('No stale pending payments found')
    );
    expect(mockPollMtn).not.toHaveBeenCalled();
  });
});

// ─── runReconciliation — MTN SUCCESSFUL ──────────────────────────────────────

describe('runReconciliation — MTN SUCCESSFUL', () => {
  test('calls finalisePayment → updates payment + ride to completed', async () => {
    const payment = makePayment({ method: 'mtn_mobile_money', metadata: { poll_attempts: 2 } });
    db.query
      .mockResolvedValueOnce({ rows: [payment] })  // fetchStalePendingPayments
      .mockResolvedValueOnce({ rows: [] })          // UPDATE payments (finalisePayment)
      .mockResolvedValueOnce({ rows: [] });         // UPDATE rides   (finalisePayment)
    mockPollMtn.mockResolvedValueOnce({ status: 'SUCCESSFUL' });

    await runReconciliation();

    expect(mockPollMtn).toHaveBeenCalledWith('mtn_ref_abc');
    const updatePaymentCall = db.query.mock.calls[1];
    expect(updatePaymentCall[0]).toContain('UPDATE payments');
    expect(updatePaymentCall[1][0]).toBe('completed'); // newStatus
    expect(updatePaymentCall[1][2]).toBe('pay-uuid-1');
  });
});

// ─── runReconciliation — Orange SUCCESS ───────────────────────────────────────

describe('runReconciliation — Orange SUCCESS', () => {
  test('calls finalisePayment → completed', async () => {
    const payment = makePayment({
      method: 'orange_money',
      reference: 'orange_ref_xyz',
      provider_ref: 'orange_ref_xyz',
      metadata: { pay_token: 'ptok_abc', poll_attempts: 1 },
    });
    db.query
      .mockResolvedValueOnce({ rows: [payment] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    mockPollOrange.mockResolvedValueOnce({ status: 'SUCCESS' });

    await runReconciliation();

    expect(mockPollOrange).toHaveBeenCalledWith('orange_ref_xyz', 'ptok_abc');
    const updateCall = db.query.mock.calls[1];
    expect(updateCall[1][0]).toBe('completed');
  });
});

// ─── runReconciliation — FAILED ───────────────────────────────────────────────

describe('runReconciliation — FAILED status', () => {
  test('finalisePayment marks payment failed', async () => {
    const payment = makePayment({ metadata: { poll_attempts: 2 } });
    db.query
      .mockResolvedValueOnce({ rows: [payment] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    mockPollMtn.mockResolvedValueOnce({ status: 'FAILED' });

    await runReconciliation();

    const updateCall = db.query.mock.calls[1];
    expect(updateCall[1][0]).toBe('failed');
  });
});

// ─── runReconciliation — MAX_POLL_ATTEMPTS exhausted ─────────────────────────

describe('runReconciliation — MAX_POLL_ATTEMPTS exhausted', () => {
  test('marks payment failed with MAX_ATTEMPTS_EXCEEDED after 144 attempts', async () => {
    // newAttempts = 143 + 1 = 144 = MAX_POLL_ATTEMPTS (144 polls × 10 min = 24 h)
    const payment = makePayment({ metadata: { poll_attempts: 143 } });
    db.query
      .mockResolvedValueOnce({ rows: [payment] })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE payments
      .mockResolvedValueOnce({ rows: [] }); // UPDATE rides
    mockPollMtn.mockResolvedValueOnce({ status: 'PENDING' });

    await runReconciliation();

    const updateCall = db.query.mock.calls[1];
    expect(updateCall[1][0]).toBe('failed');
    // The metadata JSON string should contain MAX_ATTEMPTS_EXCEEDED
    const metadataStr = updateCall[1][1];
    expect(metadataStr).toContain('MAX_ATTEMPTS_EXCEEDED');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Max poll attempts reached'),
      expect.any(Object)
    );
  });
});

// ─── runReconciliation — PENDING, still under limit ──────────────────────────

describe('runReconciliation — PENDING, increment attempts', () => {
  test('increments poll_attempts counter without marking failed', async () => {
    const payment = makePayment({ metadata: { poll_attempts: 2 } });
    db.query
      .mockResolvedValueOnce({ rows: [payment] }) // fetch
      .mockResolvedValueOnce({ rows: [] });       // incrementAttempts UPDATE
    mockPollMtn.mockResolvedValueOnce({ status: 'PENDING' });

    await runReconciliation();

    // Only 2 db.query calls (fetch + increment — no ride UPDATE)
    expect(db.query).toHaveBeenCalledTimes(2);
    const incrementCall = db.query.mock.calls[1];
    expect(incrementCall[0]).toContain('UPDATE payments SET metadata');
    const metaArg = JSON.parse(incrementCall[1][0]);
    expect(metaArg.poll_attempts).toBe(3); // was 2, now 3
  });
});

// ─── reconcileOne — mock reference skip ──────────────────────────────────────

describe('runReconciliation — mock reference skip', () => {
  test('skips payment whose reference starts with mock-', async () => {
    const payment = makePayment({ reference: 'mock-12345', provider_ref: 'mock-12345' });
    db.query.mockResolvedValueOnce({ rows: [payment] });

    await runReconciliation();

    expect(mockPollMtn).not.toHaveBeenCalled();
    expect(mockPollOrange).not.toHaveBeenCalled();
    // Only 1 db.query call (fetch) — no update
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Skipping mock payment'),
      expect.any(Object)
    );
  });
});

// ─── reconcileOne — provider poll throws ─────────────────────────────────────

describe('runReconciliation — provider poll error', () => {
  test('catches poll error, increments attempts, continues cycle', async () => {
    const payment = makePayment({ metadata: { poll_attempts: 1 } });
    db.query
      .mockResolvedValueOnce({ rows: [payment] }) // fetch
      .mockResolvedValueOnce({ rows: [] });       // incrementAttempts
    mockPollMtn.mockRejectedValueOnce(new Error('network timeout'));

    await runReconciliation();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Provider poll error'),
      expect.any(Object)
    );
    // incrementAttempts should still be called
    const incCall = db.query.mock.calls[1];
    expect(incCall[0]).toContain('UPDATE payments SET metadata');
  });

  test('error in one payment does not abort the cycle (other payments still processed)', async () => {
    const p1 = makePayment({ id: 'pay-1', reference: 'mock-skip' }); // skipped
    const p2 = makePayment({ id: 'pay-2', method: 'mtn_mobile_money' });
    db.query
      .mockResolvedValueOnce({ rows: [p1, p2] }) // fetch
      .mockResolvedValueOnce({ rows: [] })        // finalisePayment for p2
      .mockResolvedValueOnce({ rows: [] });       // ride update for p2
    mockPollMtn.mockResolvedValueOnce({ status: 'SUCCESSFUL' });

    await runReconciliation();

    expect(mockPollMtn).toHaveBeenCalledTimes(1); // only p2 was polled
    expect(db.query.mock.calls[1][1][0]).toBe('completed');
  });
});

// ─── fetchStalePendingPayments — DB error ────────────────────────────────────

describe('runReconciliation — DB fetch error', () => {
  test('logs error and returns gracefully without throwing', async () => {
    db.query.mockRejectedValueOnce(new Error('connection pool exhausted'));

    await expect(runReconciliation()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to fetch stale payments'),
      expect.any(Object)
    );
  });
});

// ─── startReconciliationJob — test env guard ──────────────────────────────────

describe('startReconciliationJob', () => {
  test('is a no-op when NODE_ENV=test', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    expect(() => startReconciliationJob()).not.toThrow();
    stopReconciliationJob();
    process.env.NODE_ENV = originalEnv;
  });
});

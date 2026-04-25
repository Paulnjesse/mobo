'use strict';
/**
 * settleEarnings.test.js — Saga earnings settlement job
 *
 * Tests:
 *   1. Happy-path settlement (BEGIN → SELECT FOR UPDATE → UPDATE drivers → UPDATE pending → COMMIT)
 *   2. Idempotency: no pending row (SKIP LOCKED) → returns settled:false, does ROLLBACK
 *   3. DB error mid-transaction → ROLLBACK + mark row as 'failed' + rethrow
 *   4. flagStaleEarnings: updates stale rows, logs, no-op on empty result
 *   5. flagStaleEarnings: handles DB error gracefully
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
const logger = require('../src/utils/logger');
const { settleDriverEarnings, flagStaleEarnings } = require('../src/jobs/settleEarnings');

// ─── Mock client factory ──────────────────────────────────────────────────────

function makeClient(queryMocks = []) {
  const client = {
    query:   jest.fn(),
    release: jest.fn(),
  };
  queryMocks.forEach((mock, i) => {
    if (mock instanceof Error) {
      client.query.mockRejectedValueOnce(mock);
    } else {
      client.query.mockResolvedValueOnce(mock);
    }
  });
  return client;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── settleDriverEarnings — happy path ────────────────────────────────────────

describe('settleDriverEarnings — happy path', () => {
  test('settles pending earnings and returns settled:true + amount_xaf', async () => {
    const pendingRow = { id: 'ep-uuid-1', driver_id: 'driver-uuid-1', amount_xaf: 4000 };
    const client = makeClient([
      { rows: [] },                   // BEGIN
      { rows: [pendingRow] },         // SELECT FOR UPDATE SKIP LOCKED
      { rows: [] },                   // UPDATE drivers
      { rows: [] },                   // UPDATE earnings_pending
      { rows: [] },                   // COMMIT
    ]);
    db.getClient.mockResolvedValue(client);

    const result = await settleDriverEarnings('ride-uuid-1');

    expect(result).toEqual({ settled: true, amount_xaf: 4000 });
    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT id, driver_id, amount_xaf'),
      ['ride-uuid-1']
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE drivers SET total_earnings'),
      [4000, 'driver-uuid-1']
    );
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  test('passes opts.notes to the settled row UPDATE', async () => {
    const pendingRow = { id: 'ep-uuid-2', driver_id: 'd-uuid-2', amount_xaf: 3000 };
    const client = makeClient([
      { rows: [] },
      { rows: [pendingRow] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
    ]);
    db.getClient.mockResolvedValue(client);

    await settleDriverEarnings('ride-uuid-2', { notes: 'stripe webhook' });

    const updatePendingCall = client.query.mock.calls.find(
      ([sql]) => sql && sql.includes('UPDATE earnings_pending')
    );
    expect(updatePendingCall).toBeDefined();
    expect(updatePendingCall[1]).toContain('stripe webhook');
  });
});

// ─── settleDriverEarnings — idempotency ───────────────────────────────────────

describe('settleDriverEarnings — idempotency (no pending row)', () => {
  test('returns settled:false when row is already settled or absent', async () => {
    const client = makeClient([
      { rows: [] },  // BEGIN
      { rows: [] },  // SELECT FOR UPDATE SKIP LOCKED → empty (row locked or gone)
    ]);
    // ROLLBACK call also needs a mock
    client.query.mockResolvedValue({ rows: [] });
    db.getClient.mockResolvedValue(client);

    const result = await settleDriverEarnings('ride-already-settled');

    expect(result).toEqual({ settled: false, amount_xaf: null });
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

  test('concurrent webhooks: second call gets empty result (SKIP LOCKED)', async () => {
    // Simulate two concurrent calls — first wins, second gets empty SELECT result
    const pendingRow = { id: 'ep-uuid-3', driver_id: 'd-uuid-3', amount_xaf: 2500 };

    const client1 = makeClient([
      { rows: [] }, { rows: [pendingRow] }, { rows: [] }, { rows: [] }, { rows: [] },
    ]);
    const client2 = makeClient([
      { rows: [] }, { rows: [] }, // BEGIN then empty SELECT
    ]);
    client2.query.mockResolvedValue({ rows: [] }); // ROLLBACK

    db.getClient
      .mockResolvedValueOnce(client1)
      .mockResolvedValueOnce(client2);

    const [r1, r2] = await Promise.all([
      settleDriverEarnings('ride-concurrent'),
      settleDriverEarnings('ride-concurrent'),
    ]);

    expect(r1.settled).toBe(true);
    expect(r2.settled).toBe(false);
  });
});

// ─── settleDriverEarnings — error handling ────────────────────────────────────

describe('settleDriverEarnings — error handling', () => {
  test('DB error triggers ROLLBACK + marks row failed + rethrows', async () => {
    const dbError = new Error('deadlock detected');
    const client = makeClient([
      { rows: [] },                           // BEGIN
      { rows: [{ id: 'ep-e', driver_id: 'd', amount_xaf: 1000 }] }, // SELECT
      dbError,                               // UPDATE drivers → throws
    ]);
    client.query.mockResolvedValue({ rows: [] }); // ROLLBACK
    db.getClient.mockResolvedValue(client);
    db.query.mockResolvedValue({ rows: [] }); // mark-failed UPDATE

    await expect(settleDriverEarnings('ride-err')).rejects.toThrow('deadlock detected');

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'failed'"),
      expect.arrayContaining(['deadlock detected', 'ride-err'])
    );
    expect(client.release).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  test('release is always called even after error', async () => {
    const client = makeClient([new Error('boom')]);
    client.query.mockResolvedValue({ rows: [] });
    db.getClient.mockResolvedValue(client);
    db.query.mockResolvedValue({ rows: [] });

    await expect(settleDriverEarnings('ride-release-test')).rejects.toThrow();
    expect(client.release).toHaveBeenCalled();
  });
});

// ─── flagStaleEarnings ────────────────────────────────────────────────────────

describe('flagStaleEarnings', () => {
  test('flags stale rows and logs warning with count and total XAF', async () => {
    const rows = [
      { ride_id: 'r1', driver_id: 'd1', amount_xaf: 2000 },
      { ride_id: 'r2', driver_id: 'd2', amount_xaf: 3000 },
    ];
    db.query.mockResolvedValueOnce({ rows });

    await flagStaleEarnings();

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE earnings_pending'),
      // no params — the 24h interval is interpolated
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Stale pending earnings flagged'),
      expect.objectContaining({ count: 2, totalXAF: 5000 })
    );
  });

  test('no stale rows → no warn log', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    await flagStaleEarnings();

    expect(logger.warn).not.toHaveBeenCalled();
  });

  test('DB error is caught and logged (non-fatal)', async () => {
    db.query.mockRejectedValueOnce(new Error('DB unavailable'));

    await expect(flagStaleEarnings()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('flagStaleEarnings error'),
      expect.any(Object)
    );
  });
});

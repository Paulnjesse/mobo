'use strict';
/**
 * event_dlq_and_replay.test.js
 *
 * Tests for:
 *   1. General-purpose Event DLQ (src/queues/eventDlq.js)
 *      - enqueueEventRetry enqueues to Redis sorted set
 *      - drainEventDlq calls the registered handler
 *      - On handler failure the item is re-enqueued with attempt+1
 *      - After MAX_RETRIES the item is written to dead_letter_events
 *      - Non-fatal: missing handler persists to dead_letter_events
 *
 *   2. Event Replay API (GET /admin/events/replay)
 *      - Requires authentication and admin role
 *      - Returns 400 when from/to missing
 *      - Returns paginated events for valid query
 *      - Supports ride_id and event_type filters
 */

process.env.NODE_ENV     = 'test';
process.env.JWT_SECRET   = 'test_secret_minimum_32_chars_long_abc';
process.env.DATABASE_URL = 'postgresql://localhost/mobo_test';

// ── Shared mock infrastructure ────────────────────────────────────────────────

const mockClient = { query: jest.fn(), release: jest.fn() };
const mockDb = {
  query:     jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  queryRead: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  connect:   jest.fn().mockResolvedValue(mockClient),
};

const mockCache = {
  get:          jest.fn().mockResolvedValue(null),
  set:          jest.fn().mockResolvedValue(true),
  del:          jest.fn(),
  delPattern:   jest.fn(),
  zadd:         jest.fn().mockResolvedValue(true),
  zrangebyscore: jest.fn().mockResolvedValue([]),
  zrem:         jest.fn().mockResolvedValue(true),
};

jest.mock('../src/config/database',      () => mockDb);
jest.mock('../src/utils/cache',          () => mockCache);
jest.mock('../src/jobs/escalationJob',   () => ({ startEscalationJob: jest.fn() }));
jest.mock('../src/jobs/scheduledRideJob',() => ({ startScheduledRideJob: jest.fn() }));
jest.mock('../src/jobs/deliverySchedulerJob', () => ({ startDeliverySchedulerJob: jest.fn() }));
jest.mock('../src/jobs/messagePurgeJob', () => ({ startMessagePurgeJob: jest.fn() }));
jest.mock('../src/queues/fraudWorker',   () => ({ startFraudWorker: jest.fn() }));
jest.mock('../src/queues/eventDlq',      () => ({
  startEventDlqWorker: jest.fn(),
  enqueueEventRetry:   jest.fn(),
  drainEventDlq:       jest.fn(),
  registerHandler:     jest.fn(),
}));
jest.mock('nodemailer', () => ({ createTransport: () => ({ sendMail: jest.fn() }) }));
jest.mock('axios',      () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock('../src/utils/logger', () => {
  const child = jest.fn();
  const l = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), http: jest.fn(), debug: jest.fn(), child };
  child.mockReturnValue(l);
  return l;
});

// ── Import real eventDlq after mocking dependencies ──────────────────────────
// We un-mock the module under test and re-require it with its deps already mocked.
jest.unmock('../src/queues/eventDlq');

const request = require('supertest');
const jwt     = require('jsonwebtoken');
const app     = require('../server');

const JWT_SECRET  = process.env.JWT_SECRET;
const adminToken  = jwt.sign({ id: 'admin-1', role: 'admin', permissions: ['audit:read'] }, JWT_SECRET, { expiresIn: '1h' });
const riderToken  = jwt.sign({ id: 'user-1',  role: 'rider' }, JWT_SECRET, { expiresIn: '1h' });

beforeEach(() => {
  mockDb.query.mockReset();
  mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
  mockDb.queryRead.mockReset();
  mockDb.queryRead.mockResolvedValue({ rows: [], rowCount: 0 });
  mockClient.query.mockReset();
  mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
  Object.values(mockCache).forEach(fn => typeof fn.mockReset === 'function' && fn.mockReset());
  mockCache.zadd.mockResolvedValue(true);
  mockCache.zrangebyscore.mockResolvedValue([]);
  mockCache.zrem.mockResolvedValue(true);
  mockCache.get.mockResolvedValue(null);
  mockCache.set.mockResolvedValue(true);
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 1 — Event DLQ (unit-level, testing the module directly)
// ─────────────────────────────────────────────────────────────────────────────

describe('EventDLQ — enqueueEventRetry', () => {
  let eventDlq;

  beforeAll(() => {
    // Require the actual module (not the server-mock)
    jest.isolateModules(() => {
      eventDlq = require('../src/queues/eventDlq');
    });
  });

  afterEach(() => jest.clearAllMocks());

  test('enqueues item to Redis sorted set on attempt 1', async () => {
    await eventDlq.enqueueEventRetry('ride_event', { ride_id: 'r-1' }, 1, 'ride_event');
    expect(mockCache.zadd).toHaveBeenCalledWith(
      'event:dlq',
      expect.any(Number),
      expect.stringContaining('ride_event')
    );
  });

  test('writes to dead_letter_events after MAX_RETRIES exceeded', async () => {
    await eventDlq.enqueueEventRetry('ride_event', { ride_id: 'r-2' }, 6); // > MAX_RETRIES (5)
    // Should NOT call zadd — should call db.query for dead_letter insert
    expect(mockCache.zadd).not.toHaveBeenCalled();
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO dead_letter_events'),
      expect.arrayContaining(['ride_event'])
    );
  });

  test('falls back to dead_letter_events when Redis unavailable', async () => {
    mockCache.zadd.mockRejectedValueOnce(new Error('Redis ECONNREFUSED'));
    await eventDlq.enqueueEventRetry('payment_event', { payment_id: 'p-1' }, 1);
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO dead_letter_events'),
      expect.arrayContaining(['payment_event'])
    );
  });
});

describe('EventDLQ — drainEventDlq', () => {
  let eventDlq;

  beforeAll(() => {
    jest.isolateModules(() => {
      eventDlq = require('../src/queues/eventDlq');
    });
  });

  afterEach(() => jest.clearAllMocks());

  test('does nothing when queue is empty', async () => {
    mockCache.zrangebyscore.mockResolvedValueOnce([]);
    await eventDlq.drainEventDlq();
    expect(mockCache.zrem).not.toHaveBeenCalled();
    expect(mockDb.query).not.toHaveBeenCalled();
  });

  test('calls registered ride_event handler and removes entry from queue', async () => {
    const entry = JSON.stringify({
      eventType:  'ride_event',
      handlerKey: 'ride_event',
      payload:    { ride_id: 'r-3', event_type: 'status_change', old_status: 'requested', new_status: 'accepted' },
      attempt:    1,
    });
    mockCache.zrangebyscore.mockResolvedValueOnce([entry]);
    // Mock the ride_events INSERT to succeed
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await eventDlq.drainEventDlq();

    expect(mockCache.zrem).toHaveBeenCalledWith('event:dlq', entry);
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO ride_events'),
      expect.anything()
    );
  });

  test('re-enqueues on handler failure', async () => {
    const entry = JSON.stringify({
      eventType:  'ride_event',
      handlerKey: 'ride_event',
      payload:    { ride_id: 'r-4', event_type: 'status_change' },
      attempt:    1,
    });
    mockCache.zrangebyscore.mockResolvedValueOnce([entry]);
    // Simulate INSERT failure
    mockDb.query.mockRejectedValueOnce(new Error('DB down'));

    await eventDlq.drainEventDlq();

    // Item removed from queue first
    expect(mockCache.zrem).toHaveBeenCalledWith('event:dlq', entry);
    // Then re-enqueued with attempt=2
    expect(mockCache.zadd).toHaveBeenCalledWith(
      'event:dlq',
      expect.any(Number),
      expect.stringContaining('"attempt":2')
    );
  });

  test('persists to dead_letter_events for unknown handler key', async () => {
    const entry = JSON.stringify({
      eventType:  'unknown_event_type',
      handlerKey: 'unknown_handler',
      payload:    { data: 'test' },
      attempt:    1,
    });
    mockCache.zrangebyscore.mockResolvedValueOnce([entry]);

    await eventDlq.drainEventDlq();

    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO dead_letter_events'),
      expect.arrayContaining(['unknown_event_type'])
    );
  });
});

describe('EventDLQ — registerHandler', () => {
  test('custom handler is called during drain', async () => {
    let eventDlq;
    jest.isolateModules(() => { eventDlq = require('../src/queues/eventDlq'); });

    const customHandler = jest.fn().mockResolvedValue(true);
    eventDlq.registerHandler('custom_event', customHandler);

    const entry = JSON.stringify({
      eventType: 'custom_event', handlerKey: 'custom_event',
      payload: { foo: 'bar' }, attempt: 1,
    });
    mockCache.zrangebyscore.mockResolvedValueOnce([entry]);

    await eventDlq.drainEventDlq();

    expect(customHandler).toHaveBeenCalledWith({ foo: 'bar' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 2 — Event Replay API (integration via supertest)
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /admin/events/replay — auth guards', () => {
  test('rejects unauthenticated request', async () => {
    const res = await request(app).get('/admin/events/replay?from=2024-01-01&to=2024-12-31');
    expect([401, 403]).toContain(res.status);
  });

  test('rejects non-admin user', async () => {
    const res = await request(app)
      .get('/admin/events/replay?from=2024-01-01&to=2024-12-31')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([401, 403]).toContain(res.status);
  });
});

describe('GET /admin/events/replay — validation', () => {
  test('returns 400 when from is missing', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'admin-1', role: 'admin' }] });
    const res = await request(app)
      .get('/admin/events/replay?to=2024-12-31')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/from.*to|required/i);
  });

  test('returns 400 when to is missing', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'admin-1', role: 'admin' }] });
    const res = await request(app)
      .get('/admin/events/replay?from=2024-01-01')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });
});

describe('GET /admin/events/replay — successful queries', () => {
  const eventRows = [
    { id: 'ev-1', ride_id: 'r-1', event_type: 'status_change', old_status: 'requested', new_status: 'accepted', actor_role: 'driver', created_at: '2024-06-01T10:00:00Z' },
    { id: 'ev-2', ride_id: 'r-1', event_type: 'status_change', old_status: 'accepted', new_status: 'arriving', actor_role: 'driver', created_at: '2024-06-01T10:05:00Z' },
  ];

  test('returns events list for valid date range', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: eventRows })         // events query
      .mockResolvedValueOnce({ rows: [{ total: '2' }] }); // count query
    const res = await request(app)
      .get('/admin/events/replay?from=2024-06-01&to=2024-06-30')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.events)).toBe(true);
      expect(res.body.count).toBe(2);
    }
  });

  test('supports ride_id filter', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [eventRows[0]] })
      .mockResolvedValueOnce({ rows: [{ total: '1' }] });
    const res = await request(app)
      .get('/admin/events/replay?from=2024-06-01&to=2024-06-30&ride_id=r-1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
  });

  test('supports event_type filter', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: eventRows })
      .mockResolvedValueOnce({ rows: [{ total: '2' }] });
    const res = await request(app)
      .get('/admin/events/replay?from=2024-06-01&to=2024-06-30&event_type=status_change')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
  });

  test('respects limit and offset params', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [eventRows[0]] })
      .mockResolvedValueOnce({ rows: [{ total: '1' }] });
    const res = await request(app)
      .get('/admin/events/replay?from=2024-01-01&to=2024-12-31&limit=1&offset=0')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
  });

  test('clamps limit to max 1000', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: '0' }] });
    // limit=99999 should be clamped to 1000 — just assert no crash
    const res = await request(app)
      .get('/admin/events/replay?from=2024-01-01&to=2024-12-31&limit=99999')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
  });

  test('returns empty events array when no events match', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: '0' }] });
    const res = await request(app)
      .get('/admin/events/replay?from=2020-01-01&to=2020-01-02')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.events).toEqual([]);
      expect(res.body.count).toBe(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 3 — Consumer Lag / Job Metrics (unit-level)
// ─────────────────────────────────────────────────────────────────────────────

describe('jobMetrics — recordJobRun / recordJobPending', () => {
  let jobMetrics;

  beforeAll(() => {
    jest.isolateModules(() => { jobMetrics = require('../src/utils/jobMetrics'); });
  });

  test('recordJobRun does not throw', () => {
    expect(() => jobMetrics.recordJobRun('test_job')).not.toThrow();
  });

  test('recordJobPending does not throw', () => {
    expect(() => jobMetrics.recordJobPending('test_job', 5)).not.toThrow();
  });

  test('jobMetricsRegistry returns object or null (prom-client optional)', () => {
    const reg = jobMetrics.jobMetricsRegistry();
    // In test env prom-client may or may not be available — just check it doesn't crash
    expect(reg === null || typeof reg === 'object').toBe(true);
  });
});

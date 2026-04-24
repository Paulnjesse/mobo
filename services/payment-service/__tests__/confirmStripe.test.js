'use strict';
/**
 * Tests for POST /payments/stripe/confirm
 *
 * Verifies:
 *   1. Returns mock success in dev mode (no STRIPE_SECRET_KEY)
 *   2. Returns 400 when payment_intent_id is missing
 *   3. Returns 403 when PI user_id does not match authenticated user
 *   4. Returns success + updates DB when PI status is 'succeeded'
 *   5. Returns correct status when PI is 'requires_action'
 *   6. Handles Stripe API errors gracefully
 */

process.env.NODE_ENV     = 'test';
process.env.JWT_SECRET   = 'test_secret_minimum_32_chars_long_abc';
process.env.DATABASE_URL = 'postgresql://localhost/mobo_test';

const mockDb = {
  query:     jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  queryRead: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
};
jest.mock('../src/config/database', () => mockDb);
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), http: jest.fn(),
}));
jest.mock('@sentry/node', () => ({ captureException: jest.fn(), init: jest.fn() }));

const express  = require('express');
const request  = require('supertest');

// ── Build a minimal app that exercises confirmStripePayment ──────────────────
function buildApp(mockStripe = null) {
  // If mockStripe is provided, inject it so the controller uses our mock
  if (mockStripe) {
    jest.doMock('stripe', () => () => mockStripe);
    process.env.STRIPE_SECRET_KEY = 'sk_test_real';
  } else {
    delete process.env.STRIPE_SECRET_KEY;
  }

  jest.resetModules(); // pick up the new stripe mock

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'user-abc', role: 'rider' };
    next();
  });
  // Re-require after resetModules so our stripe mock is used
  const { confirmStripePayment } = require('../src/controllers/paymentController');
  app.post('/payments/stripe/confirm', confirmStripePayment);
  return app;
}

describe('POST /payments/stripe/confirm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
    jest.resetModules();
  });

  test('dev mode — returns mock success when STRIPE_SECRET_KEY not set', async () => {
    const app = buildApp(null);
    const res = await request(app).post('/payments/stripe/confirm')
      .send({ payment_intent_id: 'pi_mock_123' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.mock).toBe(true);
  });

  test('returns 400 when payment_intent_id is missing', async () => {
    const app = buildApp(null);
    const res = await request(app).post('/payments/stripe/confirm').send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('payment_intent_id');
  });

  test('returns success and updates DB when PI succeeded', async () => {
    const mockPi = {
      id:       'pi_test_abc',
      status:   'succeeded',
      amount:   5000,
      currency: 'xaf',
      metadata: { user_id: 'user-abc', ride_id: 'ride-1' },
    };
    const mockStripe = { paymentIntents: { retrieve: jest.fn().mockResolvedValue(mockPi) } };
    const app = buildApp(mockStripe);

    const res = await request(app).post('/payments/stripe/confirm')
      .send({ payment_intent_id: 'pi_test_abc', ride_id: 'ride-1' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('succeeded');
    expect(res.body.amount).toBe(5000);

    // DB upsert should have been called
    const upsertCall = mockDb.query.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO payments')
    );
    expect(upsertCall).toBeTruthy();
  });

  test('returns 403 when PI user_id does not match authenticated user', async () => {
    const mockPi = {
      id:       'pi_test_other',
      status:   'succeeded',
      amount:   5000,
      currency: 'xaf',
      metadata: { user_id: 'other-user-id' }, // different user
    };
    const mockStripe = { paymentIntents: { retrieve: jest.fn().mockResolvedValue(mockPi) } };
    const app = buildApp(mockStripe);

    const res = await request(app).post('/payments/stripe/confirm')
      .send({ payment_intent_id: 'pi_test_other' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('returns non-succeeded status when PI requires_action', async () => {
    const mockPi = {
      id: 'pi_3ds', status: 'requires_action',
      amount: 3000, currency: 'xaf',
      metadata: { user_id: 'user-abc' },
    };
    const mockStripe = { paymentIntents: { retrieve: jest.fn().mockResolvedValue(mockPi) } };
    const app = buildApp(mockStripe);

    const res = await request(app).post('/payments/stripe/confirm')
      .send({ payment_intent_id: 'pi_3ds' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.status).toBe('requires_action');
  });

  test('returns 400 when Stripe retrieve throws', async () => {
    const mockStripe = {
      paymentIntents: { retrieve: jest.fn().mockRejectedValue(new Error('No such payment_intent')) },
    };
    const app = buildApp(mockStripe);

    const res = await request(app).post('/payments/stripe/confirm')
      .send({ payment_intent_id: 'pi_nonexistent' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

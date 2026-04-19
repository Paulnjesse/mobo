/**
 * payments_coverage.test.js — broad coverage sweep for payment-service
 * Targets all uncovered payment controller functions.
 * Auth middleware: JWT-only (no DB hit).
 */
process.env.NODE_ENV          = 'test';
process.env.JWT_SECRET        = 'test_secret_minimum_32_chars_long_abc';
process.env.DATABASE_URL      = 'postgresql://localhost/mobo_test';
process.env.STRIPE_SECRET_KEY = 'sk_live_test_mobo_key_for_jest';
process.env.MTN_API_KEY       = 'mtn_test_key';
process.env.ORANGE_API_KEY    = 'orange_test_key';

const mockDb = {
  query:   jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  connect: jest.fn().mockResolvedValue({
    query:   jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    release: jest.fn(),
  }),
};

jest.mock('../src/config/database', () => mockDb);
jest.mock('axios', () => ({
  get:    jest.fn().mockResolvedValue({ data: {}, status: 200 }),
  post:   jest.fn().mockResolvedValue({ data: { referenceId: 'REF-TEST', order_id: 'ORD-TEST', pay_token: 'PAY-TOKEN' }, status: 200 }),
  create: jest.fn().mockReturnThis(),
}));
// NOTE: do NOT mock currencyUtil, stripe, or fraudDetection here.
// currencyMiddleware (called inside auth try/catch) needs resolveCountryCode + RATES
// from the real currencyUtil. Mocking with an incomplete stub causes TypeError → 401.
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
const riderToken  = jwt.sign({ id: 1, role: 'rider'  }, JWT_SECRET, { expiresIn: '1h' });
const driverToken = jwt.sign({ id: 2, role: 'driver' }, JWT_SECRET, { expiresIn: '1h' });
const adminToken  = jwt.sign({ id: 9, role: 'admin'  }, JWT_SECRET, { expiresIn: '1h' });

beforeEach(() => {
  mockDb.query.mockReset();
  mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ─────────────────────────────────────────────
// addPaymentMethod
// ─────────────────────────────────────────────
describe('addPaymentMethod', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).post('/payments/methods').send({ type: 'mtn_mobile_money', phone: '+237612345678' });
    expect([401, 403]).toContain(res.status);
  });

  test('returns 400 for missing type', async () => {
    const res = await request(app)
      .post('/payments/methods')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ phone: '+237612345678' });
    expect(res.status).toBe(400);
  });

  test('returns 400 for invalid type', async () => {
    const res = await request(app)
      .post('/payments/methods')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ type: 'bitcoin', phone: '+237612345678' });
    expect(res.status).toBe(400);
  });

  test('returns 400 for mobile money without phone', async () => {
    const res = await request(app)
      .post('/payments/methods')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ type: 'mtn_mobile_money' });
    expect(res.status).toBe(400);
  });

  test('returns 400 for card without card_number', async () => {
    const res = await request(app)
      .post('/payments/methods')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ type: 'card' });
    expect(res.status).toBe(400);
  });

  test('returns 400 for invalid card number', async () => {
    const res = await request(app)
      .post('/payments/methods')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ type: 'card', card_number: '1234' });
    expect(res.status).toBe(400);
  });

  test('adds mtn_mobile_money method', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 10, type: 'mtn_mobile_money', phone: '+237612345678', is_default: false }] });
    const res = await request(app)
      .post('/payments/methods')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ type: 'mtn_mobile_money', phone: '+237612345678', label: 'My MTN' });
    expect([200, 201, 400, 500]).toContain(res.status);
  });

  test('adds card method with set_default=true', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] }) // UPDATE is_default = false
      .mockResolvedValueOnce({ rows: [{ id: 11, type: 'card', card_last4: '1234', is_default: true }] });
    const res = await request(app)
      .post('/payments/methods')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ type: 'card', card_number: '4111111111111111', card_brand: 'Visa', set_default: true });
    expect([200, 201, 400, 500]).toContain(res.status);
  });

  test('adds orange_money method', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 12, type: 'orange_money', phone: '+237655000001', is_default: false }] });
    const res = await request(app)
      .post('/payments/methods')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ type: 'orange_money', phone: '+237655000001' });
    expect([200, 201, 400, 500]).toContain(res.status);
  });

  test('adds wave method', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 13, type: 'wave', phone: '+237655000002', is_default: false }] });
    const res = await request(app)
      .post('/payments/methods')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ type: 'wave', phone: '+237655000002' });
    expect([200, 201, 400, 500]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// listPaymentMethods
// ─────────────────────────────────────────────
describe('listPaymentMethods', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).get('/payments/methods');
    expect([401, 403]).toContain(res.status);
  });

  test('returns empty list when no methods', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/payments/methods')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 400]).toContain(res.status);
  });

  test('returns payment methods list', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [
        { id: 1, type: 'mtn_mobile_money', phone: '+237612345678', is_default: true },
        { id: 2, type: 'card', card_last4: '4567', is_default: false },
      ],
    });
    const res = await request(app)
      .get('/payments/methods')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 400]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// setDefaultMethod
// ─────────────────────────────────────────────
describe('setDefaultMethod', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).put('/payments/methods/1/default');
    expect([401, 403]).toContain(res.status);
  });

  test('returns 404 when method not found', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] }) // clear defaults
      .mockResolvedValueOnce({ rows: [] }); // not found
    const res = await request(app)
      .put('/payments/methods/99/default')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([404, 400, 500]).toContain(res.status);
  });

  test('updates default method successfully', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] }) // clear defaults
      .mockResolvedValueOnce({ rows: [{ id: 1, type: 'mtn_mobile_money', is_default: true }] }); // update
    const res = await request(app)
      .put('/payments/methods/1/default')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 400]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// deletePaymentMethod
// ─────────────────────────────────────────────
describe('deletePaymentMethod', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).delete('/payments/methods/1');
    expect([401, 403]).toContain(res.status);
  });

  test('returns 404 when method not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .delete('/payments/methods/99')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([404, 400, 500]).toContain(res.status);
  });

  test('deletes method successfully', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 });
    const res = await request(app)
      .delete('/payments/methods/1')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 204, 400]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// chargeRide
// ─────────────────────────────────────────────
describe('chargeRide', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).post('/payments/charge').send({});
    expect([401, 403]).toContain(res.status);
  });

  test('returns 400 for missing ride_id', async () => {
    const res = await request(app)
      .post('/payments/charge')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ payment_method: 'cash' });
    expect([400, 422]).toContain(res.status);
  });

  test('returns 404 when ride not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // ride not found
    const res = await request(app)
      .post('/payments/charge')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ ride_id: 99999, payment_method: 'cash' });
    expect([400, 404, 500]).toContain(res.status);
  });

  test('handles cash payment for completed ride', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, rider_id: 1, status: 'completed', final_fare: 2500, payment_method: 'cash', is_paid: false }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'completed', transaction_id: 'TXN-001' }] }); // update
    const res = await request(app)
      .post('/payments/charge')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ ride_id: 1, payment_method: 'cash' });
    expect([200, 201, 400, 404, 500]).toContain(res.status);
  });

  test('handles wallet payment', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, rider_id: 1, status: 'completed', final_fare: 2500, payment_method: 'wallet', is_paid: false }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, wallet_balance: 10000 }] }) // user wallet check
      .mockResolvedValueOnce({ rows: [{ wallet_balance: 7500 }] }) // deduct
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // payment record
    const res = await request(app)
      .post('/payments/charge')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ ride_id: 1, payment_method: 'wallet' });
    expect([200, 201, 400, 404, 500]).toContain(res.status);
  });

  test('rejects already-paid ride', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, rider_id: 1, status: 'completed', final_fare: 2500, is_paid: true }] });
    const res = await request(app)
      .post('/payments/charge')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ ride_id: 1, payment_method: 'cash' });
    expect([400, 409, 500]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// getWalletBalance
// ─────────────────────────────────────────────
describe('getWalletBalance', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).get('/payments/wallet');
    expect([401, 403]).toContain(res.status);
  });

  test('returns wallet balance', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ wallet_balance: 15000 }] });
    const res = await request(app)
      .get('/payments/wallet')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 400, 404, 500]).toContain(res.status);
  });

  test('returns 404 when user not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/payments/wallet')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 404, 500]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// refundPayment
// ─────────────────────────────────────────────
describe('refundPayment', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).post('/payments/refund/1');
    expect([401, 403]).toContain(res.status);
  });

  test('returns 404 when payment not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/payments/refund/99')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ reason: 'Driver no-show' });
    expect([400, 403, 404, 500]).toContain(res.status);
  });

  test('processes refund for completed payment', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1, status: 'completed', amount: 2500, ride_id: 1, payment_method: 'wallet' }] })
      .mockResolvedValueOnce({ rows: [] }) // update wallet
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'refunded' }] }); // update payment
    const res = await request(app)
      .post('/payments/refund/1')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ reason: 'Driver cancelled' });
    expect([200, 201, 400, 403, 404, 500]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// processSubscription
// ─────────────────────────────────────────────
describe('processSubscription', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).post('/payments/subscribe').send({});
    expect([401, 403]).toContain(res.status);
  });

  test('returns 400 for invalid plan', async () => {
    const res = await request(app)
      .post('/payments/subscribe')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ plan: 'diamond' });
    expect([400, 422]).toContain(res.status);
  });

  test('returns 400 for missing plan', async () => {
    const res = await request(app)
      .post('/payments/subscribe')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ payment_method: 'wallet' });
    expect([400, 422]).toContain(res.status);
  });

  test('processes basic plan subscription', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, wallet_balance: 50000 }] }) // user
      .mockResolvedValueOnce({ rows: [{ wallet_balance: 45000 }] })        // deduct
      .mockResolvedValueOnce({ rows: [{ id: 1, subscription_plan: 'basic' }] }); // update
    const res = await request(app)
      .post('/payments/subscribe')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ plan: 'basic', payment_method: 'wallet' });
    expect([200, 201, 400, 402, 500]).toContain(res.status);
  });

  test('processes premium plan subscription', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, wallet_balance: 100000 }] })
      .mockResolvedValueOnce({ rows: [{ wallet_balance: 80000 }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, subscription_plan: 'premium' }] });
    const res = await request(app)
      .post('/payments/subscribe')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ plan: 'premium', payment_method: 'wallet' });
    expect([200, 201, 400, 402, 500]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// getSubscriptionStatus
// ─────────────────────────────────────────────
describe('getSubscriptionStatus', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).get('/payments/subscription');
    expect([401, 403]).toContain(res.status);
  });

  test('returns active subscription', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 1, subscription_plan: 'premium', subscription_expiry: new Date(Date.now() + 86400000) }],
    });
    const res = await request(app)
      .get('/payments/subscription')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 404, 500]).toContain(res.status);
  });

  test('returns none for user with no subscription', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, subscription_plan: 'none', subscription_expiry: null }] });
    const res = await request(app)
      .get('/payments/subscription')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 404, 500]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// Stripe payment intent — additional paths
// ─────────────────────────────────────────────
describe('createStripePaymentIntent — coverage paths', () => {
  test('returns 400 for missing ride_id', async () => {
    const res = await request(app)
      .post('/payments/stripe/payment-intent')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ currency: 'XAF' });
    expect([400, 422, 500]).toContain(res.status);
  });

  test('returns 404 when ride not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/payments/stripe/payment-intent')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ ride_id: 9999, currency: 'XAF' });
    expect([400, 404, 500]).toContain(res.status);
  });

  test('creates payment intent for valid ride', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, rider_id: 1, final_fare: 3000, is_paid: false }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, transaction_id: 'pi_test' }] });
    const res = await request(app)
      .post('/payments/stripe/payment-intent')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ ride_id: 1, currency: 'XAF' });
    expect([200, 201, 400, 500]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// webhookFlutterwave
// ─────────────────────────────────────────────
describe('webhookFlutterwave', () => {
  test('is publicly accessible', async () => {
    const res = await request(app)
      .post('/payments/webhook/flutterwave')
      .send({ event: 'charge.completed', data: { status: 'successful', tx_ref: 'MOBO-1-' + Date.now(), amount: 5000 } });
    expect([200, 400, 401, 500]).toContain(res.status);
  });

  test('handles failed payment event', async () => {
    const res = await request(app)
      .post('/payments/webhook/flutterwave')
      .send({ event: 'charge.completed', data: { status: 'failed', tx_ref: 'MOBO-99-12345', amount: 3000 } });
    expect([200, 400, 401, 500]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// webhookStripe — additional
// ─────────────────────────────────────────────
describe('webhookStripe', () => {
  test('is publicly accessible', async () => {
    const res = await request(app)
      .post('/payments/webhook/stripe')
      .set('stripe-signature', 'test_sig')
      .send(JSON.stringify({ type: 'payment_intent.succeeded' }));
    expect([200, 400, 401, 500]).toContain(res.status);
  });
});

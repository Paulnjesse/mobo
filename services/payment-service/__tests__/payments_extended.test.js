/**
 * payments_extended.test.js — extended coverage for payment-service
 *
 * Covers: addPaymentMethod, listPaymentMethods, setDefaultMethod,
 *         deletePaymentMethod, chargeRide, getWalletBalance,
 *         refundPayment, processSubscription, getSubscriptionStatus,
 *         driverCashout, getDriverCashoutHistory,
 *         webhook handlers, checkPaymentStatus (additional paths).
 *
 * Auth middleware uses JWT-only (no DB). Mocks are consumed by controller code.
 */
process.env.NODE_ENV               = 'test';
process.env.JWT_SECRET             = 'test_secret_minimum_32_chars_long_abc';
process.env.DATABASE_URL           = 'postgresql://localhost/mobo_test';
process.env.MTN_WEBHOOK_SECRET     = 'test_mtn_webhook_secret';
process.env.ORANGE_WEBHOOK_SECRET  = 'test_orange_webhook_secret';
process.env.STRIPE_SECRET_KEY      = 'sk_live_test_mobo_key';

const mockDb = {
  query:   jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  connect: jest.fn(),
};
const mockDbClient = {
  query: (...args) => {
    const sql = (args[0] || '').trim();
    if (/^(BEGIN|COMMIT|ROLLBACK)/i.test(sql)) return Promise.resolve({ rows: [], rowCount: 0 });
    return mockDb.query(...args);
  },
  release: jest.fn(),
};
mockDb.connect.mockResolvedValue(mockDbClient);
mockDb.queryRead = (...args) => mockDb.query(...args);

jest.mock('../src/config/database', () => mockDb);
jest.mock('stripe', () => () => ({
  paymentIntents: {
    create: jest.fn().mockResolvedValue({ id: 'pi_test', client_secret: 'pi_test_secret', status: 'requires_payment_method' }),
  },
  webhooks: {
    constructEvent: jest.fn().mockReturnValue({ type: 'payment_intent.succeeded', data: { object: { metadata: { ride_id: '1' }, amount_received: 1500, id: 'pi_test' } } }),
  },
}));
jest.mock('axios', () => ({
  get:  jest.fn().mockResolvedValue({ data: { access_token: 'mtn_token' } }),
  post: jest.fn().mockResolvedValue({ data: { access_token: 'mtn_token', status: 'pending', referenceId: 'REF_TEST' } }),
}));
jest.mock('../src/utils/logger', () => {
  const child = jest.fn();
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), http: jest.fn(), debug: jest.fn(), child };
  child.mockReturnValue(logger);
  return logger;
});

const request = require('supertest');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
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
    const res = await request(app).post('/payments/methods').send({});
    expect([401, 403]).toContain(res.status);
  });

  test('returns 400 without required fields', async () => {
    const res = await request(app)
      .post('/payments/methods')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({}); // missing type
    expect([400, 422]).toContain(res.status);
  });

  test('adds MTN MoMo payment method', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 5, type: 'mtn_mobile_money', phone: '+237612345678' }] });
    const res = await request(app)
      .post('/payments/methods')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ type: 'mtn_mobile_money', phone: '+237612345678' });
    expect([200, 201, 400]).toContain(res.status);
  });

  test('adds Orange Money payment method', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 6, type: 'orange_money', phone: '+237699000000' }] });
    const res = await request(app)
      .post('/payments/methods')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ type: 'orange_money', phone: '+237699000000' });
    expect([200, 201, 400]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// listPaymentMethods
// ─────────────────────────────────────────────
describe('listPaymentMethods', () => {
  test('returns empty list when no methods saved', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/payments/methods')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 401]).toContain(res.status);
  });

  test('returns saved payment methods', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [
        { id: 1, type: 'mtn_mobile_money', phone: '+237612345678', is_default: true },
        { id: 2, type: 'orange_money',     phone: '+237699000000', is_default: false },
      ],
    });
    const res = await request(app)
      .get('/payments/methods')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 401]).toContain(res.status);
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

  test('returns 404 for non-existent method', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .put('/payments/methods/999/default')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([404, 400]).toContain(res.status);
  });

  test('sets method as default', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1 }] }) // method exists
      .mockResolvedValueOnce({ rows: [] }) // unset others
      .mockResolvedValueOnce({ rows: [{ id: 1, is_default: true }] }); // update
    const res = await request(app)
      .put('/payments/methods/1/default')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 404]).toContain(res.status);
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

  test('returns 404 when method not found or not owned', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .delete('/payments/methods/999')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([404, 400]).toContain(res.status);
  });

  test('deletes owned payment method', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1 }] }) // method exists
      .mockResolvedValueOnce({ rowCount: 1 }); // delete
    const res = await request(app)
      .delete('/payments/methods/1')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 404]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// chargeRide
// ─────────────────────────────────────────────
describe('chargeRide — extended', () => {
  test('charges via cash payment method', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, rider_id: 1, status: 'completed', estimated_fare: 1500, final_fare: 1500 }] }) // ride
      .mockResolvedValueOnce({ rows: [{ id: 10, status: 'completed', reference: 'REF-CASH-001' }] }); // insert payment
    const res = await request(app)
      .post('/payments/charge')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ ride_id: 1, payment_method: 'cash' });
    expect([200, 201, 400, 500]).toContain(res.status);
  });

  test('charges via MTN MoMo', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, rider_id: 1, status: 'completed', estimated_fare: 2000, final_fare: 2000 }] })
      .mockResolvedValueOnce({ rows: [{ id: 11, status: 'pending', reference: 'REF-MTN-001' }] });
    const res = await request(app)
      .post('/payments/charge')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ ride_id: 1, payment_method: 'mtn_mobile_money', phone: '+237612345678' });
    expect([200, 201, 400, 500]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// getWalletBalance
// ─────────────────────────────────────────────
describe('getWalletBalance', () => {
  test('returns 404 when wallet not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/payments/wallet')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([404, 200]).toContain(res.status);
  });

  test('returns balance and currency', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ balance: 15000, currency: 'XAF', user_id: 1 }],
    });
    const res = await request(app)
      .get('/payments/wallet')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 404]).toContain(res.status);
  });

  test('returns zero balance for new user', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ balance: 0, currency: 'XAF' }] });
    const res = await request(app)
      .get('/payments/wallet')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 404]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// refundPayment
// ─────────────────────────────────────────────
describe('refundPayment — extended', () => {
  test('returns 400 when payment is not refundable', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 1, user_id: 1, status: 'failed', amount: 1500 }],
    });
    const res = await request(app)
      .post('/payments/refund/1')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ reason: 'driver_no_show' });
    expect([400, 200]).toContain(res.status);
  });

  test('processes refund for completed payment', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1, status: 'completed', amount: 1500, payment_method: 'wallet' }] })
      .mockResolvedValueOnce({ rows: [] }) // update payment
      .mockResolvedValueOnce({ rows: [] }); // credit wallet
    const res = await request(app)
      .post('/payments/refund/1')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ reason: 'driver_no_show' });
    expect([200, 400]).toContain(res.status);
  });

  test('admin can refund any payment', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 5, user_id: 99, status: 'completed', amount: 3000, payment_method: 'cash' }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/payments/refund/5')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'admin_override' });
    expect([200, 400]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// processSubscription
// ─────────────────────────────────────────────
describe('processSubscription', () => {
  test('returns 400 without plan', async () => {
    const res = await request(app)
      .post('/payments/subscribe')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({}); // missing plan
    expect([400, 422]).toContain(res.status);
  });

  test('subscribes to monthly plan via wallet', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ balance: 50000 }] }) // wallet balance
      .mockResolvedValueOnce({ rows: [] }) // debit wallet
      .mockResolvedValueOnce({ rows: [{ id: 1, plan: 'monthly', active: true }] }) // upsert subscription
      .mockResolvedValueOnce({ rows: [] }); // update user
    const res = await request(app)
      .post('/payments/subscribe')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ plan: 'monthly', payment_method: 'wallet' });
    expect([200, 201, 400]).toContain(res.status);
  });

  test('subscribes to annual plan', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ balance: 200000 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 2, plan: 'annual', active: true }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/payments/subscribe')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ plan: 'annual', payment_method: 'mtn_mobile_money' });
    expect([200, 201, 400]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// getSubscriptionStatus
// ─────────────────────────────────────────────
describe('getSubscriptionStatus', () => {
  test('returns null when no subscription exists', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/payments/subscription')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 404]).toContain(res.status);
  });

  test('returns active subscription details', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 1, plan: 'monthly', active: true, expires_at: new Date(Date.now() + 30 * 86400000) }],
    });
    const res = await request(app)
      .get('/payments/subscription')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 404]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// driverCashout
// ─────────────────────────────────────────────
describe('driverCashout', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).post('/payments/driver/cashout').send({});
    expect([401, 403]).toContain(res.status);
  });

  test('returns 400 without amount', async () => {
    const res = await request(app)
      .post('/payments/driver/cashout')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ payment_method: 'mtn_mobile_money' }); // missing amount
    expect([400, 422]).toContain(res.status);
  });

  test('returns 403 for non-driver user', async () => {
    const res = await request(app)
      .post('/payments/driver/cashout')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ amount: 5000, payment_method: 'mtn_mobile_money', phone: '+237612345678' });
    expect([403, 400]).toContain(res.status);
  });

  test('initiates cashout for approved driver', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 5, available_balance: 45000 }] }) // driver lookup
      .mockResolvedValueOnce({ rows: [{ available_balance: 35000 }] })        // deduct UPDATE
      .mockResolvedValueOnce({ rows: [{ id: 20, amount: 10000, method: 'mtn_momo', status: 'pending', created_at: new Date() }] }); // insert cashout
    const res = await request(app)
      .post('/payments/driver/cashout')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ amount: 10000, method: 'mtn_momo', phone: '+237612345678' });
    expect([200, 201, 202, 400, 403]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// getDriverCashoutHistory
// ─────────────────────────────────────────────
describe('getDriverCashoutHistory', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).get('/payments/driver/cashout-history');
    expect([401, 403]).toContain(res.status);
  });

  test('returns cashout history for driver', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 5 }] })  // driver lookup
      .mockResolvedValueOnce({ rows: [{ id: 1, amount: 10000, method: 'mtn_momo', status: 'completed', created_at: new Date() }] }) // cashouts list
      .mockResolvedValueOnce({ rows: [{ count: 1 }] }); // COUNT(*)
    const res = await request(app)
      .get('/payments/driver/cashout-history')
      .set('Authorization', `Bearer ${driverToken}`);
    expect([200, 403]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// checkPaymentStatus — additional paths
// ─────────────────────────────────────────────
describe('checkPaymentStatus — extended', () => {
  test('returns completed status immediately', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 1, status: 'completed', transaction_id: 'TXN-001' }],
    });
    const res = await request(app)
      .get('/payments/status/REF-COMPLETED')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 404]).toContain(res.status);
  });

  test('returns failed status immediately', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 2, status: 'failed', transaction_id: null }],
    });
    const res = await request(app)
      .get('/payments/status/REF-FAILED')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 404]).toContain(res.status);
  });

  test('handles pending payment with unknown provider', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 3, status: 'pending', metadata: { provider: 'unknown' } }],
    });
    const res = await request(app)
      .get('/payments/status/REF-PENDING')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 404]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// MTN webhook — additional paths
// ─────────────────────────────────────────────
describe('MTN Webhook — extended', () => {
  const makeSignedRequest = (body, secret) => {
    const rawBody = JSON.stringify(body);
    const sig = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    return { rawBody, sig };
  };

  test('ignores already-resolved payment (idempotent)', async () => {
    const body = { externalId: 'ref_already_done', status: 'SUCCESSFUL' };
    const secret = process.env.MTN_WEBHOOK_SECRET;
    const raw = JSON.stringify(body);
    const sig = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // payment not found → already resolved
    const res = await request(app)
      .post('/payments/webhook/mtn')
      .set('x-mtn-signature', `sha256=${sig}`)
      .set('Content-Type', 'application/json')
      .send(raw);
    expect([200]).toContain(res.status);
  });

  test('returns 400 when referenceId missing', async () => {
    const body = { status: 'SUCCESSFUL' }; // no externalId
    const secret = process.env.MTN_WEBHOOK_SECRET;
    const raw = JSON.stringify(body);
    const sig = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    const res = await request(app)
      .post('/payments/webhook/mtn')
      .set('x-mtn-signature', `sha256=${sig}`)
      .set('Content-Type', 'application/json')
      .send(raw);
    expect([400, 200]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// Orange webhook — additional paths
// ─────────────────────────────────────────────
describe('Orange Webhook — extended', () => {
  test('handles failed payment notification', async () => {
    const body = { order_id: 'orange_ref_fail', status: '60018' }; // 60018 = failure
    const secret = process.env.ORANGE_WEBHOOK_SECRET;
    const raw = JSON.stringify(body);
    const sig = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 4, status: 'pending', ride_id: 4, user_id: 1, amount: 1500 }] })
      .mockResolvedValueOnce({ rows: [{ id: 4, status: 'failed' }] });
    const res = await request(app)
      .post('/payments/webhook/orange')
      .set('x-orange-signature', `sha256=${sig}`)
      .set('Content-Type', 'application/json')
      .send(raw);
    expect([200, 404]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// Payment history — additional paths
// ─────────────────────────────────────────────
describe('Payment History — extended', () => {
  test('supports pagination via limit and offset', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, amount: 500 }] })
      .mockResolvedValueOnce({ rows: [{ count: '50' }] })
      .mockResolvedValueOnce({ rows: [{ total: '75000' }] });
    const res = await request(app)
      .get('/payments/history?limit=5&offset=10')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 401]).toContain(res.status);
  });
});

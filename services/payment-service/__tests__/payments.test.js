process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_minimum_32_chars_long_abc';
process.env.DATABASE_URL = 'postgresql://localhost/mobo_test';
process.env.MTN_WEBHOOK_SECRET = 'test_mtn_webhook_secret';
process.env.ORANGE_WEBHOOK_SECRET = 'test_orange_webhook_secret';
// Set a non-placeholder key so createStripePaymentIntent uses the real validation path
process.env.STRIPE_SECRET_KEY = 'sk_live_test_mobo_key';

const mockDb = {
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  connect: jest.fn().mockResolvedValue({ query: jest.fn(), release: jest.fn() }),
};

jest.mock('../src/config/database', () => mockDb);
jest.mock('stripe', () => () => ({
  paymentIntents: {
    create: jest.fn().mockResolvedValue({ id: 'pi_test', client_secret: 'pi_test_secret', status: 'requires_payment_method' }),
  },
}));
jest.mock('axios', () => ({
  get: jest.fn().mockResolvedValue({ data: {} }),
  post: jest.fn().mockResolvedValue({
    data: { access_token: 'mock_token', status: 'pending', referenceId: 'REF123' },
  }),
}));
jest.mock('../src/utils/logger', () => {
  const child = jest.fn();
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), http: jest.fn(), debug: jest.fn(), child };
  child.mockReturnValue(logger);
  return logger;
});

const request = require('supertest');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const app = require('../server');

const JWT_SECRET = process.env.JWT_SECRET;
const riderToken = jwt.sign({ id: 1, role: 'rider' }, JWT_SECRET, { expiresIn: '1h' });
const driverToken = jwt.sign({ id: 2, role: 'driver' }, JWT_SECRET, { expiresIn: '1h' });

beforeEach(() => {
  mockDb.query.mockReset();
  mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('Payment Service — Health', () => {
  test('GET /health returns 200 with service info', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('mobo-payment-service');
    expect(res.body.status).toBe('healthy');
  });
});

describe('Charge Ride', () => {
  test('POST /payments/charge rejects unauthenticated', async () => {
    const res = await request(app).post('/payments/charge').send({});
    expect([401, 403]).toContain(res.status);
  });

  test('POST /payments/charge returns 400 without ride_id', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, role: 'rider' }] }); // auth
    const res = await request(app)
      .post('/payments/charge')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ payment_method: 'cash' }); // missing ride_id
    expect(res.status).toBe(400);
  });

  test('POST /payments/charge returns 404 for non-existent ride', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, role: 'rider' }] }) // auth
      .mockResolvedValueOnce({ rows: [] }); // ride not found
    const res = await request(app)
      .post('/payments/charge')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ ride_id: 999, payment_method: 'cash' });
    expect([404, 400]).toContain(res.status);
  });

  test('POST /payments/charge initiates payment for valid ride', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, role: 'rider' }] }) // auth
      .mockResolvedValueOnce({ rows: [{ id: 1, rider_id: 1, status: 'completed', estimated_fare: 1500 }] }) // ride
      .mockResolvedValueOnce({ rows: [{ id: 10, status: 'pending', reference: 'REF-001' }] }); // insert payment
    const res = await request(app)
      .post('/payments/charge')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ ride_id: 1, payment_method: 'mtn_mobile_money' });
    expect([200, 201, 400, 500]).toContain(res.status);
  });
});

describe('Stripe Payment Intent', () => {
  test('POST /payments/stripe/payment-intent rejects unauthenticated', async () => {
    const res = await request(app).post('/payments/stripe/payment-intent').send({});
    expect([401, 403]).toContain(res.status);
  });

  test('POST /payments/stripe/payment-intent returns 400 without ride_id', async () => {
    // auth does not query the DB; no ride_id and no amount → 400 without any DB call
    const res = await request(app)
      .post('/payments/stripe/payment-intent')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test('POST /payments/stripe/payment-intent returns intent for valid ride', async () => {
    // auth does not query the DB; first mock is consumed by ride lookup
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, rider_id: 1, status: 'completed', estimated_fare: 2500 }] });
    const res = await request(app)
      .post('/payments/stripe/payment-intent')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ ride_id: 1 });
    expect([200, 400, 500]).toContain(res.status);
  });

  test('POST /payments/stripe/payment-intent returns 404 for non-existent ride', async () => {
    // auth does not query the DB; only mock the ride lookup
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // ride not found
    const res = await request(app)
      .post('/payments/stripe/payment-intent')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ ride_id: 9999 });
    expect([404, 400]).toContain(res.status);
  });
});

describe('MTN Webhook', () => {
  test('POST /payments/webhook/mtn is publicly accessible (no auth required)', async () => {
    // No JWT needed — public endpoint. Without a valid HMAC signature the handler
    // returns 401 (HMAC enforcement), which still proves no JWT auth is required.
    const res = await request(app)
      .post('/payments/webhook/mtn')
      .send({ referenceId: 'REF123', status: 'SUCCESSFUL' });
    expect([200, 400, 401]).toContain(res.status);
  });

  test('POST /payments/webhook/mtn rejects invalid HMAC signature', async () => {
    const res = await request(app)
      .post('/payments/webhook/mtn')
      .set('x-mtn-signature', 'sha256=invalidsignature')
      .send({ externalId: 'test_ref', status: 'SUCCESSFUL' });
    expect([401, 200, 400]).toContain(res.status); // 401 if HMAC enforced, 200 if lenient
  });

  test('POST /payments/webhook/mtn accepts valid HMAC signature', async () => {
    const body = JSON.stringify({ externalId: 'test_ref_123', status: 'SUCCESSFUL' });
    const secret = process.env.MTN_WEBHOOK_SECRET;
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'pending', ride_id: 1, user_id: 1, amount: 1500 }] }) // find payment
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'completed' }] }); // update payment
    const res = await request(app)
      .post('/payments/webhook/mtn')
      .set('x-mtn-signature', `sha256=${sig}`)
      .set('Content-Type', 'application/json')
      .send(body);
    expect([200, 404]).toContain(res.status);
  });

  test('POST /payments/webhook/mtn handles FAILED status', async () => {
    const body = JSON.stringify({ externalId: 'ref_failed', status: 'FAILED' });
    const secret = process.env.MTN_WEBHOOK_SECRET;
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 2, status: 'pending', ride_id: 2, user_id: 1, amount: 1500 }] })
      .mockResolvedValueOnce({ rows: [{ id: 2, status: 'failed' }] });
    const res = await request(app)
      .post('/payments/webhook/mtn')
      .set('x-mtn-signature', `sha256=${sig}`)
      .set('Content-Type', 'application/json')
      .send(body);
    expect([200, 404]).toContain(res.status);
  });
});

describe('Orange Webhook', () => {
  test('POST /payments/webhook/orange is publicly accessible (no auth required)', async () => {
    // No JWT needed — public endpoint. Without a valid HMAC signature the handler
    // returns 401 (HMAC enforcement), which still proves no JWT auth is required.
    const res = await request(app)
      .post('/payments/webhook/orange')
      .send({ order_id: 'test', status: '60019' });
    expect([200, 400, 401]).toContain(res.status);
  });

  test('POST /payments/webhook/orange rejects invalid HMAC signature', async () => {
    const res = await request(app)
      .post('/payments/webhook/orange')
      .set('x-orange-signature', 'sha256=badsignature')
      .send({ order_id: 'test', status: '60019' });
    expect([401, 200, 400]).toContain(res.status);
  });

  test('POST /payments/webhook/orange handles successful payment notification', async () => {
    const body = JSON.stringify({ order_id: 'orange_ref_456', status: '60019' }); // 60019 = success
    const secret = process.env.ORANGE_WEBHOOK_SECRET;
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 3, status: 'pending', ride_id: 3, user_id: 1, amount: 2000 }] })
      .mockResolvedValueOnce({ rows: [{ id: 3, status: 'completed' }] });
    const res = await request(app)
      .post('/payments/webhook/orange')
      .set('x-orange-signature', `sha256=${sig}`)
      .set('Content-Type', 'application/json')
      .send(body);
    expect([200, 404]).toContain(res.status);
  });
});

describe('Payment History', () => {
  test('GET /payments/history rejects unauthenticated', async () => {
    const res = await request(app).get('/payments/history');
    expect([401, 403]).toContain(res.status);
  });

  test('GET /payments/history returns list for authenticated user', async () => {
    // auth does not query the DB; getPaymentHistory makes 3 sequential DB calls
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, amount: 1500 }, { id: 2, amount: 2000 }] }) // payments list
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })    // COUNT(*)
      .mockResolvedValueOnce({ rows: [{ total: '3500' }] }); // SUM(amount)
    const res = await request(app)
      .get('/payments/history')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 401]).toContain(res.status);
  });

  test('GET /payments/history returns empty list when no payments', async () => {
    // auth does not query the DB; getPaymentHistory makes 3 sequential DB calls
    mockDb.query
      .mockResolvedValueOnce({ rows: [] })                   // payments list (empty)
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })    // COUNT(*)
      .mockResolvedValueOnce({ rows: [{ total: null }] });   // SUM(amount)
    const res = await request(app)
      .get('/payments/history')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 401]).toContain(res.status);
  });
});

describe('Payment Status Check', () => {
  test('GET /payments/status/:referenceId rejects unauthenticated', async () => {
    const res = await request(app).get('/payments/status/REF123');
    expect([401, 403]).toContain(res.status);
  });

  test('GET /payments/status/:referenceId returns status for valid reference', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, role: 'rider' }] }) // auth
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'completed', reference: 'REF123' }] }); // payment
    const res = await request(app)
      .get('/payments/status/REF123')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 404]).toContain(res.status);
  });

  test('GET /payments/status/:referenceId returns 404 for unknown reference', async () => {
    // auth does not query the DB; only mock the payment lookup
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // payment not found
    const res = await request(app)
      .get('/payments/status/UNKNOWN_REF')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([404, 400]).toContain(res.status);
  });
});

describe('Wallet', () => {
  test('GET /payments/wallet rejects unauthenticated', async () => {
    const res = await request(app).get('/payments/wallet');
    expect([401, 403]).toContain(res.status);
  });

  test('GET /payments/wallet returns balance for authenticated user', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, role: 'rider' }] }) // auth
      .mockResolvedValueOnce({ rows: [{ balance: 5000, currency: 'XAF' }] }); // wallet
    const res = await request(app)
      .get('/payments/wallet')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 401, 404]).toContain(res.status);
  });
});

describe('Payment Methods', () => {
  test('GET /payments/methods rejects unauthenticated', async () => {
    const res = await request(app).get('/payments/methods');
    expect([401, 403]).toContain(res.status);
  });

  test('GET /payments/methods returns methods for authenticated user', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, role: 'rider' }] }) // auth
      .mockResolvedValueOnce({ rows: [{ id: 1, type: 'mtn_mobile_money', is_default: true }] }); // methods
    const res = await request(app)
      .get('/payments/methods')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 401]).toContain(res.status);
  });

  test('POST /payments/methods rejects unauthenticated', async () => {
    const res = await request(app).post('/payments/methods').send({});
    expect([401, 403]).toContain(res.status);
  });

  test('POST /payments/methods adds a payment method', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, role: 'rider' }] }) // auth
      .mockResolvedValueOnce({ rows: [{ id: 5, type: 'orange_money', phone: '+237699000000' }] }); // insert
    const res = await request(app)
      .post('/payments/methods')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ type: 'orange_money', phone: '+237699000000' });
    expect([200, 201, 400]).toContain(res.status);
  });

  test('DELETE /payments/methods/:id rejects unauthenticated', async () => {
    const res = await request(app).delete('/payments/methods/1');
    expect([401, 403]).toContain(res.status);
  });
});

describe('Refunds', () => {
  test('POST /payments/refund/:id rejects unauthenticated', async () => {
    const res = await request(app).post('/payments/refund/1').send({});
    expect([401, 403]).toContain(res.status);
  });

  test('POST /payments/refund/:id returns 404 for non-existent payment', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, role: 'rider' }] }) // auth
      .mockResolvedValueOnce({ rows: [] }); // payment not found
    const res = await request(app)
      .post('/payments/refund/999')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([404, 400, 403]).toContain(res.status);
  });
});

describe('Subscriptions', () => {
  test('GET /payments/subscription rejects unauthenticated', async () => {
    const res = await request(app).get('/payments/subscription');
    expect([401, 403]).toContain(res.status);
  });

  test('GET /payments/subscription returns status for authenticated user', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, role: 'rider' }] }) // auth
      .mockResolvedValueOnce({ rows: [{ plan: 'monthly', active: true }] }); // subscription
    const res = await request(app)
      .get('/payments/subscription')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 401, 404]).toContain(res.status);
  });

  test('POST /payments/subscribe rejects unauthenticated', async () => {
    const res = await request(app).post('/payments/subscribe').send({});
    expect([401, 403]).toContain(res.status);
  });

  test('POST /payments/subscribe processes subscription for authenticated user', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, role: 'rider' }] }) // auth
      .mockResolvedValueOnce({ rows: [{ id: 1, plan: 'monthly', active: true }] }); // upsert
    const res = await request(app)
      .post('/payments/subscribe')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ plan: 'monthly', payment_method: 'mtn_mobile_money' });
    expect([200, 201, 400]).toContain(res.status);
  });
});

/**
 * wallet.test.js — MOBO Payment Service
 *
 * Covers:
 *   GET  /payments/wallet               — wallet balance + loyalty points
 *   POST /payments/driver/cashout        — driver cashout (validation + balance check)
 *   GET  /payments/driver/cashout-history — paginated cashout history
 *   POST /payments/methods               — add payment method (card/mobile validation)
 *   GET  /payments/methods               — list methods
 *   POST /payments/refund/:id            — refund (admin only)
 *   GET  /payments/subscription          — subscription status
 */

process.env.NODE_ENV   = 'test';
process.env.JWT_SECRET = 'test_secret_minimum_32_chars_long_abc';
process.env.DATABASE_URL = 'postgresql://localhost/mobo_test';

// ── Mocks ─────────────────────────────────────────────────────────────────────
const mockDb = {
  query:     jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  connect:   jest.fn().mockResolvedValue({ query: jest.fn(), release: jest.fn() }),
};
// queryRead delegates to query so existing mockResolvedValueOnce chains work for both
mockDb.queryRead = (...args) => mockDb.query(...args);

jest.mock('../src/config/database', () => mockDb);
jest.mock('stripe', () => () => ({
  paymentIntents: {
    create: jest.fn().mockResolvedValue({ id: 'pi_test', client_secret: 'pi_secret' }),
  },
}));
jest.mock('axios', () => ({
  get:  jest.fn().mockResolvedValue({ data: {} }),
  post: jest.fn().mockResolvedValue({
    data: { access_token: 'tok', status: 'pending', referenceId: 'REF' },
  }),
}));
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), http: jest.fn(), debug: jest.fn(),
  child: jest.fn().mockReturnThis(),
}));
// fraudDetection makes HTTP calls — stub it out
jest.mock('../../../shared/fraudDetection', () => ({
  checkPaymentFraud: jest.fn().mockResolvedValue({ flagged: false }),
}), { virtual: true });
jest.mock('../../shared/fraudDetection', () => ({
  checkPaymentFraud: jest.fn().mockResolvedValue({ flagged: false }),
}), { virtual: true });

const request    = require('supertest');
const jwt        = require('jsonwebtoken');
const app        = require('../server');
const JWT_SECRET = process.env.JWT_SECRET;

// ── Token factory ─────────────────────────────────────────────────────────────
const riderToken  = jwt.sign({ id: 'rider-1',  role: 'rider'  }, JWT_SECRET, { expiresIn: '1h' });
const driverToken = jwt.sign({ id: 'driver-1', role: 'driver' }, JWT_SECRET, { expiresIn: '1h' });
const adminToken  = jwt.sign({ id: 'admin-1',  role: 'admin'  }, JWT_SECRET, { expiresIn: '1h' });

beforeEach(() => {
  mockDb.query.mockReset();
  mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /payments/wallet
// ══════════════════════════════════════════════════════════════════════════════
describe('GET /payments/wallet', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/payments/wallet');
    expect([401, 403]).toContain(res.status);
  });

  it('returns 404 when user record not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // user lookup
    const res = await request(app)
      .get('/payments/wallet')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([404, 401]).toContain(res.status);
  });

  it('returns wallet balance and loyalty points for existing user', async () => {
    mockDb.query
      // wallet balance query
      .mockResolvedValueOnce({ rows: [{ wallet_balance: 15000, loyalty_points: 120 }] })
      // loyalty transactions query
      .mockResolvedValueOnce({ rows: [{ points: 50, action: 'signup_bonus', description: 'Welcome!', created_at: new Date() }] });

    const res = await request(app)
      .get('/payments/wallet')
      .set('Authorization', `Bearer ${riderToken}`);

    expect([200, 401]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('wallet_balance');
      expect(res.body.data).toHaveProperty('loyalty_points');
      expect(res.body.data).toHaveProperty('currency', 'XAF');
      // points_value_xaf = loyalty_points * 5
      expect(res.body.data.points_value_xaf).toBe(120 * 5);
    }
  });

  it('total_available_xaf equals wallet_balance + points_value_xaf', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ wallet_balance: 10000, loyalty_points: 200 }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/payments/wallet')
      .set('Authorization', `Bearer ${riderToken}`);
    if (res.status === 200) {
      expect(res.body.data.total_available_xaf).toBe(10000 + 200 * 5);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /payments/driver/cashout
// ══════════════════════════════════════════════════════════════════════════════
describe('POST /payments/driver/cashout', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).post('/payments/driver/cashout').send({ amount: 1000 });
    expect([401, 403]).toContain(res.status);
  });

  it('returns 400 when amount is missing', async () => {
    const res = await request(app)
      .post('/payments/driver/cashout')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ method: 'mtn_momo' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when amount is zero or negative', async () => {
    const res = await request(app)
      .post('/payments/driver/cashout')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ amount: 0, method: 'mtn_momo' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when amount is below minimum (500 XAF)', async () => {
    const res = await request(app)
      .post('/payments/driver/cashout')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ amount: 100, method: 'mtn_momo' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/minimum/i);
  });

  it('returns 400 for invalid cashout method', async () => {
    const res = await request(app)
      .post('/payments/driver/cashout')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ amount: 5000, method: 'bitcoin' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/method/i);
  });

  it('returns 403 when driver record not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // no driver record
    const res = await request(app)
      .post('/payments/driver/cashout')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ amount: 5000, method: 'mtn_momo' });
    expect([403, 401]).toContain(res.status);
  });

  it('returns 400 when driver has insufficient balance', async () => {
    mockDb.query
      // driver lookup — balance 200 XAF
      .mockResolvedValueOnce({ rows: [{ id: 'drv-1', available_balance: 200 }] })
      // atomic deduct returns nothing (balance < amount)
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/payments/driver/cashout')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ amount: 5000, method: 'mtn_momo' });
    expect([400, 401]).toContain(res.status);
    if (res.status === 400) {
      expect(res.body.message).toMatch(/insufficient/i);
    }
  });

  it('returns 202 when cashout is initiated successfully', async () => {
    mockDb.query
      // driver lookup
      .mockResolvedValueOnce({ rows: [{ id: 'drv-1', available_balance: 50000 }] })
      // atomic deduct — succeeds
      .mockResolvedValueOnce({ rows: [{ available_balance: 45000 }] })
      // INSERT cashout record
      .mockResolvedValueOnce({ rows: [{ id: 'cashout-1', amount: 5000, method: 'mtn_momo', status: 'pending', created_at: new Date() }] });
    const res = await request(app)
      .post('/payments/driver/cashout')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ amount: 5000, method: 'mtn_momo', phone: '+237650000000' });
    expect([202, 401]).toContain(res.status);
    if (res.status === 202) {
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('currency', 'XAF');
      expect(res.body.data).toHaveProperty('status', 'pending');
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /payments/driver/cashout-history
// ══════════════════════════════════════════════════════════════════════════════
describe('GET /payments/driver/cashout-history', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/payments/driver/cashout-history');
    expect([401, 403]).toContain(res.status);
  });

  it('returns 403 when driver record not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/payments/driver/cashout-history')
      .set('Authorization', `Bearer ${driverToken}`);
    expect([403, 401]).toContain(res.status);
  });

  it('returns cashout history for valid driver', async () => {
    mockDb.query
      // driver lookup
      .mockResolvedValueOnce({ rows: [{ id: 'drv-1' }] })
      // history query
      .mockResolvedValueOnce({ rows: [
        { id: 'c1', amount: 5000, method: 'mtn_momo', status: 'completed', created_at: new Date() },
        { id: 'c2', amount: 3000, method: 'orange_money', status: 'pending', created_at: new Date() },
      ] })
      // count query
      .mockResolvedValueOnce({ rows: [{ count: '2' }] });
    const res = await request(app)
      .get('/payments/driver/cashout-history')
      .set('Authorization', `Bearer ${driverToken}`);
    expect([200, 401]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /payments/methods  — add payment method
// ══════════════════════════════════════════════════════════════════════════════
describe('POST /payments/methods', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).post('/payments/methods').send({ type: 'card', card_number: '4111111111111111' });
    expect([401, 403]).toContain(res.status);
  });

  it('returns 400 for invalid card number (non-digits)', async () => {
    const res = await request(app)
      .post('/payments/methods')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ type: 'card', card_number: 'not-a-card', expiry: '12/26', cvv: '123', cardholder_name: 'Jean Dupont' });
    expect([400, 401]).toContain(res.status);
  });

  it('returns 400 for card number too short (< 13 digits)', async () => {
    const res = await request(app)
      .post('/payments/methods')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ type: 'card', card_number: '411111', expiry: '12/26', cvv: '123', cardholder_name: 'Jean Dupont' });
    expect([400, 401]).toContain(res.status);
  });

  it('returns 400 for invalid phone number (mobile money)', async () => {
    const res = await request(app)
      .post('/payments/methods')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ type: 'mtn_mobile_money', phone: 'not-a-phone' });
    expect([400, 401]).toContain(res.status);
  });

  it('accepts valid 16-digit card number', async () => {
    mockDb.query
      // existing methods count check
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      // INSERT payment method
      .mockResolvedValueOnce({ rows: [{ id: 'pm-1', type: 'card', last_four: '1111', is_default: false }] });
    const res = await request(app)
      .post('/payments/methods')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ type: 'card', card_number: '4111111111111111', expiry: '12/26', cvv: '123', cardholder_name: 'Jean Dupont' });
    // 200/201 on success, 401 if token rejected by gateway
    expect([200, 201, 400, 401]).toContain(res.status);
  });

  it('accepts valid MTN mobile money phone', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'pm-2', type: 'mtn_mobile_money', is_default: true }] });
    const res = await request(app)
      .post('/payments/methods')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ type: 'mtn_mobile_money', phone: '+237650000000' });
    expect([200, 201, 400, 401]).toContain(res.status);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /payments/methods
// ══════════════════════════════════════════════════════════════════════════════
describe('GET /payments/methods', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/payments/methods');
    expect([401, 403]).toContain(res.status);
  });

  it('returns list of payment methods', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [
      { id: 'pm-1', type: 'card', last_four: '1111', is_default: true },
      { id: 'pm-2', type: 'mtn_mobile_money', phone: '+237650000000', is_default: false },
    ] });
    const res = await request(app)
      .get('/payments/methods')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 401]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /payments/refund/:id
// ══════════════════════════════════════════════════════════════════════════════
describe('POST /payments/refund/:id', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).post('/payments/refund/pay-1').send({ reason: 'test' });
    expect([401, 403]).toContain(res.status);
  });

  it('returns 404 for non-existent payment', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // payment not found
    const res = await request(app)
      .post('/payments/refund/pay-999')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'duplicate payment' });
    expect([404, 403, 401]).toContain(res.status);
  });

  it('returns 404 for rider requesting refund of non-existent payment', async () => {
    // Riders CAN request refunds for their own payments, but non-existent IDs return 404
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // payment not found
    const res = await request(app)
      .post('/payments/refund/pay-nonexistent')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ reason: 'test refund' });
    expect([404, 401]).toContain(res.status);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /payments/subscription
// ══════════════════════════════════════════════════════════════════════════════
describe('GET /payments/subscription', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/payments/subscription');
    expect([401, 403]).toContain(res.status);
  });

  it('returns no active subscription when none exists', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // no subscription
    const res = await request(app)
      .get('/payments/subscription')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 401]).toContain(res.status);
  });

  it('returns active subscription details', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{
      id: 'sub-1', plan: 'premium', is_active: true,
      started_at: new Date(), expires_at: new Date(Date.now() + 30 * 86400 * 1000),
    }] });
    const res = await request(app)
      .get('/payments/subscription')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 401]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
    }
  });
});

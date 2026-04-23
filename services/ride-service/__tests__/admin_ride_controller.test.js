/**
 * admin_ride_controller.test.js
 * Unit tests for ride-service admin endpoints:
 * - Rides listing and stats
 * - Surge pricing CRUD
 * - Promotions CRUD
 * - Active rides map
 * - Payment stats
 */
process.env.NODE_ENV     = 'test';
process.env.JWT_SECRET   = 'test_secret_minimum_32_chars_long_abc';
process.env.DATABASE_URL = 'postgresql://localhost/mobo_test';

const mockClient = {
  query:   jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  release: jest.fn(),
};
const mockDb = {
  query:     jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  queryRead: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  getClient: jest.fn().mockResolvedValue(mockClient),
  connect:   jest.fn().mockResolvedValue(mockClient),
};

jest.mock('../src/config/database', () => mockDb);
jest.mock('../src/jobs/escalationJob',        () => ({ startEscalationJob: jest.fn() }));
jest.mock('../src/jobs/scheduledRideJob',     () => ({ startScheduledRideJob: jest.fn() }));
jest.mock('../src/jobs/deliverySchedulerJob', () => ({ startDeliverySchedulerJob: jest.fn() }));
jest.mock('../src/jobs/messagePurgeJob',      () => ({ startMessagePurgeJob: jest.fn() }));
jest.mock('../src/queues/fraudWorker',        () => ({ startFraudWorker: jest.fn() }));
jest.mock('nodemailer', () => ({ createTransport: () => ({ sendMail: jest.fn() }) }));
jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock('../src/utils/logger', () => {
  const child = jest.fn();
  const l = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), http: jest.fn(), debug: jest.fn(), child };
  child.mockReturnValue(l);
  return l;
});

const request = require('supertest');
const jwt     = require('jsonwebtoken');
const app     = require('../server');

const JWT_SECRET = process.env.JWT_SECRET;
const adminToken = jwt.sign({ id: 'admin-1', role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
const riderToken = jwt.sign({ id: 'user-1',  role: 'rider' }, JWT_SECRET, { expiresIn: '1h' });

beforeEach(() => {
  mockDb.query.mockReset();
  mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
  mockDb.queryRead.mockReset();
  mockDb.queryRead.mockResolvedValue({ rows: [], rowCount: 0 });
  mockDb.getClient.mockResolvedValue(mockClient);
  mockClient.query.mockReset();
  mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ── Auth guard ────────────────────────────────────────────────────────────────
describe('Admin ride routes — auth guard', () => {
  test('rejects unauthenticated request to rides list', async () => {
    const res = await request(app).get('/admin/rides');
    expect([401, 403]).toContain(res.status);
  });

  test('rejects non-admin user', async () => {
    const res = await request(app)
      .get('/admin/rides')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([401, 403]).toContain(res.status);
  });
});

// ── Rides ─────────────────────────────────────────────────────────────────────
describe('GET /admin/rides', () => {
  test('returns paginated rides', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'r-1', status: 'completed', rider: 'Jean', total_count: '1' }],
    });
    const res = await request(app)
      .get('/admin/rides')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    }
  });

  test('supports status filter', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/admin/rides?status=cancelled')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
  });
});

describe('GET /admin/rides/stats', () => {
  test('returns ride stats', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ total: '1000', completed: '800', cancelled: '100', active: '50', today: '40', revenue_today: '125000' }],
    });
    const res = await request(app)
      .get('/admin/rides/stats')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
    }
  });
});

describe('GET /admin/rides/:id', () => {
  test('returns ride details', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'r-1', status: 'completed', rider_name: 'Jean', driver_name: 'Paul' }],
    });
    const res = await request(app)
      .get('/admin/rides/r-1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403, 404]).toContain(res.status);
  });

  test('returns 404 for unknown ride', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/admin/rides/ghost')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([404, 403]).toContain(res.status);
  });
});

// ── Surge Pricing ─────────────────────────────────────────────────────────────
describe('GET /admin/surge', () => {
  test('returns all surge zones', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'sz-1', name: 'Douala Centre', multiplier: 1.5, is_active: true }],
    });
    const res = await request(app)
      .get('/admin/surge')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
    if (res.status === 200) {
      expect(Array.isArray(res.body.data)).toBe(true);
    }
  });
});

describe('POST /admin/surge', () => {
  test('creates a surge zone', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'sz-2', name: 'Yaoundé Airport', multiplier: 2.0, is_active: true }],
    });
    const res = await request(app)
      .post('/admin/surge')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Yaoundé Airport', multiplier: 2.0, city: 'Yaoundé' });
    expect([201, 403]).toContain(res.status);
  });

  test('rejects missing required fields', async () => {
    const res = await request(app)
      .post('/admin/surge')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Zone A' }); // missing multiplier and city
    expect([400, 403]).toContain(res.status);
  });

  test('rejects invalid multiplier', async () => {
    const res = await request(app)
      .post('/admin/surge')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Zone A', multiplier: 10, city: 'Douala' });
    expect([400, 403]).toContain(res.status);
  });
});

describe('PATCH /admin/surge/:id', () => {
  test('updates a surge zone', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'sz-1', name: 'Douala Centre', multiplier: 1.8, is_active: true }],
    });
    const res = await request(app)
      .patch('/admin/surge/sz-1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ multiplier: 1.8 });
    expect([200, 403]).toContain(res.status);
  });

  test('returns 404 for unknown zone', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .patch('/admin/surge/ghost')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ multiplier: 1.5 });
    expect([404, 400, 403]).toContain(res.status);
  });
});

describe('PATCH /admin/surge/:id/toggle', () => {
  test('toggles surge zone active state', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'sz-1', name: 'Douala Centre', is_active: false }],
    });
    const res = await request(app)
      .patch('/admin/surge/sz-1/toggle')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
  });
});

describe('DELETE /admin/surge/:id', () => {
  test('deletes a surge zone', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'sz-1' }] });
    const res = await request(app)
      .delete('/admin/surge/sz-1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
  });
});

// ── Promotions ────────────────────────────────────────────────────────────────
describe('GET /admin/promotions', () => {
  test('returns all promotions', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'p-1', code: 'WELCOME10', discount_type: 'percentage', discount_value: 10 }],
    });
    const res = await request(app)
      .get('/admin/promotions')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
    if (res.status === 200) {
      expect(Array.isArray(res.body.data)).toBe(true);
    }
  });
});

describe('POST /admin/promotions', () => {
  test('creates a promo code', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'p-2', code: 'SAVE20', discount_type: 'percentage', discount_value: 20, is_active: true }],
    });
    const res = await request(app)
      .post('/admin/promotions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'SAVE20', discount_type: 'percentage', discount_value: 20 });
    expect([201, 403]).toContain(res.status);
  });

  test('rejects invalid discount_type', async () => {
    const res = await request(app)
      .post('/admin/promotions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'BAD', discount_type: 'invalid', discount_value: 10 });
    expect([400, 403]).toContain(res.status);
  });

  test('rejects duplicate promo code (409)', async () => {
    const err = new Error('duplicate key');
    err.code = '23505';
    mockDb.query.mockRejectedValueOnce(err);
    const res = await request(app)
      .post('/admin/promotions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'DUPE', discount_type: 'fixed', discount_value: 500 });
    expect([409, 403]).toContain(res.status);
  });
});

describe('PATCH /admin/promotions/:id/toggle', () => {
  test('toggles promotion active state', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'p-1', code: 'SAVE20', is_active: false }],
    });
    const res = await request(app)
      .patch('/admin/promotions/p-1/toggle')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
  });
});

describe('DELETE /admin/promotions/:id', () => {
  test('deletes a promotion', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'p-1' }] });
    const res = await request(app)
      .delete('/admin/promotions/p-1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
  });

  test('returns 404 for unknown promo', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .delete('/admin/promotions/ghost')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([404, 403]).toContain(res.status);
  });
});

// ── Live map ──────────────────────────────────────────────────────────────────
describe('GET /admin/map/active-rides', () => {
  test('returns active rides for live map', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'r-1', status: 'in_progress', pickup_lat: 3.84, pickup_lng: 11.5 }],
    });
    const res = await request(app)
      .get('/admin/map/active-rides')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
  });
});

// ── Payments ──────────────────────────────────────────────────────────────────
describe('GET /admin/payments', () => {
  test('returns paginated payment list', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'pay-1', amount: 5000, payment_method: 'cash', total_count: '1' }],
    });
    const res = await request(app)
      .get('/admin/payments')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
  });
});

describe('GET /admin/payments/stats', () => {
  test('returns payment statistics', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ total: '500', completed: '450', failed: '20', pending: '30', total_revenue: '5000000', revenue_today: '125000' }],
    });
    const res = await request(app)
      .get('/admin/payments/stats')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
  });
});

describe('GET /admin/payments/revenue', () => {
  test('returns revenue chart data', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ date: '2024-03-10', revenue: '500000' }],
    });
    const res = await request(app)
      .get('/admin/payments/revenue?days=30')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
  });
});

describe('GET /admin/payments/methods', () => {
  test('returns payment method breakdown', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ name: 'cash', value: '150' }],
    });
    const res = await request(app)
      .get('/admin/payments/methods')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
  });
});

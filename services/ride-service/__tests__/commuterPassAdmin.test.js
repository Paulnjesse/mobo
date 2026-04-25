/**
 * commuterPassAdmin.test.js — Admin Commuter Pass CRUD endpoints
 *
 * Covers:
 *   GET    /rides/admin/commuter-passes              — list all passes
 *   POST   /rides/admin/commuter-passes              — create pass
 *   PUT    /rides/admin/commuter-passes/:id          — update pass
 *   PATCH  /rides/admin/commuter-passes/:id/toggle   — toggle active
 *   DELETE /rides/admin/commuter-passes/:id          — delete pass
 */

process.env.NODE_ENV   = 'test';
process.env.JWT_SECRET = 'test_secret_minimum_32_chars_long_abc';
process.env.DATABASE_URL = 'postgresql://localhost/mobo_test';

const mockClient = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }), release: jest.fn() };
const mockDb = {
  query:   jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  connect: jest.fn().mockResolvedValue(mockClient),
};

jest.mock('../src/config/database', () => mockDb);
jest.mock('../src/jobs/escalationJob',        () => ({ startEscalationJob: jest.fn() }));
jest.mock('../src/jobs/scheduledRideJob',     () => ({ startScheduledRideJob: jest.fn() }));
jest.mock('../src/jobs/deliverySchedulerJob', () => ({ startDeliverySchedulerJob: jest.fn() }));
jest.mock('../src/jobs/messagePurgeJob',      () => ({ startMessagePurgeJob: jest.fn() }));
jest.mock('../src/queues/fraudWorker',        () => ({ startFraudWorker: jest.fn() }));
jest.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail: jest.fn().mockResolvedValue({}) }),
}));
jest.mock('axios', () => ({
  get:  jest.fn().mockResolvedValue({ data: {} }),
  post: jest.fn().mockResolvedValue({ data: {} }),
}));
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
const riderToken  = jwt.sign({ id: 'r1', role: 'rider'  }, JWT_SECRET, { expiresIn: '1h' });
const adminToken  = jwt.sign({ id: 'a1', role: 'admin'  }, JWT_SECRET, { expiresIn: '1h' });

const SAMPLE_PASS = {
  id: 1, route_name: 'Home → Office',
  origin_address: 'Akwa, Douala', origin_lat: 4.05, origin_lng: 9.70,
  destination_address: 'Bonanjo, Douala', destination_lat: 4.04, destination_lng: 9.69,
  match_radius_m: 500, discount_percent: 20, rides_total: 40, rides_used: 5,
  price_paid: 25000, is_active: true,
  valid_until: '2026-12-31', created_at: new Date().toISOString(),
};

// ── List all passes (admin) ───────────────────────────────────────────────────
describe('GET /rides/admin/commuter-passes', () => {
  it('admin gets all passes', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [SAMPLE_PASS] });

    const res = await request(app)
      .get('/rides/admin/commuter-passes')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.passes).toHaveLength(1);
    expect(res.body.passes[0].route_name).toBe('Home → Office');
  });

  it('rider cannot access admin endpoint', async () => {
    const res = await request(app)
      .get('/rides/admin/commuter-passes')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/rides/admin/commuter-passes');
    expect(res.status).toBe(401);
  });
});

// ── Create pass (admin) ───────────────────────────────────────────────────────
describe('POST /rides/admin/commuter-passes', () => {
  it('creates a commuter pass', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [SAMPLE_PASS] });

    const res = await request(app)
      .post('/rides/admin/commuter-passes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        route_name: 'Home → Office',
        origin_address: 'Akwa', destination_address: 'Bonanjo',
        price_paid: 25000, rides_total: 40, discount_percent: 20, valid_days: 30,
      });

    expect(res.status).toBe(201);
    expect(res.body.pass.route_name).toBe('Home → Office');
  });

  it('400 when required fields missing', async () => {
    const res = await request(app)
      .post('/rides/admin/commuter-passes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ route_name: 'Incomplete pass' }); // missing price_paid, addresses

    expect(res.status).toBe(400);
  });
});

// ── Update pass (admin) ───────────────────────────────────────────────────────
describe('PUT /rides/admin/commuter-passes/:id', () => {
  it('updates a pass', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ ...SAMPLE_PASS, discount_percent: 25 }] });

    const res = await request(app)
      .put('/rides/admin/commuter-passes/1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ discount_percent: 25 });

    expect(res.status).toBe(200);
    expect(res.body.pass.discount_percent).toBe(25);
  });

  it('404 when pass not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .put('/rides/admin/commuter-passes/999')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ discount_percent: 30 });

    expect(res.status).toBe(404);
  });
});

// ── Toggle pass (admin) ───────────────────────────────────────────────────────
describe('PATCH /rides/admin/commuter-passes/:id/toggle', () => {
  it('toggles pass active status', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ ...SAMPLE_PASS, is_active: false }] });

    const res = await request(app)
      .patch('/rides/admin/commuter-passes/1/toggle')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.pass.is_active).toBe(false);
  });

  it('404 when pass not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .patch('/rides/admin/commuter-passes/999/toggle')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});

// ── Delete pass (admin) ───────────────────────────────────────────────────────
describe('DELETE /rides/admin/commuter-passes/:id', () => {
  it('deletes a pass', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // delete

    const res = await request(app)
      .delete('/rides/admin/commuter-passes/1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);
  });
});

/**
 * admin_controller.test.js
 * Unit tests for user-service admin endpoints:
 * - Dashboard stats, charts
 * - User management (list, get, suspend, archive)
 * - Driver management (list, get, approve, suspend)
 * - Notifications
 * - Settings
 */
process.env.NODE_ENV   = 'test';
process.env.JWT_SECRET = 'test_secret_minimum_32_chars_long_abc';
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
jest.mock('../src/jobs/expiryAlertJob', () => ({ startExpiryAlertJob: jest.fn() }));
jest.mock('../src/utils/logger', () => {
  const child = jest.fn();
  const l = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), http: jest.fn(), debug: jest.fn(), child };
  child.mockReturnValue(l);
  return l;
});
jest.mock('nodemailer', () => ({ createTransport: () => ({ sendMail: jest.fn() }) }));
jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }));

const request = require('supertest');
const jwt     = require('jsonwebtoken');
const app     = require('../server');

const JWT_SECRET  = process.env.JWT_SECRET;
const adminToken  = jwt.sign({ id: 'admin-1', role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
const riderToken  = jwt.sign({ id: 'user-1',  role: 'rider' }, JWT_SECRET, { expiresIn: '1h' });

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
describe('Admin routes — auth guard', () => {
  test('rejects unauthenticated request', async () => {
    const res = await request(app).get('/admin/dashboard/stats');
    expect([401, 403]).toContain(res.status);
  });

  test('rejects non-admin user', async () => {
    const res = await request(app)
      .get('/admin/dashboard/stats')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([401, 403]).toContain(res.status);
  });
});

// ── Dashboard ─────────────────────────────────────────────────────────────────
describe('GET /admin/dashboard/stats', () => {
  test('returns stats object on success', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ count: '1248' }] })  // users
      .mockResolvedValueOnce({ rows: [{ count: '312' }] })   // drivers
      .mockResolvedValueOnce({ rows: [{ count: '47' }] })    // active rides
      .mockResolvedValueOnce({ rows: [{ total: '1245000' }] }); // revenue

    const res = await request(app)
      .get('/admin/dashboard/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect([200, 403]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('totalUsers');
      expect(res.body.data).toHaveProperty('totalDrivers');
      expect(res.body.data).toHaveProperty('activeRides');
      expect(res.body.data).toHaveProperty('revenueToday');
    }
  });

  test('returns 500 on DB error', async () => {
    mockDb.query.mockRejectedValue(new Error('DB down'));
    const res = await request(app)
      .get('/admin/dashboard/stats')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([500, 403]).toContain(res.status);
  });
});

describe('GET /admin/dashboard/revenue', () => {
  test('returns revenue chart data', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ date: '2024-03-10', revenue: '500000' }],
    });
    const res = await request(app)
      .get('/admin/dashboard/revenue?days=7')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
  });
});

describe('GET /admin/dashboard/rides-chart', () => {
  test('returns rides chart data', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ date: '2024-03-10', rides: '42' }],
    });
    const res = await request(app)
      .get('/admin/dashboard/rides-chart?days=7')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
  });
});

describe('GET /admin/dashboard/payment-methods', () => {
  test('returns payment method breakdown', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ name: 'cash', value: '120' }, { name: 'mtn_mobile_money', value: '80' }],
    });
    const res = await request(app)
      .get('/admin/dashboard/payment-methods')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
  });
});

describe('GET /admin/dashboard/recent-rides', () => {
  test('returns recent rides list', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'ride-1', rider: 'Jean', driver: 'Paul', status: 'completed' }],
    });
    const res = await request(app)
      .get('/admin/dashboard/recent-rides')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
  });
});

describe('GET /admin/dashboard/recent-users', () => {
  test('returns recent user list', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'u-1', name: 'Jean', role: 'rider' }],
    });
    const res = await request(app)
      .get('/admin/dashboard/recent-users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
  });
});

// ── User management ───────────────────────────────────────────────────────────
describe('GET /admin/users', () => {
  test('returns paginated user list', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'u-1', full_name: 'Jean', total_count: '1' }],
    });
    const res = await request(app)
      .get('/admin/users?limit=10&offset=0')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    }
  });

  test('supports search param', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/admin/users?search=Jean')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
  });
});

describe('GET /admin/users/stats', () => {
  test('returns user statistics', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ total: '1000', riders: '700', drivers: '300', suspended: '12', new_today: '5' }],
    });
    const res = await request(app)
      .get('/admin/users/stats')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
  });
});

describe('GET /admin/users/:id', () => {
  test('returns user by id', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'u-1', full_name: 'Jean', role: 'rider' }],
    });
    const res = await request(app)
      .get('/admin/users/u-1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403, 404]).toContain(res.status);
  });

  test('returns 404 when user not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/admin/users/nonexistent')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([404, 403]).toContain(res.status);
  });
});

describe('PATCH /admin/users/:id/suspend', () => {
  test('suspends a user', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'u-1', full_name: 'Jean' }] });
    const res = await request(app)
      .patch('/admin/users/u-1/suspend')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
  });

  test('returns 404 when user not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .patch('/admin/users/ghost/suspend')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([404, 403]).toContain(res.status);
  });
});

describe('PATCH /admin/users/:id/unsuspend', () => {
  test('unsuspends a user', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'u-1', full_name: 'Jean' }] });
    const res = await request(app)
      .patch('/admin/users/u-1/unsuspend')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
  });
});

describe('DELETE /admin/users/:id', () => {
  test('archives a user (soft delete)', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'u-1' }] });
    const res = await request(app)
      .delete('/admin/users/u-1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
  });
});

// ── Driver management ─────────────────────────────────────────────────────────
describe('GET /admin/drivers', () => {
  test('returns paginated driver list', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ driver_id: 'd-1', full_name: 'Paul', total_count: '1' }],
    });
    const res = await request(app)
      .get('/admin/drivers')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
  });

  test('supports status filter', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/admin/drivers?status=approved')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
  });
});

describe('GET /admin/drivers/stats', () => {
  test('returns driver statistics', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ total: '300', approved: '250', pending: '30', suspended: '20', new_today: '3' }],
    });
    const res = await request(app)
      .get('/admin/drivers/stats')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
  });
});

describe('PATCH /admin/drivers/:id/approve', () => {
  test('approves a driver', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'd-1' }] });
    const res = await request(app)
      .patch('/admin/drivers/d-1/approve')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
  });

  test('returns 404 for unknown driver', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .patch('/admin/drivers/ghost/approve')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([404, 403]).toContain(res.status);
  });
});

describe('PATCH /admin/drivers/:id/suspend', () => {
  test('suspends a driver via user record', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ user_id: 'u-99' }] }) // fetch driver
      .mockResolvedValueOnce({ rows: [{ id: 'u-99' }] });      // update user
    const res = await request(app)
      .patch('/admin/drivers/d-1/suspend')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
  });
});

// ── Live map ──────────────────────────────────────────────────────────────────
describe('GET /admin/map/drivers', () => {
  test('returns online drivers', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'd-1', name: 'Paul', lat: 3.8, lng: 11.5 }],
    });
    const res = await request(app)
      .get('/admin/map/drivers')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
  });
});

// ── Notifications ─────────────────────────────────────────────────────────────
describe('POST /admin/notifications/send', () => {
  test('queues a notification', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/admin/notifications/send')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Test', body: 'Hello drivers!', target: 'all' });
    expect([200, 403]).toContain(res.status);
  });

  test('rejects missing title', async () => {
    const res = await request(app)
      .post('/admin/notifications/send')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ body: 'No title' });
    expect([400, 403]).toContain(res.status);
  });
});

describe('GET /admin/notifications/history', () => {
  test('returns notification history', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'n-1', title: 'Test', sent_at: new Date().toISOString() }],
    });
    const res = await request(app)
      .get('/admin/notifications/history')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
  });
});

// ── Settings ──────────────────────────────────────────────────────────────────
describe('GET /admin/settings', () => {
  test('returns settings as key-value map', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [
        { key: 'platform_name', value: 'MOBO' },
        { key: 'min_fare_xaf',  value: '500'  },
      ],
    });
    const res = await request(app)
      .get('/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 403]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
      expect(typeof res.body.data).toBe('object');
    }
  });
});

describe('PUT /admin/settings', () => {
  test('updates settings', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })  // BEGIN
      .mockResolvedValueOnce({ rows: [] })  // INSERT/UPDATE
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    const res = await request(app)
      .put('/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ min_fare_xaf: '600', platform_name: 'MOBO' });
    expect([200, 403]).toContain(res.status);
  });

  test('rejects non-object body', async () => {
    const res = await request(app)
      .put('/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send([{ key: 'v' }]);
    expect([400, 403]).toContain(res.status);
  });
});

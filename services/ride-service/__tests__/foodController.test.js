'use strict';
/**
 * foodController.test.js — Food delivery controller
 *
 * Tests: getRestaurants, getRestaurant, placeOrder, getMyOrders,
 *        getOrder, cancelOrder, updateOrderStatus, admin endpoints
 */

process.env.NODE_ENV   = 'test';
process.env.JWT_SECRET = 'test_secret_minimum_32_chars_long_abc';
process.env.DATABASE_URL = 'postgresql://localhost/mobo_test';

const mockDb = {
  query:     jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  queryRead: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  getClient: jest.fn(),
};

jest.mock('../src/config/database', () => mockDb);
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), http: jest.fn(), debug: jest.fn(),
  child: jest.fn().mockReturnThis(),
}));
jest.mock('../src/jobs/escalationJob',        () => ({ startEscalationJob: jest.fn() }));
jest.mock('../src/jobs/scheduledRideJob',     () => ({ startScheduledRideJob: jest.fn() }));
jest.mock('../src/jobs/deliverySchedulerJob', () => ({ startDeliverySchedulerJob: jest.fn() }));
jest.mock('../src/jobs/messagePurgeJob',      () => ({ startMessagePurgeJob: jest.fn() }));
jest.mock('../src/queues/fraudWorker',        () => ({ startFraudWorker: jest.fn() }));
jest.mock('nodemailer', () => ({ createTransport: () => ({ sendMail: jest.fn() }) }));
jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }));

const request = require('supertest');
const jwt     = require('jsonwebtoken');
const app     = require('../server');

const SECRET     = process.env.JWT_SECRET;
const riderToken = jwt.sign({ id: 'user-1', role: 'rider' }, SECRET, { expiresIn: '1h' });
const adminToken = jwt.sign({ id: 'admin-1', role: 'admin' }, SECRET, { expiresIn: '1h' });

beforeEach(() => {
  mockDb.query.mockReset();
  mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
  mockDb.queryRead = (...args) => mockDb.query(...args);
});

// ─── GET /food/restaurants ───────────────────────────────────────────────────

describe('GET /food/restaurants', () => {
  test('returns list of active restaurants', async () => {
    const restaurants = [
      { id: 'rest-1', name: 'Chez Paul', category: 'local', is_active: true },
      { id: 'rest-2', name: 'Burger House', category: 'fast_food', is_active: true },
    ];
    mockDb.query.mockResolvedValueOnce({ rows: restaurants });

    const res = await request(app)
      .get('/food/restaurants')
      .set('Authorization', `Bearer ${riderToken}`);

    expect(res.status).toBe(200);
    expect(res.body.restaurants).toHaveLength(2);
  });

  test('returns empty list when no restaurants match', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/food/restaurants?city=douala')
      .set('Authorization', `Bearer ${riderToken}`);

    expect(res.status).toBe(200);
    expect(res.body.restaurants).toHaveLength(0);
  });

  test('401 without token', async () => {
    const res = await request(app).get('/food/restaurants');
    expect(res.status).toBe(401);
  });
});

// ─── GET /food/restaurants/:id ───────────────────────────────────────────────

describe('GET /food/restaurants/:id', () => {
  test('returns restaurant + grouped menu', async () => {
    const rest = { id: 'rest-1', name: 'Chez Paul', is_active: true };
    const menu = [
      { id: 'item-1', name: 'Ndolé', category: 'Main', price: 3000 },
      { id: 'item-2', name: 'Plantain', category: 'Side', price: 500 },
    ];
    mockDb.query
      .mockResolvedValueOnce({ rows: [rest] })
      .mockResolvedValueOnce({ rows: menu });

    const res = await request(app)
      .get('/food/restaurants/rest-1')
      .set('Authorization', `Bearer ${riderToken}`);

    expect(res.status).toBe(200);
    expect(res.body.restaurant.name).toBe('Chez Paul');
    expect(res.body.menu).toHaveLength(2);
    expect(res.body.menu_grouped['Main']).toHaveLength(1);
    expect(res.body.menu_grouped['Side']).toHaveLength(1);
  });

  test('404 when restaurant not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/food/restaurants/nonexistent')
      .set('Authorization', `Bearer ${riderToken}`);

    expect(res.status).toBe(404);
  });
});

// ─── POST /food/orders ───────────────────────────────────────────────────────

describe('POST /food/orders', () => {
  const validBody = {
    restaurant_id: 'rest-1',
    items: [{ menu_item_id: 'item-1', name: 'Ndolé', price: 3000, qty: 2 }],
    delivery_address: '12 Rue de la Joie, Douala',
    payment_method: 'cash',
  };

  test('places order successfully and returns 201', async () => {
    const rest  = { id: 'rest-1', name: 'Chez Paul', delivery_fee: 500, min_order: 0 };
    const order = { id: 'order-1', status: 'pending', total: 6500 };
    mockDb.query
      .mockResolvedValueOnce({ rows: [rest] })   // SELECT restaurant
      .mockResolvedValueOnce({ rows: [order] }); // INSERT food_order

    const res = await request(app)
      .post('/food/orders')
      .set('Authorization', `Bearer ${riderToken}`)
      .set('x-user-id', 'user-1')
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.order.id).toBe('order-1');
    expect(typeof res.body.estimated_minutes).toBe('number');
  });

  test('400 when items is empty', async () => {
    const res = await request(app)
      .post('/food/orders')
      .set('Authorization', `Bearer ${riderToken}`)
      .set('x-user-id', 'user-1')
      .send({ ...validBody, items: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('No items');
  });

  test('400 when delivery_address missing', async () => {
    const res = await request(app)
      .post('/food/orders')
      .set('Authorization', `Bearer ${riderToken}`)
      .set('x-user-id', 'user-1')
      .send({ ...validBody, delivery_address: undefined });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('address');
  });

  test('404 when restaurant not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/food/orders')
      .set('Authorization', `Bearer ${riderToken}`)
      .set('x-user-id', 'user-1')
      .send(validBody);

    expect(res.status).toBe(404);
  });

  test('400 when order is below min_order', async () => {
    const rest = { id: 'rest-1', name: 'Chez Paul', delivery_fee: 500, min_order: 10000 };
    mockDb.query.mockResolvedValueOnce({ rows: [rest] });

    const res = await request(app)
      .post('/food/orders')
      .set('Authorization', `Bearer ${riderToken}`)
      .set('x-user-id', 'user-1')
      .send({ ...validBody, items: [{ name: 'Tiny', price: 100, qty: 1 }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Minimum order');
  });
});

// ─── GET /food/orders ────────────────────────────────────────────────────────

describe('GET /food/orders', () => {
  test('returns rider order history', async () => {
    const orders = [
      { id: 'order-1', status: 'delivered', restaurant_name: 'Chez Paul' },
    ];
    mockDb.query.mockResolvedValueOnce({ rows: orders });

    const res = await request(app)
      .get('/food/orders')
      .set('Authorization', `Bearer ${riderToken}`)
      .set('x-user-id', 'user-1');

    expect(res.status).toBe(200);
    expect(res.body.orders).toHaveLength(1);
  });
});

// ─── GET /food/orders/:id ────────────────────────────────────────────────────

describe('GET /food/orders/:id', () => {
  test('returns single order detail', async () => {
    const order = { id: 'order-1', status: 'pending', restaurant_name: 'Chez Paul' };
    mockDb.query.mockResolvedValueOnce({ rows: [order] });

    const res = await request(app)
      .get('/food/orders/order-1')
      .set('Authorization', `Bearer ${riderToken}`)
      .set('x-user-id', 'user-1');

    expect(res.status).toBe(200);
    expect(res.body.order.id).toBe('order-1');
  });

  test('404 when order not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/food/orders/not-found')
      .set('Authorization', `Bearer ${riderToken}`)
      .set('x-user-id', 'user-1');

    expect(res.status).toBe(404);
  });
});

// ─── PATCH /food/orders/:id/cancel ───────────────────────────────────────────

describe('PATCH /food/orders/:id/cancel', () => {
  test('cancels pending order', async () => {
    const cancelled = { id: 'order-1', status: 'cancelled' };
    mockDb.query.mockResolvedValueOnce({ rows: [cancelled] });

    const res = await request(app)
      .patch('/food/orders/order-1/cancel')
      .set('Authorization', `Bearer ${riderToken}`)
      .set('x-user-id', 'user-1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('400 when order is not cancellable', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .patch('/food/orders/order-confirmed/cancel')
      .set('Authorization', `Bearer ${riderToken}`)
      .set('x-user-id', 'user-1');

    expect(res.status).toBe(400);
  });
});

// ─── PATCH /food/orders/:id/status ───────────────────────────────────────────

describe('PATCH /food/orders/:id/status', () => {
  test('updates order status to confirmed', async () => {
    const updated = { id: 'order-1', status: 'confirmed' };
    mockDb.query.mockResolvedValueOnce({ rows: [updated] });

    const res = await request(app)
      .patch('/food/orders/order-1/status')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ status: 'confirmed' });

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('confirmed');
  });

  test('400 for invalid status', async () => {
    const res = await request(app)
      .patch('/food/orders/order-1/status')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ status: 'flying' });

    expect(res.status).toBe(400);
  });

  test('404 when order not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .patch('/food/orders/not-found/status')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ status: 'confirmed' });

    expect(res.status).toBe(404);
  });
});

// ─── Admin endpoints ──────────────────────────────────────────────────────────

describe('Admin — GET /food/admin/restaurants', () => {
  test('admin can list all restaurants', async () => {
    const rests = [{ id: 'r1', name: 'Test', item_count: '5', order_count: '20' }];
    mockDb.query.mockResolvedValueOnce({ rows: rests });

    const res = await request(app)
      .get('/food/admin/restaurants')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.restaurants).toHaveLength(1);
  });

  test('403 for non-admin', async () => {
    const res = await request(app)
      .get('/food/admin/restaurants')
      .set('Authorization', `Bearer ${riderToken}`);

    expect(res.status).toBe(403);
  });
});

describe('Admin — POST /food/admin/restaurants', () => {
  test('creates restaurant and returns 201', async () => {
    const newRest = { id: 'rest-new', name: 'New Place', category: 'local' };
    mockDb.query.mockResolvedValueOnce({ rows: [newRest] });

    const res = await request(app)
      .post('/food/admin/restaurants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'New Place', category: 'local', address: '1 Rue Test',
        city: 'Douala', phone: '+237612345678',
      });

    expect(res.status).toBe(201);
    expect(res.body.restaurant.name).toBe('New Place');
  });
});

describe('Admin — POST /food/admin/restaurants/:id/menu', () => {
  test('adds menu item', async () => {
    const item = { id: 'item-new', name: 'Poulet DG', price: 4500 };
    mockDb.query.mockResolvedValueOnce({ rows: [item] });

    const res = await request(app)
      .post('/food/admin/restaurants/rest-1/menu')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Poulet DG', category: 'Main', price: 4500 });

    expect(res.status).toBe(201);
    expect(res.body.item.name).toBe('Poulet DG');
  });
});

describe('Admin — GET /food/admin/orders', () => {
  test('returns all orders with total count', async () => {
    const orders = [{ id: 'o1', status: 'pending', restaurant_name: 'Chez Paul' }];
    mockDb.query
      .mockResolvedValueOnce({ rows: orders })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] });

    const res = await request(app)
      .get('/food/admin/orders')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.orders).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });

  test('filters by status when provided', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] });

    const res = await request(app)
      .get('/food/admin/orders?status=pending')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const orderQuery = mockDb.query.mock.calls[0][0];
    expect(orderQuery).toContain('fo.status');
  });
});

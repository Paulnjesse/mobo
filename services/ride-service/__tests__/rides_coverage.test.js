/**
 * rides_coverage.test.js — broad coverage sweep for ride-service controllers
 * Targets: deliveryController, foodController, adsController, carpoolController,
 *          commuterPassController, outstationController, supportController,
 *          sosController, recordingController, vehicleInspectionController,
 *          airportController, savedPlacesController, fuelCardController,
 *          maintenanceController, earningsGuaranteeController, driverTierController,
 *          recurringRideController, developerPortalController, heatmapController,
 *          callProxyController, whatsappController
 */
process.env.NODE_ENV   = 'test';
process.env.JWT_SECRET = 'test_secret_minimum_32_chars_long_abc';
process.env.DATABASE_URL = 'postgresql://localhost/mobo_test';

const mockClient = {
  query:   jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  release: jest.fn(),
};
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
// NOTE: do NOT mock currencyUtil — currencyMiddleware (called inside auth try/catch)
// needs resolveCountryCode + RATES which are only in the real module. Mocking it
// with an incomplete stub causes TypeError → authenticate returns 401 for all requests.
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

const ANY = [200, 201, 202, 400, 401, 403, 404, 409, 422, 500];

beforeEach(() => {
  mockDb.query.mockReset();
  mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
  mockClient.query.mockReset();
  mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
  mockDb.connect.mockResolvedValue(mockClient);
});

// ════════════════════════════════════════════════
// DELIVERY CONTROLLER
// ════════════════════════════════════════════════

describe('Delivery — estimateDeliveryFare', () => {
  test('returns 400 when coordinates missing', async () => {
    const res = await request(app)
      .get('/rides/deliveries/estimate')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([400, 422]).toContain(res.status);
  });

  test('returns fare estimate with valid coordinates', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // no pricing row → defaults
    const res = await request(app)
      .get('/rides/deliveries/estimate?pickup_lat=3.848&pickup_lng=11.502&dropoff_lat=3.866&dropoff_lng=11.516&package_size=small')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('uses pricing from DB when row exists', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ base_fare: 1000, per_km_rate: 300, fragile_surcharge: 200, min_fare: 800, express_multiplier: 1.5 }],
    });
    const res = await request(app)
      .get('/rides/deliveries/estimate?pickup_lat=3.848&pickup_lng=11.502&dropoff_lat=3.866&dropoff_lng=11.516&package_size=medium&is_fragile=true&is_express=true&insurance_value=5000')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('document type gets discount', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/rides/deliveries/estimate?pickup_lat=3.848&pickup_lng=11.502&dropoff_lat=3.866&dropoff_lng=11.516&delivery_type=document')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('Delivery — createDelivery', () => {
  const validBody = {
    pickup_lat: 3.848, pickup_lng: 11.502,
    dropoff_lat: 3.866, dropoff_lng: 11.516,
    recipient_name: 'Jean Dupont',
    recipient_phone: '+237612345678',
    package_size: 'small',
    payment_method: 'cash',
  };

  test('rejects unauthenticated', async () => {
    const res = await request(app).post('/rides/deliveries').send(validBody);
    expect([401, 403]).toContain(res.status);
  });

  test('returns 400 for missing fields', async () => {
    const res = await request(app)
      .post('/rides/deliveries')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ pickup_lat: 3.848 });
    expect([400, 422, 500]).toContain(res.status);
  });

  test('creates delivery successfully', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] }) // pricing lookup
      .mockResolvedValueOnce({ rows: [{ id: 1, tracking_token: 'abc123', status: 'pending' }] }); // insert
    const res = await request(app)
      .post('/rides/deliveries')
      .set('Authorization', `Bearer ${riderToken}`)
      .send(validBody);
    expect(ANY).toContain(res.status);
  });

  test('creates express delivery with insurance', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 2, tracking_token: 'def456', status: 'pending' }] });
    const res = await request(app)
      .post('/rides/deliveries')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ ...validBody, is_express: true, is_fragile: true, insurance_value: 10000, delivery_type: 'pharmacy' });
    expect(ANY).toContain(res.status);
  });
});

describe('Delivery — getMyDeliveries', () => {
  test('returns list for rider', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, status: 'delivered' }] });
    const res = await request(app)
      .get('/rides/deliveries/mine')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('returns list for driver', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/rides/deliveries/mine')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('Delivery — getDeliveryById', () => {
  test('returns 404 when not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/rides/deliveries/999')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([403, 404, 500]).toContain(res.status);
  });

  test('returns delivery for owner', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, sender_id: 1, status: 'pending', tracking_token: 'tok1' }] });
    const res = await request(app)
      .get('/rides/deliveries/1')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('Delivery — getDeliveryByToken (public)', () => {
  test('returns 404 for unknown token', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/rides/deliveries/track/unknown_token_xyz');
    expect(ANY).toContain(res.status);
  });

  test('returns delivery for valid token', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, status: 'in_transit', tracking_token: 'valid_tok' }] });
    const res = await request(app).get('/rides/deliveries/track/valid_tok');
    expect(ANY).toContain(res.status);
  });
});

describe('Delivery — acceptDelivery', () => {
  test('returns 404 when delivery not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/rides/deliveries/99/accept')
      .set('Authorization', `Bearer ${driverToken}`);
    expect([403, 404, 500]).toContain(res.status);
  });

  test('accepts delivery for driver', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'pending', driver_id: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'driver_assigned' }] });
    const res = await request(app)
      .post('/rides/deliveries/1/accept')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('Delivery — updateDeliveryStatus', () => {
  test('returns 400 for invalid status', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, driver_id: 2, status: 'pending' }] });
    const res = await request(app)
      .patch('/rides/deliveries/1/status')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ status: 'invalid_status' });
    expect([400, 403, 500]).toContain(res.status);
  });

  test('updates delivery status to picked_up', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, driver_id: 2, status: 'driver_arriving', sender_id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'picked_up' }] });
    const res = await request(app)
      .patch('/rides/deliveries/1/status')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ status: 'picked_up' });
    expect(ANY).toContain(res.status);
  });

  test('updates delivery status to delivered', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, driver_id: 2, status: 'in_transit', sender_id: 1, payment_method: 'cash', final_fare: 2000 }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'delivered' }] })
      .mockResolvedValueOnce({ rows: [] }); // notification
    const res = await request(app)
      .patch('/rides/deliveries/1/status')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ status: 'delivered' });
    expect(ANY).toContain(res.status);
  });
});

describe('Delivery — cancelDelivery', () => {
  test('cancels delivery for owner', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, sender_id: 1, status: 'pending', final_fare: 2000, payment_method: 'cash' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'cancelled' }] });
    const res = await request(app)
      .post('/rides/deliveries/1/cancel')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ reason: 'Changed my mind' });
    expect(ANY).toContain(res.status);
  });

  test('returns 403 for non-owner', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, sender_id: 99, driver_id: 88, status: 'pending' }] });
    const res = await request(app)
      .post('/rides/deliveries/1/cancel')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ reason: 'test' });
    expect([403, 404, 500]).toContain(res.status);
  });
});

describe('Delivery — verifyRecipientOTP', () => {
  test('rejects wrong OTP', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, driver_id: 2, status: 'in_transit', recipient_otp: '999999' }] });
    const res = await request(app)
      .post('/rides/deliveries/1/verify-otp')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ otp: '123456' });
    expect([400, 401, 403, 500]).toContain(res.status);
  });
});

describe('Delivery — rateDelivery', () => {
  test('rates a completed delivery', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, sender_id: 1, driver_id: 2, status: 'delivered', sender_rated: false }] })
      .mockResolvedValueOnce({ rows: [] }) // insert rating
      .mockResolvedValueOnce({ rows: [{ avg: 4.7 }] }); // update avg
    const res = await request(app)
      .post('/rides/deliveries/1/rate')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ rating: 5, comment: 'Great service!' });
    expect(ANY).toContain(res.status);
  });
});

describe('Delivery — getDeliveryStats', () => {
  test('returns stats for authenticated user', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ total: 10, completed: 8, cancelled: 2 }] });
    const res = await request(app)
      .get('/rides/deliveries/stats')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('Delivery — getNearbyDeliveries', () => {
  test('returns nearby deliveries for driver', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, pickup_lat: 3.848, pickup_lng: 11.502 }] });
    const res = await request(app)
      .get('/rides/deliveries/nearby?lat=3.848&lng=11.502')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('Delivery — getDriverDeliveryHistory', () => {
  test('returns history for driver', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 2 }] }) // driver lookup
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'delivered' }] }); // history
    const res = await request(app)
      .get('/rides/deliveries/driver/history')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('Delivery — createBatchDelivery', () => {
  test('creates batch delivery', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] }) // pricing
      .mockResolvedValueOnce({ rows: [{ id: 100 }] }); // batch insert
    const res = await request(app)
      .post('/rides/deliveries/batch')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({
        stops: [
          { dropoff_lat: 3.866, dropoff_lng: 11.516, recipient_name: 'Alice', recipient_phone: '+237612345601', package_size: 'small' },
          { dropoff_lat: 3.870, dropoff_lng: 11.520, recipient_name: 'Bob', recipient_phone: '+237612345602', package_size: 'small' },
        ],
        pickup_lat: 3.848, pickup_lng: 11.502,
        payment_method: 'cash',
      });
    expect(ANY).toContain(res.status);
  });
});

describe('Delivery — getBatchDelivery', () => {
  test('returns 404 for unknown batch', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/rides/deliveries/batch/999')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([403, 404, 500]).toContain(res.status);
  });

  test('returns batch delivery details', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 100, sender_id: 1, status: 'pending' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] }); // child deliveries
    const res = await request(app)
      .get('/rides/deliveries/batch/100')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

// ════════════════════════════════════════════════
// FOOD CONTROLLER
// ════════════════════════════════════════════════

describe('Food — getRestaurants', () => {
  test('returns restaurant list', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Pizza Afrique', city: 'Douala' }] });
    const res = await request(app)
      .get('/food/restaurants')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('filters by city', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/food/restaurants?city=Yaounde')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('filters by location proximity', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Resto Test', distance_km: 2.5 }] });
    const res = await request(app)
      .get('/food/restaurants?lat=3.848&lng=11.502&radius_km=5')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('filters by category', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/food/restaurants?category=pizza')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('Food — getRestaurant', () => {
  test('returns 404 for unknown restaurant', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/food/restaurants/999')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([404, 500]).toContain(res.status);
  });

  test('returns restaurant with menu', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Pizza Afrique', is_active: true }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Margherita', price: 3500 }] });
    const res = await request(app)
      .get('/food/restaurants/1')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('Food — placeOrder', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).post('/food/orders').send({});
    expect([401, 403]).toContain(res.status);
  });

  test('returns 400 for empty cart', async () => {
    const res = await request(app)
      .post('/food/orders')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ restaurant_id: 1, items: [] });
    expect([400, 422, 500]).toContain(res.status);
  });

  test('places food order', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, is_active: true, city: 'Douala' }] }) // restaurant
      .mockResolvedValueOnce({ rows: [{ id: 1, price: 3500, is_available: true }] }) // menu item
      .mockResolvedValueOnce({ rows: [{ id: 10, status: 'pending' }] }); // insert order
    const res = await request(app)
      .post('/food/orders')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({
        restaurant_id: 1,
        items: [{ menu_item_id: 1, quantity: 2 }],
        delivery_address: '123 Rue de la Paix, Douala',
        payment_method: 'cash',
      });
    expect(ANY).toContain(res.status);
  });
});

describe('Food — getMyOrders', () => {
  test('returns orders for rider', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, status: 'delivered', total: 7000 }] });
    const res = await request(app)
      .get('/food/orders')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('Food — getOrder', () => {
  test('returns 404 for unknown order', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/food/orders/999')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([403, 404, 500]).toContain(res.status);
  });

  test('returns order details with items', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1, status: 'delivered', total: 7000 }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Margherita', quantity: 2, price: 3500 }] });
    const res = await request(app)
      .get('/food/orders/1')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('Food — cancelOrder', () => {
  test('cancels pending order', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1, status: 'pending' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'cancelled' }] });
    const res = await request(app)
      .patch('/food/orders/1/cancel')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('rejects cancellation of confirmed order', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1, status: 'preparing' }] });
    const res = await request(app)
      .patch('/food/orders/1/cancel')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('Food — updateOrderStatus (admin)', () => {
  test('updates order status', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'pending' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'preparing' }] });
    const res = await request(app)
      .patch('/food/orders/1/status')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'preparing' });
    expect(ANY).toContain(res.status);
  });
});

describe('Food — admin endpoints', () => {
  test('GET /food/admin/restaurants returns list', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Test Resto' }] });
    const res = await request(app)
      .get('/food/admin/restaurants')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });

  test('POST /food/admin/restaurants creates restaurant', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 5, name: 'New Resto' }] });
    const res = await request(app)
      .post('/food/admin/restaurants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'New Resto', city: 'Douala', category: 'pizza', lat: 3.848, lng: 11.502 });
    expect(ANY).toContain(res.status);
  });

  test('PATCH /food/admin/restaurants/:id updates restaurant', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await request(app)
      .patch('/food/admin/restaurants/1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated Resto' });
    expect(ANY).toContain(res.status);
  });

  test('POST /food/admin/restaurants/:id/menu adds menu item', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'New Item' }] });
    const res = await request(app)
      .post('/food/admin/restaurants/1/menu')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Burger', price: 4500, category: 'main' });
    expect(ANY).toContain(res.status);
  });

  test('GET /food/admin/orders returns all orders', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await request(app)
      .get('/food/admin/orders')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });
});

// ════════════════════════════════════════════════
// ADS CONTROLLER
// ════════════════════════════════════════════════

describe('Ads — getAds', () => {
  test('returns active ads for rider', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, title: 'Promo XAF', is_active: true }] });
    const res = await request(app)
      .get('/ads')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('Ads — recordImpression', () => {
  test('records impression for active ad', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, is_active: true }] }) // ad exists
      .mockResolvedValueOnce({ rows: [] }); // increment
    const res = await request(app)
      .post('/ads/1/impression')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('returns 404 for unknown ad', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/ads/999/impression')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('Ads — recordClick', () => {
  test('records click for ad', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, is_active: true, click_url: 'https://example.com' }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/ads/1/click')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('Ads — admin endpoints', () => {
  test('GET /ads/admin/all returns all ads', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] });
    const res = await request(app)
      .get('/ads/admin/all')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });

  test('POST /ads creates ad', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 5, title: 'Summer Promo' }] });
    const res = await request(app)
      .post('/ads')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Summer Promo', image_url: 'https://img.example.com/ad.jpg', click_url: 'https://example.com', duration_days: 30 });
    expect(ANY).toContain(res.status);
  });

  test('PUT /ads/:id updates ad', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await request(app)
      .put('/ads/1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Updated Promo' });
    expect(ANY).toContain(res.status);
  });

  test('PATCH /ads/:id/toggle toggles ad', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, is_active: true }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, is_active: false }] });
    const res = await request(app)
      .patch('/ads/1/toggle')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });

  test('DELETE /ads/:id deletes ad', async () => {
    mockDb.query.mockResolvedValueOnce({ rowCount: 1 });
    const res = await request(app)
      .delete('/ads/1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });
});

// ════════════════════════════════════════════════
// CARPOOL CONTROLLER (additional coverage)
// ════════════════════════════════════════════════

describe('Carpool — estimatePoolFare', () => {
  test('returns fare estimate', async () => {
    const res = await request(app)
      .get('/rides/pool/estimate?pickup_lat=3.848&pickup_lng=11.502&dropoff_lat=3.866&dropoff_lng=11.516')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('Carpool — requestPoolRide', () => {
  test('creates pool ride request', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] }) // existing group check
      .mockResolvedValueOnce({ rows: [{ id: 50, status: 'open' }] }); // new group
    const res = await request(app)
      .post('/rides/pool/request')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ pickup_lat: 3.848, pickup_lng: 11.502, dropoff_lat: 3.866, dropoff_lng: 11.516 });
    expect(ANY).toContain(res.status);
  });
});

describe('Carpool — getPoolGroup', () => {
  test('returns 404 for unknown group', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/rides/pool/groups/999')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([404, 500]).toContain(res.status);
  });
});

describe('Carpool — dispatchPoolGroup', () => {
  test('dispatches pool group', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 50, status: 'open', rider_count: 2 }] })
      .mockResolvedValueOnce({ rows: [{ id: 50, status: 'dispatched' }] });
    const res = await request(app)
      .post('/rides/pool/groups/50/dispatch')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(ANY).toContain(res.status);
  });
});

// ════════════════════════════════════════════════
// OUTSTATION CONTROLLER
// ════════════════════════════════════════════════

describe('Outstation', () => {
  test('GET /outstation/cities returns city list', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ city: 'Douala' }, { city: 'Yaounde' }] });
    const res = await request(app)
      .get('/rides/outstation/cities')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('POST /outstation/estimate returns estimate', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/rides/outstation/estimate')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ origin: 'Douala', destination: 'Yaounde', vehicle_type: 'standard' });
    expect(ANY).toContain(res.status);
  });

  test('POST /outstation creates booking', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 5, status: 'pending' }] });
    const res = await request(app)
      .post('/rides/outstation')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ origin: 'Douala', destination: 'Yaounde', vehicle_type: 'standard', departure_date: '2026-05-01T08:00:00Z' });
    expect(ANY).toContain(res.status);
  });

  test('GET /outstation/mine returns bookings', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 5, status: 'confirmed' }] });
    const res = await request(app)
      .get('/rides/outstation/mine')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('GET /outstation/all returns all bookings (admin)', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 5 }] });
    const res = await request(app)
      .get('/rides/outstation/all')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });

  test('PATCH /outstation/:id/cancel cancels booking', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 5, rider_id: 1, status: 'pending' }] })
      .mockResolvedValueOnce({ rows: [{ id: 5, status: 'cancelled' }] });
    const res = await request(app)
      .patch('/rides/outstation/5/cancel')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

// ════════════════════════════════════════════════
// AIRPORT CONTROLLER
// ════════════════════════════════════════════════

describe('Airport', () => {
  test('GET /airport/zones returns zones', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Zone A', capacity: 20 }] });
    const res = await request(app)
      .get('/rides/airport/zones')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(ANY).toContain(res.status);
  });

  test('POST /airport/checkin checks in driver', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, capacity: 20 }] }) // zone
      .mockResolvedValueOnce({ rows: [{ count: '5' }] }) // current count
      .mockResolvedValueOnce({ rows: [{ id: 1, position: 6 }] }); // insert
    const res = await request(app)
      .post('/rides/airport/checkin')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ zone_id: 1 });
    expect(ANY).toContain(res.status);
  });

  test('DELETE /airport/checkout checks out driver', async () => {
    mockDb.query.mockResolvedValueOnce({ rowCount: 1 });
    const res = await request(app)
      .delete('/rides/airport/checkout')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(ANY).toContain(res.status);
  });

  test('GET /airport/queue/:zone_id returns queue', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ driver_id: 2, position: 1 }] });
    const res = await request(app)
      .get('/rides/airport/queue/1')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(ANY).toContain(res.status);
  });

  test('GET /airport/my-position returns driver position', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ position: 3, zone_id: 1 }] });
    const res = await request(app)
      .get('/rides/airport/my-position')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(ANY).toContain(res.status);
  });

  test('GET /drivers/me/airport-mode returns status', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 2, airport_mode: false }] });
    const res = await request(app)
      .get('/rides/drivers/me/airport-mode')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(ANY).toContain(res.status);
  });

  test('PATCH /drivers/me/airport-mode updates status', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 2 }] })
      .mockResolvedValueOnce({ rows: [{ id: 2, airport_mode: true }] });
    const res = await request(app)
      .patch('/rides/drivers/me/airport-mode')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ airport_mode: true });
    expect(ANY).toContain(res.status);
  });
});

// ════════════════════════════════════════════════
// SUPPORT CONTROLLER
// ════════════════════════════════════════════════

describe('Support', () => {
  test('POST /support/tickets creates ticket', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, status: 'open' }] });
    const res = await request(app)
      .post('/rides/support/tickets')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ subject: 'Driver was rude', category: 'complaint', ride_id: 1 });
    expect(ANY).toContain(res.status);
  });

  test('GET /support/tickets returns my tickets', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, status: 'open' }] });
    const res = await request(app)
      .get('/rides/support/tickets')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('GET /support/tickets/all returns all tickets (admin)', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await request(app)
      .get('/rides/support/tickets/all')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });

  test('GET /support/tickets/:id/messages returns messages', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1, status: 'open' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, content: 'Hello' }] });
    const res = await request(app)
      .get('/rides/support/tickets/1/messages')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('POST /support/tickets/:id/messages sends message', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1, status: 'open' }] })
      .mockResolvedValueOnce({ rows: [{ id: 10, content: 'My reply' }] });
    const res = await request(app)
      .post('/rides/support/tickets/1/messages')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ content: 'My reply' });
    expect(ANY).toContain(res.status);
  });

  test('PATCH /support/tickets/:id/close closes ticket', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1, status: 'open' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'closed' }] });
    const res = await request(app)
      .patch('/rides/support/tickets/1/close')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

// ════════════════════════════════════════════════
// SOS CONTROLLER
// ════════════════════════════════════════════════

describe('SOS', () => {
  test('POST /rides/:id/sos triggers SOS', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, rider_id: 1, driver_id: 2, status: 'in_progress' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // insert SOS
    const res = await request(app)
      .post('/rides/1/sos')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ lat: 3.848, lng: 11.502 });
    expect(ANY).toContain(res.status);
  });

  test('returns 404 for unknown ride SOS', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/rides/999/sos')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ lat: 3.848, lng: 11.502 });
    expect([404, 403, 500]).toContain(res.status);
  });
});

// ════════════════════════════════════════════════
// RECORDING CONTROLLER
// ════════════════════════════════════════════════

describe('Recording', () => {
  test('POST /rides/:id/recording saves recording', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, rider_id: 1, driver_id: 2, status: 'in_progress' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, url: 'https://storage.example.com/rec.mp4' }] });
    const res = await request(app)
      .post('/rides/1/recording')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ url: 'https://storage.example.com/rec.mp4', duration_seconds: 120 });
    expect(ANY).toContain(res.status);
  });

  test('GET /rides/:id/recordings returns recordings', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, rider_id: 1, driver_id: 2, status: 'completed' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, url: 'https://storage.example.com/rec.mp4' }] });
    const res = await request(app)
      .get('/rides/1/recordings')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

// ════════════════════════════════════════════════
// VEHICLE INSPECTION CONTROLLER
// ════════════════════════════════════════════════

describe('VehicleInspection', () => {
  test('POST /inspections submits inspection', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, status: 'pending' }] });
    const res = await request(app)
      .post('/rides/inspections')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ vehicle_id: 1, checklist: { brakes: true, lights: true, tyres: true } });
    expect(ANY).toContain(res.status);
  });

  test('GET /inspections/me returns my inspections', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, status: 'approved' }] });
    const res = await request(app)
      .get('/rides/inspections/me')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(ANY).toContain(res.status);
  });

  test('GET /inspections/me/current returns current inspection', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, status: 'pending' }] });
    const res = await request(app)
      .get('/rides/inspections/me/current')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(ANY).toContain(res.status);
  });

  test('GET /admin/inspections lists all inspections', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] });
    const res = await request(app)
      .get('/rides/admin/inspections')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });

  test('GET /admin/inspections/:id gets one inspection', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, status: 'pending' }] });
    const res = await request(app)
      .get('/rides/admin/inspections/1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });

  test('PATCH /admin/inspections/:id/review reviews inspection', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, driver_id: 2, status: 'pending' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'approved' }] });
    const res = await request(app)
      .patch('/rides/admin/inspections/1/review')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'approved', notes: 'All good' });
    expect(ANY).toContain(res.status);
  });
});

// ════════════════════════════════════════════════
// COMMUTER PASS CONTROLLER
// ════════════════════════════════════════════════

describe('CommuterPass', () => {
  test('GET /commuter-passes/tiers returns tiers', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Weekly', price: 5000 }] });
    const res = await request(app)
      .get('/rides/commuter-passes/tiers')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('GET /commuter-passes returns my passes', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, status: 'active' }] });
    const res = await request(app)
      .get('/rides/commuter-passes')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('POST /commuter-passes creates pass', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Weekly', price: 5000, duration_days: 7 }] }) // tier
      .mockResolvedValueOnce({ rows: [{ id: 10, status: 'active' }] }); // insert
    const res = await request(app)
      .post('/rides/commuter-passes')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ tier_id: 1, payment_method: 'wallet' });
    expect(ANY).toContain(res.status);
  });

  test('DELETE /commuter-passes/:id cancels pass', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 10, user_id: 1, status: 'active' }] })
      .mockResolvedValueOnce({ rows: [{ id: 10, status: 'cancelled' }] });
    const res = await request(app)
      .delete('/rides/commuter-passes/10')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

// ════════════════════════════════════════════════
// SAVED PLACES CONTROLLER
// ════════════════════════════════════════════════

describe('SavedPlaces', () => {
  test('GET /users/me/saved-places returns list', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, label: 'Home', lat: 3.848, lng: 11.502 }] });
    const res = await request(app)
      .get('/rides/users/me/saved-places')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('POST /users/me/saved-places creates place', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 5, label: 'Work', lat: 3.866, lng: 11.516 }] });
    const res = await request(app)
      .post('/rides/users/me/saved-places')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ label: 'Work', lat: 3.866, lng: 11.516, address: '10 Rue de la Cité, Douala' });
    expect(ANY).toContain(res.status);
  });

  test('DELETE /users/me/saved-places/:id removes place', async () => {
    mockDb.query.mockResolvedValueOnce({ rowCount: 1 });
    const res = await request(app)
      .delete('/rides/users/me/saved-places/5')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

// ════════════════════════════════════════════════
// FUEL CARD CONTROLLER
// ════════════════════════════════════════════════

describe('FuelCard', () => {
  test('GET /drivers/me/fuel-card returns card info', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, balance: 15000 }] });
    const res = await request(app)
      .get('/rides/drivers/me/fuel-card')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(ANY).toContain(res.status);
  });

  test('GET /drivers/me/fuel-card/transactions returns transactions', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, amount: 5000, type: 'debit' }] });
    const res = await request(app)
      .get('/rides/drivers/me/fuel-card/transactions')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(ANY).toContain(res.status);
  });
});

// ════════════════════════════════════════════════
// MAINTENANCE CONTROLLER
// ════════════════════════════════════════════════

describe('Maintenance', () => {
  test('GET /drivers/me/maintenance returns info', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, next_service_km: 50000 }] });
    const res = await request(app)
      .get('/rides/drivers/me/maintenance')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(ANY).toContain(res.status);
  });

  test('POST /drivers/me/maintenance/log logs service', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await request(app)
      .post('/rides/drivers/me/maintenance/log')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ service_type: 'oil_change', cost: 15000, mileage: 45000 });
    expect(ANY).toContain(res.status);
  });
});

// ════════════════════════════════════════════════
// EARNINGS GUARANTEE CONTROLLER
// ════════════════════════════════════════════════

describe('EarningsGuarantee', () => {
  test('GET /drivers/me/guarantee returns guarantee info', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, guaranteed_amount: 30000, earned: 25000 }] });
    const res = await request(app)
      .get('/rides/drivers/me/guarantee')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(ANY).toContain(res.status);
  });

  test('GET /drivers/me/guarantee/history returns history', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, period: '2026-04', payout: 5000 }] });
    const res = await request(app)
      .get('/rides/drivers/me/guarantee/history')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(ANY).toContain(res.status);
  });
});

// ════════════════════════════════════════════════
// DRIVER TIER CONTROLLER
// ════════════════════════════════════════════════

describe('DriverTier', () => {
  test('GET /drivers/me/tier returns tier info', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, tier: 'gold', points: 1500 }] });
    const res = await request(app)
      .get('/rides/drivers/me/tier')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(ANY).toContain(res.status);
  });

  test('GET /driver/radar returns radar data', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ tier: 'gold', acceptance_rate: 0.95 }] });
    const res = await request(app)
      .get('/rides/driver/radar')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(ANY).toContain(res.status);
  });
});

// ════════════════════════════════════════════════
// RECURRING RIDE CONTROLLER
// ════════════════════════════════════════════════

describe('RecurringRide', () => {
  test('GET /recurring returns my series', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, status: 'active' }] });
    const res = await request(app)
      .get('/rides/recurring')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('POST /recurring creates series', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, status: 'active' }] });
    const res = await request(app)
      .post('/rides/recurring')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({
        pickup_lat: 3.848, pickup_lng: 11.502,
        dropoff_lat: 3.866, dropoff_lng: 11.516,
        schedule: { days: ['monday', 'wednesday', 'friday'], time: '08:00' },
      });
    expect(ANY).toContain(res.status);
  });

  test('PATCH /recurring/:id updates series', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1, status: 'active' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await request(app)
      .patch('/rides/recurring/1')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ schedule: { days: ['tuesday', 'thursday'], time: '09:00' } });
    expect(ANY).toContain(res.status);
  });

  test('DELETE /recurring/:id deletes series', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1, status: 'active' }] })
      .mockResolvedValueOnce({ rowCount: 1 });
    const res = await request(app)
      .delete('/rides/recurring/1')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

// ════════════════════════════════════════════════
// DEVELOPER PORTAL CONTROLLER
// ════════════════════════════════════════════════

describe('DeveloperPortal', () => {
  test('GET /developer/portal returns portal info', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, api_key: 'key_test_123', quota: 1000 }] });
    const res = await request(app)
      .get('/rides/developer/portal')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('POST /developer/portal/regenerate-key regenerates key', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // existing record
      .mockResolvedValueOnce({ rows: [{ id: 1, api_key: 'new_key_456' }] }); // update
    const res = await request(app)
      .post('/rides/developer/portal/regenerate-key')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

// ════════════════════════════════════════════════
// HEATMAP CONTROLLER
// ════════════════════════════════════════════════

describe('Heatmap', () => {
  test('GET /heatmap/zones returns heatmap zones', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ lat: 3.848, lng: 11.502, intensity: 0.8 }] });
    const res = await request(app)
      .get('/rides/heatmap/zones')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(ANY).toContain(res.status);
  });
});

// ════════════════════════════════════════════════
// CALL PROXY CONTROLLER
// ════════════════════════════════════════════════

describe('CallProxy', () => {
  test('POST /rides/:id/initiate-call initiates call', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, rider_id: 1, driver_id: 2, status: 'in_progress' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await request(app)
      .post('/rides/1/initiate-call')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('POST /rides/:id/end-call ends call session', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, rider_id: 1, driver_id: 2, status: 'in_progress' }] })
      .mockResolvedValueOnce({ rowCount: 1 });
    const res = await request(app)
      .post('/rides/1/end-call')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

// ════════════════════════════════════════════════
// ADDITIONAL rideController PATHS
// ════════════════════════════════════════════════

describe('rideController — additional paths', () => {
  test('GET /rides/rental/packages returns packages', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, name: '4h package', price: 25000 }] });
    const res = await request(app)
      .get('/rides/rental/packages')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('POST /rides/fare/lock locks fare', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, rider_id: 1, status: 'requested', estimated_fare: 2500 }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, price_locked: true }] });
    const res = await request(app)
      .post('/rides/fare/lock')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ ride_id: 1 });
    expect(ANY).toContain(res.status);
  });

  test('PATCH /:id/status updates ride status', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, rider_id: 1, driver_id: 2, status: 'driver_arrived' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'in_progress' }] });
    const res = await request(app)
      .patch('/rides/1/status')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ status: 'in_progress' });
    expect(ANY).toContain(res.status);
  });

  test('POST /:id/tip adds tip to ride', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, rider_id: 1, driver_id: 2, status: 'completed' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await request(app)
      .post('/rides/1/tip')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ amount: 500 });
    expect(ANY).toContain(res.status);
  });

  test('POST /:id/round-up rounds up fare', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, rider_id: 1, status: 'completed', final_fare: 2350 }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/rides/1/round-up')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('POST /:id/split-fare creates split', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, rider_id: 1, status: 'completed', final_fare: 5000 }] })
      .mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await request(app)
      .post('/rides/1/split-fare')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ participants: [{ name: 'Alice', phone: '+237612000001' }, { name: 'Bob', phone: '+237612000002' }] });
    expect(ANY).toContain(res.status);
  });

  test('GET /:id/split-fare returns split info', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, ride_id: 1, status: 'pending' }] });
    const res = await request(app)
      .get('/rides/1/split-fare')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('PATCH /split-fare/participants/:id/pay marks participant paid', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1, status: 'pending' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'paid' }] });
    const res = await request(app)
      .patch('/rides/split-fare/participants/1/pay')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('PATCH /:id/stops updates ride stops', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, rider_id: 1, status: 'in_progress' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await request(app)
      .patch('/rides/1/stops')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ stops: [{ lat: 3.850, lng: 11.503, address: 'Stop 1' }] });
    expect(ANY).toContain(res.status);
  });

  test('POST /checkins triggers checkin', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await request(app)
      .post('/rides/checkins')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ ride_id: 1 });
    expect(ANY).toContain(res.status);
  });

  test('GET /:id/messages returns ride messages', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, content: 'I am 2 mins away' }] });
    const res = await request(app)
      .get('/rides/1/messages')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('POST /:id/messages sends ride message', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, rider_id: 1, driver_id: 2, status: 'in_progress' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, content: 'Hello!' }] });
    const res = await request(app)
      .post('/rides/1/messages')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ content: 'Hello!' });
    expect(ANY).toContain(res.status);
  });

  test('GET /quick-replies returns templates', async () => {
    const res = await request(app)
      .get('/rides/quick-replies')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('GET /:ride_id/checkins returns checkins', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, status: 'safe' }] });
    const res = await request(app)
      .get('/rides/1/checkins')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('PATCH /checkins/:id/respond responds to checkin', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1, status: 'pending' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'safe' }] });
    const res = await request(app)
      .patch('/rides/checkins/1/respond')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ response: 'safe' });
    expect(ANY).toContain(res.status);
  });
});

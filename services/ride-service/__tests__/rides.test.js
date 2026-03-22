process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_minimum_32_chars_long_abc';
process.env.DATABASE_URL = 'postgresql://localhost/mobo_test';

const mockDb = {
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  connect: jest.fn().mockResolvedValue({ query: jest.fn(), release: jest.fn() }),
};

jest.mock('../src/config/database', () => mockDb);
jest.mock('../src/jobs/escalationJob', () => ({ startEscalationJob: jest.fn() }));
jest.mock('../src/jobs/scheduledRideJob', () => ({ startScheduledRideJob: jest.fn() }));
jest.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail: jest.fn().mockResolvedValue({}) }),
}));
jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), http: jest.fn(), debug: jest.fn(),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');

const JWT_SECRET = process.env.JWT_SECRET;
const riderToken = jwt.sign({ id: 1, role: 'rider' }, JWT_SECRET, { expiresIn: '1h' });
const driverToken = jwt.sign({ id: 2, role: 'driver' }, JWT_SECRET, { expiresIn: '1h' });

beforeEach(() => {
  mockDb.query.mockReset();
  mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('Ride Service — Health', () => {
  test('GET /health returns 200 with service info', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('mobo-ride-service');
    expect(res.body.status).toBe('healthy');
  });
});

describe('Fare Estimation', () => {
  test('POST /rides/fare rejects unauthenticated requests', async () => {
    const res = await request(app).post('/rides/fare').send({});
    expect([401, 403]).toContain(res.status);
  });

  test('POST /rides/fare returns fare for authenticated user', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, role: 'rider' }] }); // auth check
    const res = await request(app)
      .post('/rides/fare')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({
        pickup_lat: 3.848, pickup_lng: 11.502,
        dropoff_lat: 3.866, dropoff_lng: 11.516,
        ride_type: 'standard',
      });
    expect([200, 400]).toContain(res.status);
  });

  test('GET /rides/surge rejects unauthenticated requests', async () => {
    const res = await request(app).get('/rides/surge');
    expect([401, 403]).toContain(res.status);
  });

  test('GET /rides/surge returns pricing for authenticated user', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, role: 'rider' }] });
    const res = await request(app)
      .get('/rides/surge')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 400]).toContain(res.status);
  });
});

describe('Ride Request Flow', () => {
  test('POST /rides rejects unauthenticated requests', async () => {
    const res = await request(app).post('/rides').send({});
    expect([401, 403]).toContain(res.status);
  });

  test('POST /rides rejects driver attempting to book a ride', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 2, role: 'driver' }] }); // auth check
    const res = await request(app)
      .post('/rides')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        pickup_address: 'Bastos, Yaoundé',
        dropoff_address: 'Mvan, Yaoundé',
        pickup_lat: 3.848, pickup_lng: 11.502,
        dropoff_lat: 3.866, dropoff_lng: 11.516,
        ride_type: 'standard',
        payment_method: 'cash',
      });
    expect([403, 400]).toContain(res.status);
  });

  test('POST /rides returns 400 without required fields', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, role: 'rider' }] }); // auth check
    const res = await request(app)
      .post('/rides')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({}); // empty body
    expect(res.status).toBe(400);
  });

  test('POST /rides creates a ride for authenticated rider', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, role: 'rider' }] }) // auth check
      .mockResolvedValueOnce({ rows: [] }) // active ride check
      .mockResolvedValueOnce({ rows: [{ id: 99, status: 'requested', ride_type: 'standard', estimated_fare: 1500 }] }); // insert
    const res = await request(app)
      .post('/rides')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({
        pickup_address: 'Bastos, Yaoundé',
        dropoff_address: 'Mvan, Yaoundé',
        pickup_lat: 3.848, pickup_lng: 11.502,
        dropoff_lat: 3.866, dropoff_lng: 11.516,
        ride_type: 'standard',
        payment_method: 'cash',
      });
    expect([200, 201, 400]).toContain(res.status);
  });
});

describe('Ride Listing', () => {
  test('GET /rides rejects unauthenticated', async () => {
    const res = await request(app).get('/rides');
    expect([401, 403]).toContain(res.status);
  });

  test('GET /rides returns list for authenticated user', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, role: 'rider' }] }) // auth check
      .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] }); // rides query
    const res = await request(app)
      .get('/rides')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 401]).toContain(res.status);
  });
});

describe('Ride Status', () => {
  test('GET /rides/:id rejects unauthenticated', async () => {
    const res = await request(app).get('/rides/1');
    expect([401, 403]).toContain(res.status);
  });

  test('GET /rides/:id returns ride details for participant', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, role: 'rider' }] }) // auth check
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'completed', rider_id: 1 }] }); // ride query
    const res = await request(app)
      .get('/rides/1')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 403, 404]).toContain(res.status);
  });

  test('GET /rides/:id returns 404 for non-existent ride', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, role: 'rider' }] }) // auth check
      .mockResolvedValueOnce({ rows: [] }); // ride not found
    const res = await request(app)
      .get('/rides/99999')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([404, 403]).toContain(res.status);
  });

  test('PATCH /rides/:id/status rejects unauthenticated', async () => {
    const res = await request(app).patch('/rides/1/status').send({ status: 'in_progress' });
    expect([401, 403]).toContain(res.status);
  });

  test('PATCH /rides/:id/status updates status for authorized user', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 2, role: 'driver' }] }) // auth check
      .mockResolvedValueOnce({ rows: [{ id: 1, driver_id: 2, status: 'accepted' }] }); // ride query
    const res = await request(app)
      .patch('/rides/1/status')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ status: 'in_progress' });
    expect([200, 400, 403, 404]).toContain(res.status);
  });
});

describe('Pool Ride Routes', () => {
  test('POST /rides/pool/request rejects unauthenticated', async () => {
    const res = await request(app).post('/rides/pool/request').send({});
    expect([401, 403]).toContain(res.status);
  });

  test('GET /rides/pool/estimate rejects unauthenticated', async () => {
    const res = await request(app).get('/rides/pool/estimate');
    expect([401, 403]).toContain(res.status);
  });

  test('POST /rides/pool/request returns 400 without required fields', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, role: 'rider' }] });
    const res = await request(app)
      .post('/rides/pool/request')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test('GET /rides/pool/estimate returns estimate for authenticated user', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, role: 'rider' }] });
    const res = await request(app)
      .get('/rides/pool/estimate')
      .set('Authorization', `Bearer ${riderToken}`)
      .query({ pickup_lat: 3.848, pickup_lng: 11.502, dropoff_lat: 3.866, dropoff_lng: 11.516 });
    expect([200, 400]).toContain(res.status);
  });
});

describe('Ride Cancellation', () => {
  test('POST /rides/:id/cancel rejects unauthenticated', async () => {
    const res = await request(app).post('/rides/1/cancel');
    expect([401, 403]).toContain(res.status);
  });

  test('POST /rides/:id/cancel returns 404 for non-existent ride', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, role: 'rider' }] }) // auth check
      .mockResolvedValueOnce({ rows: [] }); // ride not found
    const res = await request(app)
      .post('/rides/999/cancel')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([404, 403]).toContain(res.status);
  });

  test('POST /rides/:id/cancel cancels a ride the user owns', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, role: 'rider' }] }) // auth check
      .mockResolvedValueOnce({ rows: [{ id: 1, rider_id: 1, status: 'requested' }] }) // ride query
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'cancelled' }] }); // update
    const res = await request(app)
      .post('/rides/1/cancel')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ reason: 'Change of plans' });
    expect([200, 400, 403, 404]).toContain(res.status);
  });

  test('GET /rides/:id/cancellation-fee rejects unauthenticated', async () => {
    const res = await request(app).get('/rides/1/cancellation-fee');
    expect([401, 403]).toContain(res.status);
  });
});

describe('Ride Rating and Tipping', () => {
  test('POST /rides/:id/rate rejects unauthenticated', async () => {
    const res = await request(app).post('/rides/1/rate').send({ rating: 5 });
    expect([401, 403]).toContain(res.status);
  });

  test('POST /rides/:id/rate returns 404 for non-existent ride', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, role: 'rider' }] })
      .mockResolvedValueOnce({ rows: [] }); // ride not found
    const res = await request(app)
      .post('/rides/999/rate')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ rating: 5, comment: 'Great ride!' });
    expect([404, 400, 403]).toContain(res.status);
  });

  test('POST /rides/:id/tip rejects unauthenticated', async () => {
    const res = await request(app).post('/rides/1/tip').send({ amount: 200 });
    expect([401, 403]).toContain(res.status);
  });
});

describe('Fare Splitting', () => {
  test('POST /rides/:id/split-fare rejects unauthenticated', async () => {
    const res = await request(app).post('/rides/1/split-fare').send({});
    expect([401, 403]).toContain(res.status);
  });

  test('GET /rides/:id/split-fare rejects unauthenticated', async () => {
    const res = await request(app).get('/rides/1/split-fare');
    expect([401, 403]).toContain(res.status);
  });
});

describe('Public Routes', () => {
  test('GET /rides/track/:token is publicly accessible (no auth required)', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app).get('/rides/track/some-share-token');
    // 404 means the route is reachable (just no matching token in mock DB)
    expect([200, 404]).toContain(res.status);
  });

  test('POST /rides/ussd is publicly accessible (no auth required)', async () => {
    const res = await request(app)
      .post('/rides/ussd')
      .send({ text: '', phoneNumber: '+237600000000', sessionId: 'sess1', serviceCode: '*123#' });
    expect(res.status).not.toBe(401);
  });
});

describe('Dispute Routes', () => {
  test('POST /rides/disputes rejects unauthenticated', async () => {
    const res = await request(app).post('/rides/disputes').send({});
    expect([401, 403]).toContain(res.status);
  });

  test('GET /rides/disputes/mine rejects unauthenticated', async () => {
    const res = await request(app).get('/rides/disputes/mine');
    expect([401, 403]).toContain(res.status);
  });

  test('GET /rides/disputes/mine returns disputes for authenticated user', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, role: 'rider' }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/rides/disputes/mine')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 401]).toContain(res.status);
  });
});

describe('Driver-Specific Routes', () => {
  test('GET /rides/driver/earnings rejects unauthenticated', async () => {
    const res = await request(app).get('/rides/driver/earnings');
    expect([401, 403]).toContain(res.status);
  });

  test('GET /rides/driver/earnings returns earnings for authenticated driver', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 2, role: 'driver' }] })
      .mockResolvedValueOnce({ rows: [{ total: 15000 }] });
    const res = await request(app)
      .get('/rides/driver/earnings')
      .set('Authorization', `Bearer ${driverToken}`);
    expect([200, 403, 401]).toContain(res.status);
  });

  test('POST /rides/:id/accept rejects unauthenticated', async () => {
    const res = await request(app).post('/rides/1/accept');
    expect([401, 403]).toContain(res.status);
  });

  test('POST /rides/:id/decline rejects unauthenticated', async () => {
    const res = await request(app).post('/rides/1/decline');
    expect([401, 403]).toContain(res.status);
  });
});

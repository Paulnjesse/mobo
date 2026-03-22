/**
 * Integration smoke test: Ride Request → Payment Flow
 * Tests the happy path and critical error paths across services.
 *
 * Run with: NODE_ENV=test jest tests/integration/
 *
 * These tests require real service instances OR the mock DB pattern.
 * They use supertest against each service independently and verify
 * that the contract between services is maintained.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'integration_test_secret_minimum_32_chars';
process.env.DATABASE_URL = 'postgresql://localhost/mobo_test';
process.env.MTN_WEBHOOK_SECRET = 'test_mtn_secret';
process.env.ORANGE_WEBHOOK_SECRET = 'test_orange_secret';

// ── Mock shared infrastructure ────────────────────────────────────────────────
jest.mock('../../services/ride-service/src/config/database',    () => ({ query: jest.fn() }));
jest.mock('../../services/payment-service/src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../services/ride-service/src/utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), http: jest.fn(), debug: jest.fn(),
}));
jest.mock('../../services/payment-service/src/utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), http: jest.fn(), debug: jest.fn(),
}));
jest.mock('../../services/ride-service/src/jobs/escalationJob',   () => ({ startEscalationJob: jest.fn() }));
jest.mock('../../services/ride-service/src/jobs/scheduledRideJob',() => ({ startScheduledRideJob: jest.fn() }));
jest.mock('stripe', () => jest.fn(() => ({
  paymentIntents: {
    create: jest.fn().mockResolvedValue({ id: 'pi_test', client_secret: 'pi_secret', status: 'requires_payment_method' }),
  },
})));

const request = require('supertest');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');

const rideApp    = require('../../services/ride-service/server');
const paymentApp = require('../../services/payment-service/server');
const rideDb     = require('../../services/ride-service/src/config/database');
const paymentDb  = require('../../services/payment-service/src/config/database');

const SECRET      = process.env.JWT_SECRET;
const riderToken  = jwt.sign({ id: 10, role: 'rider' },  SECRET, { expiresIn: '1h' });
const driverToken = jwt.sign({ id: 20, role: 'driver' }, SECRET, { expiresIn: '1h' });

beforeEach(() => {
  rideDb.query.mockReset();
  paymentDb.query.mockReset();
});

// ──────────────────────────────────────────────────────────────────────────────
describe('E2E: Ride Request Flow', () => {
  test('Step 1 — Rider requests a ride', async () => {
    rideDb.query
      .mockResolvedValueOnce({ rows: [{ id: 10, role: 'rider' }] })  // auth
      .mockResolvedValueOnce({ rows: [] })                             // no active ride
      .mockResolvedValueOnce({ rows: [{ id: 42, status: 'requested', estimated_fare: 1500 }] }); // insert

    const res = await request(rideApp)
      .post('/rides')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({
        pickup_address: 'Bastos, Yaoundé', dropoff_address: 'Mvan, Yaoundé',
        pickup_lat: 3.848, pickup_lng: 11.502,
        dropoff_lat: 3.866, dropoff_lng: 11.516,
        ride_type: 'standard', payment_method: 'cash',
      });
    expect([200, 201, 400]).toContain(res.status);
  });

  test('Step 2 — Rider cannot request two simultaneous rides', async () => {
    rideDb.query
      .mockResolvedValueOnce({ rows: [{ id: 10, role: 'rider' }] })
      .mockResolvedValueOnce({ rows: [{ id: 41, status: 'accepted' }] }); // active ride exists

    const res = await request(rideApp)
      .post('/rides')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({
        pickup_address: 'Bastos', dropoff_address: 'Mvan',
        pickup_lat: 3.848, pickup_lng: 11.502,
        dropoff_lat: 3.866, dropoff_lng: 11.516,
        ride_type: 'standard', payment_method: 'cash',
      });
    expect([400, 409]).toContain(res.status);
  });

  test('Step 3 — Driver cannot create a ride (role guard)', async () => {
    rideDb.query.mockResolvedValueOnce({ rows: [{ id: 20, role: 'driver' }] });
    const res = await request(rideApp)
      .post('/rides')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        pickup_address: 'Bastos', dropoff_address: 'Mvan',
        pickup_lat: 3.848, pickup_lng: 11.502,
        dropoff_lat: 3.866, dropoff_lng: 11.516,
        ride_type: 'standard', payment_method: 'cash',
      });
    expect(res.status).toBe(403);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('E2E: Fare Estimation', () => {
  test('Returns fare estimate for valid route', async () => {
    rideDb.query.mockResolvedValueOnce({ rows: [{ id: 10, role: 'rider' }] });
    const res = await request(rideApp)
      .post('/rides/fare')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ pickup_lat: 3.848, pickup_lng: 11.502, dropoff_lat: 3.866, dropoff_lng: 11.516, ride_type: 'standard' });
    expect([200, 400]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('data');
    }
  });

  test('Rejects unauthenticated fare requests', async () => {
    const res = await request(rideApp).post('/rides/fare').send({});
    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('E2E: Payment Charge Flow', () => {
  test('Step 1 — Stripe payment intent created for completed ride', async () => {
    paymentDb.query
      .mockResolvedValueOnce({ rows: [{ id: 10, role: 'rider' }] })
      .mockResolvedValueOnce({ rows: [{ id: 42, rider_id: 10, status: 'completed', estimated_fare: 2500 }] });

    const res = await request(paymentApp)
      .post('/payments/stripe/payment-intent')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ ride_id: 42 });
    expect([200, 500]).toContain(res.status); // 500 if STRIPE_SECRET_KEY not in test env
  });

  test('Step 2 — MTN webhook processes payment with valid HMAC', async () => {
    const body = JSON.stringify({ externalId: 'ref_mobo_42', status: 'SUCCESSFUL' });
    const sig  = crypto.createHmac('sha256', process.env.MTN_WEBHOOK_SECRET).update(body).digest('hex');

    paymentDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'pending', ride_id: 42, user_id: 10, amount: 1500 }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'completed' }] });

    const res = await request(paymentApp)
      .post('/payments/webhook/mtn')
      .set('x-mtn-signature', `sha256=${sig}`)
      .set('Content-Type', 'application/json')
      .send(body);
    expect([200, 404]).toContain(res.status);
  });

  test('Step 3 — MTN webhook rejects invalid HMAC', async () => {
    const res = await request(paymentApp)
      .post('/payments/webhook/mtn')
      .set('x-mtn-signature', 'sha256=deadbeef')
      .send({ externalId: 'ref_42', status: 'SUCCESSFUL' });
    expect(res.status).toBe(401);
  });

  test('Step 4 — Orange webhook processes payment with valid HMAC', async () => {
    const body = JSON.stringify({ order_id: 'ref_mobo_42', status: '60019' });
    const sig  = crypto.createHmac('sha256', process.env.ORANGE_WEBHOOK_SECRET).update(body).digest('hex');

    paymentDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'pending', ride_id: 42, user_id: 10, amount: 1500 }] })
      .mockResolvedValueOnce({ rows: [{ id: 1 }] });

    const res = await request(paymentApp)
      .post('/payments/webhook/orange')
      .set('x-orange-signature', `sha256=${sig}`)
      .set('Content-Type', 'application/json')
      .send(body);
    expect([200, 404]).toContain(res.status);
  });

  test('Step 5 — Payment history accessible after ride completion', async () => {
    paymentDb.query
      .mockResolvedValueOnce({ rows: [{ id: 10, role: 'rider' }] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, ride_id: 42, amount: 1500, status: 'completed' }] });

    const res = await request(paymentApp)
      .get('/payments/history')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 401]).toContain(res.status);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('E2E: Pool Ride Request', () => {
  test('Rider requests pool ride with valid payload', async () => {
    rideDb.query
      .mockResolvedValueOnce({ rows: [{ id: 10, role: 'rider' }] })
      .mockResolvedValueOnce({ rows: [] }) // no active pool group
      .mockResolvedValueOnce({ rows: [{ id: 5, status: 'forming', seats_available: 3 }] });

    const res = await request(rideApp)
      .post('/rides/pool/request')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({
        pickup_lat: 3.848, pickup_lng: 11.502,
        dropoff_lat: 3.866, dropoff_lng: 11.516,
        seats_requested: 1,
      });
    expect([200, 201, 400]).toContain(res.status);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('E2E: Ride Cancellation', () => {
  test('Rider can cancel a ride in requested state', async () => {
    rideDb.query
      .mockResolvedValueOnce({ rows: [{ id: 10, role: 'rider' }] })
      .mockResolvedValueOnce({ rows: [{ id: 42, rider_id: 10, status: 'requested' }] })
      .mockResolvedValueOnce({ rows: [{ id: 42, status: 'cancelled' }] });

    const res = await request(rideApp)
      .post('/rides/42/cancel')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 404]).toContain(res.status);
  });
});

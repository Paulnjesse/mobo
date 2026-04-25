'use strict';
/**
 * carpoolController.test.js — Pool ride matching controller
 *
 * Tests: requestPoolRide, getPoolGroup, dispatchPoolGroup, estimatePoolFare
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

const riderToken = jwt.sign({ id: 'rider-1', role: 'rider' }, process.env.JWT_SECRET, { expiresIn: '1h' });
const adminToken = jwt.sign({ id: 'admin-1', role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });

beforeEach(() => {
  mockDb.query.mockReset();
  mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
  mockDb.queryRead = (...args) => mockDb.query(...args);
});

// ─── estimatePoolFare ─────────────────────────────────────────────────────────

describe('GET /rides/pool/estimate', () => {
  const validQuery = 'pickup_lat=4.05&pickup_lng=9.77&dropoff_lat=3.85&dropoff_lng=11.50';

  test('returns fare estimates for 1/2/4 riders', async () => {
    const res = await request(app)
      .get(`/rides/pool/estimate?${validQuery}`)
      .set('Authorization', `Bearer ${riderToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('pool_fare_1');
    expect(res.body).toHaveProperty('pool_fare_2');
    expect(res.body).toHaveProperty('pool_fare_4');
    expect(res.body.currency).toBe('XAF');
    expect(res.body.discount_pct).toBe(30);
    // 4-rider pool fare should be cheaper than solo
    expect(res.body.pool_fare_4).toBeLessThan(res.body.solo_fare);
  });

  test('400 when lat/lng params missing', async () => {
    const res = await request(app)
      .get('/rides/pool/estimate?pickup_lat=4.05')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(res.status).toBe(400);
  });
});

// ─── requestPoolRide — new group ─────────────────────────────────────────────

describe('POST /rides/pool/request', () => {
  const body = {
    pickup_location:  { lat: 4.05, lng: 9.77 },
    pickup_address:   'Douala Market',
    dropoff_location: { lat: 3.85, lng: 11.50 },
    dropoff_address:  'Yaoundé Centre',
    payment_method:   'cash',
  };

  test('creates a new pool group when no match found', async () => {
    const newGroup = { id: 'group-uuid-1' };
    const newRide  = { id: 'ride-uuid-1', status: 'requested', estimated_fare: 2800 };
    const groupRow = { current_riders: 1, max_riders: 4 };

    mockDb.query
      .mockResolvedValueOnce({ rows: [] })        // surge zones query
      .mockResolvedValueOnce({ rows: [] })        // pool match search → no match
      .mockResolvedValueOnce({ rows: [newGroup] }) // INSERT pool_ride_groups
      .mockResolvedValueOnce({ rows: [groupRow] }) // SELECT current_riders
      .mockResolvedValueOnce({ rows: [newRide] })  // INSERT rides
      .mockResolvedValueOnce({ rows: [groupRow] }); // SELECT group after ride insert

    const res = await request(app)
      .post('/rides/pool/request')
      .set('Authorization', `Bearer ${riderToken}`)
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body.pool.is_new_group).toBe(true);
    expect(res.body.pool.status).toBe('forming');
    expect(res.body.fare.currency).toBe('XAF');
    expect(res.body.fare.discount_pct).toBe(30);
  });

  test('joins existing pool group when match found', async () => {
    const existingGroup = {
      id: 'group-existing', current_riders: 2, max_riders: 4,
      pickup_lat: 4.05, pickup_lng: 9.77, dropoff_lat: 3.85, dropoff_lng: 11.50,
    };
    const groupAfterJoin = { current_riders: 3, max_riders: 4 };
    const newRide = { id: 'ride-uuid-2', status: 'requested', estimated_fare: 2000 };

    mockDb.query
      .mockResolvedValueOnce({ rows: [] })                // surge zones
      .mockResolvedValueOnce({ rows: [existingGroup] })   // pool match → found
      .mockResolvedValueOnce({ rows: [] })                // UPDATE current_riders
      .mockResolvedValueOnce({ rows: [groupAfterJoin] })  // SELECT current_riders
      .mockResolvedValueOnce({ rows: [newRide] })         // INSERT rides
      .mockResolvedValueOnce({ rows: [groupAfterJoin] }); // SELECT after insert

    const res = await request(app)
      .post('/rides/pool/request')
      .set('Authorization', `Bearer ${riderToken}`)
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body.pool.is_new_group).toBe(false);
    expect(res.body.pool.current_riders).toBe(3);
  });

  test('400 when pickup_location is missing', async () => {
    const res = await request(app)
      .post('/rides/pool/request')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ dropoff_location: { lat: 3.85, lng: 11.50 } });

    expect(res.status).toBe(400);
  });

  test('group marked active when full (current_riders === max_riders)', async () => {
    const newGroup  = { id: 'group-full' };
    const newRide   = { id: 'ride-full', status: 'requested', estimated_fare: 1500 };
    const fullGroup = { current_riders: 4, max_riders: 4 };

    mockDb.query
      .mockResolvedValueOnce({ rows: [] })         // surge
      .mockResolvedValueOnce({ rows: [] })         // no match
      .mockResolvedValueOnce({ rows: [newGroup] }) // INSERT group
      .mockResolvedValueOnce({ rows: [fullGroup] })// SELECT riders
      .mockResolvedValueOnce({ rows: [newRide] })  // INSERT ride
      .mockResolvedValueOnce({ rows: [fullGroup] })// SELECT after insert
      .mockResolvedValueOnce({ rows: [] });        // UPDATE status = 'active'

    const res = await request(app)
      .post('/rides/pool/request')
      .set('Authorization', `Bearer ${riderToken}`)
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body.pool.status).toBe('active');
  });

  test('401 without auth token', async () => {
    const res = await request(app).post('/rides/pool/request').send(body);
    expect(res.status).toBe(401);
  });
});

// ─── getPoolGroup ─────────────────────────────────────────────────────────────

describe('GET /rides/pool/groups/:groupId', () => {
  test('returns group info and rides', async () => {
    const group = { id: 'group-1', status: 'forming', current_riders: 2, max_riders: 4, created_at: new Date().toISOString() };
    const rides = [{ id: 'ride-1', status: 'requested', pickup_address: 'A', dropoff_address: 'B', estimated_fare: 2000, is_mine: true }];

    mockDb.query
      .mockResolvedValueOnce({ rows: [group] })
      .mockResolvedValueOnce({ rows: rides });

    const res = await request(app)
      .get('/rides/pool/groups/group-1')
      .set('Authorization', `Bearer ${riderToken}`);

    expect(res.status).toBe(200);
    expect(res.body.group.id).toBe('group-1');
    expect(res.body.group.seats_available).toBe(2);
    expect(res.body.rides).toHaveLength(1);
  });

  test('404 when group not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/rides/pool/groups/nonexistent')
      .set('Authorization', `Bearer ${riderToken}`);

    expect(res.status).toBe(404);
  });
});

// ─── dispatchPoolGroup ────────────────────────────────────────────────────────

describe('POST /rides/pool/groups/:groupId/dispatch', () => {
  test('dispatches pool group to nearest driver', async () => {
    const sampleRide = { id: 'ride-1', pickup_lng: 9.77, pickup_lat: 4.05 };
    const driver = { driver_id: 'driver-1', user_id: 'user-d1', distance_m: 500 };

    mockDb.query
      .mockResolvedValueOnce({ rows: [sampleRide] }) // fetch ride
      .mockResolvedValueOnce({ rows: [driver] })     // find driver
      .mockResolvedValueOnce({ rows: [] })           // UPDATE rides
      .mockResolvedValueOnce({ rows: [] });          // UPDATE pool_ride_groups

    const res = await request(app)
      .post('/rides/pool/groups/group-1/dispatch')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.dispatched).toBe(true);
    expect(res.body.driver_id).toBe('driver-1');
  });

  test('returns dispatched:false when no drivers available', async () => {
    const sampleRide = { id: 'ride-1', pickup_lng: 9.77, pickup_lat: 4.05 };

    mockDb.query
      .mockResolvedValueOnce({ rows: [sampleRide] })
      .mockResolvedValueOnce({ rows: [] }); // no drivers

    const res = await request(app)
      .post('/rides/pool/groups/group-1/dispatch')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.dispatched).toBe(false);
  });

  test('404 when no rides in pool group', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // no rides

    const res = await request(app)
      .post('/rides/pool/groups/group-empty/dispatch')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});

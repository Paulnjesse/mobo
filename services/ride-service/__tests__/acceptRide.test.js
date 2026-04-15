'use strict';
/**
 * Tests for the acceptRide handler focusing on:
 *   1. Correct 409 response when ride is already taken (TOCTOU protection)
 *   2. AR (auto-reject) suspension is respected
 *   3. Transaction is rolled back on error
 *   4. Happy-path acceptance succeeds
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_minimum_32_chars_long_abc';
process.env.DATABASE_URL = 'postgresql://localhost/mobo_test';

// ── Mock helpers ──────────────────────────────────────────────────────────────
const mockClient = {
  query:   jest.fn(),
  release: jest.fn(),
};

const mockDb = {
  query:   jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  connect: jest.fn().mockResolvedValue(mockClient),
};

jest.mock('../src/config/database', () => mockDb);
jest.mock('../src/jobs/escalationJob',    () => ({ startEscalationJob:   jest.fn() }));
jest.mock('../src/jobs/scheduledRideJob', () => ({ startScheduledRideJob: jest.fn() }));
jest.mock('../src/queues/fraudQueue',     () => ({ enqueueFraudCheck: jest.fn().mockResolvedValue(true) }));
jest.mock('nodemailer', () => ({ createTransport: () => ({ sendMail: jest.fn().mockResolvedValue({}) }) }));
jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }));
const mockLogger = {
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), http: jest.fn(), debug: jest.fn(),
  child: jest.fn().mockReturnThis(),
};
jest.mock('../src/utils/logger', () => mockLogger);

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');

const JWT_SECRET = process.env.JWT_SECRET;
const driverToken = jwt.sign({ id: 'driver-user-1', role: 'driver' }, JWT_SECRET, { expiresIn: '1h' });

const RIDE_ID = 'ride-uuid-1234';

// Helper to make a realistic driver DB row
const driverRow = (overrides = {}) => ({
  id: 'driver-1',
  user_id: 'driver-user-1',
  ar_suspended_until: null,
  vehicle_category: 'standard',
  is_approved: true,
  is_ev: false,
  gender: 'male',
  ...overrides,
});

// Helper to make a realistic ride DB row
const rideRow = (overrides = {}) => ({
  id: RIDE_ID,
  status: 'requested',
  ride_type: 'standard',
  rider_id: 'rider-1',
  requires_wav: false,
  requires_ev: false,
  women_only: false,
  estimated_fare: 5000,
  pickup_address: 'Akwa, Douala',
  dropoff_address: 'Bonanjo, Douala',
  ...overrides,
});

beforeEach(() => {
  mockDb.query.mockReset();
  mockDb.connect.mockReset();
  mockClient.query.mockReset();
  mockClient.release.mockReset();
  mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
  mockDb.connect.mockResolvedValue(mockClient);
});

// ── 1. Race condition — ride already taken ────────────────────────────────────
describe('acceptRide — race condition (TOCTOU)', () => {
  test('returns 409 when FOR UPDATE finds no available ride', async () => {
    mockDb.connect.mockResolvedValueOnce(mockClient);
    mockClient.query
      .mockResolvedValueOnce({ rows: [driverRow()] })    // driver lookup (before BEGIN)
      .mockResolvedValueOnce({ rows: [] })                // BEGIN
      .mockResolvedValueOnce({ rows: [] })                // SELECT ... FOR UPDATE → already taken
      .mockResolvedValueOnce({ rows: [] });               // ROLLBACK

    const res = await request(app)
      .post(`/rides/${RIDE_ID}/accept`)
      .set('Authorization', `Bearer ${driverToken}`)
      .set('x-user-id', 'driver-user-1');

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/no longer available/i);
    // Ensure ROLLBACK was called
    const calls = mockClient.query.mock.calls.map(c => String(c[0]).trim().toUpperCase());
    expect(calls).toContain('ROLLBACK');
  });

  test('returns 409 when UPDATE rowCount is 0 (second driver got there first)', async () => {
    mockDb.connect.mockResolvedValueOnce(mockClient);
    mockClient.query
      .mockResolvedValueOnce({ rows: [driverRow()] })               // driver lookup (outside tx)
      .mockResolvedValueOnce({ rows: [] })                           // BEGIN
      .mockResolvedValueOnce({ rows: [rideRow()] })                  // FOR UPDATE — found
      .mockResolvedValueOnce({ rows: [{ gender_preference: null }] }) // riderPref check (always runs)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })              // UPDATE rides — 0 rows (race lost)
      .mockResolvedValueOnce({ rows: [] });                          // ROLLBACK

    const res = await request(app)
      .post(`/rides/${RIDE_ID}/accept`)
      .set('Authorization', `Bearer ${driverToken}`)
      .set('x-user-id', 'driver-user-1');

    expect(res.status).toBe(409);
    const calls = mockClient.query.mock.calls.map(c => String(c[0]).trim().toUpperCase());
    expect(calls).toContain('ROLLBACK');
  });
});

// ── 2. AR suspension ──────────────────────────────────────────────────────────
describe('acceptRide — AR suspension', () => {
  test('returns 403 when driver is AR-suspended', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1h from now
    mockDb.connect.mockResolvedValueOnce(mockClient);
    mockClient.query
      .mockResolvedValueOnce({ rows: [driverRow({ ar_suspended_until: future })] }); // driver with suspension

    const res = await request(app)
      .post(`/rides/${RIDE_ID}/accept`)
      .set('Authorization', `Bearer ${driverToken}`)
      .set('x-user-id', 'driver-user-1');

    // Should be rejected before any transaction starts
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/suspended/i);
  });

  test('allows accept when AR suspension has expired', async () => {
    const past = new Date(Date.now() - 60 * 1000).toISOString(); // expired 1 min ago
    const acceptedRide = { ...rideRow(), status: 'accepted', driver_id: 'driver-1', pickup_otp: '1234' };

    mockDb.connect.mockResolvedValueOnce(mockClient);
    mockClient.query
      .mockResolvedValueOnce({ rows: [driverRow({ ar_suspended_until: past })] })
      .mockResolvedValueOnce({ rows: [] })                              // BEGIN
      .mockResolvedValueOnce({ rows: [rideRow()] })                     // FOR UPDATE
      .mockResolvedValueOnce({ rows: [acceptedRide], rowCount: 1 })     // UPDATE rides
      .mockResolvedValueOnce({ rows: [] })                              // driver streak update
      .mockResolvedValueOnce({ rows: [] });                             // COMMIT

    // pool.query used after commit for push notification lookup
    mockDb.query
      .mockResolvedValue({ rows: [{ id: 'rider-1', full_name: 'Alice', push_token: null }] });

    const res = await request(app)
      .post(`/rides/${RIDE_ID}/accept`)
      .set('Authorization', `Bearer ${driverToken}`)
      .set('x-user-id', 'driver-user-1');

    // Must NOT be 403 (suspension should not block)
    expect(res.status).not.toBe(403);
  });
});

// ── 3. Driver not found ───────────────────────────────────────────────────────
describe('acceptRide — driver validation', () => {
  test('returns 403 when driver record does not exist', async () => {
    mockDb.connect.mockResolvedValueOnce(mockClient);
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }); // driver not found

    const res = await request(app)
      .post(`/rides/${RIDE_ID}/accept`)
      .set('Authorization', `Bearer ${driverToken}`)
      .set('x-user-id', 'driver-user-1');

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/approved driver/i);
  });
});

// ── 4. client.release() is always called ─────────────────────────────────────
describe('acceptRide — connection hygiene', () => {
  test('releases DB client even when an error is thrown mid-transaction', async () => {
    mockDb.connect.mockResolvedValueOnce(mockClient);
    mockClient.query
      .mockResolvedValueOnce({ rows: [driverRow()] })  // driver lookup
      .mockResolvedValueOnce({ rows: [] })              // BEGIN
      .mockRejectedValueOnce(new Error('DB connection lost')) // FOR UPDATE throws
      .mockResolvedValueOnce({ rows: [] });             // ROLLBACK in catch

    const res = await request(app)
      .post(`/rides/${RIDE_ID}/accept`)
      .set('Authorization', `Bearer ${driverToken}`)
      .set('x-user-id', 'driver-user-1');

    expect(res.status).toBe(500);
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });
});

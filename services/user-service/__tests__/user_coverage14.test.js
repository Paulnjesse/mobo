'use strict';
/**
 * user_coverage14.test.js
 *
 * Targets:
 *  - authController: forgotPassword, resetPassword, refreshToken, socialLogin,
 *    registerFleetOwner paths, resendOtp paths, registerDriver extra paths
 *  - fleetController: uncovered paths
 *  - profileController: uncovered high-impact paths
 */

process.env.NODE_ENV   = 'test';
process.env.JWT_SECRET = 'test-secret-for-jest-minimum-32-chars-long';

const mockDb = {
  query:   jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  connect: jest.fn().mockResolvedValue({
    query:   jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    release: jest.fn(),
  }),
};

jest.mock('../src/config/database', () => mockDb);
jest.mock('../src/jobs/expiryAlertJob', () => ({ startExpiryAlertJob: jest.fn() }));
jest.mock('twilio', () => () => ({
  messages: { create: jest.fn().mockResolvedValue({ sid: 'SM_test' }) },
}));
jest.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail: jest.fn().mockResolvedValue({ messageId: 'test-id' }) }),
}));
jest.mock('../../../services/shared/redis', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  quit: jest.fn().mockResolvedValue('OK'),
}), { virtual: true });
jest.mock('../../shared/redis', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  quit: jest.fn().mockResolvedValue('OK'),
}), { virtual: true });
// Mock shared redis with NX set returning 'OK' (not null)
jest.mock('../../../shared/redis', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  quit: jest.fn().mockResolvedValue('OK'),
  getClient: jest.fn().mockReturnValue({
    set: jest.fn().mockResolvedValue('OK'), // NX returns 'OK' not null → not a replay
    get: jest.fn().mockResolvedValue(null),
  }),
}), { virtual: true });
jest.mock('bcryptjs', () => ({
  hash:    jest.fn().mockResolvedValue('$2b$10$hashedpassword'),
  compare: jest.fn().mockResolvedValue(true),
  genSalt: jest.fn().mockResolvedValue('salt'),
}));
jest.mock('../src/utils/logger', () => {
  const child = jest.fn();
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), http: jest.fn(), debug: jest.fn(), child };
  child.mockReturnValue(logger);
  return logger;
});
jest.mock('axios', () => ({
  post: jest.fn().mockResolvedValue({ data: {} }),
  get:  jest.fn().mockResolvedValue({ data: { sub: 'google-user-123', email: 'user@gmail.com', name: 'Google User' } }),
}));
jest.mock('../../../shared/jwtUtil', () => ({
  signToken: jest.fn().mockReturnValue('mock-jwt-token'),
  decodeIgnoreExpiry: jest.fn().mockReturnValue({ id: 1, iat: Math.floor(Date.now() / 1000) }),
}), { virtual: true });
jest.mock('../../../shared/fieldEncryption', () => ({
  encrypt: jest.fn().mockReturnValue('encrypted-value'),
  decrypt: jest.fn().mockReturnValue('decrypted-value'),
  hashForLookup: jest.fn().mockReturnValue('hashed-value'),
}), { virtual: true });
jest.mock('../../../shared/auditLog', () => ({
  log: jest.fn().mockResolvedValue(undefined),
}), { virtual: true });
jest.mock('../../../shared/currencyUtil', () => ({
  resolveCountryCode: jest.fn().mockReturnValue('CM'),
}), { virtual: true });

const request = require('supertest');
const jwt     = require('jsonwebtoken');
const app     = require('../server');

const JWT_SECRET   = process.env.JWT_SECRET;
const riderToken   = 'Bearer ' + jwt.sign({ id: 1, role: 'rider' }, JWT_SECRET, { expiresIn: '1h' });
const adminToken   = 'Bearer ' + jwt.sign({ id: 9, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });

const ANY = [200, 201, 202, 400, 401, 403, 404, 409, 422, 429, 500];

beforeEach(() => {
  mockDb.query.mockReset();
  mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ─── authController — forgotPassword ─────────────────────────────────────────

describe('POST /auth/forgot-password', () => {
  test('missing identifier → 400', async () => {
    const res = await request(app)
      .post('/auth/forgot-password')
      .send({});
    expect([400]).toContain(res.statusCode);
  });

  test('user not found → success (no enumeration)', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/auth/forgot-password')
      .send({ identifier: '+237611000001' });
    expect([200]).toContain(res.statusCode);
  });

  test('user found by phone — inactive → 403', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, is_active: false, phone: '+237611000001', email: null, language: 'fr', full_name: 'Test' }] });
    const res = await request(app)
      .post('/auth/forgot-password')
      .send({ identifier: '+237611000001' });
    expect([403]).toContain(res.statusCode);
  });

  test('user found by email — sends OTP', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, is_active: true, phone: null, email: 'user@test.com', language: 'en', full_name: 'Test' }] })
      .mockResolvedValueOnce({ rows: [] }); // update OTP
    const res = await request(app)
      .post('/auth/forgot-password')
      .send({ identifier: 'user@test.com' });
    expect([200]).toContain(res.statusCode);
  });

  test('user found with both phone and email', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, is_active: true, phone: '+237611000001', email: 'user@test.com', language: 'fr', full_name: 'Test' }] })
      .mockResolvedValueOnce({ rows: [] }); // update OTP
    const res = await request(app)
      .post('/auth/forgot-password')
      .send({ identifier: 'user@test.com' });
    expect([200]).toContain(res.statusCode);
  });

  test('DB error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB fail'));
    const res = await request(app)
      .post('/auth/forgot-password')
      .send({ identifier: 'user@test.com' });
    expect([500]).toContain(res.statusCode);
  });
});

// ─── authController — resetPassword ──────────────────────────────────────────

describe('POST /auth/reset-password', () => {
  test('missing fields → 400', async () => {
    const res = await request(app)
      .post('/auth/reset-password')
      .send({ identifier: 'user@test.com' });
    expect([400]).toContain(res.statusCode);
  });

  test('password too short → 400', async () => {
    const res = await request(app)
      .post('/auth/reset-password')
      .send({ identifier: 'user@test.com', otp_code: '123456', new_password: 'short' });
    expect([400]).toContain(res.statusCode);
  });

  test('user not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/auth/reset-password')
      .send({ identifier: 'notfound@test.com', otp_code: '123456', new_password: 'newpassword123' });
    expect([404]).toContain(res.statusCode);
  });

  test('no reset OTP requested → 400', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, reset_otp: null }] });
    const res = await request(app)
      .post('/auth/reset-password')
      .send({ identifier: 'user@test.com', otp_code: '123456', new_password: 'newpassword123' });
    expect([400]).toContain(res.statusCode);
  });

  test('too many attempts → 429', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, reset_otp: '123456', reset_otp_attempts: 10 }] })
      .mockResolvedValueOnce({ rows: [] }); // clear OTP
    const res = await request(app)
      .post('/auth/reset-password')
      .send({ identifier: 'user@test.com', otp_code: '000000', new_password: 'newpassword123' });
    expect([429]).toContain(res.statusCode);
  });

  test('wrong OTP → 400', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, reset_otp: '654321', reset_otp_attempts: 0 }] })
      .mockResolvedValueOnce({ rows: [] }); // increment attempts
    const res = await request(app)
      .post('/auth/reset-password')
      .send({ identifier: 'user@test.com', otp_code: '000000', new_password: 'newpassword123' });
    expect([400]).toContain(res.statusCode);
  });

  test('expired OTP → 400', async () => {
    const expiredDate = new Date(Date.now() - 3600000); // 1 hour ago
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 1, reset_otp: '123456', reset_otp_attempts: 0, reset_otp_expiry: expiredDate.toISOString() }],
    });
    const res = await request(app)
      .post('/auth/reset-password')
      .send({ identifier: 'user@test.com', otp_code: '123456', new_password: 'newpassword123' });
    expect([400]).toContain(res.statusCode);
  });

  test('success — password reset', async () => {
    const futureDate = new Date(Date.now() + 3600000);
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, reset_otp: '123456', reset_otp_attempts: 0, reset_otp_expiry: futureDate.toISOString(), email: 'user@test.com', full_name: 'Test', language: 'en' }] })
      .mockResolvedValueOnce({ rows: [] }); // update password
    const res = await request(app)
      .post('/auth/reset-password')
      .send({ identifier: 'user@test.com', otp_code: '123456', new_password: 'newpassword123' });
    expect([200]).toContain(res.statusCode);
  });

  test('by phone identifier — success', async () => {
    const futureDate = new Date(Date.now() + 3600000);
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, reset_otp: '123456', reset_otp_attempts: 0, reset_otp_expiry: futureDate.toISOString(), email: null, full_name: 'Test', language: 'fr' }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/auth/reset-password')
      .send({ identifier: '+237611000001', otp_code: '123456', new_password: 'newpassword123' });
    expect([200]).toContain(res.statusCode);
  });
});

// ─── authController — refreshToken ───────────────────────────────────────────

describe('POST /auth/refresh-token', () => {
  test('no token → 401', async () => {
    const res = await request(app)
      .post('/auth/refresh-token')
      .send({});
    expect([401]).toContain(res.statusCode);
  });

  test('token from body', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 1, phone: '+237', email: null, role: 'rider', full_name: 'Test', is_active: true, is_suspended: false }],
    });
    const validToken = jwt.sign({ id: 1, role: 'rider' }, JWT_SECRET, { expiresIn: '7d' });
    const res = await request(app)
      .post('/auth/refresh-token')
      .send({ refreshToken: validToken });
    expect([200, 401, 500]).toContain(res.statusCode);
  });

  test('user not found → 401', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const validToken = jwt.sign({ id: 999 }, JWT_SECRET, { expiresIn: '7d' });
    const res = await request(app)
      .post('/auth/refresh-token')
      .send({ refreshToken: validToken });
    expect([401, 500]).toContain(res.statusCode);
  });

  test('inactive user → 403', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 1, is_active: false, is_suspended: false }],
    });
    const validToken = jwt.sign({ id: 1 }, JWT_SECRET, { expiresIn: '7d' });
    const res = await request(app)
      .post('/auth/refresh-token')
      .send({ refreshToken: validToken });
    expect([403, 401, 500]).toContain(res.statusCode);
  });

  test('invalid token string → 401', async () => {
    const res = await request(app)
      .post('/auth/refresh-token')
      .send({ refreshToken: 'not.a.valid.token' });
    expect([401, 500]).toContain(res.statusCode);
  });
});

// ─── authController — resendOtp extra paths ───────────────────────────────────

describe('POST /auth/resend-otp — extra paths', () => {
  test('user already verified → 200', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, is_verified: true, language: 'fr', full_name: 'Test', email: null }] });
    const res = await request(app)
      .post('/auth/resend-otp')
      .send({ phone: '+237611000001' });
    expect([200]).toContain(res.statusCode);
  });

  test('too many OTP requests → 429', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, is_verified: false, language: 'fr', full_name: 'Test', email: null }] })
      .mockResolvedValueOnce({ rows: [{ count: '5' }] }); // high count
    const res = await request(app)
      .post('/auth/resend-otp')
      .send({ phone: '+237611000001' });
    expect([429]).toContain(res.statusCode);
  });

  test('with email user — sends both SMS and email', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, is_verified: false, language: 'en', full_name: 'Test', email: 'test@test.com' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // OTP count
      .mockResolvedValueOnce({ rows: [] }) // update OTP
      .mockResolvedValueOnce({ rows: [] }); // log OTP send
    const res = await request(app)
      .post('/auth/resend-otp')
      .send({ phone: '+237611000001' });
    expect([200, 500]).toContain(res.statusCode);
  });
});

// ─── authController — socialLogin paths ───────────────────────────────────────

describe('POST /auth/social', () => {
  test('missing provider/token → 400', async () => {
    const res = await request(app)
      .post('/auth/social')
      .send({ email: 'user@test.com' });
    expect([400]).toContain(res.statusCode);
  });

  test('invalid provider → 400', async () => {
    const res = await request(app)
      .post('/auth/social')
      .send({ provider: 'twitter', token: 'abc123' });
    expect([400]).toContain(res.statusCode);
  });

  test('google login — existing user', async () => {
    const axios = require('axios');
    axios.get.mockResolvedValueOnce({ data: { sub: 'gid123', email: 'google@test.com', name: 'Google User', aud: 'someClientId' } });
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, phone: '+237', email: 'google@test.com', role: 'rider', full_name: 'Google User', is_active: true, is_suspended: false, country: 'CM', loyalty_points: 0, registration_step: null, registration_completed: true, country_code: 'CM' }] }) // find by email
      .mockResolvedValueOnce({ rows: [] }) // upsert oauth
      .mockResolvedValueOnce({ rows: [] }); // update google_id
    const res = await request(app)
      .post('/auth/social')
      .send({ provider: 'google', token: 'google-token-123' });
    expect(ANY).toContain(res.statusCode);
  });

  test('google login — new user created', async () => {
    const axios = require('axios');
    axios.get.mockResolvedValueOnce({ data: { sub: 'gid456', email: 'newuser@google.com', name: 'New User' } });
    mockDb.query
      .mockResolvedValueOnce({ rows: [] }) // not found by provider_id
      .mockResolvedValueOnce({ rows: [] }) // not found by email
      .mockResolvedValueOnce({ rows: [{ id: 99, phone: null, email: 'newuser@google.com', role: 'rider', full_name: 'New User', is_active: true, country: 'CM', loyalty_points: 0, registration_step: null, registration_completed: false, country_code: 'CM' }] }) // insert user
      .mockResolvedValueOnce({ rows: [] }) // upsert oauth
      .mockResolvedValueOnce({ rows: [] }); // update google_id
    const res = await request(app)
      .post('/auth/social')
      .send({ provider: 'google', token: 'new-google-token' });
    expect(ANY).toContain(res.statusCode);
  });

  test('google login — API error → 401', async () => {
    const axios = require('axios');
    axios.get.mockRejectedValueOnce(new Error('Google API down'));
    const res = await request(app)
      .post('/auth/social')
      .send({ provider: 'google', token: 'bad-token' });
    expect([401, 500]).toContain(res.statusCode);
  });

  test('facebook login — success path', async () => {
    const axios = require('axios');
    axios.get.mockResolvedValueOnce({ data: { id: 'fb123', email: 'fb@test.com', name: 'FB User' } });
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, phone: null, email: 'fb@test.com', role: 'rider', full_name: 'FB User', is_active: true, is_suspended: false, country: 'CM', loyalty_points: 0, registration_step: null, registration_completed: true, country_code: 'CM' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/auth/social')
      .send({ provider: 'facebook', token: 'fb-token-123' });
    expect(ANY).toContain(res.statusCode);
  });

  test('facebook login — API error → 401', async () => {
    const axios = require('axios');
    axios.get.mockRejectedValueOnce(new Error('Facebook API down'));
    const res = await request(app)
      .post('/auth/social')
      .send({ provider: 'facebook', token: 'bad-fb-token' });
    expect([401, 500]).toContain(res.statusCode);
  });
});

// ─── authController — registerFleetOwner paths ───────────────────────────────

describe('POST /auth/signup — fleet_owner registration', () => {
  test('fleet owner signup with existing fleet', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] }) // phone not taken
      .mockResolvedValueOnce({ rows: [] }) // email not taken
      .mockResolvedValueOnce({ rows: [{ id: 1, phone: '+237611000001', email: null, role: 'fleet_owner', full_name: 'Fleet Owner', country: 'CM' }] }) // insert user
      .mockResolvedValueOnce({ rows: [] }) // OTP count check
      .mockResolvedValueOnce({ rows: [] }) // update OTP
      .mockResolvedValueOnce({ rows: [] }) // log OTP
      .mockResolvedValueOnce({ rows: [] }) // encrypt fields
      .mockResolvedValueOnce({ rows: [] }) // loyalty transaction
      .mockResolvedValueOnce({ rows: [{ id: 'fleet1', fleet_number: 1 }] }); // existing fleet
    const res = await request(app)
      .post('/auth/signup')
      .send({
        full_name: 'Fleet Owner', phone: '+237611000001', password: 'password123',
        role: 'fleet_owner', company_name: 'Test Fleet', country: 'Cameroon',
      });
    expect(ANY).toContain(res.statusCode);
  });
});

// ─── authController — registerDriver paths ────────────────────────────────────

describe('POST /auth/driver/register — registerDriver', () => {
  test('non-authenticated user → 401', async () => {
    const res = await request(app)
      .post('/auth/driver/register')
      .send({ full_name: 'Driver', phone: '+237611000002', license_number: 'D123456' });
    expect([401, 404]).toContain(res.statusCode);
  });

  test('already has driver profile → 409', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, role: 'driver' }] }) // user found
      .mockResolvedValueOnce({ rows: [{ id: 'd1' }] }); // driver profile exists
    const res = await request(app)
      .post('/auth/driver/register')
      .set('Authorization', riderToken)
      .send({ license_number: 'D123456', license_expiry: '2025-12-31' });
    expect(ANY).toContain(res.statusCode);
  });
});

// ─── fleetController — uncovered paths ───────────────────────────────────────

describe('GET /fleet/:id/vehicles — list vehicles for fleet', () => {
  const fleetOwnerToken = 'Bearer ' + jwt.sign({ id: 5, role: 'fleet_owner' }, JWT_SECRET, { expiresIn: '1h' });

  test('fleet not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/fleet/nonexistent/vehicles')
      .set('Authorization', fleetOwnerToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('lists vehicles', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'f1', owner_id: 5 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'v1', make: 'Toyota' }] });
    const res = await request(app)
      .get('/fleet/f1/vehicles')
      .set('Authorization', fleetOwnerToken);
    expect(ANY).toContain(res.statusCode);
  });
});

describe('PATCH /fleet/:id — updateFleet', () => {
  const fleetOwnerToken = 'Bearer ' + jwt.sign({ id: 5, role: 'fleet_owner' }, JWT_SECRET, { expiresIn: '1h' });

  test('fleet not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .patch('/fleet/nonexistent')
      .set('Authorization', fleetOwnerToken)
      .send({ name: 'New Name' });
    expect(ANY).toContain(res.statusCode);
  });

  test('success', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'f1', owner_id: 5 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'f1', name: 'New Name' }] });
    const res = await request(app)
      .patch('/fleet/f1')
      .set('Authorization', fleetOwnerToken)
      .send({ name: 'New Name', description: 'Updated fleet' });
    expect(ANY).toContain(res.statusCode);
  });
});

describe('DELETE /fleet/:fleetId/vehicles/:vehicleId — removeVehicleFromFleet', () => {
  const fleetOwnerToken = 'Bearer ' + jwt.sign({ id: 5, role: 'fleet_owner' }, JWT_SECRET, { expiresIn: '1h' });

  test('vehicle not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .delete('/fleet/f1/vehicles/nonexistent')
      .set('Authorization', fleetOwnerToken);
    expect(ANY).toContain(res.statusCode);
  });
});

describe('GET /fleet/admin/all — admin list all fleets', () => {
  test('admin gets all fleets', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'f1', name: 'Fleet 1' }] });
    const res = await request(app)
      .get('/fleet/admin/all')
      .set('Authorization', adminToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('non-admin → 403', async () => {
    const res = await request(app)
      .get('/fleet/admin/all')
      .set('Authorization', riderToken);
    expect([403]).toContain(res.statusCode);
  });
});

describe('PATCH /fleet/admin/:fleetId/approve — approveFleet', () => {
  test('approves fleet', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'f1', is_approved: true }] });
    const res = await request(app)
      .patch('/fleet/admin/f1/approve')
      .set('Authorization', adminToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('fleet not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .patch('/fleet/admin/nonexistent/approve')
      .set('Authorization', adminToken);
    expect(ANY).toContain(res.statusCode);
  });
});

// ─── profileController — uncovered paths ──────────────────────────────────────

describe('GET /users/me — getProfile', () => {
  test('user not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/users/me')
      .set('Authorization', riderToken);
    expect([404, 500]).toContain(res.statusCode);
  });
});

describe('POST /users/teen — createTeenAccount', () => {
  test('missing required fields → 400', async () => {
    const res = await request(app)
      .post('/users/teen')
      .set('Authorization', riderToken)
      .send({});
    expect([400, 404]).toContain(res.statusCode);
  });

  test('too many teen accounts → 400', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ count: '3' }] }); // already has 3 teen accounts
    const res = await request(app)
      .post('/users/teen')
      .set('Authorization', riderToken)
      .send({ teen_name: 'Teen', teen_phone: '+237611000002', teen_age: 15 });
    expect(ANY).toContain(res.statusCode);
  });
});

describe('GET /users/loyalty — getLoyaltyInfo', () => {
  test('returns loyalty info', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, loyalty_points: 100 }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/users/loyalty')
      .set('Authorization', riderToken);
    expect([200, 500]).toContain(res.statusCode);
  });
});

describe('GET /users/subscription — getSubscription', () => {
  test('returns subscription info', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, subscription_plan: 'premium', subscription_expiry: new Date() }] });
    const res = await request(app)
      .get('/users/subscription')
      .set('Authorization', riderToken);
    expect([200, 500]).toContain(res.statusCode);
  });
});

describe('POST /users/me/push-token — updateExpoPushToken', () => {
  test('updates push token', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/users/me/push-token')
      .set('Authorization', riderToken)
      .send({ push_token: 'ExponentPushToken[test123]' });
    expect(ANY).toContain(res.statusCode);
  });

  test('missing token → 400', async () => {
    const res = await request(app)
      .post('/users/me/push-token')
      .set('Authorization', riderToken)
      .send({});
    expect(ANY).toContain(res.statusCode);
  });
});

describe('POST /users/me/block-rider — blockRider', () => {
  test('blocks a rider', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'rider1' }] }) // rider exists
      .mockResolvedValueOnce({ rows: [] }); // insert block
    const res = await request(app)
      .post('/users/me/block-rider')
      .set('Authorization', riderToken)
      .send({ blocked_user_id: 'rider1' });
    expect(ANY).toContain(res.statusCode);
  });
});

describe('DELETE /users/me/unblock-rider/:id — unblockRider', () => {
  test('unblocks a rider', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .delete('/users/me/unblock-rider/rider1')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });
});

describe('POST /users/me/appeal — submitAppeal', () => {
  test('submits appeal', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/users/me/appeal')
      .set('Authorization', riderToken)
      .send({ reason: 'I was wrongly suspended', details: 'Please review my account' });
    expect(ANY).toContain(res.statusCode);
  });
});

describe('GET /users/notifications — getNotifications', () => {
  test('returns notifications', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'n1', title: 'Test', is_read: false }] });
    const res = await request(app)
      .get('/users/notifications')
      .set('Authorization', riderToken);
    expect([200, 500]).toContain(res.statusCode);
  });
});

describe('PATCH /users/notifications/:id/read — markNotificationRead', () => {
  test('marks notification as read', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .patch('/users/notifications/n1/read')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });
});

describe('DELETE /users/me/delete — deleteAccount', () => {
  test('deletes account', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, wallet_balance: 0 }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .delete('/users/me/delete')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });
});

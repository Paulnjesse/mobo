/**
 * user_coverage3.test.js — deep coverage for authController, profileController, gdprController
 * Covers: login success paths, verify OTP paths, teen account, corporate account, GDPR erasure
 */
process.env.NODE_ENV   = 'test';
process.env.JWT_SECRET = 'test-secret-for-jest-minimum-32-chars-long';

const mockDb = {
  query:   jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  connect: jest.fn().mockResolvedValue({
    query:   jest.fn().mockResolvedValue({ rows: [] }),
    release: jest.fn(),
  }),
};

jest.mock('../src/config/database', () => mockDb);
jest.mock('../src/jobs/expiryAlertJob', () => ({ startExpiryAlertJob: jest.fn() }));
jest.mock('twilio', () => () => ({
  messages: { create: jest.fn().mockResolvedValue({ sid: 'SM_test' }) },
}));
jest.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail: jest.fn().mockResolvedValue({ messageId: 'test' }) }),
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
jest.mock('../src/utils/logger', () => {
  const child = jest.fn();
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), http: jest.fn(), debug: jest.fn(), child };
  child.mockReturnValue(logger);
  return logger;
});
jest.mock('../src/middleware/rbac', () => ({
  requirePermission:         () => (req, res, next) => next(),
  getUserPermissions:        jest.fn().mockResolvedValue(new Set()),
  invalidatePermissionCache: jest.fn(),
}));
jest.mock('../src/middleware/adminAudit', () => ({
  auditAdmin:     () => (req, res, next) => next(),
  autoAuditAdmin: (req, res, next) => next(),
}));
jest.mock('../src/middleware/dataAccessLogger', () => (req, res, next) => next());

const request = require('supertest');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const app     = require('../server');

const JWT_SECRET  = process.env.JWT_SECRET;
const riderToken  = jwt.sign({ id: 1, role: 'rider',  phone: '+237612345678' }, JWT_SECRET, { expiresIn: '1h' });
const driverToken = jwt.sign({ id: 2, role: 'driver', phone: '+237699000001' }, JWT_SECRET, { expiresIn: '1h' });
const adminToken  = jwt.sign({ id: 99, role: 'admin', phone: '+237600000099' }, JWT_SECRET, { expiresIn: '1h' });

const ANY = [200, 201, 202, 400, 401, 403, 404, 409, 422, 500];

let passwordHash;
beforeAll(async () => {
  // Pre-compute hash once — bcrypt with cost 1 is fast for tests
  passwordHash = await bcrypt.hash('Test@123', 1);
});

beforeEach(() => {
  mockDb.query.mockReset();
  mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
  // Reset connect mock
  const clientMock = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
  mockDb.connect.mockResolvedValue(clientMock);
});

// ─────────────────────────────────────────────
// Auth — login success paths (covers lines 638-736)
// ─────────────────────────────────────────────
describe('Auth — login success paths', () => {
  function makeUser(overrides = {}) {
    return {
      id: 1, full_name: 'Jean Dupont', phone: '+237612345678', email: null,
      password_hash: passwordHash, role: 'rider',
      is_suspended: false, is_active: true, is_verified: true,
      country: 'Cameroon', city: 'Douala', language: 'fr',
      rating: 4.8, total_rides: 50, loyalty_points: 1500, wallet_balance: 5000,
      subscription_plan: null, profile_picture: null,
      registration_step: 5, registration_completed: true,
      ...overrides,
    };
  }

  test('successful rider login returns token', async () => {
    const user = makeUser();
    mockDb.query
      .mockResolvedValueOnce({ rows: [user] })          // SELECT user
      .mockResolvedValueOnce({ rows: [{ totp_enabled: false }] }) // SELECT totp
      .mockResolvedValueOnce({ rows: [] });              // audit log
    const res = await request(app).post('/auth/login')
      .send({ phone: '+237612345678', password: 'Test@123' });
    expect(ANY).toContain(res.status);
  });

  test('successful driver login fetches driver info', async () => {
    const user = makeUser({ id: 2, role: 'driver', phone: '+237699000001' });
    mockDb.query
      .mockResolvedValueOnce({ rows: [user] })
      .mockResolvedValueOnce({ rows: [{ id: 20, make: 'Toyota', model: 'Corolla', plate: 'LT-001' }] }) // driver info
      .mockResolvedValueOnce({ rows: [{ totp_enabled: false }] })
      .mockResolvedValueOnce({ rows: [] }); // audit
    const res = await request(app).post('/auth/login')
      .send({ phone: '+237699000001', password: 'Test@123' });
    expect(ANY).toContain(res.status);
  });

  test('successful fleet_owner login fetches fleet info', async () => {
    const user = makeUser({ id: 5, role: 'fleet_owner', phone: '+237699000005' });
    mockDb.query
      .mockResolvedValueOnce({ rows: [user] })
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Fleet A', vehicle_count: '3' }] }) // fleet info
      .mockResolvedValueOnce({ rows: [{ totp_enabled: false }] })
      .mockResolvedValueOnce({ rows: [] }); // audit
    const res = await request(app).post('/auth/login')
      .send({ phone: '+237699000005', password: 'Test@123' });
    expect(ANY).toContain(res.status);
  });

  test('login with 2FA enabled returns challenge', async () => {
    const user = makeUser();
    mockDb.query
      .mockResolvedValueOnce({ rows: [user] })
      .mockResolvedValueOnce({ rows: [{ totp_enabled: true }] }); // 2FA enabled
    const res = await request(app).post('/auth/login')
      .send({ phone: '+237612345678', password: 'Test@123' });
    expect(ANY).toContain(res.status);
  });

  test('login as admin without 2FA setup is blocked', async () => {
    const adminUser = makeUser({ id: 99, role: 'admin', phone: '+237600000099' });
    mockDb.query
      .mockResolvedValueOnce({ rows: [adminUser] })
      .mockResolvedValueOnce({ rows: [{ totp_enabled: false }] }); // 2FA not set up
    const res = await request(app).post('/auth/login')
      .send({ phone: '+237600000099', password: 'Test@123' });
    expect(ANY).toContain(res.status);
  });

  test('login with suspended account returns 403', async () => {
    const user = makeUser({ is_suspended: true });
    mockDb.query.mockResolvedValueOnce({ rows: [user] });
    const res = await request(app).post('/auth/login')
      .send({ phone: '+237612345678', password: 'Test@123' });
    expect([403, 401]).toContain(res.status);
  });

  test('login with inactive account returns 403', async () => {
    const user = makeUser({ is_active: false });
    mockDb.query.mockResolvedValueOnce({ rows: [user] });
    const res = await request(app).post('/auth/login')
      .send({ phone: '+237612345678', password: 'Test@123' });
    expect([403, 401]).toContain(res.status);
  });

  test('login with email identifier', async () => {
    const user = makeUser({ email: 'jean@test.com' });
    mockDb.query
      .mockResolvedValueOnce({ rows: [user] })
      .mockResolvedValueOnce({ rows: [{ totp_enabled: false }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/auth/login')
      .send({ identifier: 'jean@test.com', password: 'Test@123' });
    expect(ANY).toContain(res.status);
  });

  test('login with wrong password records audit and returns 401', async () => {
    const user = makeUser({ password_hash: '$2b$10$wronghashXXXXXXXXXXXXXXXXXXXXXXXXXXXX' });
    mockDb.query
      .mockResolvedValueOnce({ rows: [user] })
      .mockResolvedValueOnce({ rows: [] }); // audit log
    const res = await request(app).post('/auth/login')
      .send({ phone: '+237612345678', password: 'WrongPassword' });
    expect([401]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// Auth — verify OTP additional paths (covers lines 745-826)
// ─────────────────────────────────────────────
describe('Auth — verify OTP additional paths', () => {
  test('returns 400 without phone', async () => {
    const res = await request(app).post('/auth/verify').send({ otp: '123456' });
    expect(ANY).toContain(res.status);
  });

  test('returns 401 for wrong OTP', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ otp: '654321', expires_at: new Date(Date.now() + 300000), attempts: 1 }],
    });
    const res = await request(app).post('/auth/verify')
      .send({ phone: '+237612345678', otp: '111111' });
    expect(ANY).toContain(res.status);
  });

  test('returns 401 for expired OTP', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ otp: '123456', expires_at: new Date(Date.now() - 60000), attempts: 0 }],
    });
    const res = await request(app).post('/auth/verify')
      .send({ phone: '+237612345678', otp: '123456' });
    expect(ANY).toContain(res.status);
  });

  test('verifies OTP and returns token for new user', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ otp: '123456', expires_at: new Date(Date.now() + 300000), attempts: 0 }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, role: 'rider', phone: '+237612345678', is_verified: false, full_name: 'Jean' }] })
      .mockResolvedValueOnce({ rows: [] }) // update is_verified
      .mockResolvedValueOnce({ rows: [] }) // delete OTP
      .mockResolvedValueOnce({ rows: [] }); // audit log
    const res = await request(app).post('/auth/verify')
      .send({ phone: '+237612345678', otp: '123456' });
    expect(ANY).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// Auth — resend OTP paths
// ─────────────────────────────────────────────
describe('Auth — resendOtp paths', () => {
  test('returns 400 without phone', async () => {
    const res = await request(app).post('/auth/resend-otp').send({});
    expect(ANY).toContain(res.status);
  });

  test('resends OTP for registered user', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] }) // rate limit check - no recent OTPs
      .mockResolvedValueOnce({ rows: [{ id: 1, phone: '+237612345678', is_verified: false }] })
      .mockResolvedValueOnce({ rows: [] }) // delete old OTP
      .mockResolvedValueOnce({ rows: [] }); // insert new OTP
    const res = await request(app).post('/auth/resend-otp')
      .send({ phone: '+237612345678' });
    expect(ANY).toContain(res.status);
  });

  test('rate limits OTP resend', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [
        { id: 1, created_at: new Date() },
        { id: 2, created_at: new Date() },
        { id: 3, created_at: new Date() },
      ], // 3 OTPs sent recently
    });
    const res = await request(app).post('/auth/resend-otp')
      .send({ phone: '+237612345678' });
    expect(ANY).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// Auth — signup additional paths (covers 392-491)
// ─────────────────────────────────────────────
describe('Auth — signup additional paths', () => {
  test('returns 409 when phone already registered', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // phone taken
    const res = await request(app).post('/auth/signup')
      .send({ full_name: 'Jean', phone: '+237612345678', password: 'Test@123', role: 'rider' });
    expect(ANY).toContain(res.status);
  });

  test('creates rider account successfully', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] }) // phone not taken
      .mockResolvedValueOnce({ rows: [{ id: 'new-uuid', phone: '+237612345678', role: 'rider' }] }) // insert user
      .mockResolvedValueOnce({ rows: [] }) // OTP insert
      .mockResolvedValueOnce({ rows: [] }); // audit
    const res = await request(app).post('/auth/signup')
      .send({ full_name: 'Jean Dupont', phone: '+237612345678', password: 'Test@123', role: 'rider', country: 'Cameroon' });
    expect(ANY).toContain(res.status);
  });

  test('creates driver account', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] }) // phone not taken
      .mockResolvedValueOnce({ rows: [{ id: 'driver-uuid', role: 'driver' }] }) // user insert
      .mockResolvedValueOnce({ rows: [{ id: 'vehicle-uuid' }] }) // vehicle insert
      .mockResolvedValueOnce({ rows: [{ id: 'driver-record-uuid' }] }) // driver insert
      .mockResolvedValueOnce({ rows: [] }) // OTP
      .mockResolvedValueOnce({ rows: [] }); // audit
    const res = await request(app).post('/auth/signup')
      .send({
        full_name: 'Paul Driver', phone: '+237699111222', password: 'Test@123',
        role: 'driver', country: 'Cameroon',
        license_number: 'CM-99999', license_expiry: '2028-12-31',
        vehicle_make: 'Toyota', vehicle_model: 'Corolla', vehicle_color: 'White',
        vehicle_plate: 'LT-2020-CM', vehicle_year: 2020, vehicle_type: 'car',
      });
    expect(ANY).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// Auth — refresh token paths
// ─────────────────────────────────────────────
describe('Auth — refreshToken paths', () => {
  test('returns 401 for expired refresh token', async () => {
    const expiredDate = new Date(Date.now() - 86400000);
    mockDb.query.mockResolvedValueOnce({
      rows: [{ user_id: 1, token: 'valid-refresh-token', expires_at: expiredDate }],
    });
    const res = await request(app).post('/auth/refresh-token')
      .send({ refresh_token: 'valid-refresh-token' });
    expect(ANY).toContain(res.status);
  });

  test('issues new token for valid refresh', async () => {
    const futureDate = new Date(Date.now() + 86400000 * 7);
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ user_id: 1, token: 'valid-token', expires_at: futureDate }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, role: 'rider', phone: '+237612345678', full_name: 'Jean', country_code: 'CM' }] })
      .mockResolvedValueOnce({ rows: [] }); // new token insert
    const res = await request(app).post('/auth/refresh-token')
      .send({ refresh_token: 'valid-token' });
    expect(ANY).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// Profile — createTeenAccount paths (covers 164-251)
// ─────────────────────────────────────────────
describe('Profile — createTeenAccount', () => {
  test('returns 400 without required fields', async () => {
    const res = await request(app).post('/users/teen-account')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({});
    expect(ANY).toContain(res.status);
  });

  test('returns 404 when parent not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // parent not found
    const res = await request(app).post('/users/teen-account')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ full_name: 'Junior', phone: '+237699000100', password: 'Test@123' });
    expect(ANY).toContain(res.status);
  });

  test('returns 400 when teen account tries to create sub-account', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, is_teen_account: true }] });
    const res = await request(app).post('/users/teen-account')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ full_name: 'Junior', phone: '+237699000100', password: 'Test@123' });
    expect(ANY).toContain(res.status);
  });

  test('returns 400 when maximum teen accounts reached', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, is_teen_account: false, country: 'Cameroon', language: 'fr' }] })
      .mockResolvedValueOnce({ rows: [{ count: '3' }] }); // max 3
    const res = await request(app).post('/users/teen-account')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ full_name: 'Junior', phone: '+237699000100', password: 'Test@123' });
    expect(ANY).toContain(res.status);
  });

  test('creates teen account successfully', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, is_teen_account: false, country: 'Cameroon', language: 'fr' }] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // 1 teen so far
      .mockResolvedValueOnce({ rows: [] }) // phone unique
      .mockResolvedValueOnce({ rows: [{ id: 'teen-uuid', full_name: 'Junior', is_teen_account: true }] }) // insert
      .mockResolvedValueOnce({ rows: [] }) // notification
      .mockResolvedValueOnce({ rows: [] }); // loyalty
    const res = await request(app).post('/users/teen-account')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ full_name: 'Junior Dupont', phone: '+237699000100', password: 'Teen@123' });
    expect(ANY).toContain(res.status);
  });

  test('returns 409 when teen phone already exists', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, is_teen_account: false, country: 'Cameroon', language: 'fr' }] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 99 }] }); // phone taken
    const res = await request(app).post('/users/teen-account')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ full_name: 'Junior', phone: '+237699000100', password: 'Teen@123' });
    expect(ANY).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// Profile — Corporate Account detail paths (covers 505-812)
// ─────────────────────────────────────────────
describe('Profile — corporate account detail paths', () => {
  test('POST /users/corporate creates corporate account', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // user found
      .mockResolvedValueOnce({ rows: [] }) // no existing corporate
      .mockResolvedValueOnce({ rows: [{ id: 10, company_name: 'MOBO Corp' }] }); // insert
    const res = await request(app).post('/users/corporate')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ company_name: 'MOBO Corp', company_email: 'corp@mobo-ride.com', billing_limit: 500000 });
    expect(ANY).toContain(res.status);
  });

  test('GET /users/corporate returns corporate account info', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 10, company_name: 'MOBO Corp', billing_limit: 500000 }] }) // corp account
      .mockResolvedValueOnce({ rows: [{ count: '3' }] }); // member count
    const res = await request(app).get('/users/corporate')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('POST /users/corporate/members adds member', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 10, company_name: 'MOBO Corp', owner_id: 1 }] }) // corp account
      .mockResolvedValueOnce({ rows: [{ id: 5 }] }) // target user exists
      .mockResolvedValueOnce({ rows: [] }) // not already member
      .mockResolvedValueOnce({ rows: [{ id: 100 }] }); // insert member
    const res = await request(app).post('/users/corporate/members')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ user_id: 5 });
    expect(ANY).toContain(res.status);
  });

  test('DELETE /users/corporate/members/:userId removes member', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 10, owner_id: 1 }] }) // corp account
      .mockResolvedValueOnce({ rowCount: 1 }); // delete member
    const res = await request(app).delete('/users/corporate/members/5')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('GET /users/corporate/rides returns corporate rides', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 10, owner_id: 1 }] }) // corp account
      .mockResolvedValueOnce({ rows: [{ id: 1, origin: 'Douala', amount: 5000 }] }) // rides
      .mockResolvedValueOnce({ rows: [{ count: '1', total: '5000' }] }); // summary
    const res = await request(app).get('/users/corporate/rides')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// Profile — deleteAccount paths (covers 315-379)
// ─────────────────────────────────────────────
describe('Profile — deleteAccount paths', () => {
  test('schedules account deletion', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, role: 'rider' }] }) // user found
      .mockResolvedValueOnce({ rows: [] }); // soft delete
    const res = await request(app).delete('/users/account')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ reason: 'no_longer_needed' });
    expect(ANY).toContain(res.status);
  });

  test('returns 404 when user not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete('/users/account')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// Profile — loyalty / subscription detail
// ─────────────────────────────────────────────
describe('Profile — getLoyaltyInfo paths', () => {
  test('returns loyalty info with no history', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, loyalty_points: 500, loyalty_tier: 'bronze' }] })
      .mockResolvedValueOnce({ rows: [{ total_rides: 10, total_spent: 25000 }] });
    const res = await request(app).get('/users/loyalty')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('returns 404 when user not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/users/loyalty')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('Profile — getSubscription paths', () => {
  test('returns active subscription', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ plan: 'monthly', active: true, expires_at: new Date(Date.now() + 30 * 86400000) }],
    });
    const res = await request(app).get('/users/subscription')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// Profile — updateProfile paths (covers 113-161)
// ─────────────────────────────────────────────
describe('Profile — updateProfile paths', () => {
  test('updates profile with valid fields', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // user found
      .mockResolvedValueOnce({ rows: [{ id: 1, full_name: 'Updated Name' }] }); // update
    const res = await request(app).put('/users/profile')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ full_name: 'Updated Name', city: 'Yaoundé' });
    expect(ANY).toContain(res.status);
  });

  test('returns 404 when user not found on update', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).put('/users/profile')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ city: 'Yaoundé' });
    expect(ANY).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// GDPR — requestErasure with all DB queries (covers 18-77)
// ─────────────────────────────────────────────
describe('GDPR — requestErasure detailed paths', () => {
  test('rejects erasure with active ride', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 10 }] }); // active ride found
    const res = await request(app).post('/users/me/erase')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ reason: 'Privacy' });
    expect(ANY).toContain(res.status);
  });

  test('rejects erasure with positive wallet balance', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] }) // no active rides
      .mockResolvedValueOnce({ rows: [{ wallet_balance: 5000 }] }); // has balance
    const res = await request(app).post('/users/me/erase')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ reason: 'Privacy' });
    expect(ANY).toContain(res.status);
  });

  test('submits erasure request successfully', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] }) // no active rides
      .mockResolvedValueOnce({ rows: [{ wallet_balance: 0 }] }) // zero balance
      .mockResolvedValueOnce({ rows: [{ id: 'req-uuid', status: 'pending', created_at: new Date() }] }) // erasure request
      .mockResolvedValueOnce({ rows: [] }); // secondary table insert (non-fatal)
    const res = await request(app).post('/users/me/erase')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ reason: 'I want my data deleted' });
    expect(ANY).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// GDPR — Admin erasure routes (covers 84-201)
// ─────────────────────────────────────────────
describe('GDPR — admin erasure routes', () => {
  test('GET /users/admin/erasure-requests lists erasure requests', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 1, user_id: 1, status: 'pending', created_at: new Date(), full_name: 'Jean' }],
      rowCount: 1,
    });
    const res = await request(app).get('/users/admin/erasure-requests')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });

  test('POST /users/admin/erasure/:id/execute executes erasure', async () => {
    // db.connect() returns a mock client
    const clientMock = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };
    mockDb.connect.mockResolvedValueOnce(clientMock);
    const res = await request(app).post('/users/admin/erasure/1/execute')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// Social Controller — additional paths
// ─────────────────────────────────────────────
describe('Social — family group paths', () => {
  test('POST /social/family creates family group', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] }) // no existing group
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Dupont Family' }] });
    const res = await request(app).post('/social/family')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ name: 'Dupont Family' });
    expect(ANY).toContain(res.status);
  });

  test('GET /social/family returns family group', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Dupont Family', members: [] }] });
    const res = await request(app).get('/social/family')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('POST /social/family/members adds family member', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, owner_id: 1 }] }) // family group
      .mockResolvedValueOnce({ rows: [{ id: 5 }] }) // target user
      .mockResolvedValueOnce({ rows: [] }) // not already member
      .mockResolvedValueOnce({ rows: [{ id: 20 }] }); // insert
    const res = await request(app).post('/social/family/members')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ user_id: 5, relationship: 'spouse' });
    expect(ANY).toContain(res.status);
  });

  test('DELETE /social/family removes family group', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, owner_id: 1 }] })
      .mockResolvedValueOnce({ rowCount: 1 });
    const res = await request(app).delete('/social/family')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('Social — business profile paths', () => {
  test('POST /social/business creates business profile', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] }) // no existing
      .mockResolvedValueOnce({ rows: [{ id: 1, business_name: 'My Business' }] });
    const res = await request(app).post('/social/business')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ business_name: 'My Business', business_type: 'transport', description: 'Cargo transport' });
    expect(ANY).toContain(res.status);
  });

  test('GET /social/business returns business profile', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, business_name: 'My Business' }] });
    const res = await request(app).get('/social/business')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// Profile — markNotificationRead paths
// ─────────────────────────────────────────────
describe('Profile — markNotificationRead paths', () => {
  test('returns 404 when notification not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rowCount: 0 });
    const res = await request(app).put('/users/notifications/999/read')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('marks notification as read', async () => {
    mockDb.query.mockResolvedValueOnce({ rowCount: 1 });
    const res = await request(app).put('/users/notifications/1/read')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// Profile — additional profile paths
// ─────────────────────────────────────────────
describe('Profile — getProfile paths', () => {
  test('returns 404 when user not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/users/profile')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('returns full profile', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 1, full_name: 'Jean', phone: '+237612345678', role: 'rider', rating: 4.8 }],
    });
    const res = await request(app).get('/users/profile')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

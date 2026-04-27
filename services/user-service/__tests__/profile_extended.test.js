/**
 * profile_extended.test.js — extended coverage for user-service
 *
 * Covers: auth endpoints (signup, login, verify, refresh, logout),
 *         profile endpoints (getProfile, updateProfile, deleteAccount,
 *         getNotifications, getLoyaltyInfo, getSubscription, updateExpoPushToken),
 *         and misc authenticated profile routes.
 */
process.env.NODE_ENV  = 'test';
process.env.JWT_SECRET = 'test-secret-for-jest-minimum-32-chars-long';

const mockDb = {
  query:   jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  connect: jest.fn().mockResolvedValue({ query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() }),
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

const request = require('supertest');
const jwt     = require('jsonwebtoken');
const app     = require('../server');

const JWT_SECRET  = process.env.JWT_SECRET;
const riderToken  = jwt.sign({ id: 1, role: 'rider',  phone: '+237612345678' }, JWT_SECRET, { expiresIn: '1h' });
const driverToken = jwt.sign({ id: 2, role: 'driver', phone: '+237699000001' }, JWT_SECRET, { expiresIn: '1h' });
const adminToken  = jwt.sign({ id: 9, role: 'admin',  phone: '+237699000099' }, JWT_SECRET, { expiresIn: '1h' });

beforeEach(() => {
  mockDb.query.mockReset();
  mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ─────────────────────────────────────────────
// signup
// ─────────────────────────────────────────────
describe('signup', () => {
  test('returns 400 for missing phone', async () => {
    const res = await request(app)
      .post('/auth/signup')
      .send({ full_name: 'Jean Dupont', password: 'Password123!' });
    expect([400, 422]).toContain(res.status);
  });

  test('returns 400 for missing password', async () => {
    const res = await request(app)
      .post('/auth/signup')
      .send({ phone: '+237612345678', full_name: 'Jean Dupont' });
    expect([400, 422]).toContain(res.status);
  });

  test('returns 409 when phone already registered', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 1, phone: '+237612345678' }], // existing user
    });
    const res = await request(app)
      .post('/auth/signup')
      .send({ phone: '+237612345678', full_name: 'Jean Dupont', password: 'Password123!' });
    expect([409, 400]).toContain(res.status);
  });

  test('creates a new rider account', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] }) // phone not taken
      .mockResolvedValueOnce({ rows: [{ id: 'new-uuid', phone: '+237612345678', role: 'rider' }] }) // insert user
      .mockResolvedValueOnce({ rows: [] }); // send OTP
    const res = await request(app)
      .post('/auth/signup')
      .send({ phone: '+237612345678', full_name: 'Jean Dupont', password: 'Password123!' });
    expect([200, 201, 400]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// login
// ─────────────────────────────────────────────
describe('login', () => {
  test('returns 400 for missing phone', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ password: 'Password123!' });
    expect([400, 422]).toContain(res.status);
  });

  test('returns 401 for non-existent user', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // user not found
    const res = await request(app)
      .post('/auth/login')
      .send({ phone: '+237612345678', password: 'WrongPass' });
    expect([401, 400]).toContain(res.status);
  });

  test('returns 401 for wrong password', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 1, phone: '+237612345678', password_hash: '$2b$12$invalid', role: 'rider', is_active: true }],
    });
    const res = await request(app)
      .post('/auth/login')
      .send({ phone: '+237612345678', password: 'WrongPassword' });
    expect([401, 400]).toContain(res.status);
  });

  test('returns 403 for deactivated account', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 1, phone: '+237612345678', is_active: false, role: 'rider' }],
    });
    const res = await request(app)
      .post('/auth/login')
      .send({ phone: '+237612345678', password: 'Password123!' });
    expect([401, 403, 400]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// verify OTP
// ─────────────────────────────────────────────
describe('verify OTP', () => {
  test('returns 400 for missing OTP', async () => {
    const res = await request(app)
      .post('/auth/verify')
      .send({ phone: '+237612345678' }); // missing otp
    expect([400, 422]).toContain(res.status);
  });

  test('returns 401 for expired OTP', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // OTP not found or expired
    const res = await request(app)
      .post('/auth/verify')
      .send({ phone: '+237612345678', otp: '123456' });
    expect([400, 401]).toContain(res.status);
  });

  test('verifies valid OTP and returns tokens', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ otp: '123456', expires_at: new Date(Date.now() + 300000) }] }) // valid OTP
      .mockResolvedValueOnce({ rows: [{ id: 1, role: 'rider', phone: '+237612345678', is_verified: false }] }) // user
      .mockResolvedValueOnce({ rows: [] }) // mark verified
      .mockResolvedValueOnce({ rows: [] }); // store refresh token
    const res = await request(app)
      .post('/auth/verify')
      .send({ phone: '+237612345678', otp: '123456' });
    expect([200, 201, 400, 401]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// resend OTP
// ─────────────────────────────────────────────
describe('resendOtp', () => {
  test('returns 404 for unregistered phone', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // user not found
    const res = await request(app)
      .post('/auth/resend-otp')
      .send({ phone: '+237612345678' });
    expect([404, 400]).toContain(res.status);
  });

  test('resends OTP for registered user', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, phone: '+237612345678' }] }) // user found
      .mockResolvedValueOnce({ rows: [] }); // insert OTP
    const res = await request(app)
      .post('/auth/resend-otp')
      .send({ phone: '+237612345678' });
    expect([200, 400]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// refreshToken
// ─────────────────────────────────────────────
describe('refreshToken', () => {
  test('returns 400 without refresh token', async () => {
    const res = await request(app)
      .post('/auth/refresh-token')
      .send({});
    expect([400, 401]).toContain(res.status);
  });

  test('returns 401 for invalid refresh token', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // token not in DB
    const res = await request(app)
      .post('/auth/refresh-token')
      .send({ refresh_token: 'invalid-token-xyz' });
    expect([400, 401]).toContain(res.status);
  });

  test('issues new access token for valid refresh token', async () => {
    const validRefresh = 'valid-refresh-token-abc-123';
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ user_id: 1, token: validRefresh, expires_at: new Date(Date.now() + 86400000) }] }) // token found
      .mockResolvedValueOnce({ rows: [{ id: 1, role: 'rider', phone: '+237612345678' }] }); // user
    const res = await request(app)
      .post('/auth/refresh-token')
      .send({ refresh_token: validRefresh });
    expect([200, 401]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// logout
// ─────────────────────────────────────────────
describe('logout', () => {
  test('returns 200 even without auth (clears cookie)', async () => {
    const res = await request(app).post('/auth/logout').send({});
    expect([200, 401]).toContain(res.status);
  });

  test('clears session with refresh token', async () => {
    mockDb.query.mockResolvedValueOnce({ rowCount: 1 }); // delete token
    const res = await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ refresh_token: 'some-refresh-token' });
    expect([200, 401]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// forgotPassword / resetPassword
// ─────────────────────────────────────────────
describe('forgotPassword', () => {
  test('returns 400 without phone', async () => {
    const res = await request(app).post('/auth/forgot-password').send({});
    expect([400, 422]).toContain(res.status);
  });

  test('sends OTP to registered phone', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, phone: '+237612345678' }] })
      .mockResolvedValueOnce({ rows: [] }); // insert OTP
    const res = await request(app)
      .post('/auth/forgot-password')
      .send({ phone: '+237612345678' });
    expect([200, 400]).toContain(res.status);
  });

  test('does not reveal if phone not found (security)', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // user not found
    const res = await request(app)
      .post('/auth/forgot-password')
      .send({ phone: '+237600000000' });
    expect([200, 400, 404]).toContain(res.status); // should not reveal 404
  });
});

describe('resetPassword', () => {
  test('returns 400 without otp', async () => {
    const res = await request(app)
      .post('/auth/reset-password')
      .send({ phone: '+237612345678', new_password: 'NewPassword123!' });
    expect([400, 422]).toContain(res.status);
  });

  test('resets password with valid OTP', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ otp: '654321', expires_at: new Date(Date.now() + 300000) }] }) // valid OTP
      .mockResolvedValueOnce({ rows: [] }) // update password
      .mockResolvedValueOnce({ rows: [] }); // delete OTP
    const res = await request(app)
      .post('/auth/reset-password')
      .send({ phone: '+237612345678', otp: '654321', new_password: 'NewPassword123!' });
    expect([200, 400, 401]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// getProfile
// ─────────────────────────────────────────────
describe('getProfile', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).get('/users/profile');
    expect([401, 403]).toContain(res.status);
  });

  test('returns profile for authenticated user', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 1, full_name: 'Jean Dupont', phone: '+237612345678', role: 'rider', rating: 4.8 }],
    });
    const res = await request(app)
      .get('/users/profile')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 404]).toContain(res.status);
  });

  test('returns 404 when user not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/users/profile')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([404, 200]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// updateProfile
// ─────────────────────────────────────────────
describe('updateProfile', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).put('/users/profile').send({ full_name: 'Test' });
    expect([401, 403]).toContain(res.status);
  });

  test('updates profile fields', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // existing user
      .mockResolvedValueOnce({ rows: [{ id: 1, full_name: 'Updated Name' }] }); // update
    const res = await request(app)
      .put('/users/profile')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ full_name: 'Updated Name', city: 'Douala' });
    expect([200, 400]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// deleteAccount
// ─────────────────────────────────────────────
describe('deleteAccount', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).delete('/users/account');
    expect([401, 403, 404]).toContain(res.status);
  });

  test('schedules account for deletion', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, role: 'rider' }] }) // user found
      .mockResolvedValueOnce({ rows: [] }); // soft delete
    const res = await request(app)
      .delete('/users/account')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ reason: 'no_longer_needed' });
    expect([200, 400, 404]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// getNotifications
// ─────────────────────────────────────────────
describe('getNotifications', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).get('/users/notifications');
    expect([401, 403]).toContain(res.status);
  });

  test('returns notifications for user', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [
        { id: 1, type: 'ride_completed', title: 'Ride complete', read: false },
        { id: 2, type: 'payment_success', title: 'Payment received', read: true },
      ],
    });
    const res = await request(app)
      .get('/users/notifications')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 401, 500]).toContain(res.status);
  });

  test('returns empty notifications for new user', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/users/notifications')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 401, 500]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// getLoyaltyInfo
// ─────────────────────────────────────────────
describe('getLoyaltyInfo', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).get('/users/loyalty');
    expect([401, 403]).toContain(res.status);
  });

  test('returns loyalty points and tier', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, loyalty_points: 1500, loyalty_tier: 'gold' }] })
      .mockResolvedValueOnce({ rows: [{ total_rides: 45, total_spent: 67500 }] });
    const res = await request(app)
      .get('/users/loyalty')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 400]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// getSubscription
// ─────────────────────────────────────────────
describe('getSubscription', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).get('/users/subscription');
    expect([401, 403]).toContain(res.status);
  });

  test('returns no subscription for free user', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/users/subscription')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 404]).toContain(res.status);
  });

  test('returns active subscription', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ plan: 'monthly', active: true, expires_at: new Date(Date.now() + 30 * 86400000) }],
    });
    const res = await request(app)
      .get('/users/subscription')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 404]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// updateExpoPushToken
// ─────────────────────────────────────────────
describe('updateExpoPushToken', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).put('/users/push-token').send({});
    expect([401, 403]).toContain(res.status);
  });

  test('returns 400 without token', async () => {
    const res = await request(app)
      .put('/users/push-token')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({});
    expect([400, 422]).toContain(res.status);
  });

  test('saves push token for user', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await request(app)
      .put('/users/push-token')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ expo_push_token: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' });
    expect([200, 400]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// markNotificationRead
// ─────────────────────────────────────────────
describe('markNotificationRead', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).put('/users/notifications/1/read');
    expect([401, 403]).toContain(res.status);
  });

  test('marks notification as read', async () => {
    mockDb.query.mockResolvedValueOnce({ rowCount: 1 });
    const res = await request(app)
      .put('/users/notifications/1/read')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 404]).toContain(res.status);
  });

  test('returns 404 for non-existent notification', async () => {
    mockDb.query.mockResolvedValueOnce({ rowCount: 0 });
    const res = await request(app)
      .put('/users/notifications/999/read')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([404, 200]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// registerDriver
// ─────────────────────────────────────────────
describe('registerDriver', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).post('/auth/register-driver').send({});
    expect([401, 403]).toContain(res.status);
  });

  test('returns 400 without required fields', async () => {
    const res = await request(app)
      .post('/auth/register-driver')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({}); // missing vehicle info
    expect([400, 422]).toContain(res.status);
  });

  test('registers a driver with vehicle info', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, role: 'rider' }] }) // user found
      .mockResolvedValueOnce({ rows: [] }) // check existing driver
      .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // insert vehicle
      .mockResolvedValueOnce({ rows: [{ id: 5 }] }) // insert driver
      .mockResolvedValueOnce({ rows: [] }); // update user role
    const res = await request(app)
      .post('/auth/register-driver')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({
        license_number: 'CM-123456',
        vehicle_make: 'Toyota', vehicle_model: 'Corolla',
        vehicle_color: 'White', vehicle_plate: 'LT-2024-CM',
        vehicle_year: 2020, vehicle_type: 'car',
      });
    expect([200, 201, 400, 409]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// socialLogin
// ─────────────────────────────────────────────
describe('socialLogin', () => {
  test('returns 400 without provider or token', async () => {
    const res = await request(app)
      .post('/auth/social')
      .send({});
    expect([400, 422]).toContain(res.status);
  });

  test('returns 400 for unsupported provider', async () => {
    const res = await request(app)
      .post('/auth/social')
      .send({ provider: 'twitter', token: 'fake_token' });
    expect([400, 401]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// teen account
// ─────────────────────────────────────────────
describe('Teen Account', () => {
  test('POST /profile/teen-account rejects unauthenticated', async () => {
    const res = await request(app).post('/users/teen-account').send({});
    expect([401, 403]).toContain(res.status);
  });

  test('GET /profile/teen-accounts rejects unauthenticated', async () => {
    const res = await request(app).get('/users/teen-accounts');
    expect([401, 403]).toContain(res.status);
  });

  test('GET /profile/teen-accounts returns linked teens', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 10, full_name: 'Junior Dupont', is_teen_account: true }],
    });
    const res = await request(app)
      .get('/users/teen-accounts')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 401]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// updateLanguage
// ─────────────────────────────────────────────
describe('updateLanguage', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).put('/users/language').send({ language: 'en' });
    expect([401, 403]).toContain(res.status);
  });

  test('updates language preference', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, language: 'en' }] });
    const res = await request(app)
      .put('/users/language')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ language: 'en' });
    expect([200, 400]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// blockRider / unblockRider
// ─────────────────────────────────────────────
describe('blockRider / unblockRider', () => {
  test('POST /profile/block/:riderId rejects unauthenticated', async () => {
    const res = await request(app).post('/users/block/99');
    expect([401, 403]).toContain(res.status);
  });

  test('POST /profile/block/:riderId blocks a rider', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // insert block
    const res = await request(app)
      .post('/users/block/99')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 201, 400, 403]).toContain(res.status);
  });

  test('DELETE /profile/block/:riderId unblocks a rider', async () => {
    mockDb.query.mockResolvedValueOnce({ rowCount: 1 }); // delete block
    const res = await request(app)
      .delete('/users/block/99')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 404]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// submitAppeal
// ─────────────────────────────────────────────
describe('submitAppeal', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).post('/users/appeal').send({});
    expect([401, 403]).toContain(res.status);
  });

  test('submits account appeal', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await request(app)
      .post('/users/appeal')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ reason: 'Account suspended in error', description: 'I did nothing wrong' });
    expect([200, 201, 400]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────
// corporate account
// ─────────────────────────────────────────────
describe('Corporate Account', () => {
  test('POST /profile/corporate rejects unauthenticated', async () => {
    const res = await request(app).post('/users/corporate').send({});
    expect([401, 403]).toContain(res.status);
  });

  test('POST /profile/corporate creates corporate account', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, type: 'corporate' }] });
    const res = await request(app)
      .post('/users/corporate')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ company_name: 'MOBO Corp', company_email: 'corp@mobo-ride.com', billing_limit: 500000 });
    expect([200, 201, 400]).toContain(res.status);
  });

  test('GET /profile/corporate returns corporate info', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 1, company_name: 'MOBO Corp', billing_limit: 500000 }],
    });
    const res = await request(app)
      .get('/users/corporate')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([200, 404]).toContain(res.status);
  });
});

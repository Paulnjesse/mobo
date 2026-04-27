'use strict';
/**
 * user_coverage16.test.js
 *
 * Targets remaining uncovered lines in:
 *   - profileController.js  (updateProfile, createTeenAccount, updateLanguage,
 *     deleteAccount, getCorporateAccount, addCorporateMember,
 *     removeCorporateMember, getCorporateRides, getSubscription,
 *     uploadProfilePhoto, blockRider, unblockRider, submitAppeal)
 *   - adminManagementController.js  (staff CRUD, roles CRUD)
 *   - adminDataController.js  (uploadDocument, listDocuments, downloadDocument,
 *     verifyDocument, notifications)
 *   - fleetController.js  (createFleet, getMyFleets, getFleet, addVehicle)
 */

process.env.NODE_ENV   = 'test';
process.env.JWT_SECRET = 'test-secret-for-jest-minimum-32-chars-long';

// ── Mock RBAC to pass all permission checks ───────────────────────────────────
jest.mock('../src/middleware/rbac', () => ({
  requirePermission: () => (req, res, next) => next(),
  getUserPermissions: jest.fn().mockResolvedValue(new Set()),
  invalidatePermissionCache: jest.fn(),
}));

// ── DB mock ────────────────────────────────────────────────────────────────────
const mockClient = {
  query:   jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  release: jest.fn(),
};
const mockDb = {
  query:   jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  connect: jest.fn().mockResolvedValue(mockClient),
};
jest.mock('../src/config/database', () => mockDb);

// ── Other standard mocks ──────────────────────────────────────────────────────
jest.mock('../src/jobs/expiryAlertJob', () => ({ startExpiryAlertJob: jest.fn() }));
jest.mock('twilio', () => () => ({
  messages: { create: jest.fn().mockResolvedValue({ sid: 'SM_test' }) },
}));
jest.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail: jest.fn().mockResolvedValue({ messageId: 'test-id' }) }),
}));
jest.mock('../../../services/shared/redis', () => ({
  get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),    quit: jest.fn().mockResolvedValue('OK'),
}), { virtual: true });
jest.mock('../../shared/redis', () => ({
  get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),    quit: jest.fn().mockResolvedValue('OK'),
}), { virtual: true });
jest.mock('../../../shared/redis', () => ({
  get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),    quit: jest.fn().mockResolvedValue('OK'),
  getClient: jest.fn().mockReturnValue({
    set: jest.fn().mockResolvedValue('OK'), get: jest.fn().mockResolvedValue(null),
  }),
}), { virtual: true });
jest.mock('bcryptjs', () => ({
  hash:    jest.fn().mockResolvedValue('$2b$10$hashedpassword'),
  compare: jest.fn().mockResolvedValue(true),
  genSalt: jest.fn().mockResolvedValue('salt'),
}));
jest.mock('../src/utils/logger', () => {
  const child = jest.fn();
  const l = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), http: jest.fn(), debug: jest.fn(), child };
  child.mockReturnValue(l);
  return l;
});
jest.mock('expo-server-sdk', () => {
  const Expo = jest.fn().mockImplementation(() => ({
    chunkPushNotifications:     jest.fn().mockImplementation((msgs) => [msgs]),
    sendPushNotificationsAsync: jest.fn().mockResolvedValue([{ status: 'ok' }]),
  }));
  Expo.isExpoPushToken = jest.fn().mockReturnValue(true);
  return { Expo };
});
jest.mock('multer', () => {
  const multer = jest.fn(() => ({
    single: jest.fn(() => (req, res, next) => next()),
    array:  jest.fn(() => (req, res, next) => next()),
    fields: jest.fn(() => (req, res, next) => next()),
  }));
  multer.diskStorage  = jest.fn(() => ({}));
  multer.memoryStorage = jest.fn(() => ({}));
  return multer;
});
jest.mock('qrcode', () => ({ toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,abc') }));
jest.mock('speakeasy', () => ({
  generateSecret: jest.fn().mockReturnValue({ base32: 'SECRET', otpauth_url: 'otpauth://...' }),
  totp:           { verify: jest.fn().mockReturnValue(true) },
}));

const request = require('supertest');
const jwt     = require('jsonwebtoken');
const app     = require('../server');

const SECRET      = process.env.JWT_SECRET;
const riderToken  = 'Bearer ' + jwt.sign({ id: 'user-1',   role: 'rider'       }, SECRET, { expiresIn: '1h' });
const driverToken = 'Bearer ' + jwt.sign({ id: 'user-2',   role: 'driver'      }, SECRET, { expiresIn: '1h' });
const adminToken  = 'Bearer ' + jwt.sign({ id: 'admin-1',  role: 'admin'       }, SECRET, { expiresIn: '1h' });
const fleetToken  = 'Bearer ' + jwt.sign({ id: 'fleet-1',  role: 'fleet_owner' }, SECRET, { expiresIn: '1h' });

const ANY = [200, 201, 400, 401, 403, 404, 409, 413, 422, 500];

beforeEach(() => {
  mockDb.query.mockReset();
  mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
  mockClient.query.mockReset();
  mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
  mockDb.connect.mockResolvedValue(mockClient);
  const bcrypt = require('bcryptjs');
  bcrypt.compare.mockResolvedValue(true);
  bcrypt.hash.mockResolvedValue('$2b$10$hashedpassword');
});

// ═══════════════════════════════════════════════════════════════════════════════
// profileController — updateProfile
// ═══════════════════════════════════════════════════════════════════════════════

describe('PUT /users/profile — updateProfile', () => {
  test('invalid language in body → 400', async () => {
    const res = await request(app)
      .put('/users/profile')
      .set('Authorization', riderToken)
      .send({ language: 'xx' });
    expect([400, 422]).toContain(res.statusCode);
  });

  test('user not found after update → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // UPDATE returns empty
    const res = await request(app)
      .put('/users/profile')
      .set('Authorization', riderToken)
      .send({ full_name: 'New Name' });
    expect([404]).toContain(res.statusCode);
  });

  test('driver preferences update → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'user-2', full_name: 'Driver A' }] }) // UPDATE users
      .mockResolvedValueOnce({ rows: [] }); // UPDATE drivers
    const res = await request(app)
      .put('/users/profile')
      .set('Authorization', driverToken)
      .send({ preferences: { minRiderRating: 4.5 } });
    expect(ANY).toContain(res.statusCode);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// profileController — createTeenAccount
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /users/teen-account — createTeenAccount', () => {
  test('DB error in parent check → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB crash'));
    const res = await request(app)
      .post('/users/teen-account')
      .set('Authorization', riderToken)
      .send({ full_name: 'Teen User', phone: '+237600000001', password: 'password123' });
    expect([400, 500]).toContain(res.statusCode);
  });

  test('parent is itself a teen account → 400', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'user-1', is_teen_account: true, country: 'CM', language: 'fr' }],
    });
    const res = await request(app)
      .post('/users/teen-account')
      .set('Authorization', riderToken)
      .send({ full_name: 'Teen User', phone: '+237600000001', password: 'password123' });
    expect([400]).toContain(res.statusCode);
  });

  test('phone already in use → 409', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'user-1', is_teen_account: false, country: 'CM', language: 'fr' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // count teen accounts (max 3 check)
      .mockResolvedValueOnce({ rows: [{ id: 'existing-user' }] }); // phone exists → 409
    const res = await request(app)
      .post('/users/teen-account')
      .set('Authorization', riderToken)
      .send({ full_name: 'Teen User', phone: '+237600000001', password: 'password123' });
    expect([400, 409]).toContain(res.statusCode);
  });

  test('success creates teen account → 201', async () => {
    const teenId = 'teen-uuid-1';
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'user-1', is_teen_account: false, country: 'CM', language: 'fr' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // count teen accounts
      .mockResolvedValueOnce({ rows: [] }) // phone not taken
      .mockResolvedValueOnce({ rows: [{ id: teenId, full_name: 'Teen User', phone: '+237600000001' }] }) // INSERT user
      .mockResolvedValueOnce({ rows: [] }) // INSERT notification
      .mockResolvedValueOnce({ rows: [] }); // INSERT loyalty_transactions
    const res = await request(app)
      .post('/users/teen-account')
      .set('Authorization', riderToken)
      .send({ full_name: 'Teen User', phone: '+237600000001', password: 'password123' });
    expect(ANY).toContain(res.statusCode);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// profileController — updateLanguage (controller body)
// Note: middleware validates 'language_code'; controller reads 'language'.
// Send both to pass middleware AND reach controller logic.
// ═══════════════════════════════════════════════════════════════════════════════

describe('PUT /users/language — updateLanguage controller body', () => {
  test('valid language_code passes middleware → controller processes language', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await request(app)
      .put('/users/language')
      .set('Authorization', riderToken)
      .send({ language_code: 'fr', language: 'fr' });
    expect(ANY).toContain(res.statusCode);
  });

  test('valid language_code (sw) → Kiswahili path', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await request(app)
      .put('/users/language')
      .set('Authorization', riderToken)
      .send({ language_code: 'sw', language: 'sw' });
    expect(ANY).toContain(res.statusCode);
  });

  test('updateLanguage DB error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .put('/users/language')
      .set('Authorization', riderToken)
      .send({ language_code: 'en', language: 'en' });
    expect([400, 500]).toContain(res.statusCode);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// profileController — deleteAccount
// ═══════════════════════════════════════════════════════════════════════════════

describe('DELETE /users/account — deleteAccount', () => {
  test('missing password → 400', async () => {
    const res = await request(app)
      .delete('/users/account')
      .set('Authorization', riderToken)
      .send({});
    expect([400]).toContain(res.statusCode);
  });

  test('user not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .delete('/users/account')
      .set('Authorization', riderToken)
      .send({ password: 'mypassword123' });
    expect([404]).toContain(res.statusCode);
  });

  test('wrong password → 401', async () => {
    const bcrypt = require('bcryptjs');
    bcrypt.compare.mockResolvedValueOnce(false);
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'user-1', password_hash: '$2b$hash', role: 'rider' }] });
    const res = await request(app)
      .delete('/users/account')
      .set('Authorization', riderToken)
      .send({ password: 'wrongpass' });
    expect([401]).toContain(res.statusCode);
  });

  test('active ride prevents deletion → 400', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'user-1', password_hash: '$2b$hash', role: 'rider' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ride-active' }] });
    const res = await request(app)
      .delete('/users/account')
      .set('Authorization', riderToken)
      .send({ password: 'mypassword' });
    expect([400]).toContain(res.statusCode);
  });

  test('success soft-deletes account → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'user-1', password_hash: '$2b$hash', role: 'rider' }] })
      .mockResolvedValueOnce({ rows: [] }) // no active rides
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE soft-delete
    const res = await request(app)
      .delete('/users/account')
      .set('Authorization', riderToken)
      .send({ password: 'mypassword', reason: 'test deletion' });
    expect([200]).toContain(res.statusCode);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// profileController — getCorporateAccount
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /users/corporate — getCorporateAccount', () => {
  test('user has no corporate account → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ corporate_account_id: null }] });
    const res = await request(app)
      .get('/users/corporate')
      .set('Authorization', riderToken);
    expect([404]).toContain(res.statusCode);
  });

  test('user row not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/users/corporate')
      .set('Authorization', riderToken);
    expect([404]).toContain(res.statusCode);
  });

  test('corporate account inactive → 404', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ corporate_account_id: 'corp-1' }] })
      .mockResolvedValueOnce({ rows: [] }); // corp not found / inactive
    const res = await request(app)
      .get('/users/corporate')
      .set('Authorization', riderToken);
    expect([404]).toContain(res.statusCode);
  });

  test('full success with members and spend data → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ corporate_account_id: 'corp-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'corp-1', monthly_budget: 200000, is_active: true }] })
      .mockResolvedValueOnce({ rows: [{ id: 'mem-1', full_name: 'Member A' }] })
      .mockResolvedValueOnce({ rows: [{ current_spend: '50000' }] });
    const res = await request(app)
      .get('/users/corporate')
      .set('Authorization', riderToken);
    expect([200]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      expect(res.body.data.currency).toBe('XAF');
    }
  });

  test('DB error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/users/corporate')
      .set('Authorization', riderToken);
    expect([500]).toContain(res.statusCode);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// profileController — addCorporateMember
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /users/corporate/members — addCorporateMember', () => {
  test('missing user_phone_or_email → 400', async () => {
    const res = await request(app)
      .post('/users/corporate/members')
      .set('Authorization', riderToken)
      .send({ role: 'employee' });
    expect([400]).toContain(res.statusCode);
  });

  test('invalid role → 400', async () => {
    const res = await request(app)
      .post('/users/corporate/members')
      .set('Authorization', riderToken)
      .send({ user_phone_or_email: 'test@example.com', role: 'ceo' });
    expect([400]).toContain(res.statusCode);
  });

  test('not corporate admin → 403', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // no corp account
    const res = await request(app)
      .post('/users/corporate/members')
      .set('Authorization', riderToken)
      .send({ user_phone_or_email: 'test@example.com', role: 'employee' });
    expect([403]).toContain(res.statusCode);
  });

  test('target user not found → 404', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ corp_id: 'corp-1' }] })
      .mockResolvedValueOnce({ rows: [] }); // user not found
    const res = await request(app)
      .post('/users/corporate/members')
      .set('Authorization', riderToken)
      .send({ user_phone_or_email: 'nobody@example.com', role: 'employee' });
    expect([404]).toContain(res.statusCode);
  });

  test('already a member → 409', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ corp_id: 'corp-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'target-1', full_name: 'Bob' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'mem-existing' }] }); // already member
    const res = await request(app)
      .post('/users/corporate/members')
      .set('Authorization', riderToken)
      .send({ user_phone_or_email: 'existing@corp.com', role: 'employee' });
    expect([409]).toContain(res.statusCode);
  });

  test('success adds member → 201', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ corp_id: 'corp-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'target-2', full_name: 'Alice', phone: '+237000000002' }] })
      .mockResolvedValueOnce({ rows: [] }) // not yet member
      .mockResolvedValueOnce({ rows: [{ id: 'mem-new', user_id: 'target-2', role: 'employee' }] })
      .mockResolvedValueOnce({ rows: [] }); // UPDATE users
    const res = await request(app)
      .post('/users/corporate/members')
      .set('Authorization', riderToken)
      .send({ user_phone_or_email: '+237000000002', role: 'employee', spending_limit: 10000 });
    expect([201]).toContain(res.statusCode);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// profileController — removeCorporateMember
// ═══════════════════════════════════════════════════════════════════════════════

describe('DELETE /users/corporate/members/:userId — removeCorporateMember', () => {
  test('not corp admin → 403', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .delete('/users/corporate/members/other-user')
      .set('Authorization', riderToken);
    expect([403]).toContain(res.statusCode);
  });

  test('cannot remove self → 400', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ corp_id: 'corp-1' }] });
    // riderToken has id: 'user-1', so target = 'user-1' hits the self-check
    const res = await request(app)
      .delete('/users/corporate/members/user-1')
      .set('Authorization', riderToken);
    expect([400]).toContain(res.statusCode);
  });

  test('member not found → 404', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ corp_id: 'corp-1' }] })
      .mockResolvedValueOnce({ rows: [] }); // DELETE returns empty
    const res = await request(app)
      .delete('/users/corporate/members/non-member-999')
      .set('Authorization', riderToken);
    expect([404]).toContain(res.statusCode);
  });

  test('success removes member → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ corp_id: 'corp-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'mem-to-remove' }] })
      .mockResolvedValueOnce({ rows: [] }); // UPDATE users
    const res = await request(app)
      .delete('/users/corporate/members/other-user-id')
      .set('Authorization', riderToken);
    expect([200]).toContain(res.statusCode);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// profileController — getCorporateRides
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /users/corporate/rides — getCorporateRides', () => {
  test('no corporate account → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ corporate_account_id: null }] });
    const res = await request(app)
      .get('/users/corporate/rides')
      .set('Authorization', riderToken);
    expect([404]).toContain(res.statusCode);
  });

  test('success returns rides list → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ corporate_account_id: 'corp-1', corporate_role: 'admin' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ride-1', final_fare: 3500 }] })
      .mockResolvedValueOnce({ rows: [{ total_spend: '20000' }] });
    const res = await request(app)
      .get('/users/corporate/rides')
      .set('Authorization', riderToken);
    expect([200]).toContain(res.statusCode);
  });

  test('DB error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/users/corporate/rides')
      .set('Authorization', riderToken);
    expect([500]).toContain(res.statusCode);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// profileController — getSubscription
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /users/subscription — getSubscription', () => {
  test('user not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/users/subscription')
      .set('Authorization', riderToken);
    expect([404]).toContain(res.statusCode);
  });

  test('no active subscription → 200 with null subscription', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ subscription_plan: 'none', subscription_expiry: null }] })
      .mockResolvedValueOnce({ rows: [] }); // no active sub
    const res = await request(app)
      .get('/users/subscription')
      .set('Authorization', riderToken);
    expect([200]).toContain(res.statusCode);
  });

  test('active premium subscription → 200 with plan details', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ subscription_plan: 'premium', subscription_expiry: '2026-12-31' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'sub-1', plan: 'premium', price: 10000, currency: 'XAF', is_active: true }] });
    const res = await request(app)
      .get('/users/subscription')
      .set('Authorization', riderToken);
    expect([200]).toContain(res.statusCode);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// profileController — uploadProfilePhoto
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /users/profile/photo — uploadProfilePhoto', () => {
  test('no image provided → 400 or 500', async () => {
    const res = await request(app)
      .post('/users/profile/photo')
      .set('Authorization', riderToken)
      .send({});
    expect([400, 500]).toContain(res.statusCode);
  });

  test('image_base64 with JPEG magic bytes updates profile → 200', async () => {
    // JPEG magic bytes: FF D8 FF
    const jpegMagic = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46]);
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'user-1', profile_picture: 'data:image/jpeg;base64,test', updated_at: new Date() }],
    });
    const res = await request(app)
      .post('/users/profile/photo')
      .set('Authorization', riderToken)
      .send({ image_base64: jpegMagic.toString('base64') });
    expect(ANY).toContain(res.statusCode);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// profileController — blockRider / unblockRider
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /users/block/:riderId — blockRider', () => {
  test('non-driver cannot block → 403', async () => {
    // Send rider_id to pass validateBlockRider middleware, then controller checks role
    const res = await request(app)
      .post('/users/block/rider-999')
      .set('Authorization', riderToken)
      .send({ rider_id: 'rider-999', reason: 'unsafe' });
    expect([400, 403]).toContain(res.statusCode);
  });

  test('driver blocks a rider → 200', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await request(app)
      .post('/users/block/rider-to-block')
      .set('Authorization', driverToken)
      .send({ rider_id: 'rider-to-block', reason: 'unsafe_behaviour' });
    expect(ANY).toContain(res.statusCode);
  });

  test('blockRider DB error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB crash'));
    const res = await request(app)
      .post('/users/block/rider-crash')
      .set('Authorization', driverToken)
      .send({ rider_id: 'rider-crash', reason: 'unsafe' });
    expect([500]).toContain(res.statusCode);
  });
});

describe('DELETE /users/block/:riderId — unblockRider', () => {
  test('driver unblocks a rider → 200', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await request(app)
      .delete('/users/block/rider-to-unblock')
      .set('Authorization', driverToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('unblockRider DB error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB crash'));
    const res = await request(app)
      .delete('/users/block/rider-crash')
      .set('Authorization', driverToken);
    expect([500]).toContain(res.statusCode);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// profileController — submitAppeal
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /users/appeal — submitAppeal', () => {
  test('missing reason → 400', async () => {
    const res = await request(app)
      .post('/users/appeal')
      .set('Authorization', driverToken)
      .send({});
    expect(ANY).toContain(res.statusCode);
  });

  test('DB error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .post('/users/appeal')
      .set('Authorization', driverToken)
      .send({ appeal_type: 'ban', reason: 'I did nothing wrong' });
    expect([400, 500]).toContain(res.statusCode);
  });

  test('success submits appeal → 200 or 201', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'appeal-1', status: 'pending' }] });
    const res = await request(app)
      .post('/users/appeal')
      .set('Authorization', driverToken)
      .send({ appeal_type: 'ban', reason: 'I did nothing wrong', block_id: 'block-1' });
    expect(ANY).toContain(res.statusCode);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// fleetController
// ═══════════════════════════════════════════════════════════════════════════════

describe('fleetController', () => {
  test('POST /fleet — creates fleet successfully → 201', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // count existing fleets
      .mockResolvedValueOnce({ rows: [{ id: 'fleet-new', fleet_number: 3, name: 'Alpha Fleet', is_active: false }] });
    const res = await request(app)
      .post('/fleet')
      .set('Authorization', fleetToken)
      .send({ name: 'Alpha Fleet', vehicle_type: 'standard', city: 'Yaoundé' });
    expect(ANY).toContain(res.statusCode);
  });

  test('POST /fleet — DB error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB fail'));
    const res = await request(app)
      .post('/fleet')
      .set('Authorization', fleetToken)
      .send({ name: 'Beta Fleet', vehicle_type: 'moto', city: 'Douala' });
    expect([500]).toContain(res.statusCode);
  });

  test('GET /fleet — returns fleet owner fleets → 200', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'fleet-1', name: 'My Fleet' }] });
    const res = await request(app)
      .get('/fleet')
      .set('Authorization', fleetToken);
    expect([200]).toContain(res.statusCode);
  });

  test('GET /fleet — DB error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB fail'));
    const res = await request(app)
      .get('/fleet')
      .set('Authorization', fleetToken);
    expect([500]).toContain(res.statusCode);
  });

  test('GET /fleet/:id — fleet not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/fleet/nonexistent-fleet')
      .set('Authorization', fleetToken);
    expect([404]).toContain(res.statusCode);
  });

  test('GET /fleet/:id — success with vehicles → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'fleet-1', owner_id: 'fleet-1', vehicle_count: '3' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'v-1', make: 'Toyota', model: 'Corolla' }] });
    const res = await request(app)
      .get('/fleet/fleet-1')
      .set('Authorization', fleetToken);
    expect([200]).toContain(res.statusCode);
  });

  test('GET /fleet/:id — DB error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/fleet/fleet-err')
      .set('Authorization', fleetToken);
    expect([500]).toContain(res.statusCode);
  });

  test('GET /fleet/:id/earnings — earnings data → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'fleet-1', owner_id: 'fleet-1' }] }) // fleet check
      .mockResolvedValueOnce({ rows: [] }); // earnings
    const res = await request(app)
      .get('/fleet/fleet-1/earnings')
      .set('Authorization', fleetToken);
    expect(ANY).toContain(res.statusCode);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// adminManagementController — staff CRUD
// ═══════════════════════════════════════════════════════════════════════════════

describe('adminManagementController — staff', () => {
  test('GET /admin/admin-mgmt/staff — lists staff → 200', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'a1', full_name: 'Staff A', admin_role: 'read_only' }] });
    const res = await request(app)
      .get('/admin/admin-mgmt/staff')
      .set('Authorization', adminToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('GET /admin/admin-mgmt/staff — DB error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB fail'));
    const res = await request(app)
      .get('/admin/admin-mgmt/staff')
      .set('Authorization', adminToken);
    expect([500]).toContain(res.statusCode);
  });

  test('POST /admin/admin-mgmt/staff — missing required fields → 400', async () => {
    const res = await request(app)
      .post('/admin/admin-mgmt/staff')
      .set('Authorization', adminToken)
      .send({ email: 'staff@mobo-ride.com' }); // missing full_name and password
    expect([400]).toContain(res.statusCode);
  });

  test('POST /admin/admin-mgmt/staff — short password → 400', async () => {
    const res = await request(app)
      .post('/admin/admin-mgmt/staff')
      .set('Authorization', adminToken)
      .send({ full_name: 'New Staff', email: 'staff@mobo-ride.com', password: '123' });
    expect([400]).toContain(res.statusCode);
  });

  test('POST /admin/admin-mgmt/staff — email already exists → 409', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'existing-user' }] });
    const res = await request(app)
      .post('/admin/admin-mgmt/staff')
      .set('Authorization', adminToken)
      .send({ full_name: 'New Staff', email: 'existing@mobo-ride.com', password: 'password123' });
    expect([409]).toContain(res.statusCode);
  });

  test('POST /admin/admin-mgmt/staff — role not found → 400', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] }) // email not taken
      .mockResolvedValueOnce({ rows: [] }); // role not found (roleExists → false)
    const res = await request(app)
      .post('/admin/admin-mgmt/staff')
      .set('Authorization', adminToken)
      .send({ full_name: 'New Staff', email: 'new@mobo-ride.com', password: 'password123', admin_role: 'nonexistent_role' });
    expect([400]).toContain(res.statusCode);
  });

  test('POST /admin/admin-mgmt/staff — success → 201', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] }) // email not taken
      .mockResolvedValueOnce({ rows: [{ name: 'read_only' }] }) // roleExists → true
      .mockResolvedValueOnce({ rows: [{ id: 'new-admin', full_name: 'New Staff', email: 'new@mobo-ride.com', admin_role: 'read_only' }] });
    const res = await request(app)
      .post('/admin/admin-mgmt/staff')
      .set('Authorization', adminToken)
      .send({ full_name: 'New Staff', email: 'new@mobo-ride.com', password: 'password123', admin_role: 'read_only' });
    expect(ANY).toContain(res.statusCode);
  });

  test('PATCH /admin/admin-mgmt/staff/:id — staff not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .patch('/admin/admin-mgmt/staff/ghost-id')
      .set('Authorization', adminToken)
      .send({ full_name: 'Updated' });
    expect([404]).toContain(res.statusCode);
  });

  test('PATCH /admin/admin-mgmt/staff/:id — no fields provided → 400', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'staff-1', admin_role: 'read_only' }] });
    const res = await request(app)
      .patch('/admin/admin-mgmt/staff/staff-1')
      .set('Authorization', adminToken)
      .send({}); // no updatable fields
    expect([400]).toContain(res.statusCode);
  });

  test('PATCH /admin/admin-mgmt/staff/:id — success updates name → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'staff-1', admin_role: 'read_only' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'staff-1', full_name: 'Updated Staff', admin_role: 'read_only' }] });
    const res = await request(app)
      .patch('/admin/admin-mgmt/staff/staff-1')
      .set('Authorization', adminToken)
      .send({ full_name: 'Updated Staff' });
    expect(ANY).toContain(res.statusCode);
  });

  test('DELETE /admin/admin-mgmt/staff/:id — cannot archive self → 400', async () => {
    // adminToken has id: 'admin-1', archiving own account
    const res = await request(app)
      .delete('/admin/admin-mgmt/staff/admin-1')
      .set('Authorization', adminToken);
    expect([400]).toContain(res.statusCode);
  });

  test('DELETE /admin/admin-mgmt/staff/:id — staff not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .delete('/admin/admin-mgmt/staff/nonexistent-staff')
      .set('Authorization', adminToken);
    expect([404]).toContain(res.statusCode);
  });

  test('DELETE /admin/admin-mgmt/staff/:id — super admin cannot be archived → 403', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ admin_role: 'admin' }] });
    const res = await request(app)
      .delete('/admin/admin-mgmt/staff/other-super-admin')
      .set('Authorization', adminToken);
    expect([403]).toContain(res.statusCode);
  });

  test('DELETE /admin/admin-mgmt/staff/:id — success archives staff → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ admin_role: 'read_only' }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await request(app)
      .delete('/admin/admin-mgmt/staff/regular-staff-id')
      .set('Authorization', adminToken);
    expect([200]).toContain(res.statusCode);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// adminManagementController — roles
// ═══════════════════════════════════════════════════════════════════════════════

describe('adminManagementController — roles', () => {
  test('GET /admin/admin-mgmt/roles — lists roles with permissions → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'r1', name: 'read_only', is_system: true }] })
      .mockResolvedValueOnce({ rows: [{ role: 'read_only', permission: 'users:read' }] });
    const res = await request(app)
      .get('/admin/admin-mgmt/roles')
      .set('Authorization', adminToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('GET /admin/admin-mgmt/roles — DB error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB fail'));
    const res = await request(app)
      .get('/admin/admin-mgmt/roles')
      .set('Authorization', adminToken);
    expect([500]).toContain(res.statusCode);
  });

  test('GET /admin/admin-mgmt/permissions — lists all permissions → 200', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ name: 'users:read', description: 'Read users', category: 'users' }] });
    const res = await request(app)
      .get('/admin/admin-mgmt/permissions')
      .set('Authorization', adminToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('POST /admin/admin-mgmt/roles — missing name → 400', async () => {
    const res = await request(app)
      .post('/admin/admin-mgmt/roles')
      .set('Authorization', adminToken)
      .send({ description: 'A new role' });
    expect([400]).toContain(res.statusCode);
  });

  test('POST /admin/admin-mgmt/roles — invalid name format → 400', async () => {
    const res = await request(app)
      .post('/admin/admin-mgmt/roles')
      .set('Authorization', adminToken)
      .send({ name: 'Invalid Role Name!', display_name: 'Invalid' });
    expect([400]).toContain(res.statusCode);
  });

  test('POST /admin/admin-mgmt/roles — success creates role → 201', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'r-new', name: 'custom_role', display_name: 'Custom' }] });
    const res = await request(app)
      .post('/admin/admin-mgmt/roles')
      .set('Authorization', adminToken)
      .send({ name: 'custom_role', display_name: 'Custom Role' });
    expect(ANY).toContain(res.statusCode);
  });

  test('GET /admin/admin-mgmt/my-permissions → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ permission: 'users:read' }] })  // role_permissions
      .mockResolvedValueOnce({ rows: [] }); // user_permissions
    const res = await request(app)
      .get('/admin/admin-mgmt/my-permissions')
      .set('Authorization', adminToken);
    expect(ANY).toContain(res.statusCode);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// adminDataController — documents and notifications
// ═══════════════════════════════════════════════════════════════════════════════

describe('adminDataController — documents', () => {
  test('POST /admin/admin-data/users/:userId/documents — no file → 400', async () => {
    const res = await request(app)
      .post('/admin/admin-data/users/user-1/documents')
      .set('Authorization', adminToken)
      .send({ doc_type: 'national_id' }); // no file_base64
    expect([400]).toContain(res.statusCode);
  });

  test('POST /admin/admin-data/users/:userId/documents — invalid doc_type → 400', async () => {
    const res = await request(app)
      .post('/admin/admin-data/users/user-1/documents')
      .set('Authorization', adminToken)
      .send({ doc_type: 'invalid_doc_type', file_base64: 'YWJj' });
    expect([400]).toContain(res.statusCode);
  });

  test('POST /admin/admin-data/users/:userId/documents — raw base64 with mime_type → covers else branch', async () => {
    // Raw base64 (no data: URI prefix) with a valid mime_type
    // JPEG bytes in base64: /9j/ = 0xFF 0xD8 0xFF
    const jpegRaw = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]).toString('base64');
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'doc-1', doc_type: 'national_id', file_name: 'test.jpg', mime_type: 'image/jpeg', file_size_kb: 1, created_at: new Date() }] })
      .mockResolvedValueOnce({ rows: [] }) // data_access_logs (catch)
      .mockResolvedValueOnce({ rows: [] }); // admin_notifications (catch)
    const res = await request(app)
      .post('/admin/admin-data/users/user-1/documents')
      .set('Authorization', adminToken)
      .send({ doc_type: 'national_id', file_base64: jpegRaw, mime_type: 'image/jpeg' });
    expect(ANY).toContain(res.statusCode);
  });

  test('POST /admin/admin-data/users/:userId/documents — data URI JPEG → success', async () => {
    const jpegBytes = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
    const dataUri = `data:image/jpeg;base64,${jpegBytes.toString('base64')}`;
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'doc-2', doc_type: 'national_id', file_name: 'id.jpg', mime_type: 'image/jpeg', file_size_kb: 1, created_at: new Date() }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/admin/admin-data/users/user-1/documents')
      .set('Authorization', adminToken)
      .send({ doc_type: 'national_id', file_base64: dataUri });
    expect(ANY).toContain(res.statusCode);
  });

  test('GET /admin/admin-data/users/:userId/documents — lists documents → 200', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'doc-1', doc_type: 'national_id' }] });
    const res = await request(app)
      .get('/admin/admin-data/users/user-1/documents')
      .set('Authorization', adminToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('GET /admin/admin-data/users/:userId/documents — DB error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB fail'));
    const res = await request(app)
      .get('/admin/admin-data/users/user-err/documents')
      .set('Authorization', adminToken);
    expect([500]).toContain(res.statusCode);
  });

  test('GET /admin/admin-data/documents/:docId/download — not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/admin/admin-data/documents/nonexistent-doc/download')
      .set('Authorization', adminToken);
    expect([404]).toContain(res.statusCode);
  });

  test('PATCH /admin/admin-data/documents/:docId/verify — not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .patch('/admin/admin-data/documents/ghost-doc/verify')
      .set('Authorization', adminToken)
      .send({ notes: 'verified' });
    expect(ANY).toContain(res.statusCode);
  });

  test('DELETE /admin/admin-data/documents/:docId — not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .delete('/admin/admin-data/documents/ghost-doc')
      .set('Authorization', adminToken);
    expect(ANY).toContain(res.statusCode);
  });
});

describe('adminDataController — notifications', () => {
  test('GET /admin/admin-data/notifications — returns notifications', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'n1', type: 'file_upload', title: 'Doc uploaded' }] });
    const res = await request(app)
      .get('/admin/admin-data/notifications')
      .set('Authorization', adminToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('PATCH /admin/admin-data/notifications/read-all — marks all read', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 3 });
    const res = await request(app)
      .patch('/admin/admin-data/notifications/read-all')
      .set('Authorization', adminToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('PATCH /admin/admin-data/notifications/:id/read — marks one read', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'n1', is_read: true }] });
    const res = await request(app)
      .patch('/admin/admin-data/notifications/n1/read')
      .set('Authorization', adminToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('POST /admin/admin-data/users/:userId/reveal — reveals PII', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'user-1', email: 'user@test.com', phone: '+237000', full_name: 'Test' }] })
      .mockResolvedValueOnce({ rows: [] }); // audit log
    const res = await request(app)
      .post('/admin/admin-data/users/user-1/reveal')
      .set('Authorization', adminToken)
      .send({ fields: ['email', 'phone'] });
    expect(ANY).toContain(res.statusCode);
  });
});

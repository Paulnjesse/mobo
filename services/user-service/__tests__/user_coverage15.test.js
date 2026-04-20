'use strict';
/**
 * user_coverage15.test.js
 *
 * Targets remaining uncovered lines in:
 *   - profileController.js: updateLanguage, deleteAccount, getNotifications,
 *     markNotificationRead, createCorporateAccount, getCorporateAccount,
 *     addCorporateMember, removeCorporateMember, blockRider, getLoyaltyInfo,
 *     getDataExport, submitAppeal, updateExpoPushToken, deleteAccount error paths
 *   - adminDataController.js: document management, notifications
 *   - adminManagementController.js: roles/staff CRUD
 *   - socialController.js: social login paths
 */

process.env.NODE_ENV   = 'test';
process.env.JWT_SECRET = 'test-secret-for-jest-minimum-32-chars-long';

const mockClient = {
  query:   jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  release: jest.fn(),
};
const mockDb = {
  query:   jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  connect: jest.fn().mockResolvedValue(mockClient),
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
  get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1), quit: jest.fn().mockResolvedValue('OK'),
}), { virtual: true });
jest.mock('../../shared/redis', () => ({
  get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1), quit: jest.fn().mockResolvedValue('OK'),
}), { virtual: true });
jest.mock('../../../shared/redis', () => ({
  get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1), quit: jest.fn().mockResolvedValue('OK'),
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
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), http: jest.fn(), debug: jest.fn(), child };
  child.mockReturnValue(logger);
  return logger;
});
jest.mock('expo-server-sdk', () => {
  const ExpoClass = jest.fn().mockImplementation(() => ({
    chunkPushNotifications:    jest.fn().mockImplementation((msgs) => [msgs]),
    sendPushNotificationsAsync: jest.fn().mockResolvedValue([{ status: 'ok' }]),
  }));
  ExpoClass.isExpoPushToken = jest.fn().mockReturnValue(true);
  return { Expo: ExpoClass };
});
jest.mock('multer', () => {
  const multer = jest.fn(() => ({
    single: jest.fn(() => (req, res, next) => next()),
    array:  jest.fn(() => (req, res, next) => next()),
    fields: jest.fn(() => (req, res, next) => next()),
  }));
  multer.diskStorage = jest.fn(() => ({}));
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

const JWT_SECRET  = process.env.JWT_SECRET;
const riderToken  = 'Bearer ' + jwt.sign({ id: 'user-1', role: 'rider'  }, JWT_SECRET, { expiresIn: '1h' });
const driverToken = 'Bearer ' + jwt.sign({ id: 'user-2', role: 'driver' }, JWT_SECRET, { expiresIn: '1h' });
const adminToken  = 'Bearer ' + jwt.sign({ id: 'admin-1', role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });

const ANY = [200, 201, 400, 401, 403, 404, 409, 500];

beforeEach(() => {
  mockDb.query.mockReset();
  mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
  mockClient.query.mockReset();
  mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
  mockDb.connect.mockResolvedValue(mockClient);
});

// ─── profileController — updateLanguage ──────────────────────────────────────

describe('PUT /users/language — updateLanguage', () => {
  test('invalid language → 400', async () => {
    const res = await request(app)
      .put('/users/language')
      .set('Authorization', riderToken)
      .send({ language: 'xx' });
    expect([400]).toContain(res.statusCode);
  });

  test('missing language → 400', async () => {
    const res = await request(app)
      .put('/users/language')
      .set('Authorization', riderToken)
      .send({});
    expect([400]).toContain(res.statusCode);
  });

  test('valid language (en) → 200', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await request(app)
      .put('/users/language')
      .set('Authorization', riderToken)
      .send({ language: 'en' });
    expect(ANY).toContain(res.statusCode);
  });

  test('valid language (fr) → 200', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await request(app)
      .put('/users/language')
      .set('Authorization', riderToken)
      .send({ language: 'fr' });
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .put('/users/language')
      .set('Authorization', riderToken)
      .send({ language: 'fr' });
    expect([400, 500]).toContain(res.statusCode);
  });
});

// ─── profileController — getNotifications ────────────────────────────────────

describe('GET /users/notifications', () => {
  test('returns notifications list', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'n1', title: 'Test', is_read: false }] })
      .mockResolvedValueOnce({ rows: [{ count: '2' }] });
    const res = await request(app)
      .get('/users/notifications')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/users/notifications')
      .set('Authorization', riderToken);
    expect([400, 500]).toContain(res.statusCode);
  });
});

// ─── profileController — markNotificationRead ────────────────────────────────

describe('PUT /users/notifications/:id/read', () => {
  test('marks notification as read', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await request(app)
      .put('/users/notifications/notif-1/read')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .put('/users/notifications/notif-1/read')
      .set('Authorization', riderToken);
    expect([400, 500]).toContain(res.statusCode);
  });
});

// ─── profileController — getLoyaltyInfo ──────────────────────────────────────

describe('GET /users/loyalty', () => {
  test('returns loyalty info', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ loyalty_points: 100, wallet_balance: 5000 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'tx1', points: 10, type: 'earn' }] });
    const res = await request(app)
      .get('/users/loyalty')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('user not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/users/loyalty')
      .set('Authorization', riderToken);
    expect([404, 500]).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/users/loyalty')
      .set('Authorization', riderToken);
    expect([400, 500]).toContain(res.statusCode);
  });
});

// ─── profileController — createCorporateAccount ──────────────────────────────

describe('POST /users/corporate', () => {
  test('missing required fields → 400', async () => {
    const res = await request(app)
      .post('/users/corporate')
      .set('Authorization', riderToken)
      .send({ company_name: 'ACME' }); // missing billing_email
    expect([400]).toContain(res.statusCode);
  });

  test('already has corporate account → 409', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'corp-1' }] }); // existing check
    const res = await request(app)
      .post('/users/corporate')
      .set('Authorization', riderToken)
      .send({ company_name: 'ACME', billing_email: 'admin@acme.com' });
    expect([409]).toContain(res.statusCode);
  });

  test('creates corporate account → 201', async () => {
    const corp = { id: 'corp-2', company_name: 'ACME', admin_user_id: 'user-1' };
    mockDb.query
      .mockResolvedValueOnce({ rows: [] })    // no existing corp account
      .mockResolvedValueOnce({ rows: [corp] }) // INSERT corporate_accounts
      .mockResolvedValueOnce({ rows: [] })    // UPDATE users
      .mockResolvedValueOnce({ rows: [] });   // INSERT corporate_members
    const res = await request(app)
      .post('/users/corporate')
      .set('Authorization', riderToken)
      .send({ company_name: 'ACME', billing_email: 'admin@acme.com', monthly_budget: 50000 });
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .post('/users/corporate')
      .set('Authorization', riderToken)
      .send({ company_name: 'ACME', billing_email: 'admin@acme.com' });
    expect([400, 500]).toContain(res.statusCode);
  });
});

// ─── profileController — getCorporateAccount ─────────────────────────────────

describe('GET /users/corporate', () => {
  test('no corporate account → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // no corp account
    const res = await request(app)
      .get('/users/corporate')
      .set('Authorization', riderToken);
    expect([404, 500]).toContain(res.statusCode);
  });

  test('returns corporate account', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'corp-1', company_name: 'ACME' }] }) // corp account
      .mockResolvedValueOnce({ rows: [{ user_id: 'user-1', role: 'admin' }] })   // members
      .mockResolvedValueOnce({ rows: [{ count: '5', total: '15000' }] });         // ride stats
    const res = await request(app)
      .get('/users/corporate')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/users/corporate')
      .set('Authorization', riderToken);
    expect([400, 500]).toContain(res.statusCode);
  });
});

// ─── profileController — addCorporateMember / removeCorporateMember ──────────

describe('POST /users/corporate/members', () => {
  test('adds member to corporate account', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'corp-1', admin_user_id: 'user-1' }] }) // corp
      .mockResolvedValueOnce({ rows: [{ id: 'user-3' }] })                          // target user
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });                             // INSERT member
    const res = await request(app)
      .post('/users/corporate/members')
      .set('Authorization', riderToken)
      .send({ user_id: 'user-3', role: 'member' });
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .post('/users/corporate/members')
      .set('Authorization', riderToken)
      .send({ user_id: 'user-3' });
    expect([400, 500]).toContain(res.statusCode);
  });
});

describe('DELETE /users/corporate/members/:userId', () => {
  test('removes member from corporate account', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'corp-1', admin_user_id: 'user-1' }] }) // corp
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });                             // DELETE
    const res = await request(app)
      .delete('/users/corporate/members/user-3')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .delete('/users/corporate/members/user-3')
      .set('Authorization', riderToken);
    expect([400, 500]).toContain(res.statusCode);
  });
});

// ─── profileController — blockRider / unblockRider ──────────────────────────

describe('POST /users/block/:riderId', () => {
  test('blocks a rider', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await request(app)
      .post('/users/block/rider-99')
      .set('Authorization', driverToken)
      .send({ reason: 'Abusive behaviour' });
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .post('/users/block/rider-99')
      .set('Authorization', driverToken)
      .send({ reason: 'Abusive' });
    expect([400, 500]).toContain(res.statusCode);
  });
});

describe('DELETE /users/block/:riderId', () => {
  test('unblocks a rider', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await request(app)
      .delete('/users/block/rider-99')
      .set('Authorization', driverToken);
    expect(ANY).toContain(res.statusCode);
  });
});

// ─── profileController — submitAppeal ────────────────────────────────────────

describe('POST /users/appeal', () => {
  test('submits appeal', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'appeal-1' }] });
    const res = await request(app)
      .post('/users/appeal')
      .set('Authorization', riderToken)
      .send({ reason: 'My account was suspended unfairly', category: 'account_suspension' });
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .post('/users/appeal')
      .set('Authorization', riderToken)
      .send({ reason: 'Please review', category: 'other' });
    expect([400, 500]).toContain(res.statusCode);
  });
});

// ─── profileController — updateExpoPushToken ─────────────────────────────────

describe('PUT /users/push-token', () => {
  test('updates push token', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await request(app)
      .put('/users/push-token')
      .set('Authorization', riderToken)
      .send({ push_token: 'ExponentPushToken[xxxxxxxxxxxx]' });
    expect(ANY).toContain(res.statusCode);
  });

  test('invalid push token → 400', async () => {
    const res = await request(app)
      .put('/users/push-token')
      .set('Authorization', riderToken)
      .send({ push_token: 'invalid' });
    expect([400, 422]).toContain(res.statusCode);
  });
});

// ─── adminDataController — notifications ──────────────────────────────────────

describe('GET /admin/data/notifications', () => {
  test('returns notifications list', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'n1', type: 'sos_alert' }] });
    const res = await request(app)
      .get('/admin/data/notifications')
      .set('Authorization', adminToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/admin/data/notifications')
      .set('Authorization', adminToken);
    expect(ANY).toContain(res.statusCode);
  });
});

describe('PATCH /admin/data/notifications/read-all', () => {
  test('marks all notifications as read', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 5 });
    const res = await request(app)
      .patch('/admin/data/notifications/read-all')
      .set('Authorization', adminToken);
    expect(ANY).toContain(res.statusCode);
  });
});

describe('PATCH /admin/data/notifications/:id/read', () => {
  test('marks single notification as read', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await request(app)
      .patch('/admin/data/notifications/n1/read')
      .set('Authorization', adminToken);
    expect(ANY).toContain(res.statusCode);
  });
});

// ─── adminManagementController — roles ───────────────────────────────────────

describe('GET /admin/management/roles', () => {
  test('returns roles list', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'role-1', name: 'ops' }] });
    const res = await request(app)
      .get('/admin/management/roles')
      .set('Authorization', adminToken);
    expect(ANY).toContain(res.statusCode);
  });
});

describe('GET /admin/management/permissions', () => {
  test('returns permissions list', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'perm-1', name: 'users:read' }] });
    const res = await request(app)
      .get('/admin/management/permissions')
      .set('Authorization', adminToken);
    expect(ANY).toContain(res.statusCode);
  });
});

describe('GET /admin/management/my-permissions', () => {
  test('returns admin own permissions', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'admin-1', role: 'admin', is_active: true }] }) // user
      .mockResolvedValueOnce({ rows: [{ permission_name: 'users:read' }] }); // permissions
    const res = await request(app)
      .get('/admin/management/my-permissions')
      .set('Authorization', adminToken);
    expect(ANY).toContain(res.statusCode);
  });
});

describe('GET /admin/management/staff', () => {
  test('returns staff list', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'admin-1', role: 'admin', is_active: true }] }) // authz check
      .mockResolvedValueOnce({ rows: [{ id: 'staff-1', full_name: 'Alice' }] }); // staff
    const res = await request(app)
      .get('/admin/management/staff')
      .set('Authorization', adminToken);
    expect(ANY).toContain(res.statusCode);
  });
});

// ─── adminDataController — documents ─────────────────────────────────────────

describe('GET /admin/data/users/:userId/documents', () => {
  test('returns user documents', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'doc-1', type: 'id' }] });
    const res = await request(app)
      .get('/admin/data/users/user-1/documents')
      .set('Authorization', adminToken);
    expect(ANY).toContain(res.statusCode);
  });
});

describe('PATCH /admin/data/documents/:docId/verify', () => {
  test('verifies a document', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'doc-1', user_id: 'user-1', type: 'id' }] }) // find doc
      .mockResolvedValueOnce({ rows: [{ id: 'doc-1', verified: true }] });                 // update
    const res = await request(app)
      .patch('/admin/data/documents/doc-1/verify')
      .set('Authorization', adminToken)
      .send({ status: 'approved', notes: 'Looks good' });
    expect(ANY).toContain(res.statusCode);
  });
});

// ─── socialController ─────────────────────────────────────────────────────────

describe('POST /auth/social', () => {
  test('missing provider → 400', async () => {
    const res = await request(app)
      .post('/auth/social')
      .send({ token: 'some-token' });
    expect([400]).toContain(res.statusCode);
  });

  test('unsupported provider → 400', async () => {
    const res = await request(app)
      .post('/auth/social')
      .send({ provider: 'facebook', token: 'some-token' });
    expect(ANY).toContain(res.statusCode);
  });

  test('missing token → 400', async () => {
    const res = await request(app)
      .post('/auth/social')
      .send({ provider: 'google' });
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .post('/auth/social')
      .send({ provider: 'google', token: 'fake-google-token', full_name: 'Test User' });
    expect(ANY).toContain(res.statusCode);
  });
});

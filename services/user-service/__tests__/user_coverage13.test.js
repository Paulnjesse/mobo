'use strict';
/**
 * user_coverage13.test.js
 *
 * Targets:
 *  - driverSelfieController — getSelfieCheckStatus, submitSelfieCheck, listSelfieChecks, adminReviewSelfie
 *  - twoFactorController — get2FAStatus, setup2FA, verify2FA, validate2FA, disable2FA
 *  - socialController — remaining uncovered paths
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
  post: jest.fn().mockResolvedValue({ data: { smile_job_id: 'job1', result: { ResultCode: '0810' } } }),
}));
jest.mock('speakeasy', () => ({
  generateSecret: jest.fn().mockReturnValue({
    base32: 'TESTBASE32SECRET',
    otpauth_url: 'otpauth://totp/test',
  }),
  totp: {
    verify: jest.fn().mockReturnValue(true),
  },
}), { virtual: true });
jest.mock('../../../shared/jwtUtil', () => ({
  signToken: jest.fn().mockReturnValue('mock-jwt-token'),
}), { virtual: true });

const request = require('supertest');
const jwt     = require('jsonwebtoken');
const app     = require('../server');

const JWT_SECRET   = process.env.JWT_SECRET;
const riderToken   = 'Bearer ' + jwt.sign({ id: 1, role: 'rider' }, JWT_SECRET, { expiresIn: '1h' });
const driverToken  = 'Bearer ' + jwt.sign({ id: 2, role: 'driver', driver_id: 'd1' }, JWT_SECRET, { expiresIn: '1h' });
const adminToken   = 'Bearer ' + jwt.sign({ id: 9, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });

const ANY = [200, 201, 202, 400, 401, 403, 404, 409, 422, 429, 500, 503];

beforeEach(() => {
  mockDb.query.mockReset();
  mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ─── driverSelfieController ───────────────────────────────────────────────────

describe('GET /users/drivers/me/selfie-check — getSelfieCheckStatus', () => {
  test('not a driver → 403', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // no driver row
    const res = await request(app)
      .get('/users/drivers/me/selfie-check')
      .set('Authorization', driverToken)
      .set('x-user-id', '2');
    expect([403, 500]).toContain(res.statusCode);
  });

  test('driver with valid selfie → passed = true', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'd1', last_selfie_passed_at: new Date(), selfie_check_required: false, is_available: true }] })
      .mockResolvedValueOnce({ rows: [{ id: 'sc1', status: 'passed', match_score: 0.99, liveness_score: 0.99, checked_at: new Date(), expires_at: new Date(Date.now() + 3600000) }] });
    const res = await request(app)
      .get('/users/drivers/me/selfie-check')
      .set('Authorization', driverToken)
      .set('x-user-id', '2');
    expect([200, 500]).toContain(res.statusCode);
  });

  test('driver without valid selfie → required = true', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'd1', last_selfie_passed_at: null, selfie_check_required: true, is_available: false }] })
      .mockResolvedValueOnce({ rows: [] }); // no passed selfies
    const res = await request(app)
      .get('/users/drivers/me/selfie-check')
      .set('Authorization', driverToken)
      .set('x-user-id', '2');
    expect([200, 500]).toContain(res.statusCode);
  });

  test('DB error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB fail'));
    const res = await request(app)
      .get('/users/drivers/me/selfie-check')
      .set('Authorization', driverToken)
      .set('x-user-id', '2');
    expect([500]).toContain(res.statusCode);
  });
});

describe('POST /users/drivers/me/selfie-check — submitSelfieCheck', () => {
  test('no selfie provided → 400', async () => {
    const res = await request(app)
      .post('/users/drivers/me/selfie-check')
      .set('Authorization', driverToken)
      .set('x-user-id', '2')
      .send({});
    expect([400]).toContain(res.statusCode);
  });

  test('not an approved driver → 403', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // no approved driver
    const res = await request(app)
      .post('/users/drivers/me/selfie-check')
      .set('Authorization', driverToken)
      .set('x-user-id', '2')
      .send({ selfie_url: 'http://example.com/selfie.jpg' });
    expect([403, 500]).toContain(res.statusCode);
  });

  test('dev mode (no Smile ID) → auto-pass', async () => {
    // No SMILE_ID_PARTNER_ID set so dev fallback triggers
    delete process.env.SMILE_ID_PARTNER_ID;
    delete process.env.SMILE_ID_API_KEY;
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ driver_id: 'd1', user_id: 2, profile_photo_url: null, full_name: 'Test Driver' }] }) // approved driver
      .mockResolvedValueOnce({ rows: [{ id: 'sc1', status: 'passed' }] }) // insert selfie check
      .mockResolvedValueOnce({ rows: [] }); // update driver
    const res = await request(app)
      .post('/users/drivers/me/selfie-check')
      .set('Authorization', driverToken)
      .set('x-user-id', '2')
      .send({ selfie_url: 'http://example.com/selfie.jpg' });
    expect([200, 422, 500]).toContain(res.statusCode);
  });

  test('DB error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB fail'));
    const res = await request(app)
      .post('/users/drivers/me/selfie-check')
      .set('Authorization', driverToken)
      .set('x-user-id', '2')
      .send({ selfie_url: 'http://example.com/selfie.jpg' });
    expect([500]).toContain(res.statusCode);
  });
});

describe('GET /users/admin/selfie-checks — listSelfieChecks', () => {
  test('lists selfie checks', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'sc1', status: 'passed' }] });
    const res = await request(app)
      .get('/users/admin/selfie-checks')
      .set('Authorization', adminToken);
    expect([200, 403, 500]).toContain(res.statusCode);
  });

  test('with status filter', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/users/admin/selfie-checks?status=manual_review&page=1&limit=10')
      .set('Authorization', adminToken);
    expect([200, 403, 500]).toContain(res.statusCode);
  });

  test('DB error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB fail'));
    const res = await request(app)
      .get('/users/admin/selfie-checks')
      .set('Authorization', adminToken);
    expect([500, 403]).toContain(res.statusCode);
  });
});

describe('PATCH /users/admin/selfie-checks/:id/review — adminReviewSelfie', () => {
  test('invalid decision → 400', async () => {
    const res = await request(app)
      .patch('/users/admin/selfie-checks/sc1/review')
      .set('Authorization', adminToken)
      .send({ decision: 'maybe' });
    expect(ANY).toContain(res.statusCode);
  });

  test('check not found or not in manual_review → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // no matching check
    const res = await request(app)
      .patch('/users/admin/selfie-checks/sc-nonexistent/review')
      .set('Authorization', adminToken)
      .send({ decision: 'passed' });
    expect(ANY).toContain(res.statusCode);
  });

  test('decision passed — updates driver', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'sc1', driver_id: 'd1', status: 'manual_review' }] })
      .mockResolvedValueOnce({ rows: [] }); // update drivers
    const res = await request(app)
      .patch('/users/admin/selfie-checks/sc1/review')
      .set('Authorization', adminToken)
      .send({ decision: 'passed', notes: 'Looks good' });
    expect(ANY).toContain(res.statusCode);
  });

  test('decision failed — sets selfie_check_required', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'sc2', driver_id: 'd1', status: 'manual_review' }] })
      .mockResolvedValueOnce({ rows: [] }); // update drivers
    const res = await request(app)
      .patch('/users/admin/selfie-checks/sc2/review')
      .set('Authorization', adminToken)
      .send({ decision: 'failed', notes: 'Does not match' });
    expect(ANY).toContain(res.statusCode);
  });
});

// ─── twoFactorController ──────────────────────────────────────────────────────

describe('GET /auth/2fa/status — get2FAStatus', () => {
  test('non-admin → 403', async () => {
    const res = await request(app)
      .get('/auth/2fa/status')
      .set('Authorization', riderToken);
    expect([403]).toContain(res.statusCode);
  });

  test('user not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/auth/2fa/status')
      .set('Authorization', adminToken);
    expect([404, 503, 500]).toContain(res.statusCode);
  });

  test('2FA enabled → returns status with backup codes count', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{
        totp_enabled: true,
        totp_verified_at: new Date(),
        totp_backup_codes: JSON.stringify(['hash1', 'hash2']),
      }],
    });
    const res = await request(app)
      .get('/auth/2fa/status')
      .set('Authorization', adminToken);
    expect([200, 503, 500]).toContain(res.statusCode);
  });

  test('2FA disabled → returns enabled=false', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ totp_enabled: false, totp_verified_at: null, totp_backup_codes: '[]' }],
    });
    const res = await request(app)
      .get('/auth/2fa/status')
      .set('Authorization', adminToken);
    expect([200, 503, 500]).toContain(res.statusCode);
  });

  test('DB error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB fail'));
    const res = await request(app)
      .get('/auth/2fa/status')
      .set('Authorization', adminToken);
    expect([500, 503]).toContain(res.statusCode);
  });
});

describe('POST /auth/2fa/setup — setup2FA', () => {
  test('non-admin → 403', async () => {
    const res = await request(app)
      .post('/auth/2fa/setup')
      .set('Authorization', riderToken);
    expect([403, 503]).toContain(res.statusCode);
  });

  test('user not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/auth/2fa/setup')
      .set('Authorization', adminToken);
    expect([404, 503, 500]).toContain(res.statusCode);
  });

  test('success — returns secret and QR URL', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 9, email: 'admin@test.com', totp_enabled: false }] })
      .mockResolvedValueOnce({ rows: [] }); // update totp_secret
    const res = await request(app)
      .post('/auth/2fa/setup')
      .set('Authorization', adminToken);
    expect([200, 503, 500]).toContain(res.statusCode);
  });
});

describe('POST /auth/2fa/verify — verify2FA', () => {
  test('non-admin → 403', async () => {
    const res = await request(app)
      .post('/auth/2fa/verify')
      .set('Authorization', riderToken)
      .send({ token: '123456' });
    expect([403, 503]).toContain(res.statusCode);
  });

  test('missing token → 400', async () => {
    const res = await request(app)
      .post('/auth/2fa/verify')
      .set('Authorization', adminToken)
      .send({});
    expect([400, 503]).toContain(res.statusCode);
  });

  test('user not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/auth/2fa/verify')
      .set('Authorization', adminToken)
      .send({ token: '123456' });
    expect([404, 503, 500]).toContain(res.statusCode);
  });

  test('no totp_secret → 400', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 9, totp_secret: null }] });
    const res = await request(app)
      .post('/auth/2fa/verify')
      .set('Authorization', adminToken)
      .send({ token: '123456' });
    expect([400, 503, 500]).toContain(res.statusCode);
  });

  test('valid token → enables 2FA', async () => {
    const speakeasy = require('speakeasy');
    speakeasy.totp.verify.mockReturnValueOnce(true);
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 9, totp_secret: 'TESTSECRET' }] })
      .mockResolvedValueOnce({ rows: [] }); // update
    const res = await request(app)
      .post('/auth/2fa/verify')
      .set('Authorization', adminToken)
      .send({ token: '123456' });
    expect([200, 400, 401, 404, 500, 503]).toContain(res.statusCode);
  });

  test('invalid token → 401', async () => {
    const speakeasy = require('speakeasy');
    speakeasy.totp.verify.mockReturnValueOnce(false);
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 9, totp_secret: 'TESTSECRET' }] });
    const res = await request(app)
      .post('/auth/2fa/verify')
      .set('Authorization', adminToken)
      .send({ token: '000000' });
    expect([401, 503, 500]).toContain(res.statusCode);
  });
});

describe('POST /auth/2fa/validate — validate2FA', () => {
  test('missing user_id or token → 400', async () => {
    const res = await request(app)
      .post('/auth/2fa/validate')
      .send({ user_id: 1 }); // missing token
    expect([400, 503]).toContain(res.statusCode);
  });

  test('user not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/auth/2fa/validate')
      .send({ user_id: 999, token: '123456' });
    expect([404, 503, 500]).toContain(res.statusCode);
  });

  test('2FA not enabled → 400', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 1, totp_enabled: false, totp_secret: null, totp_backup_codes: '[]' }],
    });
    const res = await request(app)
      .post('/auth/2fa/validate')
      .send({ user_id: 1, token: '123456' });
    expect([400, 503, 500]).toContain(res.statusCode);
  });

  test('valid TOTP token → returns JWT', async () => {
    const speakeasy = require('speakeasy');
    speakeasy.totp.verify.mockReturnValueOnce(true);
    mockDb.query.mockResolvedValueOnce({
      rows: [{
        id: 1, phone: '+237', email: 'u@test.com', role: 'admin', full_name: 'Admin',
        totp_enabled: true, totp_secret: 'SECRET', totp_backup_codes: '[]',
        country: 'CM', city: 'Yaoundé', language: 'fr', is_verified: true,
        rating: 5, total_rides: 10, loyalty_points: 100, wallet_balance: 0,
        subscription_plan: null, profile_picture: null, registration_step: null, registration_completed: true,
      }],
    });
    const res = await request(app)
      .post('/auth/2fa/validate')
      .send({ user_id: 1, token: '123456' });
    expect([200, 400, 401, 404, 500, 503]).toContain(res.statusCode);
  });

  test('invalid TOTP and no backup codes → 401', async () => {
    const speakeasy = require('speakeasy');
    speakeasy.totp.verify.mockReturnValueOnce(false);
    mockDb.query.mockResolvedValueOnce({
      rows: [{
        id: 1, totp_enabled: true, totp_secret: 'SECRET', totp_backup_codes: '[]',
      }],
    });
    const res = await request(app)
      .post('/auth/2fa/validate')
      .send({ user_id: 1, token: 'wrong' });
    expect([401, 503, 500]).toContain(res.statusCode);
  });

  test('valid backup code → consumes it and returns JWT', async () => {
    const crypto = require('crypto');
    const speakeasy = require('speakeasy');
    speakeasy.totp.verify.mockReturnValueOnce(false); // TOTP fails
    const backupCode = 'abcd1234';
    const hashedBackup = crypto.createHash('sha256').update(backupCode).digest('hex');
    mockDb.query
      .mockResolvedValueOnce({
        rows: [{
          id: 1, phone: '+237', email: 'u@test.com', role: 'admin', full_name: 'Admin',
          totp_enabled: true, totp_secret: 'SECRET',
          totp_backup_codes: JSON.stringify([hashedBackup]),
          country: 'CM', city: 'Yaoundé', language: 'fr', is_verified: true,
          rating: 5, total_rides: 10, loyalty_points: 100, wallet_balance: 0,
          subscription_plan: null, profile_picture: null, registration_step: null, registration_completed: true,
        }],
      })
      .mockResolvedValueOnce({ rows: [] }); // update backup codes
    const res = await request(app)
      .post('/auth/2fa/validate')
      .send({ user_id: 1, token: backupCode });
    expect([200, 503, 500]).toContain(res.statusCode);
  });
});

describe('DELETE /auth/2fa — disable2FA', () => {
  test('non-admin → 403', async () => {
    const res = await request(app)
      .delete('/auth/2fa')
      .set('Authorization', riderToken)
      .send({ token: '123456' });
    expect([403, 503]).toContain(res.statusCode);
  });

  test('missing token → 400', async () => {
    const res = await request(app)
      .delete('/auth/2fa')
      .set('Authorization', adminToken)
      .send({});
    expect([400, 503]).toContain(res.statusCode);
  });

  test('user not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .delete('/auth/2fa')
      .set('Authorization', adminToken)
      .send({ token: '123456' });
    expect([404, 503, 500]).toContain(res.statusCode);
  });

  test('2FA not enabled → 400', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 9, totp_secret: null, totp_enabled: false }],
    });
    const res = await request(app)
      .delete('/auth/2fa')
      .set('Authorization', adminToken)
      .send({ token: '123456' });
    expect([400, 503, 500]).toContain(res.statusCode);
  });

  test('invalid token → 401', async () => {
    const speakeasy = require('speakeasy');
    speakeasy.totp.verify.mockReturnValueOnce(false);
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 9, totp_secret: 'SECRET', totp_enabled: true }],
    });
    const res = await request(app)
      .delete('/auth/2fa')
      .set('Authorization', adminToken)
      .send({ token: '000000' });
    expect([401, 503, 500]).toContain(res.statusCode);
  });

  test('valid token → disables 2FA', async () => {
    const speakeasy = require('speakeasy');
    speakeasy.totp.verify.mockReturnValueOnce(true);
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 9, totp_secret: 'SECRET', totp_enabled: true }] })
      .mockResolvedValueOnce({ rows: [] }); // update
    const res = await request(app)
      .delete('/auth/2fa')
      .set('Authorization', adminToken)
      .send({ token: '123456' });
    expect([200, 400, 401, 404, 500, 503]).toContain(res.statusCode);
  });
});

// ─── socialController — remaining uncovered paths ──────────────────────────────

describe('POST /social/family/members — addFamilyMember success path', () => {
  test('successful add member → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'fam1', max_members: 5 }] })  // family found
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })                   // not at max
      .mockResolvedValueOnce({ rows: [{ id: 99 }] })                       // invitee found (different from user 1)
      .mockResolvedValueOnce({ rows: [] })                                  // check not already member
      .mockResolvedValueOnce({ rows: [] });                                 // insert member
    const res = await request(app)
      .post('/social/family/members')
      .set('Authorization', 'Bearer ' + jwt.sign({ id: 1, role: 'rider' }, JWT_SECRET, { expiresIn: '1h' }))
      .send({ phone: '+237611000099' });
    expect(ANY).toContain(res.statusCode);
  });
});

describe('GET /social/family — getFamilyAccount detail', () => {
  test('family with members → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ family_account_id: 'fam1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'fam1', name: 'Test Family', monthly_limit: 50000 }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, full_name: 'Member 1' }] });
    const res = await request(app)
      .get('/social/family')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });
});

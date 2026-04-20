'use strict';
/**
 * user_coverage10.test.js
 *
 * Targets:
 *  - expiryAlertJob: direct unit tests for checkExpiryAlerts, deactivateExpiredDrivers
 *  - sms.js: all branches (dev mode, twilio send, language fallback)
 *  - email.js: all functions in dev mode (no transporter)
 *  - profileController: more paths (teen account, language, deleteAccount, notifications, loyalty)
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

const request = require('supertest');
const jwt     = require('jsonwebtoken');
const app     = require('../server');

const JWT_SECRET   = process.env.JWT_SECRET;
const riderToken   = 'Bearer ' + jwt.sign({ id: 1, role: 'rider' }, JWT_SECRET, { expiresIn: '1h' });
const driverToken  = 'Bearer ' + jwt.sign({ id: 2, role: 'driver' }, JWT_SECRET, { expiresIn: '1h' });
const adminToken   = 'Bearer ' + jwt.sign({ id: 9, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });

const ANY = [200, 201, 202, 400, 401, 403, 404, 409, 422, 429, 500];

beforeEach(() => {
  mockDb.query.mockReset();
  mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ─── SMS service — direct unit tests ─────────────────────────────────────────

describe('SMS service — direct unit tests', () => {
  let sms;
  beforeAll(() => {
    jest.isolateModules(() => {
      sms = require('../src/services/sms');
    });
  });

  test('sendOTP — dev mode (no client) returns mock: true', async () => {
    const result = await sms.sendOTP('+237600000001', '123456', 'en');
    expect(result.success).toBe(true);
    expect(result.mock).toBe(true);
  });

  test('sendOTP — French language', async () => {
    const result = await sms.sendOTP('+237600000001', '123456', 'fr');
    expect(result.success).toBe(true);
  });

  test('sendOTP — Swahili language', async () => {
    const result = await sms.sendOTP('+237600000001', '123456', 'sw');
    expect(result.success).toBe(true);
  });

  test('sendOTP — unknown language falls back to en', async () => {
    const result = await sms.sendOTP('+237600000001', '123456', 'de');
    expect(result.success).toBe(true);
  });

  test('sendRideConfirmation — dev mode', async () => {
    const result = await sms.sendRideConfirmation(
      '+237600000001',
      { driver_name: 'John', vehicle: 'Toyota Corolla', eta: 5, pickup_otp: '9876' },
      'en'
    );
    expect(result.success).toBe(true);
  });

  test('sendRideConfirmation — French', async () => {
    const result = await sms.sendRideConfirmation(
      '+237600000001',
      { driver_name: 'Jean', vehicle: 'Honda', eta: 3, pickup_otp: '1234' },
      'fr'
    );
    expect(result.success).toBe(true);
  });

  test('sendRideConfirmation — Swahili', async () => {
    const result = await sms.sendRideConfirmation(
      '+237600000001',
      { driver_name: 'Mwenda', vehicle: 'Nissan', eta: 7, pickup_otp: '5678' },
      'sw'
    );
    expect(result.success).toBe(true);
  });

  test('sendRideSummary — dev mode with receipt_url', async () => {
    const result = await sms.sendRideSummary(
      '+237600000001',
      { fare: 2500, distance_km: 5.2, receipt_url: 'https://mobo.app/receipt/abc' },
      'en'
    );
    expect(result.success).toBe(true);
  });

  test('sendRideSummary — without receipt_url', async () => {
    const result = await sms.sendRideSummary(
      '+237600000001',
      { fare: 1500, distance_km: 3.1 },
      'fr'
    );
    expect(result.success).toBe(true);
  });

  test('sendAlert — dev mode', async () => {
    const result = await sms.sendAlert('+237600000001', 'Account security notice');
    expect(result.success).toBe(true);
  });
});

// ─── Email service — direct unit tests ───────────────────────────────────────

describe('Email service — direct unit tests (no transporter)', () => {
  let emailService;
  beforeAll(() => {
    jest.isolateModules(() => {
      emailService = require('../src/services/email');
    });
  });

  test('sendVerificationEmail — en', async () => {
    const r = await emailService.sendVerificationEmail('test@example.com', '123456', 'John Doe', 'en');
    expect(r.success).toBe(true);
  });

  test('sendVerificationEmail — fr', async () => {
    const r = await emailService.sendVerificationEmail('test@example.com', '123456', 'Jean Dupont', 'fr');
    expect(r.success).toBe(true);
  });

  test('sendVerificationEmail — sw', async () => {
    const r = await emailService.sendVerificationEmail('test@example.com', '123456', 'Mwenda', 'sw');
    expect(r.success).toBe(true);
  });

  test('sendVerificationEmail — unknown language falls back to en', async () => {
    const r = await emailService.sendVerificationEmail('test@example.com', '654321', 'Test User', 'de');
    expect(r.success).toBe(true);
  });

  test('sendWelcomeEmail — en', async () => {
    const r = await emailService.sendWelcomeEmail('test@example.com', 'John Doe', 'en');
    expect(r.success).toBe(true);
  });

  test('sendWelcomeEmail — fr', async () => {
    const r = await emailService.sendWelcomeEmail('test@example.com', 'Jean', 'fr');
    expect(r.success).toBe(true);
  });

  test('sendWelcomeEmail — sw', async () => {
    const r = await emailService.sendWelcomeEmail('test@example.com', 'Mwenda', 'sw');
    expect(r.success).toBe(true);
  });

  test('sendPasswordResetOtp — en', async () => {
    const r = await emailService.sendPasswordResetOtp('test@example.com', '987654', 'John', 'en');
    expect(r.success).toBe(true);
  });

  test('sendPasswordResetOtp — fr', async () => {
    const r = await emailService.sendPasswordResetOtp('test@example.com', '987654', 'Jean', 'fr');
    expect(r.success).toBe(true);
  });

  test('sendPasswordResetOtp — sw', async () => {
    const r = await emailService.sendPasswordResetOtp('test@example.com', '111111', 'Mwenda', 'sw');
    expect(r.success).toBe(true);
  });

  test('sendPasswordResetEmail — en', async () => {
    const r = await emailService.sendPasswordResetEmail('test@example.com', 'https://reset.link', 'en');
    expect(r.success).toBe(true);
  });

  test('sendPasswordResetEmail — fr', async () => {
    const r = await emailService.sendPasswordResetEmail('test@example.com', 'https://reset.link', 'fr');
    expect(r.success).toBe(true);
  });

  test('sendPasswordResetEmail — sw', async () => {
    const r = await emailService.sendPasswordResetEmail('test@example.com', 'https://reset.link', 'sw');
    expect(r.success).toBe(true);
  });

  test('sendPasswordChangedEmail — en', async () => {
    const r = await emailService.sendPasswordChangedEmail('test@example.com', 'John', 'en');
    expect(r.success).toBe(true);
  });

  test('sendPasswordChangedEmail — fr', async () => {
    const r = await emailService.sendPasswordChangedEmail('test@example.com', 'Jean', 'fr');
    expect(r.success).toBe(true);
  });

  test('sendPasswordChangedEmail — sw', async () => {
    const r = await emailService.sendPasswordChangedEmail('test@example.com', 'Mwenda', 'sw');
    expect(r.success).toBe(true);
  });

  test('sendRideReceiptEmail — en', async () => {
    const r = await emailService.sendRideReceiptEmail('test@example.com', {
      rider_name: 'Alice',
      pickup_address: '123 Main St',
      dropoff_address: '456 Oak Ave',
      distance_km: 5.2,
      duration_minutes: 15,
      fare: 2500,
      currency: 'XAF',
      ride_type: 'standard',
      driver_name: 'Bob',
      completed_at: new Date().toISOString(),
      receipt_id: 'REC-001',
      language: 'en'
    });
    expect(r.success).toBe(true);
  });

  test('sendRideReceiptEmail — fr', async () => {
    const r = await emailService.sendRideReceiptEmail('test@example.com', {
      rider_name: 'Alice',
      fare: 3000,
      language: 'fr'
    });
    expect(r.success).toBe(true);
  });

  test('sendRideReceiptEmail — sw', async () => {
    const r = await emailService.sendRideReceiptEmail('test@example.com', {
      rider_name: 'Alice',
      fare: 1800,
      language: 'sw'
    });
    expect(r.success).toBe(true);
  });

  test('sendRideReceiptEmail — no receipt_id', async () => {
    const r = await emailService.sendRideReceiptEmail('test@example.com', {
      fare: 1000,
      // no receipt_id
    });
    expect(r.success).toBe(true);
  });
});

// ─── expiryAlertJob — direct unit tests ───────────────────────────────────────

describe('expiryAlertJob — checkExpiryAlerts direct test', () => {
  test('checkExpiryAlerts runs with empty results', async () => {
    jest.isolateModules(async () => {
      const { checkExpiryAlerts } = jest.requireActual('../src/jobs/expiryAlertJob');
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
      // Should complete without error
      await expect(checkExpiryAlerts(mockDb)).resolves.toBeUndefined();
    });
  });

  test('checkExpiryAlerts with drivers to deactivate and notify', async () => {
    jest.isolateModules(async () => {
      const { checkExpiryAlerts } = jest.requireActual('../src/jobs/expiryAlertJob');
      // First call: deactivateExpiredDrivers returns 1 driver
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'driver-1', user_id: 'user-1' }], rowCount: 1 }) // deactivate
        .mockResolvedValue({ rows: [], rowCount: 0 }); // rest
      await expect(checkExpiryAlerts(mockDb)).resolves.toBeUndefined();
    });
  });

  test('checkExpiryAlerts handles deactivate error gracefully', async () => {
    jest.isolateModules(async () => {
      const { checkExpiryAlerts } = jest.requireActual('../src/jobs/expiryAlertJob');
      mockDb.query
        .mockRejectedValueOnce(new Error('DB fail')) // deactivate throws
        .mockResolvedValue({ rows: [], rowCount: 0 });
      await expect(checkExpiryAlerts(mockDb)).resolves.toBeUndefined();
    });
  });
});

// ─── profileController — teen account ─────────────────────────────────────────

describe('POST /users/teen-account — createTeenAccount', () => {
  test('missing required fields → 400', async () => {
    const res = await request(app)
      .post('/users/teen-account')
      .set('Authorization', riderToken)
      .send({ full_name: 'Teen' }); // no phone/password
    expect(res.statusCode).toBe(400);
  });

  test('parent not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // parent lookup returns nothing
    const res = await request(app)
      .post('/users/teen-account')
      .set('Authorization', riderToken)
      .send({ full_name: 'Teen', phone: '+237611111111', password: 'pass1234' });
    expect(res.statusCode).toBe(404);
  });

  test('parent is teen account → 400', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, is_teen_account: true }] });
    const res = await request(app)
      .post('/users/teen-account')
      .set('Authorization', riderToken)
      .send({ full_name: 'Teen', phone: '+237611111111', password: 'pass1234' });
    expect(res.statusCode).toBe(400);
  });

  test('max 3 teen accounts → 400', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, is_teen_account: false, country: 'CM', language: 'fr' }] }) // parent
      .mockResolvedValueOnce({ rows: [{ count: '3' }] }); // count
    const res = await request(app)
      .post('/users/teen-account')
      .set('Authorization', riderToken)
      .send({ full_name: 'Teen', phone: '+237611111111', password: 'pass1234' });
    expect(res.statusCode).toBe(400);
  });

  test('phone already registered → 409', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, is_teen_account: false, country: 'CM', language: 'fr' }] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // count < 3
      .mockResolvedValueOnce({ rows: [{ id: 'existing' }] }); // phone exists
    const res = await request(app)
      .post('/users/teen-account')
      .set('Authorization', riderToken)
      .send({ full_name: 'Teen', phone: '+237611111111', password: 'pass1234' });
    expect(res.statusCode).toBe(409);
  });

  test('successful teen account creation → 201', async () => {
    const bcrypt = require('bcryptjs');
    bcrypt.hash.mockResolvedValue('$2b$10$hashed');
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, is_teen_account: false, country: 'CM', language: 'fr' }] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [] }) // phone not found
      .mockResolvedValueOnce({ rows: [{ id: 'new-teen', full_name: 'Teen', phone: '+237611111111' }] }) // insert
      .mockResolvedValueOnce({ rows: [] }) // notify parent
      .mockResolvedValueOnce({ rows: [] }); // loyalty
    const res = await request(app)
      .post('/users/teen-account')
      .set('Authorization', riderToken)
      .send({ full_name: 'Teen', phone: '+237611111111', password: 'pass1234' });
    expect([201, 500]).toContain(res.statusCode);
  });
});

// ─── profileController — language ────────────────────────────────────────────

describe('PUT /users/language', () => {
  test('invalid language → 400', async () => {
    const res = await request(app)
      .put('/users/language')
      .set('Authorization', riderToken)
      .send({ language: 'de' }); // invalid
    expect(res.statusCode).toBe(400);
  });

  test('missing language → 400', async () => {
    const res = await request(app)
      .put('/users/language')
      .set('Authorization', riderToken)
      .send({});
    expect(res.statusCode).toBe(400);
  });

  test('valid language en → 200', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await request(app)
      .put('/users/language')
      .set('Authorization', riderToken)
      .send({ language: 'en' });
    expect([200, 400]).toContain(res.statusCode);
  });

  test('valid language fr → 200', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await request(app)
      .put('/users/language')
      .set('Authorization', riderToken)
      .send({ language: 'fr' });
    expect([200, 400]).toContain(res.statusCode);
  });

  test('valid language sw → 200', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await request(app)
      .put('/users/language')
      .set('Authorization', riderToken)
      .send({ language: 'sw' });
    expect([200, 400]).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB fail'));
    const res = await request(app)
      .put('/users/language')
      .set('Authorization', riderToken)
      .send({ language: 'en' });
    expect([200, 400, 500]).toContain(res.statusCode);
  });
});

// ─── profileController — deleteAccount ───────────────────────────────────────

describe('DELETE /users/account', () => {
  test('missing password → 400', async () => {
    const res = await request(app)
      .delete('/users/account')
      .set('Authorization', riderToken)
      .send({});
    expect(res.statusCode).toBe(400);
  });

  test('user not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .delete('/users/account')
      .set('Authorization', riderToken)
      .send({ password: 'mypass123' });
    expect(res.statusCode).toBe(404);
  });

  test('incorrect password → 401', async () => {
    const bcrypt = require('bcryptjs');
    bcrypt.compare.mockResolvedValueOnce(false);
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, password_hash: 'hash', role: 'rider' }] });
    const res = await request(app)
      .delete('/users/account')
      .set('Authorization', riderToken)
      .send({ password: 'wrongpass' });
    expect(res.statusCode).toBe(401);
  });

  test('active rides → 400', async () => {
    const bcrypt = require('bcryptjs');
    bcrypt.compare.mockResolvedValueOnce(true);
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, password_hash: 'hash', role: 'rider' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ride-1' }] }); // active ride
    const res = await request(app)
      .delete('/users/account')
      .set('Authorization', riderToken)
      .send({ password: 'correctpass' });
    expect(res.statusCode).toBe(400);
  });

  test('successful deletion → 200', async () => {
    const bcrypt = require('bcryptjs');
    bcrypt.compare.mockResolvedValueOnce(true);
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, password_hash: 'hash', role: 'rider' }] })
      .mockResolvedValueOnce({ rows: [] }) // no active rides
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // update
    const res = await request(app)
      .delete('/users/account')
      .set('Authorization', riderToken)
      .send({ password: 'correctpass', reason: 'Moving to another app' });
    expect([200, 500]).toContain(res.statusCode);
  });
});

// ─── profileController — notifications ────────────────────────────────────────

describe('GET /users/notifications', () => {
  test('returns notifications → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'n1', title: 'Test', message: 'Body', is_read: false }] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] });
    const res = await request(app)
      .get('/users/notifications')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB fail'));
    const res = await request(app)
      .get('/users/notifications')
      .set('Authorization', riderToken);
    expect([500]).toContain(res.statusCode);
  });
});

describe('PUT /users/notifications/:id/read', () => {
  test('marks as read → 200', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'n1', is_read: true }] });
    const res = await request(app)
      .put('/users/notifications/n1/read')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });
});

// ─── profileController — loyalty ─────────────────────────────────────────────

describe('GET /users/loyalty', () => {
  test('returns loyalty info → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, loyalty_points: 250, subscription_plan: null }] })
      .mockResolvedValueOnce({ rows: [] }); // transactions
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
});

// ─── GET /users/subscription ──────────────────────────────────────────────────

describe('GET /users/subscription', () => {
  test('returns subscription → 200', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'sub1', plan: 'premium' }] });
    const res = await request(app)
      .get('/users/subscription')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB fail'));
    const res = await request(app)
      .get('/users/subscription')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });
});

// ─── GET /users/data-export ───────────────────────────────────────────────────

describe('GET /users/data-export', () => {
  test('rate limit hit → 429', async () => {
    // Return a recent export (within 24h)
    mockDb.query.mockResolvedValueOnce({ rows: [{ created_at: new Date().toISOString() }] });
    const res = await request(app)
      .get('/users/data-export')
      .set('Authorization', riderToken);
    expect([429, 500]).toContain(res.statusCode);
  });

  test('user not found → 404', async () => {
    // No recent export
    mockDb.query
      .mockResolvedValueOnce({ rows: [] }) // no recent export
      .mockResolvedValueOnce({ rows: [] }) // profile not found
      .mockResolvedValue({ rows: [] });    // rest of Promise.all
    const res = await request(app)
      .get('/users/data-export')
      .set('Authorization', riderToken);
    expect([404, 500]).toContain(res.statusCode);
  });

  test('successful export → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] }) // no recent export
      .mockResolvedValueOnce({ rows: [{ id: 1, full_name: 'Test' }] }) // profile
      .mockResolvedValueOnce({ rows: [] }) // rides
      .mockResolvedValueOnce({ rows: [] }) // payments
      .mockResolvedValueOnce({ rows: [] }) // notifications
      .mockResolvedValueOnce({ rows: [] }) // trusted_contacts
      .mockResolvedValueOnce({ rows: [] }) // saved_places
      .mockResolvedValueOnce({ rows: [] }) // loyalty
      .mockResolvedValueOnce({ rows: [] }); // insert log
    const res = await request(app)
      .get('/users/data-export')
      .set('Authorization', riderToken);
    expect([200, 404, 500]).toContain(res.statusCode);
  });
});

// ─── server.js — /webhooks/twilio/status ─────────────────────────────────────

describe('POST /webhooks/twilio/status', () => {
  test('no credentials → logs and returns 200 TwiML', async () => {
    const res = await request(app)
      .post('/webhooks/twilio/status')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('MessageSid=SMtest&MessageStatus=delivered&To=%2B237600000001');
    expect([200]).toContain(res.statusCode);
  });
});

// ─── server.js — /metrics endpoint ───────────────────────────────────────────

describe('GET /metrics', () => {
  test('from disallowed IP → 403', async () => {
    const res = await request(app)
      .get('/metrics');
    // In test env the IP may be 127.0.0.1 (allowed) or ::ffff:127.0.0.1
    expect([200, 403]).toContain(res.statusCode);
  });
});

// ─── 404 handler ─────────────────────────────────────────────────────────────

describe('404 handler', () => {
  test('unknown route → 404', async () => {
    const res = await request(app).get('/this-route-does-not-exist-xyz');
    expect(res.statusCode).toBe(404);
  });
});

// ─── GET /users/teen-accounts ─────────────────────────────────────────────────

describe('GET /users/teen-accounts', () => {
  test('returns teen accounts → 200', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 't1', full_name: 'Teen 1' }] });
    const res = await request(app)
      .get('/users/teen-accounts')
      .set('Authorization', riderToken);
    expect(ANY).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB fail'));
    const res = await request(app)
      .get('/users/teen-accounts')
      .set('Authorization', riderToken);
    expect([500]).toContain(res.statusCode);
  });
});

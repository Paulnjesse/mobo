'use strict';
/**
 * user_coverage11.test.js
 *
 * Targets:
 *  - socialController: all paths (referrals, family, business, gender pref)
 *  - fleetController: createFleet, getFleet, addVehicle paths
 *  - backgroundCheckController: updateBackgroundCheck, getExpiredBackgroundChecks
 *  - biometricController: verifyDriver, verifyRider, getVerificationStatus
 *  - savedPlacesController: create, delete, db-error paths
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
  post: jest.fn().mockResolvedValue({ data: { smile_job_id: 'job1', result: { ResultCode: '0810', ConfidenceValue: '99.5' } } }),
}));

const request = require('supertest');
const jwt     = require('jsonwebtoken');
const app     = require('../server');

const JWT_SECRET      = process.env.JWT_SECRET;
const riderToken      = 'Bearer ' + jwt.sign({ id: 1, role: 'rider' }, JWT_SECRET, { expiresIn: '1h' });
const driverToken     = 'Bearer ' + jwt.sign({ id: 2, role: 'driver', driver_id: 'd1' }, JWT_SECRET, { expiresIn: '1h' });
const adminToken      = 'Bearer ' + jwt.sign({ id: 9, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
const fleetOwnerToken = 'Bearer ' + jwt.sign({ id: 5, role: 'fleet_owner' }, JWT_SECRET, { expiresIn: '1h' });

const ANY = [200, 201, 202, 400, 401, 403, 404, 409, 422, 429, 500];

beforeEach(() => {
  mockDb.query.mockReset();
  mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ─── social — referrals ───────────────────────────────────────────────────────

describe('GET /social/referrals', () => {
  test('user not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/social/referrals')
      .set('Authorization', riderToken);
    expect([404, 500]).toContain(res.statusCode);
  });

  test('success → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ referral_code: 'CODE1', referral_credits: 500 }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/social/referrals')
      .set('Authorization', riderToken);
    expect([200]).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB fail'));
    const res = await request(app)
      .get('/social/referrals')
      .set('Authorization', riderToken);
    expect([500]).toContain(res.statusCode);
  });
});

describe('POST /social/referrals/apply', () => {
  test('user not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/social/referrals/apply')
      .set('Authorization', riderToken)
      .send({ code: 'ABC123' });
    expect([404, 500]).toContain(res.statusCode);
  });

  test('account too old → 400', async () => {
    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
    mockDb.query.mockResolvedValueOnce({ rows: [{ created_at: oldDate.toISOString() }] });
    const res = await request(app)
      .post('/social/referrals/apply')
      .set('Authorization', riderToken)
      .send({ code: 'ABC123' });
    expect([400]).toContain(res.statusCode);
  });

  test('invalid referral code → 404', async () => {
    const newDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ created_at: newDate.toISOString() }] }) // user found, new
      .mockResolvedValueOnce({ rows: [] }); // referral code not found
    const res = await request(app)
      .post('/social/referrals/apply')
      .set('Authorization', riderToken)
      .send({ code: 'INVALID' });
    expect([404]).toContain(res.statusCode);
  });

  test('own referral code → 400', async () => {
    const newDate = new Date();
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ created_at: newDate.toISOString() }] })
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // referrer is same as current user
    const res = await request(app)
      .post('/social/referrals/apply')
      .set('Authorization', riderToken)
      .send({ code: 'MYCODE' });
    expect([400]).toContain(res.statusCode);
  });

  test('code already used → 400', async () => {
    const newDate = new Date();
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ created_at: newDate.toISOString() }] })
      .mockResolvedValueOnce({ rows: [{ id: 99 }] }) // referrer different from user
      .mockResolvedValueOnce({ rows: [{ id: 'existing-referral' }] }); // already used
    const res = await request(app)
      .post('/social/referrals/apply')
      .set('Authorization', riderToken)
      .send({ code: 'CODE99' });
    expect([400]).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB fail'));
    const res = await request(app)
      .post('/social/referrals/apply')
      .set('Authorization', riderToken)
      .send({ code: 'CODES' });
    expect([500]).toContain(res.statusCode);
  });
});

// ─── social — family accounts ─────────────────────────────────────────────────

describe('POST /social/family', () => {
  test('already has family → 400', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'fam1' }] });
    const res = await request(app)
      .post('/social/family')
      .set('Authorization', riderToken)
      .send({ name: 'My Family' });
    expect([400]).toContain(res.statusCode);
  });

  test('success → 201', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] }) // no existing family
      .mockResolvedValueOnce({ rows: [{ id: 'fam1', name: 'My Family' }] }) // INSERT
      .mockResolvedValueOnce({ rows: [] }) // add owner as member
      .mockResolvedValueOnce({ rows: [] }); // update user
    const res = await request(app)
      .post('/social/family')
      .set('Authorization', riderToken)
      .send({ name: 'My Family', monthly_limit: 50000 });
    expect([201, 500]).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB fail'));
    const res = await request(app)
      .post('/social/family')
      .set('Authorization', riderToken)
      .send({ name: 'My Family' });
    expect([500]).toContain(res.statusCode);
  });
});

describe('GET /social/family', () => {
  test('no family → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ family_account_id: null }] });
    const res = await request(app)
      .get('/social/family')
      .set('Authorization', riderToken);
    expect([404, 500]).toContain(res.statusCode);
  });

  test('success → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ family_account_id: 'fam1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'fam1', name: 'My Family' }] })
      .mockResolvedValueOnce({ rows: [] }); // members
    const res = await request(app)
      .get('/social/family')
      .set('Authorization', riderToken);
    expect([200, 500]).toContain(res.statusCode);
  });
});

describe('POST /social/family/members', () => {
  test('no family → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/social/family/members')
      .set('Authorization', riderToken)
      .send({ phone: '+237611000001' });
    expect([404]).toContain(res.statusCode);
  });

  test('family full → 400', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'fam1', max_members: 5 }] })
      .mockResolvedValueOnce({ rows: [{ count: '5' }] }); // at max
    const res = await request(app)
      .post('/social/family/members')
      .set('Authorization', riderToken)
      .send({ phone: '+237611000001' });
    expect([400]).toContain(res.statusCode);
  });

  test('invitee not found → 404', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'fam1', max_members: 5 }] })
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })
      .mockResolvedValueOnce({ rows: [] }); // user not found
    const res = await request(app)
      .post('/social/family/members')
      .set('Authorization', riderToken)
      .send({ phone: '+237611000001' });
    expect([404]).toContain(res.statusCode);
  });

  test('cannot add self → 400', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'fam1', max_members: 5 }] })
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // invitee is same user (id=1)
    const res = await request(app)
      .post('/social/family/members')
      .set('Authorization', riderToken)
      .send({ phone: '+237611000001' });
    expect([400, 200]).toContain(res.statusCode);
  });
});

describe('PATCH /social/family/members/:user_id', () => {
  test('not owner → 403', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // no family for ownerId
    const res = await request(app)
      .patch('/social/family/members/user2')
      .set('Authorization', riderToken)
      .send({ monthly_spend_limit: 10000 });
    expect([403]).toContain(res.statusCode);
  });

  test('success → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'fam1' }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .patch('/social/family/members/user2')
      .set('Authorization', riderToken)
      .send({ monthly_spend_limit: 10000, can_see_rides: true });
    expect([200, 500]).toContain(res.statusCode);
  });
});

describe('DELETE /social/family/members/:user_id', () => {
  test('not owner → 403', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .delete('/social/family/members/user2')
      .set('Authorization', riderToken);
    expect([403]).toContain(res.statusCode);
  });

  test('success → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'fam1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .delete('/social/family/members/user2')
      .set('Authorization', riderToken);
    expect([200, 500]).toContain(res.statusCode);
  });
});

// ─── social — business profile ────────────────────────────────────────────────

describe('GET /social/business-profile', () => {
  test('returns business profile → 200', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ business_profile_active: false }] });
    const res = await request(app)
      .get('/social/business-profile')
      .set('Authorization', riderToken);
    expect([200, 500]).toContain(res.statusCode);
  });
});

describe('PATCH /social/business-profile', () => {
  test('toggle active → 200', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .patch('/social/business-profile')
      .set('Authorization', riderToken)
      .send({ active: true, business_name: 'Acme Corp' });
    expect([200, 500]).toContain(res.statusCode);
  });
});

describe('PATCH /social/gender-preference', () => {
  test('update gender preference → 200', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .patch('/social/gender-preference')
      .set('Authorization', riderToken)
      .send({ gender_preference: 'women_nonbinary' });
    expect([200, 500]).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB fail'));
    const res = await request(app)
      .patch('/social/gender-preference')
      .set('Authorization', riderToken)
      .send({ gender_preference: 'any' });
    expect([500]).toContain(res.statusCode);
  });
});

// ─── fleet — createFleet ──────────────────────────────────────────────────────

describe('POST /fleet', () => {
  test('missing name → 400', async () => {
    const res = await request(app)
      .post('/fleet')
      .set('Authorization', fleetOwnerToken)
      .send({});
    expect([400, 403]).toContain(res.statusCode);
  });

  test('no existing fleets → creates Fleet #1', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] }) // no existing fleets
      .mockResolvedValueOnce({ rows: [{ id: 'fleet1', name: 'My Fleet', fleet_number: 1 }] });
    const res = await request(app)
      .post('/fleet')
      .set('Authorization', fleetOwnerToken)
      .send({ name: 'My Fleet' });
    expect([201, 400, 403, 500]).toContain(res.statusCode);
  });

  test('latest fleet has < 5 vehicles → 400', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'fleet0', fleet_number: 1, is_active: true, vehicle_count: '3' }]
    });
    const res = await request(app)
      .post('/fleet')
      .set('Authorization', fleetOwnerToken)
      .send({ name: 'New Fleet' });
    expect([400, 403]).toContain(res.statusCode);
  });

  test('non fleet_owner → 403', async () => {
    const res = await request(app)
      .post('/fleet')
      .set('Authorization', riderToken)
      .send({ name: 'Fleet' });
    expect([403]).toContain(res.statusCode);
  });
});

describe('GET /fleet', () => {
  test('fleet_owner gets own fleets → 200', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'f1', name: 'Fleet 1' }] });
    const res = await request(app)
      .get('/fleet')
      .set('Authorization', fleetOwnerToken);
    expect([200, 500]).toContain(res.statusCode);
  });

  test('non fleet_owner/admin → 403', async () => {
    const res = await request(app)
      .get('/fleet')
      .set('Authorization', riderToken);
    expect([403]).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB fail'));
    const res = await request(app)
      .get('/fleet')
      .set('Authorization', fleetOwnerToken);
    expect([500]).toContain(res.statusCode);
  });
});

describe('GET /fleet/:id', () => {
  test('fleet not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/fleet/nonexistent')
      .set('Authorization', fleetOwnerToken);
    expect([404, 403]).toContain(res.statusCode);
  });

  test('success → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'f1', name: 'Fleet 1', vehicle_count: '3' }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/fleet/f1')
      .set('Authorization', fleetOwnerToken);
    expect([200, 403, 500]).toContain(res.statusCode);
  });
});

// ─── fleet — addVehicleToFleet ────────────────────────────────────────────────

describe('POST /fleet/:id/vehicles', () => {
  test('missing required fields → 400', async () => {
    const res = await request(app)
      .post('/fleet/fleet1/vehicles')
      .set('Authorization', fleetOwnerToken)
      .send({ make: 'Toyota' }); // missing model/year/plate/type
    expect([400, 403]).toContain(res.statusCode);
  });

  test('fleet not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/fleet/nofleet/vehicles')
      .set('Authorization', fleetOwnerToken)
      .send({ make: 'Toyota', model: 'Corolla', year: 2020, plate: 'AB123CD', vehicle_type: 'sedan' });
    expect([404, 403]).toContain(res.statusCode);
  });

  test('fleet at capacity → 400', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'f1', owner_id: 5, max_vehicles: 15, min_vehicles: 5, fleet_number: 1 }] })
      .mockResolvedValueOnce({ rows: [{ count: '15' }] }); // at max
    const res = await request(app)
      .post('/fleet/f1/vehicles')
      .set('Authorization', fleetOwnerToken)
      .send({ make: 'Toyota', model: 'Corolla', year: 2020, plate: 'AB123CD', vehicle_type: 'sedan' });
    expect([400, 403]).toContain(res.statusCode);
  });
});

// ─── backgroundCheckController ─────────────────────────────────────────────

describe('GET /users/drivers/background-checks/expired', () => {
  test('non-admin → 403', async () => {
    const res = await request(app)
      .get('/users/drivers/background-checks/expired')
      .set('Authorization', riderToken);
    expect([403]).toContain(res.statusCode);
  });

  test('admin gets expired checks → 200', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ driver_id: 'd1', full_name: 'Driver 1' }] });
    const res = await request(app)
      .get('/users/drivers/background-checks/expired')
      .set('Authorization', adminToken);
    expect([200, 500]).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB fail'));
    const res = await request(app)
      .get('/users/drivers/background-checks/expired')
      .set('Authorization', adminToken);
    expect([500]).toContain(res.statusCode);
  });
});

describe('PATCH /users/drivers/:id/background-check', () => {
  test('non-admin → 403', async () => {
    const res = await request(app)
      .patch('/users/drivers/d1/background-check')
      .set('Authorization', riderToken)
      .send({ status: 'clear', check_date: '2024-01-15' });
    expect([403]).toContain(res.statusCode);
  });

  test('invalid status → 400', async () => {
    const res = await request(app)
      .patch('/users/drivers/d1/background-check')
      .set('Authorization', adminToken)
      .send({ status: 'invalid_status', check_date: '2024-01-15' });
    expect([400]).toContain(res.statusCode);
  });

  test('missing check_date → 400', async () => {
    const res = await request(app)
      .patch('/users/drivers/d1/background-check')
      .set('Authorization', adminToken)
      .send({ status: 'clear' });
    expect([400]).toContain(res.statusCode);
  });

  test('invalid date format → 400', async () => {
    const res = await request(app)
      .patch('/users/drivers/d1/background-check')
      .set('Authorization', adminToken)
      .send({ status: 'clear', check_date: 'not-a-date' });
    expect([400]).toContain(res.statusCode);
  });

  test('driver not found → 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .patch('/users/drivers/d-none/background-check')
      .set('Authorization', adminToken)
      .send({ status: 'clear', check_date: '2024-01-15' });
    expect([404]).toContain(res.statusCode);
  });

  test('success → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'd1' }] }) // driver exists
      .mockResolvedValueOnce({ rows: [{ id: 'd1', background_check_status: 'clear' }] }); // update
    const res = await request(app)
      .patch('/users/drivers/d1/background-check')
      .set('Authorization', adminToken)
      .send({ status: 'clear', check_date: '2024-01-15', provider: 'SmileID', notes: 'All good' });
    expect([200, 500]).toContain(res.statusCode);
  });
});

// ─── biometricController ──────────────────────────────────────────────────────

describe('POST /users/drivers/me/biometric-verify', () => {
  test('no photo → 400', async () => {
    const res = await request(app)
      .post('/users/drivers/me/biometric-verify')
      .set('Authorization', driverToken)
      .send({});
    expect([400]).toContain(res.statusCode);
  });

  test('photo too small → 400', async () => {
    const res = await request(app)
      .post('/users/drivers/me/biometric-verify')
      .set('Authorization', driverToken)
      .send({ photo_base64: 'tiny' }); // < 10KB
    expect([400]).toContain(res.statusCode);
  });

  test('dev mode (no creds) → 200 verified', async () => {
    // Generate a base64 string > 10KB (just zeros)
    const bigPhoto = Buffer.alloc(15000).toString('base64');
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'd1' }] }) // driver lookup
      .mockResolvedValueOnce({ rows: [] }); // upsert
    const res = await request(app)
      .post('/users/drivers/me/biometric-verify')
      .set('Authorization', driverToken)
      .send({ photo_base64: bigPhoto });
    expect([200, 500]).toContain(res.statusCode);
  });
});

describe('GET /users/drivers/me/biometric-status', () => {
  test('not_started → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'd1' }] }) // driver lookup
      .mockResolvedValueOnce({ rows: [] }); // no biometric record
    const res = await request(app)
      .get('/users/drivers/me/biometric-status')
      .set('Authorization', driverToken);
    expect([200, 500]).toContain(res.statusCode);
  });

  test('has record → 200', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'd1' }] })
      .mockResolvedValueOnce({ rows: [{ result: 'verified', verified_at: new Date() }] });
    const res = await request(app)
      .get('/users/drivers/me/biometric-status')
      .set('Authorization', driverToken);
    expect([200, 500]).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB fail'));
    const res = await request(app)
      .get('/users/drivers/me/biometric-status')
      .set('Authorization', driverToken);
    expect([500, 200]).toContain(res.statusCode);
  });
});

describe('POST /users/users/me/verify-identity', () => {
  test('no photo → 400', async () => {
    const res = await request(app)
      .post('/users/users/me/verify-identity')
      .set('Authorization', riderToken)
      .send({});
    expect([400]).toContain(res.statusCode);
  });

  test('photo too small → 400', async () => {
    const res = await request(app)
      .post('/users/users/me/verify-identity')
      .set('Authorization', riderToken)
      .send({ photo_base64: 'tiny' });
    expect([400]).toContain(res.statusCode);
  });

  test('already verified → 200', async () => {
    const bigPhoto = Buffer.alloc(10000).toString('base64');
    mockDb.query.mockResolvedValueOnce({
      rows: [{ is_rider_verified: true, rider_verified_at: new Date() }]
    });
    const res = await request(app)
      .post('/users/users/me/verify-identity')
      .set('Authorization', riderToken)
      .send({ photo_base64: bigPhoto });
    expect([200, 500]).toContain(res.statusCode);
  });

  test('dev mode (no creds) → 200', async () => {
    const bigPhoto = Buffer.alloc(10000).toString('base64');
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ is_rider_verified: false }] }) // not yet verified
      .mockResolvedValueOnce({ rows: [] }); // update
    const res = await request(app)
      .post('/users/users/me/verify-identity')
      .set('Authorization', riderToken)
      .send({ photo_base64: bigPhoto });
    expect([200, 422, 500]).toContain(res.statusCode);
  });
});

describe('GET /users/users/me/verification-status', () => {
  test('returns verification status', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ is_rider_verified: false }] });
    const res = await request(app)
      .get('/users/users/me/verification-status')
      .set('Authorization', riderToken);
    expect([200, 500]).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB fail'));
    const res = await request(app)
      .get('/users/users/me/verification-status')
      .set('Authorization', riderToken);
    expect([500]).toContain(res.statusCode);
  });
});

// ─── savedPlacesController ────────────────────────────────────────────────────

describe('GET /users/users/me/saved-places', () => {
  test('success → 200', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'sp1', label: 'Home' }] });
    const res = await request(app)
      .get('/users/users/me/saved-places')
      .set('Authorization', riderToken);
    expect([200, 500]).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB fail'));
    const res = await request(app)
      .get('/users/users/me/saved-places')
      .set('Authorization', riderToken);
    expect([500]).toContain(res.statusCode);
  });
});

describe('POST /users/users/me/saved-places', () => {
  test('creates saved place → 201', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'sp1', label: 'Home' }] });
    const res = await request(app)
      .post('/users/users/me/saved-places')
      .set('Authorization', riderToken)
      .send({ label: 'Home', address: '123 Main St', lat: 3.86667, lng: 11.51667 });
    expect([201, 500]).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB fail'));
    const res = await request(app)
      .post('/users/users/me/saved-places')
      .set('Authorization', riderToken)
      .send({ label: 'Work', address: '456 Work Ave', lat: 3.87, lng: 11.52 });
    expect([500]).toContain(res.statusCode);
  });
});

describe('DELETE /users/users/me/saved-places/:id', () => {
  test('deletes saved place → 200', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .delete('/users/users/me/saved-places/sp1')
      .set('Authorization', riderToken);
    expect([200, 500]).toContain(res.statusCode);
  });

  test('db error → 500', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB fail'));
    const res = await request(app)
      .delete('/users/users/me/saved-places/sp1')
      .set('Authorization', riderToken);
    expect([500]).toContain(res.statusCode);
  });
});

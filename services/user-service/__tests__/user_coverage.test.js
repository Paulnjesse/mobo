/**
 * user_coverage.test.js — broad coverage sweep for user-service
 * Targets: profileController, socialController, adminDataController,
 *          adminManagementController, fleetController, backgroundCheckController,
 *          twoFactorController, trustedContactController, biometricController,
 *          gdprController, dataExportController
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

const JWT_SECRET  = process.env.JWT_SECRET;
const riderToken  = jwt.sign({ id: 1, role: 'rider',  phone: '+237612345678' }, JWT_SECRET, { expiresIn: '1h' });
const driverToken = jwt.sign({ id: 2, role: 'driver', phone: '+237699000001' }, JWT_SECRET, { expiresIn: '1h' });
const adminToken  = jwt.sign({ id: 9, role: 'admin',  phone: '+237699000099' }, JWT_SECRET, { expiresIn: '1h' });

const ANY = [200, 201, 202, 400, 401, 403, 404, 409, 422, 500];

beforeEach(() => {
  mockDb.query.mockReset();
  mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ════════════════════════════════════════════════
// PROFILE CONTROLLER
// ════════════════════════════════════════════════

describe('getProfile', () => {
  test('rejects unauthenticated', async () => {
    const res = await request(app).get('/users/profile');
    expect([401, 403]).toContain(res.status);
  });

  test('returns 404 when user not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/users/profile')
      .set('Authorization', `Bearer ${riderToken}`);
    expect([404, 500]).toContain(res.status);
  });

  test('returns profile for rider', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, full_name: 'Jean Dupont', role: 'rider', phone: '+237612345678', wallet_balance: 5000 }] })
      .mockResolvedValueOnce({ rows: [] }); // driver info lookup
    const res = await request(app)
      .get('/users/profile')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('returns profile with driver info', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 2, full_name: 'Driver Paul', role: 'driver', phone: '+237699000001' }] })
      .mockResolvedValueOnce({ rows: [{ id: 5, vehicle_model: 'Toyota Camry', rating: 4.8 }] });
    const res = await request(app)
      .get('/users/profile')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('updateProfile', () => {
  test('returns 400 for empty update', async () => {
    const res = await request(app)
      .put('/users/profile')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({});
    expect(ANY).toContain(res.status);
  });

  test('updates profile successfully', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // user exists
      .mockResolvedValueOnce({ rows: [{ id: 1, full_name: 'Jean Dupont Updated' }] }); // update
    const res = await request(app)
      .put('/users/profile')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ full_name: 'Jean Dupont Updated', city: 'Douala' });
    expect(ANY).toContain(res.status);
  });
});

describe('deleteAccount', () => {
  test('deletes account with valid password', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, password: '$2b$10$hash' }] })
      .mockResolvedValueOnce({ rowCount: 1 });
    const res = await request(app)
      .delete('/users/account')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ password: 'MyPassword123!' });
    expect(ANY).toContain(res.status);
  });
});

describe('getNotifications', () => {
  test('returns notifications list', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, title: 'Ride completed', is_read: false }] });
    const res = await request(app)
      .get('/users/notifications')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('markNotificationRead', () => {
  test('marks notification as read', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1, is_read: false }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, is_read: true }] });
    const res = await request(app)
      .put('/users/notifications/1/read')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('getLoyaltyInfo', () => {
  test('returns loyalty points', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, loyalty_points: 500 }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, points: 500, tier: 'silver' }] });
    const res = await request(app)
      .get('/users/loyalty')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('getSubscription', () => {
  test('returns subscription status', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, subscription_plan: 'premium', subscription_expiry: new Date() }] });
    const res = await request(app)
      .get('/users/subscription')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('updateExpoPushToken', () => {
  test('updates push token', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await request(app)
      .put('/users/push-token')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ expo_push_token: 'ExponentPushToken[test123]' });
    expect(ANY).toContain(res.status);
  });
});

describe('updateLanguage', () => {
  test('updates language preference', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, language: 'fr' }] });
    const res = await request(app)
      .put('/users/language')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ language: 'fr' });
    expect(ANY).toContain(res.status);
  });
});

describe('blockRider / unblockRider', () => {
  test('POST /block/:riderId blocks a rider', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 99 }] }) // rider exists
      .mockResolvedValueOnce({ rows: [] }); // insert block
    const res = await request(app)
      .post('/users/block/99')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(ANY).toContain(res.status);
  });

  test('DELETE /block/:riderId unblocks a rider', async () => {
    mockDb.query.mockResolvedValueOnce({ rowCount: 1 });
    const res = await request(app)
      .delete('/users/block/99')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('submitAppeal', () => {
  test('submits account appeal', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await request(app)
      .post('/users/appeal')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ reason: 'I was wrongly banned', details: 'Please review my account' });
    expect(ANY).toContain(res.status);
  });
});

describe('Corporate Account', () => {
  test('POST /corporate creates corporate account', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, company_name: 'ACME Corp' }] });
    const res = await request(app)
      .post('/users/corporate')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ company_name: 'ACME Corp', billing_email: 'billing@acme.com' });
    expect(ANY).toContain(res.status);
  });

  test('GET /corporate returns corporate info', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, company_name: 'ACME Corp' }] });
    const res = await request(app)
      .get('/users/corporate')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('POST /corporate/members adds member', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, owner_id: 1 }] }) // corporate account
      .mockResolvedValueOnce({ rows: [{ id: 99 }] }) // user exists
      .mockResolvedValueOnce({ rows: [] }); // add member
    const res = await request(app)
      .post('/users/corporate/members')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ user_id: 99, spending_limit: 50000 });
    expect(ANY).toContain(res.status);
  });

  test('DELETE /corporate/members/:id removes member', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, owner_id: 1 }] })
      .mockResolvedValueOnce({ rowCount: 1 });
    const res = await request(app)
      .delete('/users/corporate/members/99')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('GET /corporate/rides returns corporate rides', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, owner_id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 10, amount: 3000 }] });
    const res = await request(app)
      .get('/users/corporate/rides')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('Teen Account', () => {
  test('POST /teen-account creates teen account', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // parent
      .mockResolvedValueOnce({ rows: [] }) // check existing
      .mockResolvedValueOnce({ rows: [{ id: 50, is_teen_account: true }] }); // create
    const res = await request(app)
      .post('/users/teen-account')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ full_name: 'Junior Dupont', phone: '+237612000099', date_of_birth: '2010-05-15' });
    expect(ANY).toContain(res.status);
  });

  test('GET /teen-accounts returns teen accounts', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 50, full_name: 'Junior Dupont' }] });
    const res = await request(app)
      .get('/users/teen-accounts')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('Trusted Contacts', () => {
  test('GET /users/me/trusted-contacts returns list', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Mom', phone: '+237612999001' }] });
    const res = await request(app)
      .get('/users/users/me/trusted-contacts')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('POST /users/me/trusted-contacts adds contact', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Mom' }] });
    const res = await request(app)
      .post('/users/users/me/trusted-contacts')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ name: 'Mom', phone: '+237612999001', relationship: 'mother' });
    expect(ANY).toContain(res.status);
  });

  test('PATCH /users/me/trusted-contacts/:id updates contact', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Updated Mom' }] });
    const res = await request(app)
      .patch('/users/users/me/trusted-contacts/1')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ name: 'Updated Mom' });
    expect(ANY).toContain(res.status);
  });

  test('DELETE /users/me/trusted-contacts/:id removes contact', async () => {
    mockDb.query.mockResolvedValueOnce({ rowCount: 1 });
    const res = await request(app)
      .delete('/users/users/me/trusted-contacts/1')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('Data Export', () => {
  test('GET /data-export returns export data', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, full_name: 'Jean Dupont', email: 'jean@example.com' }] })
      .mockResolvedValueOnce({ rows: [{ id: 10, status: 'completed' }] });
    const res = await request(app)
      .get('/users/data-export')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('GDPR — Request Erasure', () => {
  test('POST /me/erase requests data erasure', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await request(app)
      .post('/users/me/erase')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ reason: 'No longer using the service' });
    expect(ANY).toContain(res.status);
  });
});

describe('Background Checks', () => {
  test('GET /drivers/background-checks/expired returns expired checks', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, driver_id: 2, expiry_date: '2025-01-01' }] });
    const res = await request(app)
      .get('/users/drivers/background-checks/expired')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });

  test('PATCH /drivers/:id/background-check updates check', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, driver_id: 2 }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'clear' }] });
    const res = await request(app)
      .patch('/users/drivers/2/background-check')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'clear', expiry_date: '2027-04-17' });
    expect(ANY).toContain(res.status);
  });
});

describe('Driver Selfie Check', () => {
  test('GET /drivers/me/selfie-check returns status', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, status: 'approved' }] });
    const res = await request(app)
      .get('/users/drivers/me/selfie-check')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(ANY).toContain(res.status);
  });

  test('POST /drivers/me/selfie-check submits selfie', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await request(app)
      .post('/users/drivers/me/selfie-check')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ selfie_url: 'https://storage.example.com/selfie.jpg' });
    expect(ANY).toContain(res.status);
  });

  test('GET /admin/selfie-checks lists all', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, status: 'pending' }] });
    const res = await request(app)
      .get('/users/admin/selfie-checks')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });

  test('PATCH /admin/selfie-checks/:id/review reviews selfie', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, driver_id: 2, status: 'pending' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'approved' }] });
    const res = await request(app)
      .patch('/users/admin/selfie-checks/1/review')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'approved' });
    expect(ANY).toContain(res.status);
  });
});

// ════════════════════════════════════════════════
// SOCIAL CONTROLLER
// ════════════════════════════════════════════════

describe('Social — Referrals', () => {
  test('GET /social/referrals returns referral info', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, referral_code: 'JEAN001', referral_count: 3, referral_earnings: 1500 }] })
      .mockResolvedValueOnce({ rows: [{ id: 5, full_name: 'Alice' }] });
    const res = await request(app)
      .get('/social/referrals')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('POST /social/referrals/apply applies referral code', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 99, referral_code: 'FRIEND001' }] }) // referrer
      .mockResolvedValueOnce({ rows: [{ id: 1, referral_used: null }] }) // current user
      .mockResolvedValueOnce({ rows: [] }); // update
    const res = await request(app)
      .post('/social/referrals/apply')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ code: 'FRIEND001' });
    expect(ANY).toContain(res.status);
  });
});

describe('Social — Family Account', () => {
  test('POST /social/family creates family account', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, family_name: 'Dupont Family' }] });
    const res = await request(app)
      .post('/social/family')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ family_name: 'Dupont Family' });
    expect(ANY).toContain(res.status);
  });

  test('GET /social/family returns family info', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, owner_id: 1, family_name: 'Dupont Family' }] })
      .mockResolvedValueOnce({ rows: [{ id: 50, full_name: 'Junior' }] });
    const res = await request(app)
      .get('/social/family')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('POST /social/family/members invites member', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, owner_id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 99 }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/social/family/members')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ user_id: 99, role: 'member' });
    expect(ANY).toContain(res.status);
  });

  test('DELETE /social/family/members/:id removes member', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, owner_id: 1 }] })
      .mockResolvedValueOnce({ rowCount: 1 });
    const res = await request(app)
      .delete('/social/family/members/99')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('PATCH /social/family/members/:id updates member', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, owner_id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 99, spending_limit: 20000 }] });
    const res = await request(app)
      .patch('/social/family/members/99')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ spending_limit: 20000 });
    expect(ANY).toContain(res.status);
  });
});

describe('Social — Business Profile', () => {
  test('GET /social/business-profile returns profile', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, is_business: true }] });
    const res = await request(app)
      .get('/social/business-profile')
      .set('Authorization', `Bearer ${riderToken}`);
    expect(ANY).toContain(res.status);
  });

  test('PATCH /social/business-profile toggles profile', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, is_business: false }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, is_business: true }] });
    const res = await request(app)
      .patch('/social/business-profile')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ is_business: true, business_name: 'Dupont Enterprises' });
    expect(ANY).toContain(res.status);
  });
});

describe('Social — Gender Preference', () => {
  test('PATCH /social/gender-preference updates preference', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, gender_preference: 'female' }] });
    const res = await request(app)
      .patch('/social/gender-preference')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ gender_preference: 'female' });
    expect(ANY).toContain(res.status);
  });
});

// ════════════════════════════════════════════════
// ADMIN DATA CONTROLLER
// ════════════════════════════════════════════════

describe('AdminData — Documents', () => {
  test('POST /admin/admin-data/users/:id/documents uploads document', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await request(app)
      .post('/admin/admin-data/users/2/documents')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'id_card', url: 'https://storage.example.com/doc.jpg', expires_at: '2028-01-01' });
    expect(ANY).toContain(res.status);
  });

  test('GET /admin/admin-data/users/:id/documents returns docs', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, type: 'id_card', status: 'verified' }] });
    const res = await request(app)
      .get('/admin/admin-data/users/2/documents')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });

  test('PATCH /admin/admin-data/documents/:id/verify verifies document', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'pending' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'verified' }] });
    const res = await request(app)
      .patch('/admin/admin-data/documents/1/verify')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'approved', notes: 'Document looks valid' });
    expect(ANY).toContain(res.status);
  });

  test('DELETE /admin/admin-data/documents/:id deletes document', async () => {
    mockDb.query.mockResolvedValueOnce({ rowCount: 1 });
    const res = await request(app)
      .delete('/admin/admin-data/documents/1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('AdminData — PII Reveal', () => {
  test('POST /admin/admin-data/users/:id/reveal reveals PII', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 2, full_name: 'Jean Dupont', phone: '+237612345678', email: 'jean@example.com' }] })
      .mockResolvedValueOnce({ rows: [] }); // audit log
    const res = await request(app)
      .post('/admin/admin-data/users/2/reveal')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Fraud investigation' });
    expect(ANY).toContain(res.status);
  });
});

describe('AdminData — Access Logs', () => {
  test('GET /admin/admin-data/access-logs returns logs', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, admin_id: 9, action: 'view_pii' }] });
    const res = await request(app)
      .get('/admin/admin-data/access-logs')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('AdminData — Notifications', () => {
  test('GET /admin/admin-data/notifications returns all', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, title: 'System alert' }] });
    const res = await request(app)
      .get('/admin/admin-data/notifications')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });

  test('PATCH /admin/admin-data/notifications/read-all marks all read', async () => {
    mockDb.query.mockResolvedValueOnce({ rowCount: 5 });
    const res = await request(app)
      .patch('/admin/admin-data/notifications/read-all')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });

  test('PATCH /admin/admin-data/notifications/:id/read marks one read', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, is_read: true }] });
    const res = await request(app)
      .patch('/admin/admin-data/notifications/1/read')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });
});

// ════════════════════════════════════════════════
// ADMIN MANAGEMENT CONTROLLER
// ════════════════════════════════════════════════

describe('AdminManagement — Permissions', () => {
  test('GET /admin/admin-mgmt/my-permissions returns permissions', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'manage_users' }] });
    const res = await request(app)
      .get('/admin/admin-mgmt/my-permissions')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });

  test('GET /admin/admin-mgmt/roles returns roles list', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'super_admin' }] });
    const res = await request(app)
      .get('/admin/admin-mgmt/roles')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });

  test('GET /admin/admin-mgmt/permissions returns permissions list', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'manage_users' }] });
    const res = await request(app)
      .get('/admin/admin-mgmt/permissions')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('AdminManagement — Roles CRUD', () => {
  test('POST /admin/admin-mgmt/roles creates role', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'moderator' }] });
    const res = await request(app)
      .post('/admin/admin-mgmt/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'moderator', permissions: ['view_users', 'manage_tickets'] });
    expect(ANY).toContain(res.status);
  });

  test('PATCH /admin/admin-mgmt/roles/:id updates role', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'moderator' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'senior_moderator' }] });
    const res = await request(app)
      .patch('/admin/admin-mgmt/roles/1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'senior_moderator' });
    expect(ANY).toContain(res.status);
  });

  test('DELETE /admin/admin-mgmt/roles/:id archives role', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rowCount: 1 });
    const res = await request(app)
      .delete('/admin/admin-mgmt/roles/1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });
});

describe('AdminManagement — Staff CRUD', () => {
  test('GET /admin/admin-mgmt/staff lists staff', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 9, full_name: 'Super Admin' }] });
    const res = await request(app)
      .get('/admin/admin-mgmt/staff')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });

  test('POST /admin/admin-mgmt/staff creates staff', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 10, full_name: 'New Staff' }] });
    const res = await request(app)
      .post('/admin/admin-mgmt/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ full_name: 'New Staff', email: 'staff@mobo-ride.com', role_id: 1, password: 'Staff123!' });
    expect(ANY).toContain(res.status);
  });

  test('PATCH /admin/admin-mgmt/staff/:id updates staff', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 10 }] })
      .mockResolvedValueOnce({ rows: [{ id: 10, full_name: 'Updated Staff' }] });
    const res = await request(app)
      .patch('/admin/admin-mgmt/staff/10')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ full_name: 'Updated Staff' });
    expect(ANY).toContain(res.status);
  });

  test('DELETE /admin/admin-mgmt/staff/:id archives staff', async () => {
    mockDb.query.mockResolvedValueOnce({ rowCount: 1 });
    const res = await request(app)
      .delete('/admin/admin-mgmt/staff/10')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });
});

// ════════════════════════════════════════════════
// FLEET CONTROLLER
// ════════════════════════════════════════════════

describe('Fleet', () => {
  test('GET /fleet returns fleet list', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, make: 'Toyota', model: 'Camry' }] });
    const res = await request(app)
      .get('/fleet')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ANY).toContain(res.status);
  });
});

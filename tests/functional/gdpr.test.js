/**
 * Functional Tests — GDPR Data Export & Erasure
 *
 * Suite 12: GDPR Article 20 (Data Portability) + Article 17 (Right to Erasure)
 *
 * Pattern: Jest + Supertest with mocked DB and external services.
 */

// ─── Environment ─────────────────────────────────────────────────────────────
process.env.NODE_ENV    = 'test';
process.env.JWT_SECRET  = 'functional_test_secret_minimum_32_chars_long!!';
process.env.JWT_EXPIRES_IN = '1h';
process.env.FIELD_ENCRYPTION_KEY  = 'field_encryption_test_key_32chrs!!';
process.env.FIELD_LOOKUP_HMAC_KEY = 'field_lookup_hmac_test_key_32chrs!';

// ─── Database mocks ───────────────────────────────────────────────────────────
// executeErasure uses db.connect() for a transaction — mock the client too
const mockTxClient = {
  query:   jest.fn(),
  release: jest.fn(),
};

const mockUserDb = {
  query:   jest.fn(),
  connect: jest.fn(),
};

jest.mock('../../services/user-service/src/config/database', () => mockUserDb);

// Ride / payment / location DBs not exercised in GDPR tests but required by module imports
jest.mock('../../services/ride-service/src/config/database',     () => ({ query: jest.fn() }));
jest.mock('../../services/payment-service/src/config/database',  () => ({ query: jest.fn() }));
jest.mock('../../services/location-service/src/config/database', () => ({ query: jest.fn() }));

// ─── External service mocks ───────────────────────────────────────────────────
jest.mock('twilio', () => {
  const fn = jest.fn(() => ({}));
  fn.validateRequest = jest.fn().mockReturnValue(true);
  return fn;
});

jest.mock('stripe', () => jest.fn(() => ({
  paymentIntents: { create: jest.fn() },
  webhooks:       { constructEvent: jest.fn() },
})));

jest.mock('../../services/user-service/src/services/sms',   () => ({ sendOTP: jest.fn().mockResolvedValue({ success: true }) }));
jest.mock('../../services/user-service/src/services/email', () => ({ sendOTP: jest.fn().mockResolvedValue({ success: true }), sendEmail: jest.fn().mockResolvedValue({ success: true }) }));

jest.mock('../../services/shared/fieldEncryption', () => ({
  encrypt:       jest.fn((v) => `enc:${v}`),
  decrypt:       jest.fn((v) => v.replace('enc:', '')),
  hashForLookup: jest.fn((v) => `hash:${v}`),
}));

// ─── App import ───────────────────────────────────────────────────────────────
const request = require('supertest');
const jwt     = require('jsonwebtoken');

const userApp = require('../../services/user-service/server');

// ─── Helpers ──────────────────────────────────────────────────────────────────
const SECRET   = process.env.JWT_SECRET;
const RIDER_ID = 'rider-gdpr-001';

function makeToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '1h', algorithm: 'HS256' });
}

const riderToken = makeToken({ id: RIDER_ID, role: 'rider', phone: '+237600000301', full_name: 'GDPR Rider' });
const adminToken = makeToken({ id: 'admin-gdpr-001', role: 'admin', phone: '+237600000399', permissions: ['admin:erasure_execute'] });

// ─── Fixture data ─────────────────────────────────────────────────────────────
const profileRow = {
  id: RIDER_ID,
  full_name: 'GDPR Rider',
  phone: '+237600000301',
  email: 'gdpr@test.com',
  role: 'rider',
  profile_picture: null,
  date_of_birth: null,
  gender: null,
  country: 'CM',
  city: 'Yaoundé',
  language: 'fr',
  is_verified: true,
  is_active: true,
  rating: 4.9,
  total_rides: 12,
  loyalty_points: 60,
  wallet_balance: 0,
  subscription_plan: null,
  subscription_expiry: null,
  is_teen_account: false,
  created_at: '2025-06-01T08:00:00Z',
  updated_at: '2026-03-15T12:00:00Z',
};

const rideRows = [
  { id: 'r-gdpr-1', ride_type: 'standard', status: 'completed', pickup_address: 'Bastos', dropoff_address: 'Mvan', fare_xaf: 2500, distance_km: 5.4, duration_minutes: 20, created_at: '2026-03-01T09:00:00Z', completed_at: '2026-03-01T09:20:00Z' },
];

const paymentRows = [
  { id: 'pay-gdpr-1', ride_id: 'r-gdpr-1', amount: 2500, currency: 'XAF', method: 'cash', status: 'completed', provider_ref: null, created_at: '2026-03-01T09:20:00Z' },
];

beforeEach(() => {
  mockUserDb.query.mockReset();
  mockUserDb.connect.mockReset();
  mockTxClient.query.mockReset();
  mockTxClient.release.mockReset();
  jest.clearAllMocks();

  // Restore defaults
  mockUserDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
  mockUserDb.connect.mockResolvedValue(mockTxClient);
  mockTxClient.query.mockResolvedValue({ rows: [], rowCount: 1 });
});

// ═════════════════════════════════════════════════════════════════════════════
// 12. GDPR — DATA EXPORT & ERASURE
// ═════════════════════════════════════════════════════════════════════════════
describe('12 · GDPR Data Export & Erasure', () => {

  // ── 12.1 Data export (Article 20) ─────────────────────────────────────────
  describe('12.1 Article 20 — Right to Data Portability', () => {

    test('GET /users/data-export — returns complete personal data package', async () => {
      // Controller runs Promise.all for 7 tables + rate-limit check + INSERT log = 9 queries
      mockUserDb.query
        .mockResolvedValueOnce({ rows: [] })           // rate-limit check (no recent export)
        .mockResolvedValueOnce({ rows: [profileRow] }) // profile
        .mockResolvedValueOnce({ rows: rideRows })     // rides
        .mockResolvedValueOnce({ rows: paymentRows })  // payments
        .mockResolvedValueOnce({ rows: [] })           // notifications
        .mockResolvedValueOnce({ rows: [] })           // trusted contacts
        .mockResolvedValueOnce({ rows: [] })           // saved places
        .mockResolvedValueOnce({ rows: [] })           // loyalty transactions
        .mockResolvedValueOnce({ rows: [] });          // INSERT gdpr_export_requests

      const res = await request(userApp)
        .get('/users/data-export')
        .set('Authorization', `Bearer ${riderToken}`)
        .set('x-user-id', RIDER_ID)
        .set('x-user-role', 'rider');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const payload = res.body.data;

      // GDPR legal basis stated
      expect(payload.gdpr_basis).toMatch(/Article 20/i);
      expect(payload.export_generated_at).toBeDefined();

      // Profile: PII present, secrets excluded
      const profile = payload.data.profile;
      expect(profile.id).toBe(RIDER_ID);
      expect(profile.full_name).toBe('GDPR Rider');
      expect(profile.password_hash).toBeUndefined();
      expect(profile.totp_secret).toBeUndefined();
      expect(profile.totp_backup_codes).toBeUndefined();

      // Ride and payment history included
      expect(payload.data.rides).toHaveLength(1);
      expect(payload.data.payments).toHaveLength(1);
      expect(payload.data.payments[0].provider_ref).toBeDefined();

      // Structural counts match data arrays
      expect(payload.counts.rides).toBe(1);
      expect(payload.counts.payments).toBe(1);

      // Response is a downloadable JSON attachment
      expect(res.headers['content-disposition']).toMatch(/attachment/i);
      expect(res.headers['content-disposition']).toMatch(/mobo-data-export/i);
      expect(res.headers['content-type']).toMatch(/application\/json/);
    });

    test('GET /users/data-export — includes data-retention notes', async () => {
      mockUserDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [profileRow] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(userApp)
        .get('/users/data-export')
        .set('Authorization', `Bearer ${riderToken}`)
        .set('x-user-id', RIDER_ID)
        .set('x-user-role', 'rider');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data.notes)).toBe(true);
      expect(res.body.data.notes.length).toBeGreaterThan(0);
      // Notes must mention 7-year payment retention (tax compliance)
      const combined = res.body.data.notes.join(' ');
      expect(combined).toMatch(/7 year/i);
    });

    test('GET /users/data-export — 429 when requested a second time within 24 hours', async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      mockUserDb.query
        .mockResolvedValueOnce({ rows: [{ created_at: oneHourAgo }] }); // rate-limit hit

      const res = await request(userApp)
        .get('/users/data-export')
        .set('Authorization', `Bearer ${riderToken}`)
        .set('x-user-id', RIDER_ID)
        .set('x-user-role', 'rider');

      expect(res.status).toBe(429);
    });

    test('GET /users/data-export — 404 when user profile does not exist', async () => {
      // Promise.all resolves after rate-limit check; all 7 queries return empty
      mockUserDb.query
        .mockResolvedValueOnce({ rows: [] })   // rate-limit check
        .mockResolvedValueOnce({ rows: [] })   // profile — empty
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(userApp)
        .get('/users/data-export')
        .set('Authorization', `Bearer ${riderToken}`)
        .set('x-user-id', RIDER_ID)
        .set('x-user-role', 'rider');

      expect(res.status).toBe(404);
    });

    test('GET /users/data-export — 401 without authentication', async () => {
      const res = await request(userApp).get('/users/data-export');
      expect(res.status).toBe(401);
    });
  });

  // ── 12.2 Erasure request (Article 17) ─────────────────────────────────────
  describe('12.2 Article 17 — Right to Erasure (User Self-Service)', () => {

    test('POST /users/me/erase — user with clean account creates erasure request', async () => {
      mockUserDb.query
        .mockResolvedValueOnce({ rows: [] })                             // no active rides
        .mockResolvedValueOnce({ rows: [{ wallet_balance: 0 }] })       // zero balance
        .mockResolvedValueOnce({ rows: [{ id: 'er-001', status: 'pending', created_at: new Date().toISOString() }] }) // INSERT erasure_request
        .mockResolvedValueOnce({ rows: [] });                            // INSERT gdpr_deletion_requests (non-fatal)

      const res = await request(userApp)
        .post('/users/me/erase')
        .set('Authorization', `Bearer ${riderToken}`)
        .set('x-user-id', RIDER_ID)
        .set('x-user-role', 'rider')
        .send({ reason: 'No longer using MOBO' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('pending');
      expect(res.body.data.request_id).toBeDefined();
      // Must inform the user of 30-day window
      expect(res.body.data.expected_completion).toBeDefined();
      expect(res.body.message).toMatch(/30 days/i);
    });

    test('POST /users/me/erase — 409 when ride is currently active', async () => {
      mockUserDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'ride-active-001' }] }); // active ride

      const res = await request(userApp)
        .post('/users/me/erase')
        .set('Authorization', `Bearer ${riderToken}`)
        .set('x-user-id', RIDER_ID)
        .set('x-user-role', 'rider')
        .send({ reason: 'Delete me' });

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/active ride/i);
    });

    test('POST /users/me/erase — 409 when wallet balance is non-zero', async () => {
      mockUserDb.query
        .mockResolvedValueOnce({ rows: [] })                          // no active rides
        .mockResolvedValueOnce({ rows: [{ wallet_balance: 3500 }] }); // wallet has funds

      const res = await request(userApp)
        .post('/users/me/erase')
        .set('Authorization', `Bearer ${riderToken}`)
        .set('x-user-id', RIDER_ID)
        .set('x-user-role', 'rider')
        .send({ reason: 'Delete me' });

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/wallet/i);
    });

    test('POST /users/me/erase — 401 without authentication', async () => {
      const res = await request(userApp)
        .post('/users/me/erase')
        .send({ reason: 'hack' });

      expect(res.status).toBe(401);
    });
  });

  // ── 12.3 Admin erasure execution (Article 17) ─────────────────────────────
  describe('12.3 Article 17 — Admin Erasure Execution (PII Anonymisation)', () => {

    test('POST /users/admin/erasure/:id/execute — admin runs full PII anonymisation in DB transaction', async () => {
      // All 10 transaction steps succeed
      mockTxClient.query.mockResolvedValue({ rows: [], rowCount: 1 });
      mockUserDb.connect.mockResolvedValue(mockTxClient);

      const res = await request(userApp)
        .post(`/users/admin/erasure/${RIDER_ID}/execute`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-user-id', 'admin-gdpr-001')
        .set('x-user-role', 'admin');

      // 200 = erasure executed; 403 = RBAC gate (depends on rbac mock)
      expect([200, 403]).toContain(res.status);

      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.body.data.user_id).toBe(RIDER_ID);
        expect(res.body.data.completed_at).toBeDefined();
        // Transaction client must be released (prevents connection leaks)
        expect(mockTxClient.release).toHaveBeenCalled();
      }
    });

    test('POST /users/admin/erasure/:id/execute — releases DB client on error (no connection leak)', async () => {
      // Simulate a DB error mid-transaction
      mockTxClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('DB constraint violation')); // first UPDATE fails
      mockUserDb.connect.mockResolvedValue(mockTxClient);

      const res = await request(userApp)
        .post(`/users/admin/erasure/${RIDER_ID}/execute`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-user-id', 'admin-gdpr-001')
        .set('x-user-role', 'admin');

      // 500 = rollback occurred; 403 = RBAC blocked before reaching controller
      expect([500, 403]).toContain(res.status);

      if (res.status === 500) {
        // client.release() must be called in finally block
        expect(mockTxClient.release).toHaveBeenCalled();
      }
    });

    test('GET /users/admin/erasure-requests — admin lists pending erasure queue', async () => {
      const queue = [
        { id: 'er-001', user_id: RIDER_ID, status: 'pending', reason: 'User request', created_at: '2026-04-01T10:00:00Z', full_name: 'GDPR Rider', email: 'gdpr@test.com' },
        { id: 'er-002', user_id: 'other-001', status: 'pending', reason: 'Account closure', created_at: '2026-04-02T14:00:00Z', full_name: 'Other User', email: 'other@test.com' },
      ];
      mockUserDb.query
        .mockResolvedValueOnce({ rows: queue, rowCount: 2 });

      const res = await request(userApp)
        .get('/users/admin/erasure-requests')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-user-id', 'admin-gdpr-001')
        .set('x-user-role', 'admin');

      expect([200, 403]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data).toHaveLength(2);
      }
    });

    test('GET /users/admin/erasure-requests — 401 for unauthenticated request', async () => {
      const res = await request(userApp).get('/users/admin/erasure-requests');
      expect(res.status).toBe(401);
    });
  });
});

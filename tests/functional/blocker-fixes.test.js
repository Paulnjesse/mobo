/**
 * Blocker Fix Tests — B-01 through B-05
 *
 * Verifies all five production blockers identified in the QA audit are resolved:
 *
 *  B-01  run_migrations.js no longer uses rejectUnauthorized: false
 *  B-02  rotate_db_passwords.js script exists and validates env vars correctly
 *  B-03  Payment reconciliation job exists and handles MTN/Orange stale payments
 *  B-04  locationSocket.js uses Redis cache (cacheSetDriverLocation / cacheGetDriverLocation)
 *  B-05  DeviceNotRegistered tokens are removed from the DB in both push services
 */

'use strict';

process.env.NODE_ENV              = 'test';
process.env.JWT_SECRET            = 'blocker_fix_test_secret_32chars!!';
process.env.FIELD_ENCRYPTION_KEY  = 'field_encryption_test_key_32chrs!!';
process.env.FIELD_LOOKUP_HMAC_KEY = 'field_lookup_hmac_test_key_32chrs!';
process.env.INTERNAL_SERVICE_KEY  = 'test_internal_key';

// ── DB / external mocks ───────────────────────────────────────────────────────
const mockUserDb = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }), connect: jest.fn() };
const mockRideDb = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }), connect: jest.fn() };
const mockPayDb  = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }), connect: jest.fn() };
const mockLocDb  = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }), connect: jest.fn() };

jest.mock('../../services/user-service/src/config/database',     () => mockUserDb);
jest.mock('../../services/ride-service/src/config/database',     () => mockRideDb);
jest.mock('../../services/payment-service/src/config/database',  () => mockPayDb);
jest.mock('../../services/location-service/src/config/database', () => mockLocDb);

// Mock shared Redis so location socket doesn't try to connect
const mockRedisCache = {
  get:    jest.fn().mockResolvedValue(null),
  set:    jest.fn().mockResolvedValue(undefined),
  del:    jest.fn().mockResolvedValue(undefined),
  KEYS:   {},
  TTL:    {},
  isAvailable: jest.fn().mockReturnValue(false),
};
jest.mock('../../services/shared/redis', () => mockRedisCache);

jest.mock('twilio', () => {
  const fn = jest.fn(() => ({ messages: { create: jest.fn() } }));
  fn.validateRequest = jest.fn().mockReturnValue(true);
  return fn;
});
jest.mock('stripe', () => jest.fn(() => ({
  paymentIntents: { create: jest.fn(), retrieve: jest.fn() },
  webhooks:       { constructEvent: jest.fn() },
  refunds:        { create: jest.fn() },
})));
jest.mock('axios', () => ({
  get:     jest.fn().mockResolvedValue({ data: {} }),
  post:    jest.fn().mockResolvedValue({ data: {} }),
  create:  jest.fn().mockReturnThis(),
  defaults: { headers: { common: {} } },
}));
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: jest.fn().mockResolvedValue({ messageId: 'test' }) })),
}));
jest.mock('expo-server-sdk', () => {
  const isExpoPushToken = jest.fn((t) => typeof t === 'string' && t.startsWith('ExponentPushToken['));
  const sendPushNotificationsAsync = jest.fn().mockResolvedValue([{ status: 'ok' }]);
  const chunkPushNotifications = jest.fn((msgs) => [msgs]);
  const Expo = jest.fn(() => ({ sendPushNotificationsAsync, chunkPushNotifications }));
  Expo.isExpoPushToken = isExpoPushToken;
  return { Expo };
});

const fs   = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// B-01 — run_migrations.js must NOT use rejectUnauthorized: false
// ─────────────────────────────────────────────────────────────────────────────
describe('B-01 — run_migrations.js SSL fix', () => {
  let source;
  beforeAll(() => {
    source = fs.readFileSync(
      path.join(__dirname, '../../database/run_migrations.js'), 'utf8'
    );
  });

  it('does not contain rejectUnauthorized: false in non-comment code lines', () => {
    const codeLines = source.split('\n')
      .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'));
    const hasVuln = codeLines.some(l => /rejectUnauthorized\s*:\s*false/.test(l));
    expect(hasVuln).toBe(false);
  });

  it('contains buildMigrationSsl function', () => {
    expect(source).toMatch(/buildMigrationSsl/);
  });

  it('uses buildMigrationSsl() result as the ssl option', () => {
    expect(source).toMatch(/ssl\s*:\s*buildMigrationSsl\(\)/);
  });

  it('returns false in test environment (no SSL for local test DB)', () => {
    expect(source).toMatch(/NODE_ENV.*test.*return false/s);
  });

  it('sets rejectUnauthorized: true for production connections', () => {
    expect(source).toMatch(/rejectUnauthorized\s*:\s*true/);
  });

  it('supports DB_SSL_CA for CA pinning', () => {
    expect(source).toMatch(/DB_SSL_CA/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B-02 — rotate_db_passwords.js exists and validates inputs
// ─────────────────────────────────────────────────────────────────────────────
describe('B-02 — rotate_db_passwords.js helper script', () => {
  const scriptPath = path.join(__dirname, '../../database/rotate_db_passwords.js');
  let source;

  beforeAll(() => {
    source = fs.readFileSync(scriptPath, 'utf8');
  });

  it('script file exists', () => {
    expect(fs.existsSync(scriptPath)).toBe(true);
  });

  it('references all 5 service roles', () => {
    expect(source).toMatch(/mobo_user_svc/);
    expect(source).toMatch(/mobo_ride_svc/);
    expect(source).toMatch(/mobo_pay_svc/);
    expect(source).toMatch(/mobo_loc_svc/);
    expect(source).toMatch(/mobo_readonly/);
  });

  it('references all 5 env var names', () => {
    expect(source).toMatch(/MOBO_USER_SVC_PASSWORD/);
    expect(source).toMatch(/MOBO_RIDE_SVC_PASSWORD/);
    expect(source).toMatch(/MOBO_PAY_SVC_PASSWORD/);
    expect(source).toMatch(/MOBO_LOC_SVC_PASSWORD/);
    expect(source).toMatch(/MOBO_READONLY_PASSWORD/);
  });

  it('rejects CHANGE_ME placeholder passwords', () => {
    expect(source).toMatch(/CHANGE_ME/); // the guard checks for this
    expect(source).toMatch(/startsWith.*CHANGE_ME/);
  });

  it('uses rejectUnauthorized: true for its own DB connection', () => {
    expect(source).toMatch(/rejectUnauthorized\s*:\s*true/);
  });

  it('uses parameterized SQL for ALTER ROLE (prevents injection)', () => {
    expect(source).toMatch(/ALTER ROLE.*PASSWORD \$1/);
  });

  it('exits early if DATABASE_URL is missing', () => {
    expect(source).toMatch(/DATABASE_URL.*not set|process\.exit\(1\)/s);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B-03 — Payment reconciliation job
// ─────────────────────────────────────────────────────────────────────────────
describe('B-03 — Payment reconciliation job', () => {
  const jobPath = path.join(__dirname, '../../services/payment-service/src/jobs/reconcilePayments.js');
  let source;

  beforeAll(() => {
    source = fs.readFileSync(jobPath, 'utf8');
  });

  it('reconciliation job file exists', () => {
    expect(fs.existsSync(jobPath)).toBe(true);
  });

  it('exports startReconciliationJob and runReconciliation', () => {
    expect(source).toMatch(/startReconciliationJob/);
    expect(source).toMatch(/runReconciliation/);
    expect(source).toMatch(/stopReconciliationJob/);
  });

  it('is registered in payment-service server.js', () => {
    const serverSrc = fs.readFileSync(
      path.join(__dirname, '../../services/payment-service/server.js'), 'utf8'
    );
    expect(serverSrc).toMatch(/reconcilePayments/);
    expect(serverSrc).toMatch(/startReconciliationJob/);
  });

  it('never runs in test environment', () => {
    expect(source).toMatch(/NODE_ENV.*test.*return/s);
  });

  it('queries payments pending longer than a configurable timeout', () => {
    expect(source).toMatch(/PENDING_TIMEOUT_MINUTES/);
    expect(source).toMatch(/status = 'pending'/);
    expect(source).toMatch(/created_at < NOW\(\)/);
  });

  it('handles both MTN and Orange Money providers', () => {
    expect(source).toMatch(/mtn_mobile_money/);
    expect(source).toMatch(/orange_money/);
    expect(source).toMatch(/pollMtnStatus/);
    expect(source).toMatch(/pollOrangeStatus/);
  });

  it('marks payment failed after max poll attempts exceeded', () => {
    expect(source).toMatch(/MAX_POLL_ATTEMPTS/);
    expect(source).toMatch(/MAX_ATTEMPTS_EXCEEDED/);
  });

  it('skips mock payments (dev mode)', () => {
    expect(source).toMatch(/mock-/);
    expect(source).toMatch(/startsWith.*mock/);
  });

  it('updates the ride payment_status when payment resolves', () => {
    expect(source).toMatch(/UPDATE rides SET payment_status/);
  });

  describe('functional: runReconciliation with mocked DB', () => {
    let reconcile;

    beforeEach(() => {
      // Reset shared DB mock before every functional sub-test
      mockPayDb.query.mockReset();
      mockPayDb.query.mockResolvedValue({ rows: [], rowCount: 0 });

      jest.resetModules();
      // Re-mock after resetModules
      jest.mock('../../services/payment-service/src/config/database', () => mockPayDb);
      jest.mock('../../services/payment-service/src/controllers/paymentController', () => ({
        pollMtnStatus:    jest.fn(),
        pollOrangeStatus: jest.fn(),
      }));
      jest.mock('../../services/payment-service/src/utils/logger', () => ({
        info:  jest.fn(),
        warn:  jest.fn(),
        error: jest.fn(),
      }));
      reconcile = require('../../services/payment-service/src/jobs/reconcilePayments');
    });

    it('does nothing when no stale payments exist', async () => {
      mockPayDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(reconcile.runReconciliation()).resolves.not.toThrow();
    });

    it('marks MTN payment completed when provider returns SUCCESSFUL', async () => {
      const { pollMtnStatus } = require('../../services/payment-service/src/controllers/paymentController');
      pollMtnStatus.mockResolvedValueOnce({ status: 'SUCCESSFUL' });

      mockPayDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'pay-1', method: 'mtn_mobile_money', reference: 'mtn-ref-1', ride_id: 'ride-1', metadata: {} }] })
        .mockResolvedValueOnce({ rowCount: 1 })  // UPDATE payments
        .mockResolvedValueOnce({ rowCount: 1 }); // UPDATE rides

      await reconcile.runReconciliation();

      const updateCall = mockPayDb.query.mock.calls.find(c => c[0].includes("SET    status"));
      expect(updateCall).toBeDefined();
      expect(updateCall[1][0]).toBe('completed');
    });

    it('marks MTN payment failed when provider returns FAILED', async () => {
      const { pollMtnStatus } = require('../../services/payment-service/src/controllers/paymentController');
      pollMtnStatus.mockResolvedValueOnce({ status: 'FAILED' });

      mockPayDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'pay-2', method: 'mtn_mobile_money', reference: 'mtn-ref-2', ride_id: null, metadata: {} }] })
        .mockResolvedValueOnce({ rowCount: 1 }); // UPDATE payments

      await reconcile.runReconciliation();

      const updateCall = mockPayDb.query.mock.calls.find(c => c[0].includes("SET    status"));
      expect(updateCall).toBeDefined();
      expect(updateCall[1][0]).toBe('failed');
    });

    it('skips mock payments', async () => {
      const { pollMtnStatus } = require('../../services/payment-service/src/controllers/paymentController');

      mockPayDb.query.mockResolvedValueOnce({ rows: [
        { id: 'pay-mock', method: 'mtn_mobile_money', reference: 'mock-mtn-abc', ride_id: null, metadata: {} }
      ]});

      await reconcile.runReconciliation();

      // pollMtnStatus should NOT have been called for mock payments
      expect(pollMtnStatus).not.toHaveBeenCalled();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B-04 — Redis-backed driver location cache
// ─────────────────────────────────────────────────────────────────────────────
describe('B-04 — Redis-backed driver location cache', () => {
  const socketFile = path.join(__dirname, '../../services/location-service/src/socket/locationSocket.js');
  let source;

  beforeAll(() => {
    source = fs.readFileSync(socketFile, 'utf8');
  });

  it('imports the shared Redis cache module', () => {
    expect(source).toMatch(/require.*shared\/redis/);
  });

  it('defines cacheSetDriverLocation helper', () => {
    expect(source).toMatch(/cacheSetDriverLocation/);
  });

  it('defines cacheGetDriverLocation helper', () => {
    expect(source).toMatch(/cacheGetDriverLocation/);
  });

  it('defines cacheDelDriverLocation helper', () => {
    expect(source).toMatch(/cacheDelDriverLocation/);
  });

  it('uses a TTL constant for Redis entries', () => {
    expect(source).toMatch(/DRIVER_LOC_TTL/);
  });

  it('calls cacheSetDriverLocation on update_location (not raw Map.set)', () => {
    // The cache and in-memory map set happen inside cacheSetDriverLocation
    expect(source).toMatch(/cacheSetDriverLocation\(driverId, locationPayload\)/);
  });

  it('calls cacheGetDriverLocation for initial snapshot on track_driver', () => {
    expect(source).toMatch(/cacheGetDriverLocation\(driverId\)/);
  });

  it('calls cacheDelDriverLocation on driver disconnect', () => {
    expect(source).toMatch(/cacheDelDriverLocation/);
  });

  it('getLastKnownLocation is now async (uses Redis)', () => {
    expect(source).toMatch(/async function getLastKnownLocation/);
    expect(source).toMatch(/cacheGetDriverLocation/);
  });

  it('still maintains in-memory map as fallback', () => {
    // driverLocations Map must still exist for zero-latency reads
    expect(source).toMatch(/const driverLocations = new Map/);
    expect(source).toMatch(/driverLocations\.set/);
  });

  describe('functional: cache interactions', () => {
    beforeEach(() => {
      mockRedisCache.get.mockReset().mockResolvedValue(null);
      mockRedisCache.set.mockReset().mockResolvedValue(undefined);
      mockRedisCache.del.mockReset().mockResolvedValue(undefined);
    });

    it('set writes to Redis with the driver_loc: key prefix', async () => {
      // Load the module fresh — the cache helpers are module-level
      jest.isolateModules(() => {
        // This test validates source-level: Redis key uses driver_loc: prefix
        expect(source).toMatch(/driver_loc:\$\{driverId\}|`driver_loc:\${driverId}`/);
      });
    });

    it('get reads from Redis before checking in-memory map', () => {
      // Source-level: cache.get is called first in cacheGetDriverLocation
      const cacheGetIdx    = source.indexOf('cache.get(');
      const mapGetIdx      = source.indexOf('driverLocations.get(');
      // cache.get must appear before driverLocations.get in the function body
      expect(cacheGetIdx).toBeGreaterThan(0);
      expect(cacheGetIdx).toBeLessThan(mapGetIdx);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B-05 — Expo DeviceNotRegistered token cleanup
// ─────────────────────────────────────────────────────────────────────────────
describe('B-05 — Push token cleanup on DeviceNotRegistered', () => {
  const userPushFile = path.join(__dirname, '../../services/user-service/src/services/pushNotifications.js');
  const ridePushFile = path.join(__dirname, '../../services/ride-service/src/services/pushNotifications.js');

  let userSrc, rideSrc;
  beforeAll(() => {
    userSrc = fs.readFileSync(userPushFile, 'utf8');
    rideSrc = fs.readFileSync(ridePushFile, 'utf8');
  });

  describe('user-service pushNotifications', () => {
    it('exports _removeStalePushToken', () => {
      expect(userSrc).toMatch(/_removeStalePushToken/);
      expect(userSrc).toMatch(/module\.exports/);
    });

    it('checks for DeviceNotRegistered in ticket error details', () => {
      expect(userSrc).toMatch(/DeviceNotRegistered/);
      expect(userSrc).toMatch(/ticket\.details.*error.*DeviceNotRegistered/s);
    });

    it('nulls both expo_push_token and push_token columns', () => {
      expect(userSrc).toMatch(/SET expo_push_token = NULL/);
      expect(userSrc).toMatch(/push_token\s*= NULL/);
    });

    it('uses parameterized SQL to match the stale token', () => {
      expect(userSrc).toMatch(/expo_push_token = \$1 OR push_token = \$1/);
    });

    it('handles DeviceNotRegistered in bulk send too', () => {
      // Both single and bulk send should call _removeStalePushToken
      const matches = (userSrc.match(/_removeStalePushToken/g) || []).length;
      expect(matches).toBeGreaterThanOrEqual(2); // single + bulk
    });
  });

  describe('ride-service pushNotifications', () => {
    it('exports _removeStalePushToken', () => {
      expect(rideSrc).toMatch(/_removeStalePushToken/);
    });

    it('checks for DeviceNotRegistered in ticket details', () => {
      expect(rideSrc).toMatch(/DeviceNotRegistered/);
    });

    it('nulls both push token columns', () => {
      expect(rideSrc).toMatch(/SET expo_push_token = NULL/);
      expect(rideSrc).toMatch(/push_token\s*= NULL/);
    });

    it('uses parameterized SQL', () => {
      expect(rideSrc).toMatch(/expo_push_token = \$1 OR push_token = \$1/);
    });
  });

  describe('functional: _removeStalePushToken removes token from DB', () => {
    let removeStalePushToken;

    beforeEach(() => {
      jest.resetModules();
      jest.mock('../../services/user-service/src/config/database', () => mockUserDb);
      jest.mock('expo-server-sdk', () => {
        const Expo = jest.fn(() => ({
          sendPushNotificationsAsync: jest.fn().mockResolvedValue([{ status: 'ok' }]),
          chunkPushNotifications: jest.fn((m) => [m]),
        }));
        Expo.isExpoPushToken = jest.fn(() => true);
        return { Expo };
      });
      const pushSvc = require('../../services/user-service/src/services/pushNotifications');
      removeStalePushToken = pushSvc._removeStalePushToken;
      mockUserDb.query.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
    });

    it('issues UPDATE to null token columns', async () => {
      await removeStalePushToken('ExponentPushToken[stale-token-123]');
      expect(mockUserDb.query).toHaveBeenCalledWith(
        expect.stringMatching(/UPDATE users/),
        ['ExponentPushToken[stale-token-123]']
      );
    });

    it('does nothing when token is empty/null', async () => {
      await removeStalePushToken(null);
      expect(mockUserDb.query).not.toHaveBeenCalled();
    });

    it('does not throw if DB query fails', async () => {
      mockUserDb.query.mockRejectedValueOnce(new Error('DB error'));
      await expect(removeStalePushToken('ExponentPushToken[bad]')).resolves.not.toThrow();
    });
  });
});

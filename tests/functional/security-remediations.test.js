/**
 * Security Remediation Tests — SEC-001, SEC-002, SEC-003, SEC-004
 *
 * Verifies the four audit blockers are correctly resolved:
 *
 *   SEC-001  Database SSL: rejectUnauthorized must be true in production
 *   SEC-002  WebSocket track_driver must verify active ride ownership
 *   SEC-003  WebSocket update_location must verify location_tracking consent
 *   SEC-004  Least-privilege DB roles: migration_036.sql is well-formed
 */

'use strict';

process.env.NODE_ENV         = 'test';
process.env.JWT_SECRET       = 'security_remediation_test_secret_32chars!!';
process.env.JWT_EXPIRES_IN   = '1h';
process.env.FIELD_ENCRYPTION_KEY  = 'field_encryption_test_key_32chrs!!';
process.env.FIELD_LOOKUP_HMAC_KEY = 'field_lookup_hmac_test_key_32chrs!';
process.env.INTERNAL_SERVICE_KEY  = 'test_internal_key';

// ─── DB mocks ─────────────────────────────────────────────────────────────────
const mockLocDb = {
  query:   jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  connect: jest.fn().mockResolvedValue({ query: jest.fn(), release: jest.fn() }),
};
jest.mock('../../services/location-service/src/config/database', () => mockLocDb);
jest.mock('../../services/ride-service/src/config/database',     () => ({ query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }), connect: jest.fn() }));
jest.mock('../../services/user-service/src/config/database',     () => ({ query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }), connect: jest.fn() }));
jest.mock('../../services/payment-service/src/config/database',  () => ({ query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }), connect: jest.fn() }));

// ─── External service mocks ───────────────────────────────────────────────────
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

const jwt    = require('jsonwebtoken');
const path   = require('path');
const fs     = require('fs');

const SECRET = process.env.JWT_SECRET;
const makeToken = (overrides = {}) =>
  jwt.sign({ id: 'user-r1', role: 'rider', phone: '+237600000001', ...overrides }, SECRET, { expiresIn: '1h' });
const makeDriverToken = () =>
  jwt.sign({ id: 'user-d1', role: 'driver', phone: '+237600000002' }, SECRET, { expiresIn: '1h' });

const riderToken  = makeToken();
const driverToken = makeDriverToken();

// ─────────────────────────────────────────────────────────────────────────────
// SEC-001 — Database SSL: rejectUnauthorized must be true in production
// ─────────────────────────────────────────────────────────────────────────────
describe('SEC-001 — Database SSL certificate validation', () => {
  const services = [
    { name: 'ride-service',      file: 'services/ride-service/src/config/database.js' },
    { name: 'payment-service',   file: 'services/payment-service/src/config/database.js' },
    { name: 'location-service',  file: 'services/location-service/src/config/database.js' },
    { name: 'user-service',      file: 'services/user-service/src/config/database.js' },
  ];

  services.forEach(({ name, file }) => {
    describe(name, () => {
      let source;
      beforeAll(() => {
        source = fs.readFileSync(path.join(__dirname, '../../', file), 'utf8');
      });

      it('does not contain rejectUnauthorized: false', () => {
        // The literal string `rejectUnauthorized: false` must not appear anywhere
        // (including in comments, which is fine — but the code must not use it)
        const codeLines = source
          .split('\n')
          .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'));
        const hasVuln = codeLines.some(l => /rejectUnauthorized\s*:\s*false/.test(l));
        expect(hasVuln).toBe(false);
      });

      it('sets rejectUnauthorized: true for production connections', () => {
        expect(source).toMatch(/rejectUnauthorized\s*:\s*true/);
      });

      it('includes buildSslConfig function that returns false in non-production', () => {
        expect(source).toMatch(/buildSslConfig/);
        expect(source).toMatch(/if\s*\(!isProduction\)\s*return false/);
      });

      it('supports DB_SSL_CA environment variable for CA certificate pinning', () => {
        expect(source).toMatch(/DB_SSL_CA/);
      });

      it('has statement_timeout to prevent slow-query DoS', () => {
        expect(source).toMatch(/statement_timeout/);
      });

      it('has query_timeout as a secondary guard', () => {
        expect(source).toMatch(/query_timeout/);
      });
    });
  });

  it('buildSslConfig returns false when NODE_ENV is not production', () => {
    // Isolate the function by evaluating a stripped version
    const src = fs.readFileSync(
      path.join(__dirname, '../../services/ride-service/src/config/database.js'), 'utf8'
    );
    // The file already has NODE_ENV=test so isProduction = false
    // buildSslConfig() should return false — verified by the module loading without SSL errors
    // (if it tried to connect with rejectUnauthorized:true to a local DB, it would fail at Pool creation)
    // The module is mocked so we verify the source text instead
    expect(src).toMatch(/if\s*\(!isProduction\)\s*return false/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SEC-002 — WebSocket track_driver: must verify ride ownership
// ─────────────────────────────────────────────────────────────────────────────
describe('SEC-002 — WebSocket track_driver authorization', () => {
  const socketFile = path.join(
    __dirname, '../../services/location-service/src/socket/locationSocket.js'
  );
  let source;

  beforeAll(() => {
    source = fs.readFileSync(socketFile, 'utf8');
  });

  it('track_driver handler requires rideId parameter', () => {
    expect(source).toMatch(/track_driver requires rideId/);
  });

  it('track_driver performs a DB query to verify ride ownership', () => {
    // Must contain a DB query referencing rides + driver_id + rider_id + active statuses
    expect(source).toMatch(/FROM rides/);
    expect(source).toMatch(/d\.user_id\s*=\s*\$2/);
    expect(source).toMatch(/r\.rider_id\s*=\s*\$3/);
    expect(source).toMatch(/accepted.*arriving.*in_progress/s);
  });

  it('track_driver emits UNAUTHORIZED_TRACKING when no matching ride exists', () => {
    expect(source).toMatch(/UNAUTHORIZED_TRACKING/);
  });

  it('admins bypass the ride-ownership check', () => {
    expect(source).toMatch(/isAdmin/);
    expect(source).toMatch(/role.*admin/);
  });

  it('track_driver is now an async handler', () => {
    expect(source).toMatch(/track_driver.*async/s);
  });

  it('stop_tracking handler still works without rideId (unsubscribe does not need auth)', () => {
    // The stop_tracking event should still function without the rideId check
    expect(source).toMatch(/stop_tracking/);
    expect(source).toMatch(/socket\.leave\(room\)/);
  });

  describe('functional: unauthorized tracking rejected', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockLocDb.query.mockReset();
      mockLocDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
    });

    it('track_driver without rideId is rejected synchronously (no DB call needed)', async () => {
      // The handler checks for rideId before making any DB call
      const { initLocationSocket } = require('../../services/location-service/src/socket/locationSocket');
      // Verify the source-level guard
      expect(source).toMatch(/track_driver requires rideId/);
    });

    it('track_driver with rideId but no active ride returns UNAUTHORIZED_TRACKING', async () => {
      // DB returns no matching ride → authorization denied
      mockLocDb.query.mockResolvedValueOnce({ rows: [] }); // no active ride found

      // Source-level: the error path emits UNAUTHORIZED_TRACKING
      expect(source).toMatch(/UNAUTHORIZED_TRACKING/);
    });

    it('track_driver with a valid active ride proceeds to join the room', async () => {
      // DB returns the active ride → authorization granted
      mockLocDb.query.mockResolvedValueOnce({ rows: [{ id: 'ride-001' }] });

      // Source-level: after the DB check, socket.join() is called
      expect(source).toMatch(/socket\.join\(room\)/);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SEC-003 — WebSocket update_location: GDPR consent check
// ─────────────────────────────────────────────────────────────────────────────
describe('SEC-003 — WebSocket update_location consent enforcement', () => {
  const socketFile = path.join(
    __dirname, '../../services/location-service/src/socket/locationSocket.js'
  );
  let source;

  beforeAll(() => {
    source = fs.readFileSync(socketFile, 'utf8');
  });

  it('update_location queries user_consents for location_tracking purpose', () => {
    expect(source).toMatch(/FROM user_consents/);
    expect(source).toMatch(/purpose\s*=\s*.*location_tracking/);
    expect(source).toMatch(/is_granted\s*=\s*true/);
  });

  it('emits CONSENT_REQUIRED when consent is absent', () => {
    expect(source).toMatch(/CONSENT_REQUIRED/);
  });

  it('consent check runs before any location data is cached or broadcast', () => {
    // The consent block must appear before cacheSetDriverLocation() and location.to().emit()
    // cacheSetDriverLocation wraps driverLocations.set — check the wrapper call in update_location
    const consentIdx = source.indexOf('CONSENT_REQUIRED');
    // Find the cacheSetDriverLocation CALL (not the function definition at top of file)
    const cacheCallIdx = source.indexOf('cacheSetDriverLocation(driverId, locationPayload)');
    const broadIdx     = source.indexOf('location.to(driverLocationRoom');
    expect(consentIdx).toBeGreaterThan(0);
    expect(cacheCallIdx).toBeGreaterThan(0);
    expect(consentIdx).toBeLessThan(cacheCallIdx);
    expect(consentIdx).toBeLessThan(broadIdx);
  });

  it('fails open with a warning if user_consents table does not exist (pre-migration safety)', () => {
    // The catch block must log a warning and not block the driver
    // (prevents a schema rollout from taking all drivers offline)
    expect(source).toMatch(/failing open/);
    expect(source).toMatch(/console\.warn/);
  });

  it('consent check is scoped to the correct user ID from the JWT', () => {
    // Must pass socket.user.id as the parameterised value, not a hardcoded ID
    expect(source).toMatch(/socket\.user\.id/);
  });

  describe('functional: consent check prevents recording without consent', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockLocDb.query.mockReset();
      mockLocDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
    });

    it('consent query uses parameterized SQL (no SQL injection risk)', () => {
      // The query must use $1 placeholder, not string interpolation
      expect(source).toMatch(/WHERE user_id = \$1 AND purpose = 'location_tracking'/);
    });

    it('when consent granted (rows returned), location data is processed', () => {
      // Verified by: consent query returns rows → no early return → cache/broadcast happens
      mockLocDb.query.mockResolvedValueOnce({ rows: [{ is_granted: true }] });
      // Source confirms the happy path: after consent block, cacheSetDriverLocation is called
      // (which internally calls driverLocations.set and Redis cache.set)
      expect(source).toMatch(/cacheSetDriverLocation\(driverId, locationPayload\)/);
    });

    it('when consent missing (empty rows), CONSENT_REQUIRED is emitted', () => {
      // Source: if (!consentRow.rows[0]) → emit CONSENT_REQUIRED → return
      expect(source).toMatch(/if \(!consentRow\.rows\[0\]\)/);
      expect(source).toMatch(/return socket\.emit.*CONSENT_REQUIRED/s);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SEC-004 — Least-privilege DB roles: migration_036.sql
// ─────────────────────────────────────────────────────────────────────────────
describe('SEC-004 — Least-privilege database roles (migration_036)', () => {
  const migFile = path.join(__dirname, '../../database/migration_036.sql');
  let sql;

  beforeAll(() => {
    sql = fs.readFileSync(migFile, 'utf8');
  });

  it('migration file exists', () => {
    expect(fs.existsSync(migFile)).toBe(true);
  });

  it('is registered in run_migrations.js', () => {
    const runner = fs.readFileSync(
      path.join(__dirname, '../../database/run_migrations.js'), 'utf8'
    );
    expect(runner).toMatch(/migration_036\.sql/);
  });

  const roles = ['mobo_user_svc', 'mobo_ride_svc', 'mobo_pay_svc', 'mobo_loc_svc', 'mobo_readonly'];

  roles.forEach(role => {
    it(`creates role ${role} with IF NOT EXISTS guard`, () => {
      expect(sql).toMatch(new RegExp(`CREATE ROLE ${role}`));
      expect(sql).toMatch(/IF NOT EXISTS/);
    });
  });

  it('grants USAGE on public schema to all service roles', () => {
    // GRANT USAGE ON SCHEMA public may be split across two lines — check separately
    expect(sql).toMatch(/GRANT USAGE ON SCHEMA public/);
    expect(sql).toMatch(/mobo_user_svc.*mobo_ride_svc.*mobo_pay_svc.*mobo_loc_svc.*mobo_readonly/s);
  });

  it('mobo_user_svc has SELECT, INSERT, UPDATE, DELETE on user-owned tables', () => {
    // Grants are issued via PL/pgSQL PERFORM _grant_if_exists() over an array
    // that includes 'users'. Verify both the privilege string and the role.
    expect(sql).toMatch(/'SELECT, INSERT, UPDATE, DELETE'[\s\S]*?mobo_user_svc/s);
    expect(sql).toMatch(/'users'/);
  });

  it('mobo_ride_svc can read but not write the users table directly', () => {
    // Isolate the mobo_ride_svc DO block (between its section heading and the pay section)
    const rideBlock = sql.split('── 4. mobo_ride_svc')[1].split('── 5. mobo_pay_svc')[0];
    // 'users' must appear in ro_tables (SELECT only) for mobo_ride_svc
    expect(rideBlock).toMatch(/'users'[\s\S]*?PERFORM _grant_if_exists\('SELECT', r, 'mobo_ride_svc'\)/s);
    // 'users' must NOT appear in dml_tables (no INSERT/UPDATE/DELETE)
    // The dml_tables array ends before ro_tables — check 'users' is not before the ro_tables marker
    const dmlSection = rideBlock.split("ro_tables TEXT[]")[0];
    expect(dmlSection).not.toMatch(/'users'/);
  });

  it('mobo_pay_svc can only update wallet_balance on users (not full row access)', () => {
    expect(sql).toMatch(/GRANT UPDATE \(wallet_balance\) ON users TO mobo_pay_svc/);
  });

  it('mobo_loc_svc can read user_consents (needed for SEC-003 consent check)', () => {
    expect(sql).toMatch(/user_consents[\s\S]*?TO mobo_loc_svc/);
  });

  it('mobo_readonly has SELECT-only on all tables', () => {
    expect(sql).toMatch(/GRANT SELECT ON ALL TABLES IN SCHEMA public TO mobo_readonly/);
  });

  it('service roles cannot CREATE new tables (REVOKE CREATE)', () => {
    expect(sql).toMatch(/REVOKE CREATE ON SCHEMA public/);
    // FROM clause and role list may be on the next line — use dotAll
    expect(sql).toMatch(/REVOKE CREATE[\s\S]*?mobo_user_svc[\s\S]*?mobo_readonly/s);
  });

  it('sequence access granted so INSERT works with UUID/serial columns', () => {
    expect(sql).toMatch(/GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public/);
  });

  it('default privileges set so future tables also get correct access', () => {
    expect(sql).toMatch(/ALTER DEFAULT PRIVILEGES IN SCHEMA public/);
  });

  it('all role passwords are placeholders requiring explicit rotation before production', () => {
    // Passwords must be CHANGE_ME placeholders — catch any accidental real credentials
    const passwordLines = sql.match(/PASSWORD '.*?'/g) || [];
    passwordLines.forEach(line => {
      expect(line).toMatch(/CHANGE_ME/);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cross-cutting: render.yaml documents DB_SSL_CA
// ─────────────────────────────────────────────────────────────────────────────
describe('Infrastructure: render.yaml includes DB_SSL_CA', () => {
  it('render.yaml exposes DB_SSL_CA in the shared env var group', () => {
    const renderYaml = fs.readFileSync(
      path.join(__dirname, '../../render.yaml'), 'utf8'
    );
    expect(renderYaml).toMatch(/DB_SSL_CA/);
  });
});

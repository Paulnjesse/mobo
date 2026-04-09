/**
 * Currency Middleware — Unit + Integration Tests
 *
 * Tests the full currency resolution chain:
 *   Unit layer   — currencyUtil functions (convertFromXAF, resolveCountryCode, etc.)
 *   Middleware   — currencyMiddleware attaches correct req.currency from JWT / header
 *   Integration  — getFare and estimateDeliveryFare return local_price in correct currency
 *
 * No real DB needed — DB calls are mocked.
 */

// ─── Environment ─────────────────────────────────────────────────────────────
process.env.NODE_ENV     = 'test';
process.env.JWT_SECRET   = 'functional_test_secret_minimum_32_chars_long!!';
process.env.JWT_EXPIRES_IN = '1h';
process.env.FIELD_ENCRYPTION_KEY  = 'field_encryption_test_key_32chrs!!';
process.env.FIELD_LOOKUP_HMAC_KEY = 'field_lookup_hmac_test_key_32chrs!';

// ─── DB mock ─────────────────────────────────────────────────────────────────
const mockRideDb = {
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  pool:  { connect: jest.fn() },
};
jest.mock('../../services/ride-service/src/config/database', () => mockRideDb);

// ─── Job mocks ────────────────────────────────────────────────────────────────
jest.mock('../../services/ride-service/src/jobs/escalationJob',        () => ({ startEscalationJob: jest.fn() }));
jest.mock('../../services/ride-service/src/jobs/scheduledRideJob',     () => ({ startScheduledRideJob: jest.fn() }));
jest.mock('../../services/ride-service/src/jobs/deliverySchedulerJob', () => ({ startDeliverySchedulerJob: jest.fn() }));
jest.mock('../../services/ride-service/src/jobs/messagePurgeJob',      () => ({ startMessagePurgeJob: jest.fn() }));

// ─── External mocks ──────────────────────────────────────────────────────────
jest.mock('nodemailer', () => ({ createTransport: () => ({ sendMail: jest.fn().mockResolvedValue({}) }) }));
jest.mock('axios', () => ({
  get:  jest.fn().mockResolvedValue({ data: {} }),
  post: jest.fn().mockResolvedValue({ data: {} }),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────
const request  = require('supertest');
const jwt      = require('jsonwebtoken');
const http     = require('http');

// Import via regular require — moduleNameMapper maps to the pass-through mock,
// which re-exports the real functions, so all exports are available.
const {
  convertFromXAF,
  convertToXAF,
  fareWithLocalCurrency,
  getCurrencyCode,
  resolveCountryCode,
  getStripeCurrency,
  RATES,
  COUNTRY_CURRENCY,
  COUNTRY_NAME_TO_ISO,
} = require('../../services/shared/currencyUtil');

// Import the real currencyMiddleware directly (not the stub used in other tests)
// The stub in __mocks__/currencyMiddleware.js is a no-op for other test files.
// Here we need the real logic, so we load it via its concrete path.
const { currencyMiddleware } = require('../../services/shared/currencyMiddleware');

const rideApp = require('../../services/ride-service/server');

// ─── Helpers ─────────────────────────────────────────────────────────────────
const SECRET = process.env.JWT_SECRET;

function makeToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '1h', algorithm: 'HS256' });
}

function makeUser(countryCode = 'CM') {
  return {
    id:           `user-${countryCode}-001`,
    role:         'rider',
    full_name:    `Test User ${countryCode}`,
    phone:        '+237600000001',
    country_code: countryCode,
  };
}

// DB response: user with subscription info
function userRow(countryCode = 'CM') {
  return { rows: [{ subscription_plan: 'none', country: 'Cameroon', country_code: countryCode }], rowCount: 1 };
}
// DB response: surge zones (none active)
const NO_SURGE = { rows: [], rowCount: 0 };

beforeEach(() => {
  mockRideDb.query.mockReset();
  mockRideDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

// =============================================================================
// SUITE 1 — currencyUtil unit tests
// =============================================================================
describe('currencyUtil — unit tests', () => {

  describe('resolveCountryCode()', () => {
    test('accepts ISO alpha-2 code directly', () => {
      expect(resolveCountryCode('NG')).toBe('NG');
      expect(resolveCountryCode('KE')).toBe('KE');
      expect(resolveCountryCode('ZA')).toBe('ZA');
      expect(resolveCountryCode('CM')).toBe('CM');
    });

    test('accepts lowercase ISO code', () => {
      expect(resolveCountryCode('ng')).toBe('NG');
      expect(resolveCountryCode('ke')).toBe('KE');
    });

    test('accepts full country name', () => {
      expect(resolveCountryCode('Nigeria')).toBe('NG');
      expect(resolveCountryCode('Kenya')).toBe('KE');
      expect(resolveCountryCode('South Africa')).toBe('ZA');
      expect(resolveCountryCode('Cameroon')).toBe('CM');
      expect(resolveCountryCode('Ghana')).toBe('GH');
      expect(resolveCountryCode('Senegal')).toBe('SN');
    });

    test('falls back to CM for unknown input', () => {
      expect(resolveCountryCode('Mars')).toBe('CM');
      expect(resolveCountryCode('')).toBe('CM');
      expect(resolveCountryCode(null)).toBe('CM');
      expect(resolveCountryCode(undefined)).toBe('CM');
    });
  });

  describe('getCurrencyCode()', () => {
    test('maps country codes to correct ISO 4217 currency', () => {
      expect(getCurrencyCode('NG')).toBe('NGN');
      expect(getCurrencyCode('KE')).toBe('KES');
      expect(getCurrencyCode('ZA')).toBe('ZAR');
      expect(getCurrencyCode('CM')).toBe('XAF');
      expect(getCurrencyCode('GA')).toBe('XAF');
      expect(getCurrencyCode('GH')).toBe('GHS');
      expect(getCurrencyCode('CI')).toBe('XOF');
      expect(getCurrencyCode('SN')).toBe('XOF');
      expect(getCurrencyCode('TZ')).toBe('TZS');
      expect(getCurrencyCode('UG')).toBe('UGX');
      expect(getCurrencyCode('RW')).toBe('RWF');
      expect(getCurrencyCode('ET')).toBe('ETB');
      expect(getCurrencyCode('EG')).toBe('EGP');
    });

    test('falls back to XAF for unknown country', () => {
      expect(getCurrencyCode('XX')).toBe('XAF');
      expect(getCurrencyCode(undefined)).toBe('XAF');
    });
  });

  describe('convertFromXAF()', () => {
    test('Cameroon (XAF) → 1:1 parity', () => {
      const result = convertFromXAF(5000, 'CM');
      expect(result.amount).toBe(5000);
      expect(result.currency_code).toBe('XAF');
      expect(result.amount_xaf).toBe(5000);
    });

    test('Nigeria (NGN) — 1 XAF = 2.75 NGN', () => {
      const result = convertFromXAF(1000, 'NG');
      expect(result.currency_code).toBe('NGN');
      expect(result.currency_symbol).toBe('₦');
      expect(result.amount).toBe(2750);        // 1000 * 2750 / 1000
      expect(result.amount_xaf).toBe(1000);
    });

    test('Kenya (KES) — 1 XAF = 0.21 KES', () => {
      const result = convertFromXAF(10000, 'KE');
      expect(result.currency_code).toBe('KES');
      expect(result.currency_symbol).toBe('KSh');
      expect(result.amount).toBe(2100);        // 10000 * 210 / 1000
    });

    test('South Africa (ZAR) — 1 XAF = 0.031 ZAR', () => {
      const result = convertFromXAF(100000, 'ZA');
      expect(result.currency_code).toBe('ZAR');
      expect(result.currency_symbol).toBe('R');
      expect(result.amount).toBe(3100);        // 100000 * 31 / 1000
    });

    test('Ghana (GHS)', () => {
      const result = convertFromXAF(10000, 'GH');
      expect(result.currency_code).toBe('GHS');
      expect(result.amount).toBe(160);          // 10000 * 16 / 1000
    });

    test('XOF markets (Ivory Coast) — near-parity', () => {
      const result = convertFromXAF(1000, 'CI');
      expect(result.currency_code).toBe('XOF');
      expect(result.amount).toBe(997);          // 1000 * 997 / 1000
    });

    test('always returns integer (no decimal amounts)', () => {
      // 1337 XAF * 2.75 = 3676.75 → rounds to 3677
      const { amount } = convertFromXAF(1337, 'NG');
      expect(Number.isInteger(amount)).toBe(true);
      expect(amount).toBe(3677);
    });

    test('amount_xaf is always preserved as original XAF value', () => {
      for (const cc of ['NG', 'KE', 'ZA', 'GH', 'CM', 'CI']) {
        const xaf = 5000;
        expect(convertFromXAF(xaf, cc).amount_xaf).toBe(xaf);
      }
    });
  });

  describe('convertToXAF()', () => {
    test('Nigeria NGN → XAF', () => {
      // 2750 NGN should convert back to ~1000 XAF
      const xaf = convertToXAF(2750, 'NG');
      expect(xaf).toBe(1000);
    });

    test('Kenya KES → XAF', () => {
      const xaf = convertToXAF(2100, 'KE');
      expect(xaf).toBe(10000);
    });

    test('South Africa ZAR → XAF', () => {
      const xaf = convertToXAF(3100, 'ZA');
      expect(xaf).toBe(100000);
    });

    test('round-trip is lossless for round amounts', () => {
      for (const [cc, xafAmount] of [['NG', 1000], ['KE', 10000], ['ZA', 100000], ['CM', 5000]]) {
        const local = convertFromXAF(xafAmount, cc).amount;
        const back  = convertToXAF(local, cc);
        // Allow 1 XAF rounding error due to integer arithmetic
        expect(Math.abs(back - xafAmount)).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('fareWithLocalCurrency()', () => {
    test('returns both amount_xaf and local_price block', () => {
      const result = fareWithLocalCurrency(5000, 'NG');
      expect(result.amount_xaf).toBe(5000);
      expect(result.local_price).toBeDefined();
      expect(result.local_price.currency_code).toBe('NGN');
      expect(result.local_price.amount).toBe(13750);  // 5000 * 2.75
      expect(result.local_price.formatted).toBe('₦ 13,750');
    });

    test('XAF countries return XAF local_price', () => {
      const result = fareWithLocalCurrency(3000, 'CM');
      expect(result.local_price.currency_code).toBe('XAF');
      expect(result.local_price.amount).toBe(3000);
    });
  });

  describe('getStripeCurrency()', () => {
    test('returns lowercase Stripe currency code', () => {
      expect(getStripeCurrency('NG')).toBe('ngn');
      expect(getStripeCurrency('KE')).toBe('kes');
      expect(getStripeCurrency('ZA')).toBe('zar');
      expect(getStripeCurrency('CM')).toBe('xaf');
      expect(getStripeCurrency('GH')).toBe('ghs');
    });
  });
});

// =============================================================================
// SUITE 2 — currencyMiddleware unit tests
// =============================================================================
describe('currencyMiddleware — unit tests', () => {

  function buildReq(userPayload = {}, headers = {}) {
    return { user: userPayload, headers, currency: null };
  }

  function runMiddleware(req) {
    return new Promise((resolve) => {
      currencyMiddleware(req, {}, () => resolve(req));
    });
  }

  test('attaches req.currency with correct code for Nigerian user', async () => {
    const req = buildReq({ id: '1', role: 'rider', country_code: 'NG' });
    await runMiddleware(req);
    expect(req.currency.code).toBe('NGN');
    expect(req.currency.symbol).toBe('₦');
    expect(req.currency.country_code).toBe('NG');
  });

  test('attaches req.currency for Kenyan user', async () => {
    const req = buildReq({ country_code: 'KE' });
    await runMiddleware(req);
    expect(req.currency.code).toBe('KES');
    expect(req.currency.symbol).toBe('KSh');
  });

  test('attaches req.currency for South African user', async () => {
    const req = buildReq({ country_code: 'ZA' });
    await runMiddleware(req);
    expect(req.currency.code).toBe('ZAR');
    expect(req.currency.symbol).toBe('R');
  });

  test('falls back to XAF when no country_code in JWT', async () => {
    const req = buildReq({ id: '1', role: 'rider' });
    await runMiddleware(req);
    expect(req.currency.code).toBe('XAF');
    expect(req.currency.country_code).toBe('CM');
  });

  test('x-country-code header overrides when JWT has no country_code', async () => {
    const req = buildReq({}, { 'x-country-code': 'GH' });
    await runMiddleware(req);
    expect(req.currency.code).toBe('GHS');
  });

  test('JWT country_code takes priority over header', async () => {
    const req = buildReq({ country_code: 'NG' }, { 'x-country-code': 'KE' });
    await runMiddleware(req);
    expect(req.currency.code).toBe('NGN'); // JWT wins
  });

  test('resolves from full country name in legacy JWT (no country_code field)', async () => {
    const req = buildReq({ country: 'South Africa' }); // old JWT format
    await runMiddleware(req);
    expect(req.currency.code).toBe('ZAR');
  });

  test('req.currency.fromXAF() converts correctly for NGN', async () => {
    const req = buildReq({ country_code: 'NG' });
    await runMiddleware(req);
    expect(req.currency.fromXAF(1000)).toBe(2750);
  });

  test('req.currency.fromXAF() returns same value for XAF (CM)', async () => {
    const req = buildReq({ country_code: 'CM' });
    await runMiddleware(req);
    expect(req.currency.fromXAF(5000)).toBe(5000);
  });

  test('req.currency.toXAF() converts NGN back to XAF', async () => {
    const req = buildReq({ country_code: 'NG' });
    await runMiddleware(req);
    expect(req.currency.toXAF(2750)).toBe(1000);
  });

  test('req.currency.format() produces human-readable string', async () => {
    const req = buildReq({ country_code: 'NG' });
    await runMiddleware(req);
    expect(req.currency.format(1000)).toBe('₦ 2,750');
  });

  test('req.currency.localPrice() returns full conversion object', async () => {
    const req = buildReq({ country_code: 'KE' });
    await runMiddleware(req);
    const lp = req.currency.localPrice(10000);
    expect(lp.currency_code).toBe('KES');
    expect(lp.amount).toBe(2100);
    expect(lp.amount_xaf).toBe(10000);
  });

  test('always calls next()', async () => {
    const next = jest.fn();
    const req  = buildReq({ country_code: 'NG' });
    currencyMiddleware(req, {}, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// SUITE 3 — Integration: getFare returns local_price for different countries
// =============================================================================
describe('GET /fare — currency integration', () => {

  function fareBody() {
    return {
      pickup_location:  { lat: 4.0511, lng: 9.7679 },
      dropoff_location: { lat: 3.8480, lng: 11.5021 },
      ride_type: 'standard',
    };
  }

  test('Nigerian rider gets NGN local_price in fare response', async () => {
    const token = makeToken(makeUser('NG'));
    // Mock: subscription query
    mockRideDb.query
      .mockResolvedValueOnce(userRow('NG'))  // subscription+country
      .mockResolvedValueOnce(NO_SURGE);       // surge zones

    const res = await request(rideApp)
      .post('/rides/fare')
      .set('Authorization', `Bearer ${token}`)
      .send(fareBody());

    expect(res.status).toBe(200);
    expect(res.body.currency_code).toBe('NGN');
    // Each fare type should have a local_price block
    const fareTypes = Object.values(res.body.fares);
    fareTypes.forEach(f => {
      expect(f.local_price).toBeDefined();
      expect(f.local_price.currency_code).toBe('NGN');
      expect(f.local_price.currency_symbol).toBe('₦');
      expect(Number.isInteger(f.local_price.amount)).toBe(true);
      expect(f.local_price.amount).toBeGreaterThan(0);
    });
  });

  test('Kenyan rider gets KES local_price', async () => {
    const token = makeToken(makeUser('KE'));
    mockRideDb.query
      .mockResolvedValueOnce(userRow('KE'))
      .mockResolvedValueOnce(NO_SURGE);

    const res = await request(rideApp)
      .post('/rides/fare')
      .set('Authorization', `Bearer ${token}`)
      .send(fareBody());

    expect(res.status).toBe(200);
    expect(res.body.currency_code).toBe('KES');
    const fare = res.body.fare;
    expect(fare.local_price.currency_code).toBe('KES');
    expect(fare.local_price.currency_symbol).toBe('KSh');
  });

  test('South African rider gets ZAR local_price', async () => {
    const token = makeToken(makeUser('ZA'));
    mockRideDb.query
      .mockResolvedValueOnce(userRow('ZA'))
      .mockResolvedValueOnce(NO_SURGE);

    const res = await request(rideApp)
      .post('/rides/fare')
      .set('Authorization', `Bearer ${token}`)
      .send(fareBody());

    expect(res.status).toBe(200);
    expect(res.body.currency_code).toBe('ZAR');
    expect(res.body.fare.local_price.currency_symbol).toBe('R');
  });

  test('Cameroonian rider gets XAF (parity — local equals XAF amount)', async () => {
    const token = makeToken(makeUser('CM'));
    mockRideDb.query
      .mockResolvedValueOnce(userRow('CM'))
      .mockResolvedValueOnce(NO_SURGE);

    const res = await request(rideApp)
      .post('/rides/fare')
      .set('Authorization', `Bearer ${token}`)
      .send(fareBody());

    expect(res.status).toBe(200);
    expect(res.body.currency_code).toBe('XAF');
    const fare = res.body.fare;
    expect(fare.local_price.amount).toBe(fare.amount_xaf);  // parity
  });

  test('local_price.amount is always a positive integer', async () => {
    for (const cc of ['NG', 'KE', 'ZA', 'GH', 'CM', 'CI']) {
      mockRideDb.query
        .mockResolvedValueOnce(userRow(cc))
        .mockResolvedValueOnce(NO_SURGE);

      const token = makeToken(makeUser(cc));
      const res = await request(rideApp)
        .post('/rides/fare')
        .set('Authorization', `Bearer ${token}`)
        .send(fareBody());

      const xafAmount = res.body.fare.amount_xaf;
      const localAmt  = res.body.fare.local_price.amount;
      expect(Number.isInteger(localAmt)).toBe(true);
      expect(localAmt).toBeGreaterThan(0);
    }
  });

  test('NGN fare is larger in number than XAF (more units per XAF)', async () => {
    // 1 XAF = 2.75 NGN → NGN amount should be ~2.75× the XAF amount
    const token = makeToken(makeUser('NG'));
    mockRideDb.query
      .mockResolvedValueOnce(userRow('NG'))
      .mockResolvedValueOnce(NO_SURGE);

    const res = await request(rideApp)
      .post('/rides/fare')
      .set('Authorization', `Bearer ${token}`)
      .send(fareBody());

    const xafAmt = res.body.fare.amount_xaf;
    const ngnAmt = res.body.fare.local_price.amount;
    expect(ngnAmt).toBeGreaterThan(xafAmt);
    expect(Math.abs(ngnAmt / xafAmt - 2.75)).toBeLessThan(0.01);
  });

  test('ZAR fare is smaller in number than XAF (fewer units per XAF)', async () => {
    // 1 XAF = 0.031 ZAR → ZAR amount should be ~0.031× the XAF amount
    const token = makeToken(makeUser('ZA'));
    mockRideDb.query
      .mockResolvedValueOnce(userRow('ZA'))
      .mockResolvedValueOnce(NO_SURGE);

    const res = await request(rideApp)
      .post('/rides/fare')
      .set('Authorization', `Bearer ${token}`)
      .send(fareBody());

    const xafAmt = res.body.fare.amount_xaf;
    const zarAmt = res.body.fare.local_price.amount;
    expect(zarAmt).toBeLessThan(xafAmt);
  });

  test('x-country-code header is respected when JWT has no country_code', async () => {
    // Token without country_code (simulates old JWT)
    const token = makeToken({ id: 'old-user', role: 'rider', full_name: 'Old User' });
    mockRideDb.query
      .mockResolvedValueOnce(userRow('GH'))
      .mockResolvedValueOnce(NO_SURGE);

    const res = await request(rideApp)
      .post('/rides/fare')
      .set('Authorization', `Bearer ${token}`)
      .set('x-country-code', 'GH')
      .send(fareBody());

    expect(res.status).toBe(200);
    expect(res.body.currency_code).toBe('GHS');
    expect(res.body.fare.local_price.currency_symbol).toBe('GH₵');
  });
});

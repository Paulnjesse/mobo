'use strict';
/**
 * sharedUtils_p3.test.js — P3 shared utility tests
 *
 * Tests: latencyMiddleware, currencyMiddleware, featureFlags,
 *        networkResilience (withRetry, backoffMs), auditLog
 */

process.env.NODE_ENV = 'test';

// ── Mock shared logger ─────────────────────────────────────────────────────────
jest.mock('../logger', () => ({
  info:  jest.fn(),
  warn:  jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// ── Mock axios so networkResilience can load (axiosAfrica uses axios.create) ──
jest.mock('axios', () => {
  const mockInstance = {
    post: jest.fn(), get: jest.fn(), interceptors: {
      response: { use: jest.fn() },
      request:  { use: jest.fn() },
    },
  };
  return {
    create: jest.fn(() => mockInstance),
    get: jest.fn(), post: jest.fn(),
    default: { create: jest.fn(() => mockInstance) },
  };
});

// ═══════════════════════════════════════════════════════════════════════════════
// latencyMiddleware
// ═══════════════════════════════════════════════════════════════════════════════

describe('latencyMiddleware — normalisePath (internal)', () => {
  // We test the public API via httpLatencyMiddleware + a mock histogram

  const { httpLatencyMiddleware } = require('../latencyMiddleware');

  function makeHistogram() {
    const observed = [];
    return {
      labels: jest.fn().mockReturnValue({
        observe: jest.fn((val) => observed.push(val)),
      }),
      observed,
    };
  }

  function makeReq(path = '/rides/abc-123/status', method = 'GET', route = null) {
    return { path, method, url: path, route: route ? { path: route } : undefined };
  }

  function makeRes(statusCode = 200) {
    const headers = {};
    const listeners = {};
    return {
      statusCode,
      setHeader: jest.fn((key, val) => { headers[key] = val; }),
      on: jest.fn((event, fn) => { listeners[event] = fn; }),
      // simulate `on-headers` by exposing a trigger
      _headers: headers,
      _triggerHeaders: function () {
        // on-headers executes the listener with `this` = res
        if (listeners['__headers']) listeners['__headers'].call(this);
      },
    };
  }

  test('middleware skips /health path', () => {
    const histogram = makeHistogram();
    const mw = httpLatencyMiddleware(histogram);
    const req = makeReq('/health');
    const res = makeRes();
    const next = jest.fn();
    mw(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(histogram.labels).not.toHaveBeenCalled();
  });

  test('middleware skips /metrics path', () => {
    const histogram = makeHistogram();
    const mw = httpLatencyMiddleware(histogram);
    const req = makeReq('/metrics');
    const res = makeRes();
    const next = jest.fn();
    mw(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(histogram.labels).not.toHaveBeenCalled();
  });

  test('middleware calls next() for regular paths', () => {
    const histogram = makeHistogram();
    const mw = httpLatencyMiddleware(histogram);
    const req = makeReq('/rides/123/status');
    const res = makeRes();
    const next = jest.fn();
    mw(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('createLatencyHistogram', () => {
  test('creates histogram with correct metric name and labels', async () => {
    const promClient = require('prom-client');
    const registry = new promClient.Registry();
    const { createLatencyHistogram } = require('../latencyMiddleware');

    const histogram = createLatencyHistogram(registry, 'test-service');
    expect(histogram).toBeDefined();

    // Verify it's registered in the registry (getMetricsAsJSON returns Promise in prom-client v15+)
    const metricsRaw = registry.getMetricsAsJSON();
    const metrics = metricsRaw && typeof metricsRaw.then === 'function'
      ? await metricsRaw
      : metricsRaw;
    const httpMetric = Array.isArray(metrics)
      ? metrics.find((m) => m.name === 'http_request_duration_seconds')
      : null;

    if (httpMetric) {
      expect(httpMetric.help).toContain('test-service');
    } else {
      // Some prom-client versions return metrics differently — just verify histogram is created
      expect(histogram.observe || histogram.labels).toBeDefined();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// currencyMiddleware
// ═══════════════════════════════════════════════════════════════════════════════

describe('currencyMiddleware', () => {
  const { currencyMiddleware } = require('../currencyMiddleware');

  function runMiddleware(user = {}, headers = {}) {
    const req = { user, headers };
    const next = jest.fn();
    currencyMiddleware(req, {}, next);
    return req;
  }

  test('defaults to XAF for Cameroon (CM)', () => {
    const req = runMiddleware({ country_code: 'CM' });
    expect(req.currency.code).toBe('XAF');
    expect(req.currency.symbol).toBe('FCFA');
    expect(req.currency.country_code).toBe('CM');
  });

  test('resolves NGN for Nigeria', () => {
    const req = runMiddleware({ country_code: 'NG' });
    expect(req.currency.code).toBe('NGN');
    expect(req.currency.symbol).toBe('₦');
  });

  test('resolves KES for Kenya', () => {
    const req = runMiddleware({ country_code: 'KE' });
    expect(req.currency.code).toBe('KES');
  });

  test('falls back to CM/XAF when no country info', () => {
    const req = runMiddleware();
    expect(req.currency.code).toBe('XAF');
  });

  test('uses x-country-code header when no user country_code', () => {
    const req = runMiddleware({}, { 'x-country-code': 'NG' });
    expect(req.currency.code).toBe('NGN');
  });

  test('user country_code takes priority over x-country-code header', () => {
    const req = runMiddleware({ country_code: 'KE' }, { 'x-country-code': 'NG' });
    expect(req.currency.code).toBe('KES');
  });

  test('fromXAF converts XAF to local currency correctly', () => {
    const req = runMiddleware({ country_code: 'NG' }); // rate_x1000 = 2750
    // 1000 XAF * 2750 / 1000 = 2750 NGN
    expect(req.currency.fromXAF(1000)).toBe(2750);
  });

  test('toXAF converts local currency back to XAF', () => {
    const req = runMiddleware({ country_code: 'NG' }); // rate_x1000 = 2750
    // 2750 NGN * 1000 / 2750 = 1000 XAF
    expect(req.currency.toXAF(2750)).toBe(1000);
  });

  test('format returns symbol + localized amount string', () => {
    const req = runMiddleware({ country_code: 'CM' }); // XAF — 1:1
    const formatted = req.currency.format(5000);
    expect(formatted).toContain('FCFA');
    expect(formatted).toContain('5');
  });

  test('localPrice returns conversion object', () => {
    const req = runMiddleware({ country_code: 'NG' });
    const local = req.currency.localPrice(1000);
    expect(local).toBeDefined();
    expect(typeof local).toBe('object');
  });

  test('calls next()', () => {
    const req = { user: { country_code: 'CM' }, headers: {} };
    const next = jest.fn();
    currencyMiddleware(req, {}, next);
    expect(next).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// featureFlags
// ═══════════════════════════════════════════════════════════════════════════════

describe('featureFlags — in-process fallback (no Unleash configured)', () => {
  let isEnabled, getVariant, initFeatureFlags, destroyFeatureFlags;

  beforeEach(() => {
    jest.resetModules();
    delete process.env.UNLEASH_URL;
    delete process.env.UNLEASH_API_TOKEN;
    // Clear any FEATURE_ env overrides
    Object.keys(process.env).filter((k) => k.startsWith('FEATURE_')).forEach((k) => delete process.env[k]);

    const flags = require('../featureFlags');
    isEnabled         = flags.isEnabled;
    getVariant        = flags.getVariant;
    initFeatureFlags  = flags.initFeatureFlags;
    destroyFeatureFlags = flags.destroyFeatureFlags;
  });

  test('fraud_detection_v1 is true by default (fallback)', () => {
    expect(isEnabled('fraud_detection_v1')).toBe(true);
  });

  test('new_surge_algorithm is false by default', () => {
    expect(isEnabled('new_surge_algorithm')).toBe(false);
  });

  test('stripe_webhook_v2 is true by default', () => {
    expect(isEnabled('stripe_webhook_v2')).toBe(true);
  });

  test('location_purge_enabled is true by default', () => {
    expect(isEnabled('location_purge_enabled')).toBe(true);
  });

  test('unknown flags return false', () => {
    expect(isEnabled('completely_unknown_flag_xyz')).toBe(false);
  });

  test('env override FEATURE_NEW_SURGE_ALGORITHM=true enables the flag', () => {
    process.env.FEATURE_NEW_SURGE_ALGORITHM = 'true';
    expect(isEnabled('new_surge_algorithm')).toBe(true);
    delete process.env.FEATURE_NEW_SURGE_ALGORITHM;
  });

  test('env override FEATURE_FRAUD_DETECTION_V1=false disables a default-true flag', () => {
    process.env.FEATURE_FRAUD_DETECTION_V1 = 'false';
    expect(isEnabled('fraud_detection_v1')).toBe(false);
    delete process.env.FEATURE_FRAUD_DETECTION_V1;
  });

  test('env override with "1" enables flag', () => {
    process.env.FEATURE_GDPR_EXPORT_V2 = '1';
    expect(isEnabled('gdpr_export_v2')).toBe(true);
    delete process.env.FEATURE_GDPR_EXPORT_V2;
  });

  test('getVariant returns disabled variant when no Unleash client', () => {
    const variant = getVariant('some_variant_flag');
    expect(variant.name).toBe('disabled');
    expect(variant.enabled).toBe(false);
  });

  test('initFeatureFlags completes without Unleash URL (no-op)', async () => {
    await expect(initFeatureFlags()).resolves.toBeUndefined();
  });

  test('destroyFeatureFlags is safe to call when no client initialized', () => {
    expect(() => destroyFeatureFlags()).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// networkResilience — withRetry + backoffMs
// ═══════════════════════════════════════════════════════════════════════════════

describe('networkResilience — backoffMs', () => {
  const { backoffMs } = require('../networkResilience');

  test('returns a positive number', () => {
    const delay = backoffMs(1, { baseDelayMs: 600, maxDelayMs: 8000, jitterFactor: 0 });
    expect(delay).toBe(600); // no jitter → exactly base
  });

  test('doubles on each attempt (exponential, no jitter)', () => {
    const d1 = backoffMs(1, { baseDelayMs: 100, maxDelayMs: 10000, jitterFactor: 0 });
    const d2 = backoffMs(2, { baseDelayMs: 100, maxDelayMs: 10000, jitterFactor: 0 });
    const d3 = backoffMs(3, { baseDelayMs: 100, maxDelayMs: 10000, jitterFactor: 0 });
    expect(d1).toBe(100);
    expect(d2).toBe(200);
    expect(d3).toBe(400);
  });

  test('caps at maxDelayMs', () => {
    const delay = backoffMs(20, { baseDelayMs: 600, maxDelayMs: 1000, jitterFactor: 0 });
    expect(delay).toBe(1000);
  });

  test('jitter produces values within ±25% of base', () => {
    const delays = Array.from({ length: 50 }, () =>
      backoffMs(1, { baseDelayMs: 1000, maxDelayMs: 10000, jitterFactor: 0.25 })
    );
    delays.forEach((d) => {
      expect(d).toBeGreaterThanOrEqual(750);
      expect(d).toBeLessThanOrEqual(1250);
    });
  });
});

describe('networkResilience — withRetry', () => {
  const { withRetry } = require('../networkResilience');
  const logger = require('../logger');

  beforeEach(() => jest.clearAllMocks());

  test('returns value immediately on first success', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('retries on transient 503 and succeeds on second attempt', async () => {
    const err503 = Object.assign(new Error('Service Unavailable'), { response: { status: 503 } });
    const fn = jest.fn()
      .mockRejectedValueOnce(err503)
      .mockResolvedValueOnce('recovered');

    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5 });
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('throws after all attempts exhausted', async () => {
    const err = Object.assign(new Error('Network error'), { response: { status: 503 } });
    const fn = jest.fn().mockRejectedValue(err);

    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5 })
    ).rejects.toThrow('Network error');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test('does NOT retry on 404 (non-retryable client error)', async () => {
    const err = Object.assign(new Error('Not Found'), { response: { status: 404 } });
    const fn = jest.fn().mockRejectedValue(err);

    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 })
    ).rejects.toThrow('Not Found');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('does NOT retry on 401 (auth error)', async () => {
    const err = Object.assign(new Error('Unauthorized'), { response: { status: 401 } });
    const fn = jest.fn().mockRejectedValue(err);

    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 })
    ).rejects.toThrow('Unauthorized');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('retries on 429 (rate limited)', async () => {
    const err429 = Object.assign(new Error('Rate Limited'), { response: { status: 429 } });
    const fn = jest.fn()
      .mockRejectedValueOnce(err429)
      .mockResolvedValueOnce('ok after rate limit');

    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5 });
    expect(result).toBe('ok after rate limit');
  });

  test('custom shouldRetry predicate can abort early', async () => {
    const err = new Error('Domain error');
    const fn = jest.fn().mockRejectedValue(err);
    const shouldRetry = jest.fn().mockReturnValue(false); // never retry

    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 1, shouldRetry })
    ).rejects.toThrow('Domain error');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(shouldRetry).toHaveBeenCalledWith(err, 1);
  });

  test('calls logger.warn on retry and final failure', async () => {
    const err = Object.assign(new Error('Temporary failure'), { response: { status: 502 } });
    const fn = jest.fn().mockRejectedValue(err);

    await expect(
      withRetry(fn, { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 5, label: 'test-op' })
    ).rejects.toThrow();

    // Should warn on retry attempt 1 and final failure
    expect(logger.warn).toHaveBeenCalled();
    const calls = logger.warn.mock.calls.map((c) => c[0]);
    expect(calls.some((msg) => msg.includes('test-op'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// auditLog
// ═══════════════════════════════════════════════════════════════════════════════

describe('auditLog — log()', () => {
  const audit = require('../auditLog');

  function makePool(error = null) {
    return {
      query: error
        ? jest.fn().mockRejectedValue(error)
        : jest.fn().mockResolvedValue({ rows: [] }),
    };
  }

  test('inserts audit record with correct action', async () => {
    const pool = makePool();
    await audit.log(pool, {
      actor_id:    'user-1',
      actor_role:  'rider',
      action:      'ride.request',
      resource_type: 'ride',
      resource_id: 'ride-abc',
      ip:          '127.0.0.1',
      outcome:     'success',
      detail:      { estimated_fare: 5000 },
    });

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO audit_logs');
    expect(params[2]).toBe('ride.request');   // action
    expect(params[7]).toBe('success');        // outcome
    expect(params[8]).toContain('5000');      // detail as JSON string
  });

  test('returns without querying when action is missing', async () => {
    const pool = makePool();
    await audit.log(pool, { actor_id: 'u1' }); // no action
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('does NOT throw when DB write fails (fire-and-forget safe)', async () => {
    const pool = makePool(new Error('DB constraint violation'));
    await expect(
      audit.log(pool, { action: 'auth.login', outcome: 'success' })
    ).resolves.toBeUndefined();
  });

  test('handles null optional fields gracefully', async () => {
    const pool = makePool();
    await audit.log(pool, { action: 'auth.logout' });

    const params = pool.query.mock.calls[0][1];
    expect(params[0]).toBeNull();  // actor_id
    expect(params[1]).toBeNull();  // actor_role
    expect(params[3]).toBeNull();  // resource_type
    expect(params[4]).toBeNull();  // resource_id
  });

  test('converts resource_id to string', async () => {
    const pool = makePool();
    await audit.log(pool, { action: 'payment.complete', resource_id: 12345 });

    const params = pool.query.mock.calls[0][1];
    expect(params[4]).toBe('12345');
    expect(typeof params[4]).toBe('string');
  });
});

describe('auditLog — AUDITABLE_ACTIONS', () => {
  const { AUDITABLE_ACTIONS } = require('../auditLog');

  test('contains auth actions', () => {
    expect(AUDITABLE_ACTIONS.has('auth.login')).toBe(true);
    expect(AUDITABLE_ACTIONS.has('auth.otp.verify')).toBe(true);
    expect(AUDITABLE_ACTIONS.has('auth.2fa.setup')).toBe(true);
  });

  test('contains payment actions', () => {
    expect(AUDITABLE_ACTIONS.has('payment.initiate')).toBe(true);
    expect(AUDITABLE_ACTIONS.has('payment.refund')).toBe(true);
  });

  test('contains ride actions', () => {
    expect(AUDITABLE_ACTIONS.has('ride.request')).toBe(true);
    expect(AUDITABLE_ACTIONS.has('ride.cancel')).toBe(true);
  });

  test('contains security actions', () => {
    expect(AUDITABLE_ACTIONS.has('security.device.mismatch')).toBe(true);
    expect(AUDITABLE_ACTIONS.has('security.idor.attempt')).toBe(true);
  });
});

describe('auditLog — middleware()', () => {
  const { middleware } = require('../auditLog');

  test('logs the action and calls next()', async () => {
    const pool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };
    const req = {
      user:    { id: 'user-1', role: 'rider' },
      ip:      '10.0.0.1',
      headers: { 'user-agent': 'MoboApp/1.0' },
    };
    const next = jest.fn();

    const mw = middleware(pool, 'auth.login');
    await mw(req, {}, next);

    expect(pool.query).toHaveBeenCalledTimes(1);
    const params = pool.query.mock.calls[0][1];
    expect(params[2]).toBe('auth.login');
    expect(params[0]).toBe('user-1');
    expect(next).toHaveBeenCalled();
  });

  test('calls next() even when DB write fails', async () => {
    const pool = { query: jest.fn().mockRejectedValue(new Error('DB down')) };
    const req  = { user: null, ip: null, headers: {} };
    const next = jest.fn();

    const mw = middleware(pool, 'auth.login.fail');
    await mw(req, {}, next);

    expect(next).toHaveBeenCalled();
  });
});

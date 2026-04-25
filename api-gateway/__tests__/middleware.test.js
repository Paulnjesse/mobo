'use strict';
/**
 * middleware.test.js — API Gateway middleware unit tests
 *
 * Tests: verifyToken, optionalAuth, requireRole (auth.js)
 *        cacheHeaders (cacheHeaders.js)
 *        requestId (requestId.js)
 *        circuitBreakerFor, getAllServiceHealth (serviceCircuitBreaker.js)
 */

process.env.NODE_ENV   = 'test';
process.env.JWT_SECRET = 'test_secret_minimum_32_chars_long_abc';

// jwtUtil uses HS256 in test (no RS256 keys)
const { signToken } = require('../../services/shared/jwtUtil');

// Prevent the recursive logger.child bug in api-gateway/src/utils/logger.js
// (line 34: `logger.child = (meta) => logger.child(meta)` creates infinite recursion)
jest.mock('../src/utils/logger', () => {
  const mockChild = jest.fn().mockReturnValue({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  });
  return {
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), http: jest.fn(),
    child: mockChild,
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(overrides = {}) {
  return { headers: {}, ...overrides };
}

function makeRes() {
  const res = { _headers: {}, _status: null, _body: null };
  res.status = jest.fn((code) => { res._status = code; return res; });
  res.json   = jest.fn((body)  => { res._body  = body;  return res; });
  res.setHeader = jest.fn((key, val) => { res._headers[key] = val; });
  res.end    = jest.fn();
  res.write  = jest.fn();
  res.statusCode = 200;
  return res;
}

// ═══════════════════════════════════════════════════════════════════════════════
// auth.js
// ═══════════════════════════════════════════════════════════════════════════════

const { verifyToken, optionalAuth, requireRole } = require('../src/middleware/auth');

describe('verifyToken', () => {
  test('401 when no Authorization header', () => {
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();
    verifyToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('401 when header is not Bearer', () => {
    const req = makeReq({ headers: { authorization: 'Basic dXNlcjpwYXNz' } });
    const res = makeRes();
    const next = jest.fn();
    verifyToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('passes with valid JWT and injects x-user-id header', () => {
    const token = signToken({ id: 'user-1', role: 'rider', phone: '+237612345678', full_name: 'Jean' });
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
    const res = makeRes();
    const next = jest.fn();
    verifyToken(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.headers['x-user-id']).toBe('user-1');
    expect(req.headers['x-user-role']).toBe('rider');
    expect(req.user.id).toBe('user-1');
  });

  test('401 on expired token', () => {
    const token = signToken({ id: 'user-1', role: 'rider' }, { expiresIn: '-1s' });
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
    const res = makeRes();
    const next = jest.fn();
    verifyToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res._body.message).toContain('expired');
  });

  test('401 on tampered token', () => {
    const req = makeReq({ headers: { authorization: 'Bearer bad.token.here' } });
    const res = makeRes();
    const next = jest.fn();
    verifyToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res._body.message).toContain('Invalid');
  });

  test('401 on device binding mismatch', () => {
    const token = signToken({ id: 'user-1', role: 'rider', device_id: 'device-abc' });
    const req = makeReq({ headers: { authorization: `Bearer ${token}`, 'x-device-id': 'device-xyz' } });
    const res = makeRes();
    const next = jest.fn();
    verifyToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res._body.code).toBe('DEVICE_BINDING_FAILED');
  });

  test('passes when device_id matches', () => {
    const token = signToken({ id: 'user-1', role: 'rider', device_id: 'device-abc' });
    const req = makeReq({ headers: { authorization: `Bearer ${token}`, 'x-device-id': 'device-abc' } });
    const res = makeRes();
    const next = jest.fn();
    verifyToken(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('optionalAuth', () => {
  test('calls next without user when no token', () => {
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();
    optionalAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  test('attaches user when valid token provided', () => {
    const token = signToken({ id: 'user-2', role: 'driver' });
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
    const res = makeRes();
    const next = jest.fn();
    optionalAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user?.id).toBe('user-2');
  });

  test('calls next without user when token is invalid (non-fatal)', () => {
    const req = makeReq({ headers: { authorization: 'Bearer invalid.token' } });
    const res = makeRes();
    const next = jest.fn();
    optionalAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });
});

describe('requireRole', () => {
  test('401 when no user on req', () => {
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();
    requireRole('admin')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('403 when user role does not match', () => {
    const req = makeReq({ user: { id: 'u1', role: 'rider' } });
    const res = makeRes();
    const next = jest.fn();
    requireRole('admin')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('passes when role matches', () => {
    const req = makeReq({ user: { id: 'u1', role: 'admin' } });
    const res = makeRes();
    const next = jest.fn();
    requireRole('admin')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('passes when role matches any of multiple allowed', () => {
    const req = makeReq({ user: { id: 'u1', role: 'driver' } });
    const res = makeRes();
    const next = jest.fn();
    requireRole('admin', 'driver')(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// cacheHeaders.js
// ═══════════════════════════════════════════════════════════════════════════════

const { cacheHeaders } = require('../src/middleware/cacheHeaders');

describe('cacheHeaders', () => {
  function getHeader(path, method = 'GET') {
    const req = makeReq({ path, method });
    const res = makeRes();
    const next = jest.fn();
    cacheHeaders(req, res, next);
    return { header: res._headers['Cache-Control'], next };
  }

  test('POST requests get no-store', () => {
    const { header, next } = getHeader('/api/rides/surge', 'POST');
    expect(header).toBe('no-store');
    expect(next).toHaveBeenCalled();
  });

  test('DELETE requests get no-store', () => {
    const { header } = getHeader('/api/food/restaurants', 'DELETE');
    expect(header).toBe('no-store');
  });

  test('surge zones GET get 60s cache', () => {
    const { header } = getHeader('/api/rides/surge');
    expect(header).toContain('max-age=60');
    expect(header).toContain('stale-while-revalidate=120');
  });

  test('ride types GET get 3600s cache', () => {
    const { header } = getHeader('/api/rides/types');
    expect(header).toContain('max-age=3600');
  });

  test('restaurant list GET gets 300s cache', () => {
    // Pattern requires /api/v1/food/restaurants (v?1? means optional v then optional 1, but slash must follow)
    const { header } = getHeader('/api/v1/food/restaurants');
    expect(header).toContain('max-age=300');
    expect(header).toContain('public');
  });

  test('health endpoint gets 10s cache', () => {
    const { header } = getHeader('/health');
    expect(header).toContain('max-age=10');
  });

  test('admin dashboard gets 30s cache', () => {
    const { header } = getHeader('/api/v1/admin/dashboard');
    expect(header).toContain('max-age=30');
  });

  test('unknown path gets private no-store', () => {
    const { header } = getHeader('/api/user/profile');
    expect(header).toBe('private, no-store');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// requestId.js
// ═══════════════════════════════════════════════════════════════════════════════

const requestId = require('../src/middleware/requestId');

describe('requestId', () => {
  test('generates a new UUID when no X-Request-ID header', () => {
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();
    requestId(req, res, next);
    expect(req.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res._headers['X-Request-ID']).toBe(req.id);
    expect(next).toHaveBeenCalled();
  });

  test('uses existing X-Request-ID when provided', () => {
    const req = makeReq({ headers: { 'x-request-id': 'custom-req-id-123' } });
    const res = makeRes();
    const next = jest.fn();
    requestId(req, res, next);
    expect(req.id).toBe('custom-req-id-123');
    expect(res._headers['X-Request-ID']).toBe('custom-req-id-123');
  });

  test('attaches a child logger to req.logger', () => {
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();
    requestId(req, res, next);
    expect(req.logger).toBeDefined();
    expect(typeof req.logger.info).toBe('function');
  });

  test('different requests get different IDs', () => {
    const req1 = makeReq();
    const req2 = makeReq();
    const res  = makeRes();
    requestId(req1, res, jest.fn());
    requestId(req2, res, jest.fn());
    expect(req1.id).not.toBe(req2.id);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// serviceCircuitBreaker.js
// ═══════════════════════════════════════════════════════════════════════════════

const { circuitBreakerFor, getAllServiceHealth } = require('../src/middleware/serviceCircuitBreaker');

describe('circuitBreakerFor', () => {
  test('returns a middleware function', () => {
    const middleware = circuitBreakerFor('test-service');
    expect(typeof middleware).toBe('function');
  });

  test('registers service in health state', () => {
    circuitBreakerFor('health-test-service');
    const health = getAllServiceHealth();
    expect(health['health-test-service']).toBeDefined();
    expect(health['health-test-service'].state).toBe('CLOSED');
  });

  test('passes request through when circuit is CLOSED', () => {
    const middleware = circuitBreakerFor('passing-service');
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('success counter increments on 2xx response', () => {
    const svcName = 'success-track-service';
    const middleware = circuitBreakerFor(svcName);
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();
    middleware(req, res, next);
    res.statusCode = 200;
    res.end();
    const health = getAllServiceHealth();
    expect(health[svcName].successes).toBeGreaterThanOrEqual(1);
  });
});

describe('getAllServiceHealth', () => {
  test('returns an object with registered services', () => {
    circuitBreakerFor('meta-service');
    const health = getAllServiceHealth();
    expect(typeof health).toBe('object');
    expect(health['meta-service']).toBeDefined();
  });

  test('state is one of CLOSED, OPEN, HALF_OPEN', () => {
    circuitBreakerFor('state-check-service');
    const health = getAllServiceHealth();
    const validStates = ['CLOSED', 'OPEN', 'HALF_OPEN'];
    Object.values(health).forEach((h) => {
      expect(validStates).toContain(h.state);
    });
  });
});

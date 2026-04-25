'use strict';
/**
 * internalAuth.test.js — inter-service authentication middleware
 */
process.env.NODE_ENV = 'test';
process.env.INTERNAL_SERVICE_KEY = 'shared-internal-secret-key-test';
process.env.INTERNAL_SERVICE_KEY_RIDE = 'ride-specific-key-test';

jest.resetModules();
const { internalAuth, internalHeaders, timingSafeStringEqual } = require('../internalAuth');

function makeReq(overrides = {}) {
  return {
    headers: {},
    callingService: null,
    ...overrides,
  };
}
function makeRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

describe('timingSafeStringEqual', () => {
  test('returns true for identical strings', () => {
    expect(timingSafeStringEqual('abc', 'abc')).toBe(true);
  });

  test('returns false for different strings', () => {
    expect(timingSafeStringEqual('abc', 'xyz')).toBe(false);
  });

  test('returns false for different lengths', () => {
    expect(timingSafeStringEqual('short', 'longer-string')).toBe(false);
  });

  test('returns false for empty vs non-empty', () => {
    expect(timingSafeStringEqual('', 'abc')).toBe(false);
  });

  test('returns true for two empty strings', () => {
    expect(timingSafeStringEqual('', '')).toBe(true);
  });
});

describe('internalAuth middleware', () => {
  test('allows request with correct shared key', () => {
    const req = makeReq({ headers: { 'x-internal-service-key': 'shared-internal-secret-key-test', 'x-calling-service': 'user' } });
    const res = makeRes();
    const next = jest.fn();
    internalAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBeNull();
  });

  test('uses per-service key when available', () => {
    const req = makeReq({ headers: { 'x-internal-service-key': 'ride-specific-key-test', 'x-calling-service': 'ride' } });
    const res = makeRes();
    const next = jest.fn();
    internalAuth(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('rejects wrong key with 403', () => {
    const req = makeReq({ headers: { 'x-internal-service-key': 'wrong-key', 'x-calling-service': 'user' } });
    const res = makeRes();
    const next = jest.fn();
    internalAuth(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects missing key with 403', () => {
    const req = makeReq({ headers: { 'x-calling-service': 'payment' } });
    const res = makeRes();
    const next = jest.fn();
    internalAuth(req, res, next);
    expect(res.statusCode).toBe(403);
  });

  test('rejects shared key for service that has per-service key', () => {
    // ride has a per-service key — shared key should not match it
    const req = makeReq({ headers: { 'x-internal-service-key': 'shared-internal-secret-key-test', 'x-calling-service': 'ride' } });
    const res = makeRes();
    const next = jest.fn();
    internalAuth(req, res, next);
    // shared key !== ride-specific key → 403
    expect(res.statusCode).toBe(403);
  });

  test('strips non-alphanumeric characters from x-calling-service header', () => {
    const req = makeReq({ headers: { 'x-internal-service-key': 'shared-internal-secret-key-test', 'x-calling-service': '../../../etc/passwd' } });
    const res = makeRes();
    const next = jest.fn();
    internalAuth(req, res, next);
    // Sanitised service name won't match per-service key → falls through to shared key
    expect(next).toHaveBeenCalled(); // shared key is correct
    expect(req.callingService).not.toContain('/');
  });

  test('attaches callingService to req on success', () => {
    const req = makeReq({ headers: { 'x-internal-service-key': 'shared-internal-secret-key-test', 'x-calling-service': 'location' } });
    const res = makeRes();
    const next = jest.fn();
    internalAuth(req, res, next);
    expect(req.callingService).toBe('location');
  });

  test('falls through to next() in non-production when no key configured', () => {
    const saved = process.env.INTERNAL_SERVICE_KEY;
    const savedRide = process.env.INTERNAL_SERVICE_KEY_RIDE;
    delete process.env.INTERNAL_SERVICE_KEY;
    delete process.env.INTERNAL_SERVICE_KEY_RIDE;
    jest.resetModules();
    const { internalAuth: authNoKey } = require('../internalAuth');
    const req = makeReq({ headers: {} });
    const res = makeRes();
    const next = jest.fn();
    authNoKey(req, res, next);
    expect(next).toHaveBeenCalled();
    process.env.INTERNAL_SERVICE_KEY = saved;
    process.env.INTERNAL_SERVICE_KEY_RIDE = savedRide;
  });
});

describe('internalHeaders helper', () => {
  test('returns headers object with X-Internal-Service-Key', () => {
    const headers = internalHeaders('ride');
    expect(headers['X-Internal-Service-Key']).toBe('ride-specific-key-test');
    expect(headers['X-Calling-Service']).toBe('ride');
    expect(headers['Content-Type']).toBe('application/json');
  });

  test('falls back to shared key for unknown service', () => {
    const headers = internalHeaders('unknown-service');
    expect(headers['X-Internal-Service-Key']).toBe('shared-internal-secret-key-test');
  });

  test('merges extra headers', () => {
    const headers = internalHeaders('user', { 'X-Request-ID': 'abc-123' });
    expect(headers['X-Request-ID']).toBe('abc-123');
  });

  test('handles empty callingService', () => {
    const headers = internalHeaders('');
    expect(headers['X-Calling-Service']).toBe('');
    expect(headers['X-Internal-Service-Key']).toBe('shared-internal-secret-key-test');
  });
});

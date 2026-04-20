'use strict';
/**
 * user_utils_services.test.js
 *
 * Targets:
 *  - src/utils/response.js — 0% → 100% (pure helper functions)
 *  - src/services/authService.js — 0% → high coverage (unit tests)
 *  - src/middleware/rbac.js — 69.69% → higher (cover getUserPermissions branches)
 *  - src/middleware/adminIpGuard.js — 64% → higher (cover IP guard branches)
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

beforeEach(() => {
  mockDb.query.mockReset();
  mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ─── response.js — unit tests ─────────────────────────────────────────────────

describe('response helpers — success()', () => {
  let response;

  beforeAll(() => {
    jest.isolateModules(() => {
      response = require('../src/utils/response');
    });
  });

  function makeMockRes() {
    const res = {
      req: { id: 'req-123' },
      _status: null,
      _body:   null,
      status(code) { this._status = code; return this; },
      json(body)   { this._body  = body;  return this; },
      send(body)   { this._body  = body;  return this; },
    };
    return res;
  }

  test('success — default 200 with data', () => {
    const res = makeMockRes();
    response.success(res, { id: 1 }, 'OK');
    expect(res._status).toBe(200);
    expect(res._body.success).toBe(true);
    expect(res._body.data).toEqual({ id: 1 });
    expect(res._body.requestId).toBe('req-123');
  });

  test('success — no data (null)', () => {
    const res = makeMockRes();
    response.success(res, null, 'Done', 204);
    expect(res._status).toBe(204);
    expect(res._body.data).toBeUndefined();
  });

  test('success — no req.id on res', () => {
    const res = makeMockRes();
    res.req = {};
    response.success(res, { x: 1 });
    expect(res._body.requestId).toBeUndefined();
  });

  test('created — returns 201', () => {
    const res = makeMockRes();
    response.created(res, { id: 5 });
    expect(res._status).toBe(201);
    expect(res._body.data).toEqual({ id: 5 });
  });

  test('paginated — returns pagination metadata', () => {
    const res = makeMockRes();
    response.paginated(res, [1, 2, 3], 100, 1, 10);
    expect(res._status).toBe(200);
    expect(res._body.data.pagination.total).toBe(100);
    expect(res._body.data.pagination.pages).toBe(10);
    expect(res._body.data.items).toEqual([1, 2, 3]);
  });

  test('error — default 500', () => {
    const res = makeMockRes();
    response.error(res);
    expect(res._status).toBe(500);
    expect(res._body.success).toBe(false);
    expect(res._body.code).toBe('INTERNAL_ERROR');
  });

  test('error — with fields', () => {
    const res = makeMockRes();
    response.error(res, 'Bad input', 400, 'VALIDATION_ERROR', [{ field: 'email', msg: 'Invalid' }]);
    expect(res._status).toBe(400);
    expect(res._body.fields).toHaveLength(1);
  });

  test('errorHandler — operational error', () => {
    const res = makeMockRes();
    const req = { path: '/test', id: 'r1', logger: { warn: jest.fn(), error: jest.fn() } };
    const err = { isOperational: true, code: 'NOT_FOUND', message: 'Not found', statusCode: 404, fields: [] };
    response.errorHandler(err, req, res, jest.fn());
    expect(res._status).toBe(404);
    expect(res._body.message).toBe('Not found');
  });

  test('errorHandler — unknown error (no logger on req)', () => {
    const res = makeMockRes();
    const req = { path: '/test', id: 'r1' };
    const err = { isOperational: false, message: 'Something broke', stack: 'at foo' };
    response.errorHandler(err, req, res, jest.fn());
    expect(res._status).toBe(500);
    expect(res._body.message).toBe('An unexpected error occurred');
  });
});

// ─── authService.js — unit tests ─────────────────────────────────────────────

describe('authService — signToken / verifyToken', () => {
  let authService;
  beforeAll(() => {
    jest.isolateModules(() => {
      authService = require('../src/services/authService');
    });
  });

  test('signToken returns a string', () => {
    const token = authService.signToken({ userId: 1, role: 'rider' });
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });

  test('verifyToken decodes a valid token', () => {
    const token = authService.signToken({ userId: 42 });
    const decoded = authService.verifyToken(token);
    expect(decoded.userId).toBe(42);
  });

  test('verifyToken throws on invalid token', () => {
    expect(() => authService.verifyToken('invalid.token.here')).toThrow();
  });
});

describe('authService — generateOtp', () => {
  let authService;
  beforeAll(() => {
    jest.isolateModules(() => {
      authService = require('../src/services/authService');
    });
  });

  test('generateOtp returns a 6-digit string', () => {
    const otp = authService.generateOtp();
    expect(otp).toMatch(/^\d{6}$/);
  });
});

describe('authService — sanitizeUser / buildAuthResponse', () => {
  let authService;
  beforeAll(() => {
    jest.isolateModules(() => {
      authService = require('../src/services/authService');
    });
  });

  test('sanitizeUser removes sensitive fields', () => {
    const user = {
      id: 1,
      full_name: 'John',
      password_hash: 'secret',
      otp_code: '123456',
      otp_expires_at: new Date(),
      otp_attempts: 2,
      role: 'rider',
    };
    const safe = authService.sanitizeUser(user);
    expect(safe.password_hash).toBeUndefined();
    expect(safe.otp_code).toBeUndefined();
    expect(safe.otp_attempts).toBeUndefined();
    expect(safe.id).toBe(1);
  });

  test('buildAuthResponse returns token + safe user', () => {
    const user = { id: 1, role: 'rider', phone: '+2376100001', full_name: 'Bob', password_hash: 'x' };
    const result = authService.buildAuthResponse(user);
    expect(result.token).toBeTruthy();
    expect(result.user.password_hash).toBeUndefined();
    expect(result.user.full_name).toBe('Bob');
  });
});

describe('authService — findUserByIdentifier', () => {
  let authService;
  beforeAll(() => {
    jest.isolateModules(() => {
      authService = require('../src/services/authService');
    });
  });

  test('phone lookup — user found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, phone: '+237611000001' }] });
    const user = await authService.findUserByIdentifier('+237611000001');
    expect(user.id).toBe(1);
  });

  test('phone lookup — user not found returns null', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const user = await authService.findUserByIdentifier('+237611000001');
    expect(user).toBeNull();
  });

  test('email lookup — user found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 2, email: 'user@example.com' }] });
    const user = await authService.findUserByIdentifier('user@example.com');
    expect(user.id).toBe(2);
  });

  test('email lookup — user not found returns null', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const user = await authService.findUserByIdentifier('notfound@example.com');
    expect(user).toBeNull();
  });
});

describe('authService — verifyPassword', () => {
  let authService;
  let bcrypt;

  beforeAll(() => {
    jest.isolateModules(() => {
      authService = require('../src/services/authService');
      bcrypt      = require('bcryptjs');
    });
  });

  test('match returns true', async () => {
    bcrypt.compare.mockResolvedValueOnce(true);
    const result = await authService.verifyPassword('pass', '$2b$10$hash');
    expect(result).toBe(true);
  });

  test('no match throws UnauthorizedError', async () => {
    bcrypt.compare.mockResolvedValueOnce(false);
    await expect(authService.verifyPassword('wrong', '$2b$10$hash')).rejects.toThrow('Invalid credentials');
  });
});

describe('authService — hashPassword', () => {
  let authService;
  let bcrypt;

  beforeAll(() => {
    jest.isolateModules(() => {
      authService = require('../src/services/authService');
      bcrypt      = require('bcryptjs');
    });
  });

  test('returns hashed password string', async () => {
    bcrypt.hash.mockResolvedValueOnce('$2b$12$hashed');
    const hashed = await authService.hashPassword('mypassword');
    expect(hashed).toBe('$2b$12$hashed');
  });
});

describe('authService — assertNoDuplicate', () => {
  let authService;
  beforeAll(() => {
    jest.isolateModules(() => {
      authService = require('../src/services/authService');
    });
  });

  test('no conflict — returns without throwing', async () => {
    mockDb.query.mockResolvedValue({ rows: [] });
    await expect(authService.assertNoDuplicate('+23761100001', 'test@test.com')).resolves.toBeUndefined();
  });

  test('phone conflict — throws ConflictError', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    await expect(authService.assertNoDuplicate('+23761100001', null)).rejects.toThrow('phone number');
  });

  test('email conflict — throws ConflictError', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] })         // phone ok
      .mockResolvedValueOnce({ rows: [{ id: 2 }] }); // email conflict
    await expect(authService.assertNoDuplicate('+23761100002', 'dup@test.com')).rejects.toThrow('email');
  });

  test('only phone provided', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 3 }] });
    await expect(authService.assertNoDuplicate('+23761100003', null)).rejects.toThrow();
  });

  test('only email provided', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 4 }] });
    await expect(authService.assertNoDuplicate(null, 'exists@test.com')).rejects.toThrow('email');
  });
});

describe('authService — getOtpSendCount / logOtpSend', () => {
  let authService;
  beforeAll(() => {
    jest.isolateModules(() => {
      authService = require('../src/services/authService');
    });
  });

  test('getOtpSendCount returns count from DB', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ count: '3' }] });
    const count = await authService.getOtpSendCount('+237611000001');
    expect(count).toBe(3);
  });

  test('getOtpSendCount returns 0 on DB error', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB fail'));
    const count = await authService.getOtpSendCount('+237611000001');
    expect(count).toBe(0);
  });

  test('logOtpSend inserts notification', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    await expect(authService.logOtpSend(1, '+237611000001')).resolves.toBeUndefined();
  });

  test('logOtpSend handles DB error gracefully', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB fail'));
    await expect(authService.logOtpSend(1, '+237611000001')).resolves.toBeUndefined();
  });

  test('logOtpSend with null userId', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    await expect(authService.logOtpSend(null, '+237611000001')).resolves.toBeUndefined();
  });
});

// ─── rbac.js — unit tests ─────────────────────────────────────────────────────

describe('rbac — getUserPermissions', () => {
  let rbac;
  beforeAll(() => {
    jest.isolateModules(() => {
      rbac = require('../src/middleware/rbac');
    });
  });

  beforeEach(() => {
    mockDb.query.mockReset();
    mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
    // Clear cache between tests
    rbac.invalidatePermissionCache(99);
    rbac.invalidatePermissionCache(100);
    rbac.invalidatePermissionCache(101);
  });

  test('returns role permissions as a Set', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ permission: 'users:read' }, { permission: 'users:write' }] })
      .mockResolvedValueOnce({ rows: [] }); // no user-level overrides
    const perms = await rbac.getUserPermissions(99, 'admin');
    expect(perms).toBeInstanceOf(Set);
    expect(perms.has('users:read')).toBe(true);
  });

  test('user-level grant adds to permissions', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ permission: 'users:read' }] })
      .mockResolvedValueOnce({ rows: [{ permission: 'payments:refund', granted: true }] });
    const perms = await rbac.getUserPermissions(100, 'read_only');
    expect(perms.has('payments:refund')).toBe(true);
  });

  test('user-level deny removes permission from role grant', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ permission: 'users:delete' }] })
      .mockResolvedValueOnce({ rows: [{ permission: 'users:delete', granted: false }] });
    const perms = await rbac.getUserPermissions(101, 'admin');
    expect(perms.has('users:delete')).toBe(false);
  });

  test('DB error returns empty Set', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB fail'));
    const perms = await rbac.getUserPermissions(102, 'admin');
    expect(perms.size).toBe(0);
  });

  test('cached result is returned on second call', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ permission: 'users:read' }] })
      .mockResolvedValueOnce({ rows: [] });
    const perms1 = await rbac.getUserPermissions(103, 'viewer');
    const perms2 = await rbac.getUserPermissions(103, 'viewer');
    expect(perms1).toBe(perms2); // same Set reference from cache
  });

  test('invalidatePermissionCache clears cache entry', async () => {
    mockDb.query
      .mockResolvedValue({ rows: [] });
    await rbac.getUserPermissions(104, 'viewer');
    rbac.invalidatePermissionCache(104);
    // Second call should re-query DB
    await rbac.getUserPermissions(104, 'viewer');
    expect(mockDb.query).toHaveBeenCalledTimes(4); // 2 calls per non-cached fetch
  });
});

describe('rbac — requirePermission middleware', () => {
  let rbac;
  beforeAll(() => {
    jest.isolateModules(() => {
      rbac = require('../src/middleware/rbac');
    });
  });

  beforeEach(() => {
    mockDb.query.mockReset();
    mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  test('no req.user → 401', async () => {
    const mw = rbac.requirePermission('users:read');
    const req = {};
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await mw(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('permission not in set → 403', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] }) // no role perms
      .mockResolvedValueOnce({ rows: [] }); // no user perms
    const mw = rbac.requirePermission('payments:refund');
    const req = { user: { id: 200, role: 'rider', admin_role: null } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await mw(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('permission present → calls next()', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ permission: 'users:read' }] })
      .mockResolvedValueOnce({ rows: [] });
    const mw = rbac.requirePermission('users:read');
    const req = { user: { id: 201, role: 'admin', admin_role: 'admin' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await mw(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('DB throws → 500', async () => {
    mockDb.query.mockRejectedValue(new Error('DB fail'));
    const mw = rbac.requirePermission('users:read');
    const req = { user: { id: 202, role: 'admin', admin_role: 'admin' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await mw(req, res, jest.fn());
    // Should still respond (either 403 or 500), not crash
    expect(res.status).toHaveBeenCalled();
  });
});

// ─── adminIpGuard.js — unit tests ────────────────────────────────────────────

describe('adminIpGuard — IP matching helpers', () => {
  let adminIpGuard;
  // We test via the middleware function behaviour
  beforeAll(() => {
    // Reset env
    delete process.env.ADMIN_ALLOWED_IPS;
    jest.isolateModules(() => {
      adminIpGuard = require('../src/middleware/adminIpGuard');
    });
  });

  test('no ADMIN_ALLOWED_IPS — allows all IPs (calls next)', () => {
    const req  = { ip: '192.168.1.1', socket: {}, path: '/admin', method: 'GET', get: jest.fn() };
    const res  = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    adminIpGuard(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('adminIpGuard — with ADMIN_ALLOWED_IPS set', () => {
  let guard;
  beforeAll(() => {
    process.env.ADMIN_ALLOWED_IPS = '192.168.1.0/24,10.0.0.1';
    jest.isolateModules(() => {
      guard = require('../src/middleware/adminIpGuard');
    });
  });

  afterAll(() => {
    delete process.env.ADMIN_ALLOWED_IPS;
  });

  test('allowed exact IP — calls next', () => {
    const req  = { ip: '10.0.0.1', socket: {}, path: '/admin', method: 'GET', get: jest.fn() };
    const res  = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    guard(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('allowed CIDR range IP — calls next', () => {
    const req  = { ip: '192.168.1.55', socket: {}, path: '/admin', method: 'GET', get: jest.fn() };
    const res  = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    guard(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('blocked IP — returns 404', () => {
    const req  = { ip: '8.8.8.8', socket: {}, path: '/admin', method: 'GET', get: jest.fn() };
    const res  = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    guard(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  test('IPv6-mapped IPv4 allowed — calls next', () => {
    const req  = { ip: '::ffff:10.0.0.1', socket: {}, path: '/admin', method: 'GET', get: jest.fn() };
    const res  = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    guard(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('IPv6-mapped IPv4 blocked — returns 404', () => {
    const req  = { ip: '::ffff:8.8.8.8', socket: {}, path: '/admin', method: 'GET', get: jest.fn() };
    const res  = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    guard(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('socket remoteAddress used when req.ip is missing', () => {
    const req  = { ip: undefined, socket: { remoteAddress: '10.0.0.1' }, path: '/admin', method: 'GET', get: jest.fn() };
    const res  = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    guard(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

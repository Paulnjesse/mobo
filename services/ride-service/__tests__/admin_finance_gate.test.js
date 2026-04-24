'use strict';
/**
 * Tests for finance:read permission gate on admin payment endpoints
 *
 * Verifies that requirePermission('finance:read') middleware:
 *   1. Returns 403 when user lacks the permission (using inline permissions array)
 *   2. Calls next() when user has the permission
 *   3. Calls DB when no inline permissions array is provided (DB path)
 */

process.env.NODE_ENV     = 'test';
process.env.JWT_SECRET   = 'test_secret_minimum_32_chars_long_abc';
process.env.DATABASE_URL = 'postgresql://localhost/mobo_test';

const mockDb = {
  query:     jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  queryRead: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  connect:   jest.fn(),
};
jest.mock('../src/config/database', () => mockDb);
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), http: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const { requirePermission } = require('../src/middleware/rbac');

// ── Test requirePermission middleware using inline permissions array ───────────
function buildApp(userPermissions, requiredPerm) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'admin-1', role: 'admin', permissions: userPermissions };
    next();
  });
  app.get('/test', requirePermission(requiredPerm), (_req, res) => res.json({ ok: true }));
  return app;
}

describe('requirePermission — finance:read gate (inline permissions path)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  test('returns 403 when user lacks the required permission', async () => {
    const app = buildApp(['users:read', 'users:write'], 'finance:read');
    const res = await request(app).get('/test');
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('finance:read');
  });

  test('passes when user has the required permission', async () => {
    const app = buildApp(['users:read', 'finance:read'], 'finance:read');
    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('super_admin with all permissions passes', async () => {
    const app = buildApp(['users:read', 'users:write', 'finance:read', 'admin:settings'], 'finance:read');
    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
  });

  test('empty permissions fails finance:read', async () => {
    const app = buildApp([], 'finance:read');
    const res = await request(app).get('/test');
    expect(res.status).toBe(403);
  });

  test('unrelated permission does not satisfy finance:read', async () => {
    const app = buildApp(['rides:read', 'surge:write', 'users:write'], 'finance:read');
    const res = await request(app).get('/test');
    expect(res.status).toBe(403);
  });

  test('unauthenticated request returns 401', async () => {
    const app = express();
    app.use(express.json());
    // No req.user set
    app.get('/test', requirePermission('finance:read'), (_req, res) => res.json({ ok: true }));
    const res = await request(app).get('/test');
    expect(res.status).toBe(401);
  });
});

// ── DB-path test: when req.user has no inline permissions, the DB is queried ──
describe('requirePermission — DB permission lookup path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 403 when DB returns no matching permissions', async () => {
    // role_permissions: empty, user_permissions: empty
    mockDb.query.mockResolvedValue({ rows: [] });

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: 'admin-1', role: 'admin' }; // no permissions array → DB path
      next();
    });
    app.get('/test', requirePermission('finance:read'), (_req, res) => res.json({ ok: true }));

    const res = await request(app).get('/test');
    expect(res.status).toBe(403);
  });

  test('passes when DB returns the matching role permission', async () => {
    // role_permissions has finance:read for 'admin'
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ permission: 'finance:read' }] }) // role_permissions
      .mockResolvedValueOnce({ rows: [] });                               // user_permissions

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: 'admin-2', role: 'admin' };
      next();
    });
    app.get('/test', requirePermission('finance:read'), (_req, res) => res.json({ ok: true }));

    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
  });
});

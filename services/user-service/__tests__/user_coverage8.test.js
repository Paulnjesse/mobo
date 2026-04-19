'use strict';

/**
 * user_coverage8.test.js
 *
 * Micro test file: covers the last ~10 statements needed to reach 70%.
 * Directly tests auth middleware edge cases (lines 21-24, 32-38, 46, 49, 59)
 * and a few other quick wins.
 */

process.env.JWT_SECRET = 'test-secret-for-jest-minimum-32-chars-long';
process.env.NODE_ENV = 'test';

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

// ─── Direct middleware tests (no server needed) ───────────────────────────────

describe('auth.js middleware — direct unit tests', () => {
  // Use jest.requireActual to get real middleware (not mocked version from other test files)
  const { authenticate, requireDriver, requireAdmin, requireFleetOwner } = jest.requireActual('../src/middleware/auth');

  function makeRes() {
    return { status: jest.fn().mockReturnThis(), json: jest.fn() };
  }

  // ── authenticate ───────────────────────────────────────────���──────────────

  test('authenticate returns 401 for expired token (TokenExpiredError branch)', () => {
    const expiredToken = jwt.sign({ id: 1, role: 'rider' }, JWT_SECRET, { expiresIn: -1 });
    const req = { headers: { authorization: `Bearer ${expiredToken}` } };
    const res = makeRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Token expired' }));
    expect(next).not.toHaveBeenCalled();
  });

  test('authenticate returns 401 for completely invalid token', () => {
    const req = { headers: { authorization: 'Bearer totally-invalid-not-a-jwt' } };
    const res = makeRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Invalid token' }));
  });

  // ── requireDriver ─────────────────────────────────────────────────────────

  test('requireDriver returns 403 for rider role', () => {
    const req = { user: { id: 1, role: 'rider' } };
    const res = makeRes();
    const next = jest.fn();

    requireDriver(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('requireDriver returns 401 when no req.user', () => {
    const req = { user: null };
    const res = makeRes();
    const next = jest.fn();

    requireDriver(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('requireDriver allows driver role', () => {
    const req = { user: { id: 2, role: 'driver' } };
    const res = makeRes();
    const next = jest.fn();

    requireDriver(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('requireDriver allows admin role', () => {
    const req = { user: { id: 99, role: 'admin' } };
    const res = makeRes();
    const next = jest.fn();

    requireDriver(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  // ── requireAdmin ──────────────────────────────────────────────────────────

  test('requireAdmin returns 401 when no req.user', () => {
    const req = { user: null };
    const res = makeRes();
    const next = jest.fn();

    requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('requireAdmin returns 403 for non-admin role', () => {
    const req = { user: { id: 1, role: 'rider' } };
    const res = makeRes();
    const next = jest.fn();

    requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('requireAdmin allows admin role', () => {
    const req = { user: { id: 99, role: 'admin' } };
    const res = makeRes();
    const next = jest.fn();

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  // ── requireFleetOwner ─────────────────────────────────────────────────────

  test('requireFleetOwner returns 401 when no req.user', () => {
    const req = { user: null };
    const res = makeRes();
    const next = jest.fn();

    requireFleetOwner(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('requireFleetOwner returns 403 for rider', () => {
    const req = { user: { id: 1, role: 'rider' } };
    const res = makeRes();
    const next = jest.fn();

    requireFleetOwner(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('requireFleetOwner allows fleet_owner role', () => {
    const req = { user: { id: 5, role: 'fleet_owner' } };
    const res = makeRes();
    const next = jest.fn();

    requireFleetOwner(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('requireFleetOwner allows admin role', () => {
    const req = { user: { id: 99, role: 'admin' } };
    const res = makeRes();
    const next = jest.fn();

    requireFleetOwner(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

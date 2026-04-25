'use strict';
/**
 * jwtUtil.test.js — JWT sign / verify utility
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_minimum_32_chars_long_abc';

// Re-require after setting env so module picks up the secret
jest.resetModules();
const { signToken, verifyJwt, decodeIgnoreExpiry, USE_RS256 } = require('../jwtUtil');
const jwt = require('jsonwebtoken');

describe('jwtUtil — HS256 mode (test env)', () => {
  test('USE_RS256 is false in test environment', () => {
    expect(USE_RS256).toBe(false);
  });

  test('signToken returns a valid JWT string', () => {
    const token = signToken({ id: 'user-1', role: 'rider' });
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3); // header.payload.signature
  });

  test('verifyJwt decodes the payload correctly', () => {
    const payload = { id: 'user-42', role: 'driver' };
    const token = signToken(payload, { expiresIn: '1h' });
    const decoded = verifyJwt(token);
    expect(decoded.id).toBe('user-42');
    expect(decoded.role).toBe('driver');
  });

  test('verifyJwt throws on expired token', () => {
    const token = signToken({ id: 'user-1' }, { expiresIn: '-1s' });
    expect(() => verifyJwt(token)).toThrow(/expired/i);
  });

  test('verifyJwt throws on tampered token', () => {
    const token = signToken({ id: 'user-1' }, { expiresIn: '1h' });
    const parts = token.split('.');
    // Tamper payload
    parts[1] = Buffer.from(JSON.stringify({ id: 'hacker', role: 'admin' })).toString('base64url');
    expect(() => verifyJwt(parts.join('.'))).toThrow();
  });

  test('verifyJwt throws on wrong secret', () => {
    const token = jwt.sign({ id: 'user-1' }, 'wrong-secret-32-chars-minimum-len!');
    expect(() => verifyJwt(token)).toThrow();
  });

  test('decodeIgnoreExpiry returns payload even when token is expired', () => {
    const token = signToken({ id: 'user-expired', role: 'rider' }, { expiresIn: '-10s' });
    const decoded = decodeIgnoreExpiry(token);
    expect(decoded.id).toBe('user-expired');
    expect(decoded.role).toBe('rider');
  });

  test('decodeIgnoreExpiry still throws on invalid signature', () => {
    const token = jwt.sign({ id: 'hacker' }, 'completely-different-secret-here!');
    expect(() => decodeIgnoreExpiry(token)).toThrow();
  });

  test('signToken respects expiresIn option', () => {
    const token = signToken({ id: 'user-1' }, { expiresIn: '2h' });
    const decoded = verifyJwt(token);
    const nowSec = Math.floor(Date.now() / 1000);
    expect(decoded.exp).toBeGreaterThan(nowSec + 3600); // more than 1h from now
    expect(decoded.exp).toBeLessThanOrEqual(nowSec + 7201); // ~2h
  });

  test('signToken embeds arbitrary payload fields', () => {
    const token = signToken({ id: 'u1', role: 'admin', custom: true });
    const decoded = verifyJwt(token);
    expect(decoded.custom).toBe(true);
  });

  test('verifyJwt returns iat claim', () => {
    const token = signToken({ id: 'u1' });
    const decoded = verifyJwt(token);
    expect(typeof decoded.iat).toBe('number');
  });
});

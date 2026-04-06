// Mock: thin HS256 wrapper so service code that uses jwtUtil still works in tests.
// Tests sign their own tokens with jwt.sign + JWT_SECRET directly; this mock ensures
// service-side signToken / verifyJwt calls resolve correctly with the same secret.
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'functional_test_secret_minimum_32_chars_long!!';

function signToken(payload, options = {}) {
  return jwt.sign(payload, SECRET, options);
}

function verifyJwt(token) {
  return jwt.verify(token, SECRET, { algorithms: ['HS256'] });
}

function decodeIgnoreExpiry(token) {
  return jwt.verify(token, SECRET, { algorithms: ['HS256'], ignoreExpiration: true });
}

module.exports = { signToken, verifyJwt, decodeIgnoreExpiry, USE_RS256: false };

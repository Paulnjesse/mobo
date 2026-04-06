const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  // Crash at startup — a missing or weak secret must never silently fall through
  throw new Error('[FATAL] JWT_SECRET must be set and at least 32 characters. Set it in your environment and restart.');
}

/**
 * Gateway-level JWT verification.
 * Verifies the token and injects user info into request headers
 * so downstream services can trust them without re-verifying.
 */
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Please provide a Bearer token.'
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });

    // Inject user info as trusted headers for downstream services
    req.headers['x-user-id'] = decoded.id;
    req.headers['x-user-role'] = decoded.role;
    req.headers['x-user-phone'] = decoded.phone || '';
    req.headers['x-user-name'] = decoded.full_name || '';

    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired. Please login again.' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

/**
 * Optional auth — attaches user if token present, continues regardless.
 */
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    req.headers['x-user-id'] = decoded.id;
    req.headers['x-user-role'] = decoded.role;
    req.headers['x-user-phone'] = decoded.phone || '';
    req.headers['x-user-name'] = decoded.full_name || '';
    req.user = decoded;
  } catch (err) {
    // Token invalid or expired — continue without user
  }

  next();
};

/**
 * Require specific role at gateway level
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Requires role: ${roles.join(' or ')}`
      });
    }
    next();
  };
};

module.exports = { verifyToken, optionalAuth, requireRole };

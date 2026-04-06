const { verifyJwt } = require('../../../services/shared/jwtUtil');

/**
 * Gateway-level JWT verification (RS256 in production, HS256 in dev/test).
 * Verifies the token, enforces device binding, and injects user info into
 * request headers so downstream services can trust them without re-verifying.
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
    const decoded = verifyJwt(token);

    // Device binding: if the token carries a device_id claim, the request
    // MUST present the matching X-Device-ID header. Mismatch indicates the
    // token is being used from an unrecognised device (possible theft).
    if (decoded.device_id) {
      const requestDeviceId = req.headers['x-device-id'] || '';
      if (requestDeviceId !== decoded.device_id) {
        return res.status(401).json({
          success: false,
          code: 'DEVICE_BINDING_FAILED',
          message: 'Device mismatch. Please log in again from this device.',
        });
      }
    }

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
    const decoded = verifyJwt(token);
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

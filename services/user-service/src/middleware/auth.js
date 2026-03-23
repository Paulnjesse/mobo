const jwt = require('jsonwebtoken');

// Fail fast — never silently accept a weak fallback secret in any environment.
// server.js already enforces this for production; this check catches test/dev misconfig.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  const msg = '[FATAL] JWT_SECRET must be set and at least 32 characters. Exiting.';
  console.error(msg);
  process.exit(1);
}

/**
 * Authenticate JWT token — attaches req.user
 * Accepts tokens issued with HS256 only (prevents algorithm confusion attacks).
 */
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // algorithms: ['HS256'] — prevents alg:none and RS256 confusion attacks
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

/**
 * Require driver role
 */
const requireDriver = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  if (req.user.role !== 'driver' && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Driver access required' });
  }
  next();
};

/**
 * Require admin role
 */
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

/**
 * Require fleet_owner role
 */
const requireFleetOwner = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  if (req.user.role !== 'fleet_owner' && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Fleet owner access required' });
  }
  next();
};

module.exports = { authenticate, requireDriver, requireAdmin, requireFleetOwner };

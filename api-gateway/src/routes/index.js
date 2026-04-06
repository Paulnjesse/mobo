const { createProxyMiddleware } = require('http-proxy-middleware');
const { circuitBreakerFor } = require('../middleware/serviceCircuitBreaker');
const { authLimiter, paymentLimiter, rideLimiter, locationLimiter } = require('../middleware/rateLimit');
const { verifyToken, optionalAuth } = require('../middleware/auth');

const USER_SERVICE     = process.env.USER_SERVICE_URL     || 'http://user-service:3001';
const RIDE_SERVICE     = process.env.RIDE_SERVICE_URL     || 'http://ride-service:3002';
const PAYMENT_SERVICE  = process.env.PAYMENT_SERVICE_URL  || 'http://payment-service:3003';
const LOCATION_SERVICE = process.env.LOCATION_SERVICE_URL || 'http://location-service:3004';

// Circuit breakers — one per downstream service
const userCB     = circuitBreakerFor('user-service');
const rideCB     = circuitBreakerFor('ride-service');
const paymentCB  = circuitBreakerFor('payment-service');
const locationCB = circuitBreakerFor('location-service');

const onError = (err, req, res) => {
  res.status(502).json({ error: 'Service unavailable', details: err.message });
};

// ─── Strip spoofable identity headers from ALL incoming requests ──────────────
// Prevents clients from injecting x-user-id / x-user-role directly.
// verifyToken then sets these from the verified JWT before proxying.
const stripTrustedHeaders = (req, _res, next) => {
  delete req.headers['x-user-id'];
  delete req.headers['x-user-role'];
  delete req.headers['x-user-phone'];
  delete req.headers['x-user-name'];
  next();
};

// ─── Proxy factory ────────────────────────────────────────────────────────────
function proxy(target, rewrite) {
  return createProxyMiddleware({ target, changeOrigin: true, pathRewrite: rewrite, on: { error: onError } });
}

// Pass context as first arg — Express does NOT strip the prefix,
// so pathRewrite works on the full /api/xxx path
module.exports = (app) => {
  // Strip identity headers on every request before any route handler
  app.use(stripTrustedHeaders);

  // ── Public routes (no auth required) ────────────────────────────────────────
  // Trip-share tracking — publicly accessible via share token
  app.use('/api/track',    rideCB,     proxy(RIDE_SERVICE,     { '^/api/track':    '/rides/track'    }));
  app.use('/api/v1/track', rideCB,     proxy(RIDE_SERVICE,     { '^/api/v1/track': '/rides/track'    }));

  // Auth endpoints — signup, login, OTP, social (no token needed yet)
  app.use('/api/auth',     userCB,     authLimiter,     proxy(USER_SERVICE,     { '^/api/auth':     '/auth'     }));
  app.use('/api/v1/auth',  userCB,     authLimiter,     proxy(USER_SERVICE,     { '^/api/v1/auth':  '/auth'     }));

  // Payment webhooks — authenticated by HMAC signature in the handler, not JWT
  app.use('/api/payments/webhook',    paymentCB, proxy(PAYMENT_SERVICE, { '^/api/payments/webhook':    '/payments/webhook'    }));
  app.use('/api/v1/payments/webhook', paymentCB, proxy(PAYMENT_SERVICE, { '^/api/v1/payments/webhook': '/payments/webhook'    }));

  // ── Authenticated routes — verifyToken required ──────────────────────────────
  app.use('/api/users',    userCB,     verifyToken,                      proxy(USER_SERVICE,     { '^/api/users':    '/users'    }));
  app.use('/api/v1/users', userCB,     verifyToken,                      proxy(USER_SERVICE,     { '^/api/v1/users': '/users'    }));
  app.use('/api/fleet',    userCB,     verifyToken,                      proxy(USER_SERVICE,     { '^/api/fleet':    '/fleet'    }));
  app.use('/api/v1/fleet', userCB,     verifyToken,                      proxy(USER_SERVICE,     { '^/api/v1/fleet': '/fleet'    }));
  app.use('/api/social',    userCB,    verifyToken, authLimiter,         proxy(USER_SERVICE,     { '^/api/social':    '/social'   }));
  app.use('/api/v1/social', userCB,    verifyToken, authLimiter,         proxy(USER_SERVICE,     { '^/api/v1/social': '/social'   }));

  app.use('/api/deliveries',    rideCB, verifyToken, rideLimiter, proxy(RIDE_SERVICE, { '^/api/deliveries':    '/rides/deliveries' }));
  app.use('/api/v1/deliveries', rideCB, verifyToken, rideLimiter, proxy(RIDE_SERVICE, { '^/api/v1/deliveries': '/rides/deliveries' }));
  app.use('/api/rides',    rideCB,     verifyToken, rideLimiter,         proxy(RIDE_SERVICE,     { '^/api/rides':    '/rides'    }));
  app.use('/api/v1/rides', rideCB,     verifyToken, rideLimiter,         proxy(RIDE_SERVICE,     { '^/api/v1/rides': '/rides'    }));
  app.use('/api/fare',     rideCB,     verifyToken,                      proxy(RIDE_SERVICE,     { '^/api/fare':     '/rides/fare' }));
  app.use('/api/v1/fare',  rideCB,     verifyToken,                      proxy(RIDE_SERVICE,     { '^/api/v1/fare':  '/rides/fare' }));
  app.use('/api/disputes',    rideCB,  verifyToken,                      proxy(RIDE_SERVICE,     { '^/api/disputes':    '/rides/disputes' }));
  app.use('/api/v1/disputes', rideCB,  verifyToken,                      proxy(RIDE_SERVICE,     { '^/api/v1/disputes': '/rides/disputes' }));

  app.use('/api/payments',    paymentCB, verifyToken, paymentLimiter,    proxy(PAYMENT_SERVICE, { '^/api/payments':    '/payments' }));
  app.use('/api/v1/payments', paymentCB, verifyToken, paymentLimiter,    proxy(PAYMENT_SERVICE, { '^/api/v1/payments': '/payments' }));

  app.use('/api/location',       locationCB, verifyToken, locationLimiter, proxy(LOCATION_SERVICE, { '^/api/location':       '/location'         }));
  app.use('/api/v1/location',    locationCB, verifyToken, locationLimiter, proxy(LOCATION_SERVICE, { '^/api/v1/location':    '/location'         }));
  app.use('/api/drivers',        locationCB, verifyToken,                  proxy(LOCATION_SERVICE, { '^/api/drivers':        '/location/drivers' }));
  app.use('/api/v1/drivers',     locationCB, verifyToken,                  proxy(LOCATION_SERVICE, { '^/api/v1/drivers':     '/location/drivers' }));
  app.use('/api/safety',         locationCB, verifyToken,                  proxy(LOCATION_SERVICE, { '^/api/safety':         '/safety'           }));
  app.use('/api/v1/safety',      locationCB, verifyToken,                  proxy(LOCATION_SERVICE, { '^/api/v1/safety':      '/safety'           }));
  app.use('/api/safety-zones',    locationCB, verifyToken,                  proxy(LOCATION_SERVICE, { '^/api/safety-zones':    '/safety-zones'   }));
  app.use('/api/v1/safety-zones', locationCB, verifyToken,                  proxy(LOCATION_SERVICE, { '^/api/v1/safety-zones': '/safety-zones'   }));
};

const { createProxyMiddleware } = require('http-proxy-middleware');
const { circuitBreakerFor } = require('../middleware/serviceCircuitBreaker');

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

// ─── Proxy factory ────────────────────────────────────────────────────────────
function proxy(target, rewrite) {
  return createProxyMiddleware({ target, changeOrigin: true, pathRewrite: rewrite, on: { error: onError } });
}

// Pass context as first arg — Express does NOT strip the prefix,
// so pathRewrite works on the full /api/xxx path
module.exports = (app) => {
  // Public track route — must come before /api/rides to avoid conflicts
  app.use('/api/track',    rideCB,     proxy(RIDE_SERVICE,     { '^/api/track':    '/rides/track'    }));
  app.use('/api/v1/track', rideCB,     proxy(RIDE_SERVICE,     { '^/api/v1/track': '/rides/track'    }));

  app.use('/api/auth',     userCB,     proxy(USER_SERVICE,     { '^/api/auth':     '/auth'     }));
  app.use('/api/v1/auth',  userCB,     proxy(USER_SERVICE,     { '^/api/v1/auth':  '/auth'     }));
  app.use('/api/users',    userCB,     proxy(USER_SERVICE,     { '^/api/users':    '/users'    }));
  app.use('/api/v1/users', userCB,     proxy(USER_SERVICE,     { '^/api/v1/users': '/users'    }));
  app.use('/api/fleet',    userCB,     proxy(USER_SERVICE,     { '^/api/fleet':    '/fleet'    }));
  app.use('/api/v1/fleet', userCB,     proxy(USER_SERVICE,     { '^/api/v1/fleet': '/fleet'    }));
  app.use('/api/social',    userCB,    proxy(USER_SERVICE,     { '^/api/social':    '/social'   }));
  app.use('/api/v1/social', userCB,    proxy(USER_SERVICE,     { '^/api/v1/social': '/social'   }));

  app.use('/api/deliveries',    rideCB, proxy(RIDE_SERVICE, { '^/api/deliveries':    '/rides/deliveries' }));
  app.use('/api/v1/deliveries', rideCB, proxy(RIDE_SERVICE, { '^/api/v1/deliveries': '/rides/deliveries' }));
  app.use('/api/rides',    rideCB,     proxy(RIDE_SERVICE,     { '^/api/rides':    '/rides'    }));
  app.use('/api/v1/rides', rideCB,     proxy(RIDE_SERVICE,     { '^/api/v1/rides': '/rides'    }));
  app.use('/api/fare',     rideCB,     proxy(RIDE_SERVICE,     { '^/api/fare':     '/rides/fare' }));
  app.use('/api/v1/fare',  rideCB,     proxy(RIDE_SERVICE,     { '^/api/v1/fare':  '/rides/fare' }));
  app.use('/api/disputes',    rideCB,  proxy(RIDE_SERVICE,     { '^/api/disputes':    '/rides/disputes' }));
  app.use('/api/v1/disputes', rideCB,  proxy(RIDE_SERVICE,     { '^/api/v1/disputes': '/rides/disputes' }));

  app.use('/api/payments',    paymentCB, proxy(PAYMENT_SERVICE, { '^/api/payments':    '/payments' }));
  app.use('/api/v1/payments', paymentCB, proxy(PAYMENT_SERVICE, { '^/api/v1/payments': '/payments' }));

  app.use('/api/location',       locationCB, proxy(LOCATION_SERVICE, { '^/api/location':       '/location'         }));
  app.use('/api/v1/location',    locationCB, proxy(LOCATION_SERVICE, { '^/api/v1/location':    '/location'         }));
  app.use('/api/drivers',        locationCB, proxy(LOCATION_SERVICE, { '^/api/drivers':        '/location/drivers' }));
  app.use('/api/v1/drivers',     locationCB, proxy(LOCATION_SERVICE, { '^/api/v1/drivers':     '/location/drivers' }));
  app.use('/api/safety',         locationCB, proxy(LOCATION_SERVICE, { '^/api/safety':         '/safety'           }));
  app.use('/api/v1/safety',      locationCB, proxy(LOCATION_SERVICE, { '^/api/v1/safety':      '/safety'           }));
  app.use('/api/safety-zones',    locationCB, proxy(LOCATION_SERVICE, { '^/api/safety-zones':    '/safety-zones'   }));
  app.use('/api/v1/safety-zones', locationCB, proxy(LOCATION_SERVICE, { '^/api/v1/safety-zones': '/safety-zones'   }));
};

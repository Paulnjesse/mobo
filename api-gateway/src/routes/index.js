const { createProxyMiddleware } = require('http-proxy-middleware');

const USER_SERVICE = process.env.USER_SERVICE_URL || 'http://user-service:3001';
const RIDE_SERVICE = process.env.RIDE_SERVICE_URL || 'http://ride-service:3002';
const PAYMENT_SERVICE = process.env.PAYMENT_SERVICE_URL || 'http://payment-service:3003';
const LOCATION_SERVICE = process.env.LOCATION_SERVICE_URL || 'http://location-service:3004';

const proxyOptions = (target) => ({
  target,
  changeOrigin: true,
  on: {
    error: (err, req, res) => {
      res.status(502).json({ error: 'Service unavailable', details: err.message });
    }
  }
});

const proxy = (target, prefix) => createProxyMiddleware({
  target,
  changeOrigin: true,
  pathRewrite: (path) => `/${prefix}${path}`,
  on: {
    error: (err, req, res) => {
      res.status(502).json({ error: 'Service unavailable', details: err.message });
    }
  }
});

module.exports = (app) => {
  // User & Auth — strip /api/X, prepend service route
  app.use('/api/auth',   proxy(USER_SERVICE,     'auth'));
  app.use('/api/users',  proxy(USER_SERVICE,     'users'));
  app.use('/api/fleet',  proxy(USER_SERVICE,     'fleet'));
  app.use('/api/social', proxy(USER_SERVICE,     'social'));

  // Rides
  app.use('/api/rides',  proxy(RIDE_SERVICE,     'rides'));
  app.use('/api/fare',   proxy(RIDE_SERVICE,     'rides/fare'));

  // Payments
  app.use('/api/payments', proxy(PAYMENT_SERVICE, 'payments'));

  // Location
  app.use('/api/location', proxy(LOCATION_SERVICE, 'location'));
  app.use('/api/drivers',  proxy(LOCATION_SERVICE, 'location/drivers'));
};

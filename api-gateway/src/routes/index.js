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

module.exports = (app) => {
  // User & Auth
  app.use('/api/auth', createProxyMiddleware(proxyOptions(USER_SERVICE)));
  app.use('/api/users', createProxyMiddleware(proxyOptions(USER_SERVICE)));
  app.use('/api/fleet', createProxyMiddleware(proxyOptions(USER_SERVICE)));
  app.use('/api/social', createProxyMiddleware(proxyOptions(USER_SERVICE)));

  // Rides (includes preferred-drivers, lost-and-found, concierge, checkins)
  app.use('/api/rides', createProxyMiddleware(proxyOptions(RIDE_SERVICE)));
  app.use('/api/fare', createProxyMiddleware({
    ...proxyOptions(RIDE_SERVICE),
    pathRewrite: { '^/api/fare': '/rides/fare' }
  }));

  // Payments
  app.use('/api/payments', createProxyMiddleware(proxyOptions(PAYMENT_SERVICE)));

  // Location (includes destination-mode, bonuses, express-pay)
  app.use('/api/location', createProxyMiddleware(proxyOptions(LOCATION_SERVICE)));
  app.use('/api/drivers', createProxyMiddleware({
    ...proxyOptions(LOCATION_SERVICE),
    pathRewrite: { '^/api/drivers': '/location/drivers' }
  }));
};

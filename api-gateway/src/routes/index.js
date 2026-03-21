const { createProxyMiddleware } = require('http-proxy-middleware');

const USER_SERVICE = process.env.USER_SERVICE_URL || 'http://user-service:3001';
const RIDE_SERVICE = process.env.RIDE_SERVICE_URL || 'http://ride-service:3002';
const PAYMENT_SERVICE = process.env.PAYMENT_SERVICE_URL || 'http://payment-service:3003';
const LOCATION_SERVICE = process.env.LOCATION_SERVICE_URL || 'http://location-service:3004';

const onError = (err, req, res) => {
  res.status(502).json({ error: 'Service unavailable', details: err.message });
};

// Pass context as first arg — Express does NOT strip the prefix,
// so pathRewrite works on the full /api/xxx path
module.exports = (app) => {
  // Public track route — must come before /api/rides to avoid conflicts
  app.use(createProxyMiddleware('/api/track',    { target: RIDE_SERVICE,     changeOrigin: true, pathRewrite: { '^/api/track':    '/rides/track'    }, on: { error: onError } }));

  app.use(createProxyMiddleware('/api/auth',     { target: USER_SERVICE,     changeOrigin: true, pathRewrite: { '^/api/auth':     '/auth'     }, on: { error: onError } }));
  app.use(createProxyMiddleware('/api/users',    { target: USER_SERVICE,     changeOrigin: true, pathRewrite: { '^/api/users':    '/users'    }, on: { error: onError } }));
  app.use(createProxyMiddleware('/api/fleet',    { target: USER_SERVICE,     changeOrigin: true, pathRewrite: { '^/api/fleet':    '/fleet'    }, on: { error: onError } }));
  app.use(createProxyMiddleware('/api/social',   { target: USER_SERVICE,     changeOrigin: true, pathRewrite: { '^/api/social':   '/social'   }, on: { error: onError } }));
  app.use(createProxyMiddleware('/api/rides',    { target: RIDE_SERVICE,     changeOrigin: true, pathRewrite: { '^/api/rides':    '/rides'    }, on: { error: onError } }));
  app.use(createProxyMiddleware('/api/fare',     { target: RIDE_SERVICE,     changeOrigin: true, pathRewrite: { '^/api/fare':     '/rides/fare'}, on: { error: onError } }));
  app.use(createProxyMiddleware('/api/disputes', { target: RIDE_SERVICE,     changeOrigin: true, pathRewrite: { '^/api/disputes': '/rides/disputes' }, on: { error: onError } }));
  app.use(createProxyMiddleware('/api/payments', { target: PAYMENT_SERVICE,  changeOrigin: true, pathRewrite: { '^/api/payments': '/payments' }, on: { error: onError } }));
  app.use(createProxyMiddleware('/api/location',      { target: LOCATION_SERVICE, changeOrigin: true, pathRewrite: { '^/api/location':      '/location'       }, on: { error: onError } }));
  app.use(createProxyMiddleware('/api/drivers',       { target: LOCATION_SERVICE, changeOrigin: true, pathRewrite: { '^/api/drivers':        '/location/drivers' }, on: { error: onError } }));
  app.use(createProxyMiddleware('/api/safety',        { target: LOCATION_SERVICE, changeOrigin: true, pathRewrite: { '^/api/safety':         '/safety'         }, on: { error: onError } }));
  app.use(createProxyMiddleware('/api/safety-zones',  { target: LOCATION_SERVICE, changeOrigin: true, pathRewrite: { '^/api/safety-zones':   '/safety-zones'   }, on: { error: onError } }));
};

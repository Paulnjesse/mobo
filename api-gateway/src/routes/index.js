const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { verifyToken, optionalAuth } = require('../middleware/auth');
const {
  authLimiter,
  rideLimiter,
  locationLimiter,
  paymentLimiter
} = require('../middleware/rateLimit');

const router = express.Router();

const USER_SERVICE = process.env.USER_SERVICE_URL || 'http://user-service:3001';
const RIDE_SERVICE = process.env.RIDE_SERVICE_URL || 'http://ride-service:3002';
const PAYMENT_SERVICE = process.env.PAYMENT_SERVICE_URL || 'http://payment-service:3003';
const LOCATION_SERVICE = process.env.LOCATION_SERVICE_URL || 'http://location-service:3004';

// Common proxy options
const proxyOptions = (target, pathRewrite) => ({
  target,
  changeOrigin: true,
  pathRewrite,
  on: {
    error: (err, req, res) => {
      console.error(`[Gateway Proxy Error] ${err.message}`);
      if (!res.headersSent) {
        res.status(503).json({
          success: false,
          message: 'Service temporarily unavailable. Please try again shortly.'
        });
      }
    },
    proxyReq: (proxyReq, req) => {
      // Forward user context to downstream
      if (req.user) {
        proxyReq.setHeader('x-user-id', req.user.id);
        proxyReq.setHeader('x-user-role', req.user.role);
        proxyReq.setHeader('x-user-name', req.user.full_name || '');
      }
    }
  }
});

// ============================================================
// AUTH ROUTES (public)
// POST /api/auth/signup
// POST /api/auth/login
// POST /api/auth/verify
// POST /api/auth/resend-otp
// POST /api/auth/logout
// POST /api/auth/register-driver (protected - handled by user service)
// POST /api/auth/register-fleet-owner (protected - handled by user service)
// ============================================================
router.use(
  '/auth',
  authLimiter,
  createProxyMiddleware(proxyOptions(USER_SERVICE, { '^/api/auth': '/auth' }))
);

// ============================================================
// USER / PROFILE ROUTES (protected)
// GET  /api/users/profile
// PUT  /api/users/profile
// POST /api/users/teen-account
// GET  /api/users/teen-accounts
// PUT  /api/users/language
// GET  /api/users/notifications
// GET  /api/users/loyalty
// DELETE /api/users/account
// POST /api/auth/refresh-token (protected)
// ============================================================
router.use(
  '/users',
  verifyToken,
  createProxyMiddleware(proxyOptions(USER_SERVICE, { '^/api/users': '/users' }))
);

// ============================================================
// FLEET ROUTES (protected — fleet owners and admins)
// POST   /api/fleet
// GET    /api/fleet
// GET    /api/fleet/:id
// POST   /api/fleet/:id/vehicles
// PUT    /api/fleet/:id/vehicles/:vehicleId
// DELETE /api/fleet/:id/vehicles/:vehicleId
// PUT    /api/fleet/:id/vehicles/:vehicleId/driver
// DELETE /api/fleet/:id/vehicles/:vehicleId/driver
// GET    /api/fleet/:id/earnings
// GET    /api/fleet/:id/vehicles
// ============================================================
router.use(
  '/fleet',
  verifyToken,
  createProxyMiddleware(proxyOptions(USER_SERVICE, { '^/api/fleet': '/fleet' }))
);

// ============================================================
// RIDE ROUTES (protected)
// POST /api/rides/request
// GET  /api/rides
// GET  /api/rides/:id
// PATCH /api/rides/:id/accept
// PATCH /api/rides/:id/status
// POST /api/rides/:id/cancel
// POST /api/rides/:id/rate
// POST /api/rides/:id/tip
// POST /api/rides/:id/round-up
// ============================================================
router.use(
  '/rides',
  verifyToken,
  rideLimiter,
  createProxyMiddleware(proxyOptions(RIDE_SERVICE, { '^/api/rides': '/rides' }))
);

// ============================================================
// FARE ROUTES (optional auth for personalized estimates)
// GET  /api/fare/estimate
// GET  /api/fare/surge
// ============================================================
router.use(
  '/fare',
  optionalAuth,
  createProxyMiddleware(proxyOptions(RIDE_SERVICE, { '^/api/fare': '/fare' }))
);

// ============================================================
// PAYMENT ROUTES (protected)
// POST /api/payments/methods
// GET  /api/payments/methods
// PUT  /api/payments/methods/:id/default
// DELETE /api/payments/methods/:id
// POST /api/payments/charge
// GET  /api/payments/history
// POST /api/payments/refund/:id
// GET  /api/payments/wallet
// POST /api/payments/subscribe
// GET  /api/payments/subscription
// ============================================================
router.use(
  '/payments',
  verifyToken,
  paymentLimiter,
  createProxyMiddleware(proxyOptions(PAYMENT_SERVICE, { '^/api/payments': '/payments' }))
);

// ============================================================
// LOCATION ROUTES (protected)
// POST /api/location
// GET  /api/location/:userId
// GET  /api/location/history
// GET  /api/location/surge
// GET  /api/location/route/estimate
// GET  /api/rides/:id/route
// ============================================================
router.use(
  '/location',
  verifyToken,
  locationLimiter,
  createProxyMiddleware(proxyOptions(LOCATION_SERVICE, { '^/api/location': '/location' }))
);

// ============================================================
// NEARBY DRIVERS (protected)
// GET /api/drivers/nearby
// ============================================================
router.use(
  '/drivers',
  verifyToken,
  createProxyMiddleware(proxyOptions(LOCATION_SERVICE, { '^/api/drivers': '/drivers' }))
);

// ============================================================
// RIDE ROUTES route
// GET /api/rides/:id/route (location service)
// ============================================================
router.use(
  '/rides/:id/route',
  verifyToken,
  createProxyMiddleware(proxyOptions(LOCATION_SERVICE, { '^/api': '' }))
);

module.exports = router;

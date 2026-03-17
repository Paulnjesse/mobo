const rateLimit = require('express-rate-limit');

/**
 * Global rate limiter — 200 requests per 15 minutes per IP
 */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP. Please try again in 15 minutes.'
  },
  skip: (req) => req.path === '/health'
});

/**
 * Strict limiter for auth endpoints — 20 requests per 15 minutes per IP
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please wait 15 minutes.'
  }
});

/**
 * Ride request limiter — 30 requests per minute per IP
 * Prevents ride flooding
 */
const rideLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many ride requests. Please slow down.'
  }
});

/**
 * Location update limiter — 120 updates per minute (every 0.5 seconds)
 */
const locationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Location update rate exceeded.'
  }
});

/**
 * Payment limiter — 10 payment attempts per 5 minutes
 */
const paymentLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many payment attempts. Please wait a few minutes.'
  }
});

module.exports = {
  globalLimiter,
  authLimiter,
  rideLimiter,
  locationLimiter,
  paymentLimiter
};

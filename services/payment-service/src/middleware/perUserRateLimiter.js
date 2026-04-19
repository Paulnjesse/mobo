'use strict';
const rateLimit = require('express-rate-limit');

// Factory: create a per-user rate limiter
const perUserLimiter = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message: { error: message },
  keyGenerator: (req) => req.user?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'test',
});

// Specific limiters
const chargeLimiter    = perUserLimiter(60 * 60 * 1000, 20, 'Too many payment attempts — try again later');
const methodLimiter    = perUserLimiter(60 * 60 * 1000, 10, 'Too many payment method changes — try again later');
const cashoutLimiter   = perUserLimiter(24 * 60 * 60 * 1000, 3, 'Cashout limit reached for today');
const subscribeLimiter = perUserLimiter(60 * 60 * 1000, 5, 'Too many subscription requests');

module.exports = { chargeLimiter, methodLimiter, cashoutLimiter, subscribeLimiter };

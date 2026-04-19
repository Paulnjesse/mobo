'use strict';
const rateLimit = require('express-rate-limit');

const perUserLimiter = (windowMs, max, message) => rateLimit({
  windowMs, max,
  message: { error: message },
  keyGenerator: (req) => req.user?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

const locationUpdateLimiter = perUserLimiter(60 * 1000, 120, 'Location update rate limit exceeded');
const nearbyDriversLimiter  = perUserLimiter(60 * 1000, 30, 'Too many nearby driver requests');
const routeEstimateLimiter  = perUserLimiter(60 * 1000, 20, 'Too many route estimate requests');

module.exports = { locationUpdateLimiter, nearbyDriversLimiter, routeEstimateLimiter };

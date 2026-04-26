'use strict';
const rateLimit = require('express-rate-limit');

const perUserLimiter = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message: { error: message },
  keyGenerator: (req) => req.user?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

const rideRequestLimiter = perUserLimiter(60 * 1000, 5, 'Too many ride requests — wait 1 minute');
const rateLimiter        = perUserLimiter(60 * 60 * 1000, 10, 'Too many ratings in one hour');
const messageLimiter     = perUserLimiter(60 * 1000, 30, 'Too many messages — slow down');
const disputeLimiter     = perUserLimiter(24 * 60 * 60 * 1000, 3, 'Dispute limit reached for today');
const sosLimiter         = perUserLimiter(60 * 1000, 5, 'Too many SOS triggers');  // 5/min — covers rapid retap on shaky network

module.exports = { rideRequestLimiter, rateLimiter, messageLimiter, disputeLimiter, sosLimiter };

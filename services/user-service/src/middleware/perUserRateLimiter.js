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

const profileUpdateLimiter  = perUserLimiter(15 * 60 * 1000, 10, 'Too many profile updates');
const photoUploadLimiter    = perUserLimiter(60 * 60 * 1000, 5,  'Too many photo uploads per hour');
const teenAccountLimiter    = perUserLimiter(24 * 60 * 60 * 1000, 3, 'Teen account creation limit reached');
const loyaltyLimiter        = perUserLimiter(60 * 1000, 20, 'Too many loyalty requests');
const blockLimiter          = perUserLimiter(60 * 60 * 1000, 20, 'Too many block/unblock actions');

module.exports = { profileUpdateLimiter, photoUploadLimiter, teenAccountLimiter, loyaltyLimiter, blockLimiter };

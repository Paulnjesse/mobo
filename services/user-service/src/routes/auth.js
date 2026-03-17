const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  signup,
  login,
  verify,
  resendOtp,
  logout,
  refreshToken
} = require('../controllers/authController');

// Public routes
router.post('/signup', signup);
router.post('/login', login);
router.post('/verify', verify);
router.post('/resend-otp', resendOtp);
router.post('/logout', logout);

// Protected route
router.post('/refresh-token', authenticate, refreshToken);

module.exports = router;

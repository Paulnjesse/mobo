const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  signup,
  login,
  verify,
  resendOtp,
  logout,
  refreshToken,
  registerDriver,
  registerFleetOwner,
  setHomeLocation
} = require('../controllers/authController');

// Public routes
router.post('/signup', signup);
router.post('/login', login);
router.post('/verify', verify);
router.post('/resend-otp', resendOtp);
router.post('/logout', logout);

// Protected routes
router.post('/refresh-token', authenticate, refreshToken);
router.post('/register-driver', authenticate, registerDriver);
router.post('/register-fleet-owner', authenticate, registerFleetOwner);
router.post('/driver/home-location', authenticate, setHomeLocation);

module.exports = router;

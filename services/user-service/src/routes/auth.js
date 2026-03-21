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
const {
  setup2FA,
  verify2FA,
  validate2FA,
  disable2FA,
  get2FAStatus
} = require('../controllers/twoFactorController');

// Public routes
router.post('/signup', signup);
router.post('/login', login);
router.post('/verify', verify);
router.post('/resend-otp', resendOtp);
router.post('/logout', logout);

// 2FA — validate is public (called pre-login, before JWT is issued)
router.post('/2fa/validate', validate2FA);

// Protected routes
router.post('/refresh-token', authenticate, refreshToken);
router.post('/register-driver', authenticate, registerDriver);
router.post('/register-fleet-owner', authenticate, registerFleetOwner);
router.post('/driver/home-location', authenticate, setHomeLocation);

// 2FA — all remaining routes require a valid JWT (admin role checked inside controller)
router.get('/2fa/status',  authenticate, get2FAStatus);
router.post('/2fa/setup',  authenticate, setup2FA);
router.post('/2fa/verify', authenticate, verify2FA);
router.delete('/2fa',      authenticate, disable2FA);

module.exports = router;

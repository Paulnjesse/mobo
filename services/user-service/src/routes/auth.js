const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');

// Strict limiter for OTP, password reset — 5 attempts per 15 minutes per IP
const sensitiveAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please wait 15 minutes.', code: 'RATE_LIMIT_EXCEEDED' },
});
const {
  signupValidator,
  loginValidator,
  verifyOtpValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
} = require('../validators/auth.validators');
const {
  signup,
  login,
  verify,
  resendOtp,
  logout,
  refreshToken,
  registerDriver,
  registerFleetOwner,
  setHomeLocation,
  forgotPassword,
  resetPassword,
  socialLogin,
} = require('../controllers/authController');
const {
  setup2FA,
  verify2FA,
  validate2FA,
  disable2FA,
  get2FAStatus
} = require('../controllers/twoFactorController');

// Public routes
router.post('/social',          sensitiveAuthLimiter, socialLogin);   // Google / Apple sign-in
router.post('/signup',          signupValidator, validate, signup);
router.post('/login',           loginValidator, validate, login);
router.post('/verify',          verifyOtpValidator, validate, verify);
router.post('/resend-otp',      sensitiveAuthLimiter, resendOtp);
router.post('/logout',          logout);
router.post('/forgot-password', sensitiveAuthLimiter, forgotPasswordValidator, validate, forgotPassword);
router.post('/reset-password',  sensitiveAuthLimiter, resetPasswordValidator, validate, resetPassword);

// 2FA — validate is public (called pre-login, before JWT is issued)
// Rate-limited to prevent TOTP brute-force (6-digit = 1,000,000 possibilities)
router.post('/2fa/validate', sensitiveAuthLimiter, validate2FA);

// Refresh token — must NOT use authenticate middleware because the token
// may be expired; the controller calls decodeIgnoreExpiry() and enforces
// the 30-day window itself. Accepting expired tokens is the entire purpose
// of this endpoint.
router.post('/refresh-token', refreshToken);
router.post('/register-driver', authenticate, registerDriver);
router.post('/register-fleet-owner', authenticate, registerFleetOwner);
router.post('/driver/home-location', authenticate, setHomeLocation);

// 2FA — all remaining routes require a valid JWT (admin role checked inside controller)
router.get('/2fa/status',  authenticate, get2FAStatus);
router.post('/2fa/setup',  authenticate, setup2FA);
router.post('/2fa/verify', authenticate, verify2FA);
router.delete('/2fa',      authenticate, disable2FA);

module.exports = router;

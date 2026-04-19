const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const {
  getProfile,
  updateProfile,
  uploadProfilePhoto,
  createTeenAccount,
  getTeenAccounts,
  updateLanguage,
  deleteAccount,
  getNotifications,
  markNotificationRead,
  getLoyaltyInfo,
  createCorporateAccount,
  getCorporateAccount,
  addCorporateMember,
  removeCorporateMember,
  getCorporateRides,
  getSubscription,
  updateExpoPushToken,
  blockRider,
  unblockRider,
  submitAppeal,
} = require('../controllers/profileController');

// multer: memory storage, images only, max 5 MB
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  },
});
const tcCtrl  = require('../controllers/trustedContactController');
const bgCtrl  = require('../controllers/backgroundCheckController');
const { validateProfileUpdate, validateCreateTeenAccount, validateUpdateLanguage, validateBlockRider, validatePushToken } = require('../middleware/validateProfile');
const { profileUpdateLimiter, photoUploadLimiter, teenAccountLimiter, loyaltyLimiter, blockLimiter } = require('../middleware/perUserRateLimiter');
const { getDataExport } = require('../controllers/dataExportController');
const { requestErasure, executeErasure, listErasureRequests } = require('../controllers/gdprController');
const { requirePermission } = require('../middleware/rbac');

// All profile routes require authentication
router.use(authenticate);

// ── Background check routes ──────────────────────────────────────────────────
// IMPORTANT: /drivers/background-checks/expired MUST come before /drivers/:id
// to prevent Express treating "background-checks" as an :id param value.
router.get('/drivers/background-checks/expired', bgCtrl.getExpiredBackgroundChecks);
router.patch('/drivers/:id/background-check',    bgCtrl.updateBackgroundCheck);

router.get('/profile', getProfile);
router.put('/profile', profileUpdateLimiter, validateProfileUpdate, updateProfile);
// Photo upload: accepts multipart/form-data (field: photo) OR JSON body (image_base64)
router.post('/profile/photo', photoUploadLimiter, photoUpload.single('photo'), uploadProfilePhoto);

router.post('/teen-account', teenAccountLimiter, validateCreateTeenAccount, createTeenAccount);
router.get('/teen-accounts', getTeenAccounts);

router.put('/language', validateUpdateLanguage, updateLanguage);

router.delete('/account', deleteAccount);

// GDPR Article 20 — Right to Data Portability (rate-limited: 1/24h)
router.get('/data-export', getDataExport);

// Driver specific rider-blocking & appeal
router.post('/block/:riderId', blockLimiter, validateBlockRider, blockRider);
router.delete('/block/:riderId', blockLimiter, unblockRider);
router.post('/appeal', submitAppeal);

router.get('/notifications', getNotifications);
router.put('/notifications/:id/read', markNotificationRead);

router.get('/loyalty', loyaltyLimiter, getLoyaltyInfo);

// Corporate account routes
router.post('/corporate', createCorporateAccount);
router.get('/corporate', getCorporateAccount);
router.post('/corporate/members', addCorporateMember);
router.delete('/corporate/members/:userId', removeCorporateMember);
router.get('/corporate/rides', getCorporateRides);

// Subscription info
router.get('/subscription', getSubscription);

// Push notification token
router.put('/push-token', validatePushToken, updateExpoPushToken);

// Trusted contacts
router.get('/users/me/trusted-contacts', tcCtrl.getTrustedContacts);
router.post('/users/me/trusted-contacts', tcCtrl.addTrustedContact);
router.patch('/users/me/trusted-contacts/:id', tcCtrl.updateTrustedContact);
router.delete('/users/me/trusted-contacts/:id', tcCtrl.removeTrustedContact);

// Saved places
router.get('/users/me/saved-places', require('../controllers/savedPlacesController').getSavedPlaces);
router.post('/users/me/saved-places', require('../controllers/savedPlacesController').createSavedPlace);
router.delete('/users/me/saved-places/:id', require('../controllers/savedPlacesController').deleteSavedPlace);

// ── Driver Shift-Start Selfie Check (Uber Real-Time ID style) ────────────────
const selfieCtrl = require('../controllers/driverSelfieController');
router.get('/drivers/me/selfie-check',             authenticate, selfieCtrl.getSelfieCheckStatus);
router.post('/drivers/me/selfie-check',            authenticate, selfieCtrl.submitSelfieCheck);
router.get('/admin/selfie-checks',                 authenticate, selfieCtrl.listSelfieChecks);
router.patch('/admin/selfie-checks/:id/review',    authenticate, selfieCtrl.adminReviewSelfie);

// Biometric driver verification (Smile Identity)
router.post('/drivers/me/biometric-verify', require('../controllers/biometricController').verifyDriver);
router.get('/drivers/me/biometric-status',  require('../controllers/biometricController').getVerificationStatus);

// Rider identity verification — unlocks multi-stop + Verified Rider badge shown to driver
router.post('/users/me/verify-identity',       require('../controllers/biometricController').verifyRider);
router.get('/users/me/verification-status',    require('../controllers/biometricController').getRiderVerificationStatus);

// GDPR Article 17 — Right to Erasure (self-service)
router.post('/me/erase', requestErasure);

// ── Admin GDPR routes (require admin:erasure_execute permission) ─────────────
router.get('/admin/erasure-requests', requirePermission('admin:erasure_execute'), listErasureRequests);
router.post('/admin/erasure/:id/execute', requirePermission('admin:erasure_execute'), executeErasure);

module.exports = router;

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  getProfile,
  updateProfile,
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
  updateExpoPushToken
} = require('../controllers/profileController');

// All profile routes require authentication
router.use(authenticate);

router.get('/profile', getProfile);
router.put('/profile', updateProfile);

router.post('/teen-account', createTeenAccount);
router.get('/teen-accounts', getTeenAccounts);

router.put('/language', updateLanguage);

router.delete('/account', deleteAccount);

router.get('/notifications', getNotifications);
router.put('/notifications/:id/read', markNotificationRead);

router.get('/loyalty', getLoyaltyInfo);

// Corporate account routes
router.post('/corporate', createCorporateAccount);
router.get('/corporate', getCorporateAccount);
router.post('/corporate/members', addCorporateMember);
router.delete('/corporate/members/:userId', removeCorporateMember);
router.get('/corporate/rides', getCorporateRides);

// Subscription info
router.get('/subscription', getSubscription);

// Push notification token
router.put('/push-token', updateExpoPushToken);

module.exports = router;

const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const {
  addPaymentMethod,
  listPaymentMethods,
  setDefaultMethod,
  deletePaymentMethod,
  chargeRide,
  getPaymentHistory,
  refundPayment,
  getWalletBalance,
  processSubscription,
  getSubscriptionStatus
} = require('../controllers/paymentController');

// All payment routes require authentication
router.use(authenticate);

// Payment methods
router.post('/methods', addPaymentMethod);
router.get('/methods', listPaymentMethods);
router.put('/methods/:id/default', setDefaultMethod);
router.delete('/methods/:id', deletePaymentMethod);

// Charge
router.post('/charge', chargeRide);

// History
router.get('/history', getPaymentHistory);

// Refund
router.post('/refund/:id', refundPayment);

// Wallet
router.get('/wallet', getWalletBalance);

// Subscription
router.post('/subscribe', processSubscription);
router.get('/subscription', getSubscriptionStatus);

module.exports = router;

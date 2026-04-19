const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth');
const idempotency = require('../middleware/idempotency');
const {
  validateChargeRide,
  validateAddPaymentMethod,
  validateSubscription,
  validateRefund,
  validateCashout,
} = require('../middleware/validators');
const {
  chargeLimiter,
  methodLimiter,
  cashoutLimiter,
  subscribeLimiter,
} = require('../middleware/perUserRateLimiter');
const {
  addPaymentMethod,
  listPaymentMethods,
  setDefaultMethod,
  deletePaymentMethod,
  chargeRide,
  checkPaymentStatus,
  createStripePaymentIntent,
  webhookMtn,
  webhookOrange,
  webhookFlutterwave,
  getPaymentHistory,
  refundPayment,
  getWalletBalance,
  processSubscription,
  getSubscriptionStatus,
  driverCashout,
  getDriverCashoutHistory,
} = require('../controllers/paymentController');

// ── Public webhook endpoints (no auth — called by payment providers) ───────────
// NOTE: /webhook/stripe is registered in server.js BEFORE express.json()
//       because Stripe requires the raw request body for signature verification.
router.post('/webhook/mtn',         webhookMtn);
router.post('/webhook/orange',      webhookOrange);
router.post('/webhook/flutterwave', webhookFlutterwave);

// ── All other routes require a valid JWT ───────────────────────────────────────
router.use(authenticate);

// Payment methods
router.post('/methods',               methodLimiter, validateAddPaymentMethod, addPaymentMethod);
router.get('/methods',                listPaymentMethods);
router.put('/methods/:id/default',    setDefaultMethod);
router.delete('/methods/:id',         deletePaymentMethod);

// Charge + async status polling
router.post('/charge',                chargeLimiter, idempotency, validateChargeRide, chargeRide);
router.get('/status/:referenceId',    checkPaymentStatus);

// History
router.get('/history',                getPaymentHistory);

// Refund
router.post('/refund/:id',            validateRefund, refundPayment);

// Wallet
router.get('/wallet',                 getWalletBalance);

// Subscription
router.post('/subscribe',             subscribeLimiter, validateSubscription, processSubscription);
router.get('/subscription',           getSubscriptionStatus);

// Stripe payment sheet — creates a PaymentIntent; client uses client_secret with Stripe SDK
router.post('/stripe/payment-intent', idempotency, createStripePaymentIntent);

// Driver cashout (payout to mobile money / bank)
router.post('/driver/cashout',         cashoutLimiter, idempotency, validateCashout, driverCashout);
router.get('/driver/cashout-history',  getDriverCashoutHistory);

module.exports = router;

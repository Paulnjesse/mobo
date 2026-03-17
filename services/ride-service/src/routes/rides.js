const express = require('express');
const router = express.Router();
const { authenticate, requireDriver } = require('../middleware/auth');
const {
  requestRide,
  getFare,
  acceptRide,
  updateRideStatus,
  cancelRide,
  getRide,
  listRides,
  rateRide,
  addTip,
  roundUpFare,
  getSurgePricing,
  getNearbyDrivers,
  applyPromoCode,
  getActivePromos,
  getMessages,
  sendMessage
} = require('../controllers/rideController');

// Promo codes — must be before /:id routes to avoid conflicts
router.post('/promo/apply', authenticate, applyPromoCode);
router.get('/promos', authenticate, getActivePromos);

// Fare estimation (public or authenticated)
router.get('/estimate', (req, res, next) => {
  // Allow unauthenticated fare estimates
  const authHeader = req.headers.authorization;
  if (authHeader) {
    return authenticate(req, res, next);
  }
  next();
}, getFare);

// Surge check (public)
router.get('/surge', getSurgePricing);

// Nearby drivers
router.get('/drivers/nearby', authenticate, getNearbyDrivers);

// Ride list
router.get('/', authenticate, listRides);

// Request a ride
router.post('/request', authenticate, requestRide);

// Get single ride
router.get('/:id', authenticate, getRide);

// Driver accepts ride
router.patch('/:id/accept', authenticate, requireDriver, acceptRide);

// Update ride status
router.patch('/:id/status', authenticate, requireDriver, updateRideStatus);

// Cancel ride (rider or driver)
router.post('/:id/cancel', authenticate, cancelRide);

// Rate ride
router.post('/:id/rate', authenticate, rateRide);

// Add tip
router.post('/:id/tip', authenticate, addTip);

// Round up fare
router.post('/:id/round-up', authenticate, roundUpFare);

// Messages for a ride
router.get('/:id/messages', authenticate, getMessages);
router.post('/:id/messages', authenticate, sendMessage);

module.exports = router;

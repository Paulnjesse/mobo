const express = require('express');
const router = express.Router();
const { authenticate, requireDriver } = require('../middleware/auth');
const {
  updateLocation,
  getLocation,
  getNearbyDrivers,
  checkSurgeZone,
  getRouteEstimate,
  getRideRoute,
  getLocationHistory,
  updateDriverStatus
} = require('../controllers/locationController');
const driverCtrl = require('../controllers/driverDestinationController');

// Update location (driver or rider)
router.post('/location', authenticate, updateLocation);

// Get location for a user
router.get('/location/:userId', authenticate, getLocation);

// Get location history for self
router.get('/location/history', authenticate, getLocationHistory);

// Nearby drivers (public-ish, authenticated)
router.get('/drivers/nearby', authenticate, getNearbyDrivers);

// Driver online/offline status
router.post('/location/driver/status', authenticate, requireDriver, updateDriverStatus);

// Surge zone check
router.get('/location/surge', authenticate, checkSurgeZone);

// Route estimate between two points
router.get('/location/route/estimate', authenticate, getRouteEstimate);

// Ride route (active ride tracking)
router.get('/rides/:id/route', authenticate, getRideRoute);

// Destination mode
router.get('/destination-mode', authenticate, driverCtrl.getDestinationMode);
router.post('/destination-mode', authenticate, driverCtrl.setDestinationMode);

// Driver bonuses & streaks
router.get('/bonuses', authenticate, driverCtrl.getDriverBonuses);
router.post('/bonuses/challenges', authenticate, driverCtrl.createBonusChallenge);

// Express Pay
router.post('/express-pay/setup', authenticate, driverCtrl.setupExpressPay);
router.post('/express-pay/payout', authenticate, driverCtrl.requestExpressPayout);
router.get('/express-pay/history', authenticate, driverCtrl.getExpressPayHistory);

module.exports = router;

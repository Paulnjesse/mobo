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
const safetyCtrl = require('../controllers/safetyController');

// Update location (driver or rider)
router.post('/location/update', authenticate, updateLocation);

// Get location history for self (must come BEFORE /:userId)
router.get('/location/history', authenticate, getLocationHistory);

// Surge zone check
router.get('/location/surge', authenticate, checkSurgeZone);

// Route estimate between two points
router.get('/location/route/estimate', authenticate, getRouteEstimate);

// Driver online/offline status
router.post('/location/driver/status', authenticate, requireDriver, updateDriverStatus);

// Get location for a specific user (parameterized — comes LAST)
router.get('/location/:userId', authenticate, getLocation);

// Nearby drivers
router.get('/drivers/nearby', authenticate, getNearbyDrivers);

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

// Safety features
router.post('/safety/speed-alert', authenticate, safetyCtrl.recordSpeedAlert);
router.post('/safety/route-deviation', authenticate, safetyCtrl.checkRouteDeviation);
router.get('/safety/fatigue-check', authenticate, requireDriver, safetyCtrl.checkFatigue);
router.post('/safety/realid', authenticate, requireDriver, safetyCtrl.driverRealIDSubmit);
router.get('/safety/realid/pending', authenticate, safetyCtrl.getRealIDChecks);

module.exports = router;

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
const szCtrl     = require('../controllers/safetyZoneController');
const { locationUpdateLimiter, nearbyDriversLimiter, routeEstimateLimiter } = require('../middleware/perUserRateLimiter');
const { validateLocationUpdate, validateGetNearbyDrivers, validateRouteEstimate } = require('../middleware/validators');

// Update location (driver or rider)
router.post('/location/update', authenticate, locationUpdateLimiter, validateLocationUpdate, updateLocation);

// Get location history for self (must come BEFORE /:userId)
router.get('/location/history', authenticate, getLocationHistory);

// Surge zone check
router.get('/location/surge', authenticate, checkSurgeZone);

// Route estimate between two points
router.get('/location/route/estimate', authenticate, routeEstimateLimiter, validateRouteEstimate, getRouteEstimate);

// Driver online/offline status
router.post('/location/driver/status', authenticate, requireDriver, updateDriverStatus);

// Get location for a specific user (parameterized — comes LAST)
router.get('/location/:userId', authenticate, getLocation);

// Nearby drivers
router.get('/drivers/nearby', authenticate, nearbyDriversLimiter, validateGetNearbyDrivers, getNearbyDrivers);

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
router.post('/safety/crash-detection', authenticate, safetyCtrl.crashDetection);
router.get('/safety/fatigue-check', authenticate, requireDriver, safetyCtrl.checkFatigue);
router.post('/safety/fatigue-break', authenticate, requireDriver, safetyCtrl.enforceFatigueBreak);
router.post('/safety/realid', authenticate, requireDriver, safetyCtrl.driverRealIDSubmit);
router.get('/safety/realid/pending', authenticate, safetyCtrl.getRealIDChecks);

// ── Safety zones (incident alerts) ──────────────────────────────────────────
// NOTE: /safety-zones/check MUST come before /safety-zones/:id to avoid param conflict
router.get('/safety-zones',         authenticate, szCtrl.getSafetyZones);
router.post('/safety-zones',        authenticate, szCtrl.createSafetyZone);
router.post('/safety-zones/check',  authenticate, szCtrl.checkDriverInSafetyZone);
router.patch('/safety-zones/:id',   authenticate, szCtrl.updateSafetyZone);
router.delete('/safety-zones/:id',  authenticate, szCtrl.deleteSafetyZone);

module.exports = router;

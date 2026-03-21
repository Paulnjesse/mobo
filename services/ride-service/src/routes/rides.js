const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const ctrl          = require('../controllers/rideController');
const disputeCtrl   = require('../controllers/disputeController');
const shareCtrl     = require('../controllers/shareTripController');
const recordingCtrl = require('../controllers/recordingController');

// ── Share trip (PUBLIC track route MUST come before /:id to avoid param conflict)
router.get('/track/:token', shareCtrl.getSharedTrip);  // PUBLIC - no auth

// ── Disputes (mine route MUST come before /:id to avoid param conflict)
router.post('/disputes', authenticate, disputeCtrl.fileDispute);
router.get('/disputes/mine', authenticate, disputeCtrl.getMyDisputes);
router.get('/disputes', authenticate, disputeCtrl.getAllDisputes);
router.get('/disputes/:id', authenticate, disputeCtrl.getDisputeById);
router.patch('/disputes/:id/resolve', authenticate, disputeCtrl.resolveDispute);

// Fare & pricing
router.post('/fare', authenticate, ctrl.getFare);
router.post('/fare/lock', authenticate, ctrl.lockPrice);
router.get('/surge', authenticate, ctrl.getSurgePricing);

// Promo codes
router.post('/promo/apply', authenticate, ctrl.applyPromoCode);
router.get('/promo/active', authenticate, ctrl.getActivePromos);

// Preferred drivers
router.get('/preferred-drivers', authenticate, ctrl.getPreferredDrivers);
router.post('/preferred-drivers', authenticate, ctrl.addPreferredDriver);
router.delete('/preferred-drivers/:driver_id', authenticate, ctrl.removePreferredDriver);

// Concierge
router.post('/concierge', authenticate, ctrl.createConciergeBooking);
router.get('/concierge', authenticate, ctrl.getConciergeBookings);

// Lost & Found
router.post('/lost-and-found', authenticate, ctrl.reportLostItem);
router.get('/lost-and-found', authenticate, ctrl.getLostAndFound);
router.patch('/lost-and-found/:id', authenticate, ctrl.updateLostAndFoundStatus);

// Ride CRUD
router.post('/', authenticate, ctrl.requestRide);
router.get('/', authenticate, ctrl.listRides);
router.get('/:id', authenticate, ctrl.getRide);

// Ride actions
router.post('/:id/accept', authenticate, ctrl.acceptRide);
router.post('/:id/share', authenticate, shareCtrl.generateShareToken);
router.patch('/:id/status', authenticate, ctrl.updateRideStatus);
router.post('/:id/cancel', authenticate, ctrl.cancelRide);
router.post('/:id/rate', authenticate, ctrl.rateRide);
router.post('/:id/tip', authenticate, ctrl.addTip);
router.post('/:id/round-up', authenticate, ctrl.roundUpFare);
router.patch('/:id/stops', authenticate, ctrl.updateRideStops);

// Check-ins
router.post('/checkins', authenticate, ctrl.triggerCheckin);
router.patch('/checkins/:id/respond', authenticate, ctrl.respondToCheckin);
router.get('/:ride_id/checkins', authenticate, ctrl.getCheckins);

// Messages
router.get('/:id/messages', authenticate, ctrl.getMessages);
router.post('/:id/messages', authenticate, ctrl.sendMessage);

// Ride audio recordings
router.post('/:id/recording',  authenticate, recordingCtrl.saveRecording);
router.get('/:id/recordings',  authenticate, recordingCtrl.getRecordings);

module.exports = router;

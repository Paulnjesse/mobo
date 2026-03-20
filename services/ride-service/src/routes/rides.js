const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/rideController');

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

module.exports = router;

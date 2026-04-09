const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const ctrl            = require('../controllers/rideController');
const disputeCtrl     = require('../controllers/disputeController');
const shareCtrl       = require('../controllers/shareTripController');
const recordingCtrl   = require('../controllers/recordingController');
const deliveryCtrl    = require('../controllers/deliveryController');
const sosCtrl         = require('../controllers/sosController');
const outstationCtrl     = require('../controllers/outstationController');
const airportCtrl        = require('../controllers/airportController');
const callProxyCtrl      = require('../controllers/callProxyController');
const commuterPassCtrl   = require('../controllers/commuterPassController');
const supportCtrl        = require('../controllers/supportController');
const heatmapCtrl        = require('../controllers/heatmapController');
const driverTierCtrl     = require('../controllers/driverTierController');
const recurringCtrl      = require('../controllers/recurringRideController');
const savedPlacesCtrl    = require('../controllers/savedPlacesController');
const ussdCtrl           = require('../controllers/ussdController');
const fuelCardCtrl       = require('../controllers/fuelCardController');
const maintenanceCtrl    = require('../controllers/maintenanceController');
const guaranteeCtrl      = require('../controllers/earningsGuaranteeController');
const developerCtrl      = require('../controllers/developerPortalController');
const whatsappCtrl       = require('../controllers/whatsappController');
const carpoolCtrl        = require('../controllers/carpoolController');

// ── Pool / Carpool ─────────────────────────────────────────────────────────────
router.get('/pool/estimate',                   authenticate, carpoolCtrl.estimatePoolFare);
router.post('/pool/request',                   authenticate, carpoolCtrl.requestPoolRide);
router.get('/pool/groups/:groupId',            authenticate, carpoolCtrl.getPoolGroup);
router.post('/pool/groups/:groupId/dispatch',  authenticate, carpoolCtrl.dispatchPoolGroup);

// ── Heat Map ──────────────────────────────────────────────────────────────────
router.get('/heatmap/zones',            authenticate, heatmapCtrl.getHeatmapZones);

// ── Driver Tier ───────────────────────────────────────────────────────────────
router.get('/driver/radar',             authenticate, driverTierCtrl.getDriverRadar);

// ── Recurring Rides ───────────────────────────────────────────────────────────
router.get('/recurring',               authenticate, recurringCtrl.getMySeries);
router.post('/recurring',              authenticate, recurringCtrl.createSeries);
router.patch('/recurring/:id',         authenticate, recurringCtrl.updateSeries);
router.delete('/recurring/:id',        authenticate, recurringCtrl.deleteSeries);

// ── Saved Places ──────────────────────────────────────────────────────────────
router.get('/users/me/saved-places',         authenticate, savedPlacesCtrl.getSavedPlaces);
router.post('/users/me/saved-places',        authenticate, savedPlacesCtrl.createSavedPlace);
router.delete('/users/me/saved-places/:id',  authenticate, savedPlacesCtrl.deleteSavedPlace);

// ── USSD ──────────────────────────────────────────────────────────────────────
router.post('/ussd',                   ussdCtrl.handleUSSD); // no auth — USSD gateway webhook

// ── WhatsApp Booking ──────────────────────────────────────────────────────────
router.post('/whatsapp',               whatsappCtrl.validateTwilio, whatsappCtrl.handleWhatsApp); // no auth — Twilio webhook

// ── Fuel Card ─────────────────────────────────────────────────────────────────
router.get('/drivers/me/fuel-card',          authenticate, fuelCardCtrl.getFuelCard);
router.get('/drivers/me/fuel-card/transactions', authenticate, fuelCardCtrl.getTransactions);

// ── Maintenance ───────────────────────────────────────────────────────────────
router.get('/drivers/me/maintenance',        authenticate, maintenanceCtrl.getMaintenance);
router.post('/drivers/me/maintenance/log',   authenticate, maintenanceCtrl.logService);

// ── Earnings Guarantee ────────────────────────────────────────────────────────
router.get('/drivers/me/guarantee',          authenticate, guaranteeCtrl.getGuarantee);
router.get('/drivers/me/guarantee/history',  authenticate, guaranteeCtrl.getGuaranteeHistory);

// ── Driver Tier ───────────────────────────────────────────────────────────────
router.get('/drivers/me/tier',               authenticate, driverTierCtrl.getDriverTier);

// ── Developer Portal ──────────────────────────────────────────────────────────
router.get('/developer/portal',              authenticate, developerCtrl.getPortal);
router.post('/developer/portal/regenerate-key', authenticate, developerCtrl.regenerateKey);

// ── Airport Mode ─────────────────────────────────────────────────────────────
router.get('/drivers/me/airport-mode',       authenticate, airportCtrl.getAirportMode);
router.patch('/drivers/me/airport-mode',     authenticate, airportCtrl.updateAirportMode);

// ── Delivery routes (all before /:id to avoid param conflicts) ────────────────
// Estimation & discovery
router.get('/deliveries/estimate',              authenticate, deliveryCtrl.estimateDeliveryFare);
router.get('/deliveries/mine',                  authenticate, deliveryCtrl.getMyDeliveries);
router.get('/deliveries/nearby',                authenticate, deliveryCtrl.getNearbyDeliveries);
router.get('/deliveries/stats',                 authenticate, deliveryCtrl.getDeliveryStats);
router.get('/deliveries/driver/history',        authenticate, deliveryCtrl.getDriverDeliveryHistory);
// Public live-tracking — no auth required (accessible via tracking_token)
router.get('/deliveries/track/:token',          deliveryCtrl.getDeliveryByToken);
// Batch / B2B multi-drop
router.post('/deliveries/batch',                authenticate, deliveryCtrl.createBatchDelivery);
router.get('/deliveries/batch/:batchId',        authenticate, deliveryCtrl.getBatchDelivery);
// Single delivery CRUD
router.post('/deliveries',                      authenticate, deliveryCtrl.createDelivery);
router.get('/deliveries/:id',                   authenticate, deliveryCtrl.getDeliveryById);
router.post('/deliveries/:id/accept',           authenticate, deliveryCtrl.acceptDelivery);
router.patch('/deliveries/:id/status',          authenticate, deliveryCtrl.updateDeliveryStatus);
router.post('/deliveries/:id/verify-otp',       authenticate, deliveryCtrl.verifyRecipientOTP);
router.post('/deliveries/:id/cancel',           authenticate, deliveryCtrl.cancelDelivery);
router.post('/deliveries/:id/rate',             authenticate, deliveryCtrl.rateDelivery);

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

// Rental packages
router.get('/rental/packages', authenticate, ctrl.getRentalPackages);

// Driver earnings dashboard
router.get('/driver/earnings', authenticate, ctrl.getDriverEarnings);

// ── Outstation / Intercity ────────────────────────────────────────────────────
router.get('/outstation/cities',        authenticate, outstationCtrl.getIntercitiyCities);
router.post('/outstation/estimate',     authenticate, outstationCtrl.getOutstationEstimate);
router.post('/outstation',              authenticate, outstationCtrl.createOutstationBooking);
router.get('/outstation/mine',          authenticate, outstationCtrl.getMyOutstationBookings);
router.get('/outstation/all',           authenticate, outstationCtrl.getAllOutstationBookings);
router.patch('/outstation/:id/cancel',  authenticate, outstationCtrl.cancelOutstationBooking);

// ── Airport Mode / Queue ──────────────────────────────────────────────────────
router.get('/airport/zones',            authenticate, airportCtrl.getAirportZones);
router.post('/airport/checkin',         authenticate, airportCtrl.airportCheckIn);
router.delete('/airport/checkout',      authenticate, airportCtrl.airportCheckOut);
router.get('/airport/queue/:zone_id',   authenticate, airportCtrl.getAirportQueue);
router.get('/airport/my-position',      authenticate, airportCtrl.getMyQueuePosition);

// ── Commuter passes ───────────────────────────────────────────────────────────
router.get('/commuter-passes/tiers',    authenticate, commuterPassCtrl.getPassTiers);
router.get('/commuter-passes',          authenticate, commuterPassCtrl.getMyPasses);
router.post('/commuter-passes',         authenticate, commuterPassCtrl.createPass);
router.delete('/commuter-passes/:id',   authenticate, commuterPassCtrl.cancelPass);

// ── Support chat ──────────────────────────────────────────────────────────────
router.post('/support/tickets',                         authenticate, supportCtrl.createTicket);
router.get('/support/tickets',                          authenticate, supportCtrl.getMyTickets);
router.get('/support/tickets/all',                      authenticate, supportCtrl.getAllTickets);
router.get('/support/tickets/:ticket_id/messages',      authenticate, supportCtrl.getMessages);
router.post('/support/tickets/:ticket_id/messages',     authenticate, supportCtrl.sendMessage);
router.patch('/support/tickets/:ticket_id/close',       authenticate, supportCtrl.closeTicket);

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
router.post('/:id/accept',  authenticate, ctrl.acceptRide);
router.post('/:id/decline', authenticate, ctrl.declineRide);
router.post('/:id/share', authenticate, shareCtrl.generateShareToken);
router.patch('/:id/status', authenticate, ctrl.updateRideStatus);
router.post('/:id/cancel', authenticate, ctrl.cancelRide);
router.get('/:id/cancellation-fee', authenticate, ctrl.getCancellationFeePreview);
router.post('/:id/initiate-call', authenticate, callProxyCtrl.initiateCall);
router.post('/:id/end-call', authenticate, callProxyCtrl.endCallSession);
router.post('/:id/rate', authenticate, ctrl.rateRide);
router.post('/:id/tip', authenticate, ctrl.addTip);
router.post('/:id/round-up', authenticate, ctrl.roundUpFare);

// Fare splitting
router.post('/:id/split-fare', authenticate, ctrl.createFareSplit);
router.get('/:id/split-fare', authenticate, ctrl.getFareSplit);
router.patch('/split-fare/participants/:participantId/pay', authenticate, ctrl.markSplitParticipantPaid);
router.patch('/:id/stops', authenticate, ctrl.updateRideStops);

// Check-ins
router.post('/checkins', authenticate, ctrl.triggerCheckin);
router.patch('/checkins/:id/respond', authenticate, ctrl.respondToCheckin);
router.get('/:ride_id/checkins', authenticate, ctrl.getCheckins);

// Quick replies (context-aware canned messages for in-ride chat)
router.get('/quick-replies', authenticate, ctrl.getQuickReplies);

// Messages
router.get('/:id/messages', authenticate, ctrl.getMessages);
router.post('/:id/messages', authenticate, ctrl.sendMessage);

// SOS
router.post('/:id/sos', authenticate, sosCtrl.triggerSOS);

// Ride audio recordings
router.post('/:id/recording',  authenticate, recordingCtrl.saveRecording);
router.get('/:id/recordings',  authenticate, recordingCtrl.getRecordings);

module.exports = router;

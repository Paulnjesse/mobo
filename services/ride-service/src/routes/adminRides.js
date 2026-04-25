'use strict';

const express = require('express');
const router  = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const { requirePermission }          = require('../middleware/rbac');
const ctrl = require('../controllers/adminRideController');

// All admin ride routes require a valid admin JWT
router.use(authenticate, requireAdmin);

// Finance-scoped permission — only finance team / super_admin may read revenue data
const canReadFinance = requirePermission('finance:read');

// ── Rides ─────────────────────────────────────────────────────────────────────
router.get('/rides/stats', ctrl.getRideStats);
router.get('/rides',       ctrl.listRides);
router.get('/rides/:id',   ctrl.getRideById);

// ── Surge Pricing ─────────────────────────────────────────────────────────────
router.get('/surge',             ctrl.listSurgeZones);
router.post('/surge',            ctrl.createSurgeZone);
router.patch('/surge/:id',       ctrl.updateSurgeZone);
router.patch('/surge/:id/toggle', ctrl.toggleSurgeZone);
router.delete('/surge/:id',      ctrl.deleteSurgeZone);

// ── Promotions ────────────────────────────────────────────────────────────────
router.get('/promotions',                ctrl.listPromotions);
router.post('/promotions',               ctrl.createPromotion);
router.patch('/promotions/:id',          ctrl.updatePromotion);
router.patch('/promotions/:id/toggle',   ctrl.togglePromotion);
router.delete('/promotions/:id',         ctrl.deletePromotion);

// ── Live map ──────────────────────────────────────────────────────────────────
router.get('/map/active-rides', ctrl.getActiveRides);

// ── Payments (finance:read required) ──────────────────────────────────────────
router.get('/payments/stats',   canReadFinance, ctrl.getPaymentStats);
router.get('/payments/revenue', canReadFinance, ctrl.getPaymentRevenue);
router.get('/payments/methods', canReadFinance, ctrl.getPaymentMethodBreakdown);
router.get('/payments',         canReadFinance, ctrl.listPayments);

// ── Bulk operations + trip replay (CF-006, CF-005) ────────────────────────────
router.post('/bulk/rides/reassign',    requirePermission('rides:manage'), ctrl.bulkReassignRides);
router.get('/rides/:id/waypoints',     ctrl.getRideWaypoints);

module.exports = router;

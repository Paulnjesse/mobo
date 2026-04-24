'use strict';

const express = require('express');
const router  = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const { requirePermission }          = require('../middleware/rbac');
const ctrl                           = require('../controllers/adminController');

// All admin routes require a valid admin JWT
router.use(authenticate, requireAdmin);

// ── Dashboard ─────────────────────────────────────────────────────────────────
const canReadFinance = requirePermission('finance:read');

router.get('/dashboard/stats',           ctrl.getStats);
// Revenue and payment breakdowns require finance:read — restricts to finance team / super_admin
router.get('/dashboard/revenue',         canReadFinance, ctrl.getRevenueChart);
router.get('/dashboard/rides-chart',     ctrl.getRidesChart);
router.get('/dashboard/payment-methods', canReadFinance, ctrl.getPaymentMethods);
router.get('/dashboard/recent-rides',    ctrl.getRecentRides);
router.get('/dashboard/recent-users',    ctrl.getRecentUsers);

// ── Users ─────────────────────────────────────────────────────────────────────
const canReadUsers  = requirePermission('users:read');
const canWriteUsers = requirePermission('users:write');

router.get('/users/stats',            canReadUsers,  ctrl.getUserStats);
router.get('/users',                  canReadUsers,  ctrl.listUsers);
router.get('/users/:id',              canReadUsers,  ctrl.getUserById);
router.patch('/users/:id/suspend',    canWriteUsers, ctrl.suspendUser);
router.patch('/users/:id/unsuspend',  canWriteUsers, ctrl.unsuspendUser);
router.delete('/users/:id',           requirePermission('users:archive'), ctrl.archiveUser);

// ── Drivers ───────────────────────────────────────────────────────────────────
const canReadDrivers  = requirePermission('users:read');
const canWriteDrivers = requirePermission('users:write');

router.get('/drivers/stats',             canReadDrivers,  ctrl.getDriverStats);
router.get('/drivers',                   canReadDrivers,  ctrl.listDrivers);
router.get('/drivers/:id',               canReadDrivers,  ctrl.getDriverById);
router.patch('/drivers/:id/approve',     canWriteDrivers, ctrl.approveDriver);
router.patch('/drivers/:id/suspend',     canWriteDrivers, ctrl.suspendDriver);
router.patch('/drivers/:id/unsuspend',   canWriteDrivers, ctrl.unsuspendDriver);

// ── Live map (online drivers) ─────────────────────────────────────────────────
router.get('/map/drivers', canReadDrivers, ctrl.getOnlineDrivers);

// ── Notifications ─────────────────────────────────────────────────────────────
router.post('/notifications/send',    requirePermission('admin:notifications'), ctrl.sendNotification);
router.get('/notifications/history',  requirePermission('admin:notifications'), ctrl.getNotificationHistory);
router.get('/notifications/stats',    requirePermission('admin:notifications'), ctrl.getNotificationStats);

// ── Settings ──────────────────────────────────────────────────────────────────
router.get('/settings',  ctrl.getSettings);
router.put('/settings',  requirePermission('admin:settings'), ctrl.updateSettings);

module.exports = router;

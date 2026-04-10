'use strict';

const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const ctrl = require('../controllers/adminManagementController');

// All admin management routes require a valid admin JWT
router.use(authenticate, requireAdmin);

// My permissions — any admin can call this (used on dashboard init)
router.get('/my-permissions', ctrl.getMyPermissions);

// Role & permission catalogue — any admin can read
router.get('/roles',       ctrl.listRoles);
router.get('/permissions', ctrl.listPermissions);

// Role management — requires admin:manage_roles
const canManageRoles = requirePermission('admin:manage_roles');
router.post('/roles',          canManageRoles, ctrl.createRole);
router.patch('/roles/:id',     canManageRoles, ctrl.updateRole);
router.delete('/roles/:id',    canManageRoles, ctrl.archiveRole);

// Admin staff management — requires admin:manage_staff
const canManageStaff = requirePermission('admin:manage_staff');
router.get('/staff',          canManageStaff, ctrl.listAdminStaff);
router.post('/staff',         canManageStaff, ctrl.createAdminStaff);
router.patch('/staff/:id',    canManageStaff, ctrl.updateAdminStaff);
router.delete('/staff/:id',   canManageStaff, ctrl.archiveAdminStaff);

// Soft-archive endpoints — replaces hard delete
router.patch('/users/:id/archive',   requirePermission('users:archive'),   ctrl.archiveUser);
router.patch('/drivers/:id/archive', requirePermission('drivers:archive'), ctrl.archiveDriver);

module.exports = router;

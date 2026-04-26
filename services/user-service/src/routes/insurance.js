'use strict';
const express = require('express');
const router  = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/insuranceController');

// ── Rider / Driver endpoints ──────────────────────────────────────────────────
router.post('/',        authenticate, ctrl.fileClaim);
router.get('/',         authenticate, ctrl.getMyClaims);
router.get('/:id',      authenticate, ctrl.getClaimById);

// ── Admin endpoints ───────────────────────────────────────────────────────────
router.get('/admin/stats',    authenticate, requireAdmin, ctrl.adminClaimStats);
router.get('/admin/all',      authenticate, requireAdmin, ctrl.adminListClaims);
router.patch('/admin/:id',    authenticate, requireAdmin, ctrl.adminUpdateClaim);

module.exports = router;

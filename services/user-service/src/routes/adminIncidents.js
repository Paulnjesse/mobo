'use strict';
/**
 * Admin incident management routes — CF-003
 *
 * All routes require admin authentication.
 * Creating/updating incidents requires 'incidents:manage' permission.
 */

const express = require('express');
const router  = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const { requirePermission }          = require('../middleware/rbac');
const ctrl = require('../controllers/incidentController');

router.use(authenticate, requireAdmin);

const canManage = requirePermission('incidents:manage');

router.get('/',              ctrl.listIncidents);
router.get('/sla-breaches',  ctrl.getSlaBreaches);
router.get('/:id',           ctrl.getIncident);
router.post('/',             canManage, ctrl.createIncident);
router.patch('/:id',         canManage, ctrl.updateIncident);

module.exports = router;

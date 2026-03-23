const router = require('express').Router();
const { authenticate, requireFleetOwner, requireAdmin } = require('../middleware/auth');
const fleetController = require('../controllers/fleetController');
const { auditAdmin } = require('../middleware/adminAudit');
const adminIpGuard    = require('../middleware/adminIpGuard');

// ── Admin-only routes (IP guard + auth + RBAC + audit) ────────────────────────
router.get('/admin/all', adminIpGuard, authenticate, requireAdmin, fleetController.getAllFleets);
router.post('/:id/approve',  adminIpGuard, authenticate, requireAdmin, auditAdmin('fleet.approve',  'fleet',  (req) => req.params.id), fleetController.approveFleet);
router.post('/:id/suspend',  adminIpGuard, authenticate, requireAdmin, auditAdmin('fleet.suspend',  'fleet',  (req) => req.params.id), fleetController.suspendFleet);
router.post('/:id/vehicles/:vehicleId/approve', adminIpGuard, authenticate, requireAdmin, auditAdmin('vehicle.approve', 'vehicle', (req) => req.params.vehicleId), fleetController.approveVehicle);
router.post('/:id/vehicles/:vehicleId/reject',  adminIpGuard, authenticate, requireAdmin, auditAdmin('vehicle.reject',  'vehicle', (req) => req.params.vehicleId), fleetController.rejectVehicle);

// ── Fleet owner routes ─────────────────────────────────────────────────────────
router.post('/', authenticate, requireFleetOwner, fleetController.createFleet);
// GET /fleet returns all fleets for admin, own fleets for fleet_owner
router.get('/', authenticate, (req, res, next) => {
  if (req.user.role === 'admin') return fleetController.getAllFleets(req, res, next);
  if (req.user.role === 'fleet_owner') return fleetController.getMyFleets(req, res, next);
  return res.status(403).json({ success: false, message: 'Access denied' });
});
router.get('/:id', authenticate, requireFleetOwner, fleetController.getFleet);
router.post('/:id/vehicles', authenticate, requireFleetOwner, fleetController.addVehicleToFleet);
router.put('/:id/vehicles/:vehicleId', authenticate, requireFleetOwner, fleetController.updateVehicle);
router.delete('/:id/vehicles/:vehicleId', authenticate, requireFleetOwner, fleetController.removeVehicle);
router.put('/:id/vehicles/:vehicleId/driver', authenticate, requireFleetOwner, fleetController.assignDriver);
router.delete('/:id/vehicles/:vehicleId/driver', authenticate, requireFleetOwner, fleetController.unassignDriver);
router.get('/:id/earnings', authenticate, requireFleetOwner, fleetController.getFleetEarnings);
router.get('/:id/vehicles', authenticate, requireFleetOwner, fleetController.getFleetVehicles);

module.exports = router;

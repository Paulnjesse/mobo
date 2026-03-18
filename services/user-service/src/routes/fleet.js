const router = require('express').Router();
const { authenticate, requireFleetOwner, requireAdmin } = require('../middleware/auth');
const fleetController = require('../controllers/fleetController');

// ── Admin-only routes (must be before /:id to avoid conflicts) ─────────────────
router.get('/admin/all', authenticate, requireAdmin, fleetController.getAllFleets);
router.post('/:id/approve', authenticate, requireAdmin, fleetController.approveFleet);
router.post('/:id/suspend', authenticate, requireAdmin, fleetController.suspendFleet);
router.post('/:id/vehicles/:vehicleId/approve', authenticate, requireAdmin, fleetController.approveVehicle);
router.post('/:id/vehicles/:vehicleId/reject', authenticate, requireAdmin, fleetController.rejectVehicle);

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

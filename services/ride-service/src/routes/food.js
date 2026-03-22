const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/foodController');

// Public rider routes
router.get('/restaurants',             authenticate, ctrl.getRestaurants);
router.get('/restaurants/:id',         authenticate, ctrl.getRestaurant);
router.post('/orders',                 authenticate, ctrl.placeOrder);
router.get('/orders',                  authenticate, ctrl.getMyOrders);
router.get('/orders/:id',              authenticate, ctrl.getOrder);
router.patch('/orders/:id/cancel',     authenticate, ctrl.cancelOrder);
router.patch('/orders/:id/status',     authenticate, ctrl.updateOrderStatus);

// Admin routes
router.get('/admin/restaurants',       authenticate, requireAdmin, ctrl.adminListRestaurants);
router.post('/admin/restaurants',      authenticate, requireAdmin, ctrl.adminCreateRestaurant);
router.patch('/admin/restaurants/:id', authenticate, requireAdmin, ctrl.adminUpdateRestaurant);
router.post('/admin/restaurants/:id/menu', authenticate, requireAdmin, ctrl.adminAddMenuItem);
router.patch('/admin/menu/:item_id',   authenticate, requireAdmin, ctrl.adminUpdateMenuItem);
router.get('/admin/orders',            authenticate, requireAdmin, ctrl.adminListOrders);

module.exports = router;

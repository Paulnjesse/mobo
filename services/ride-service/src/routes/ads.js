const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/adsController');

// Public — mobile app fetches active ads
router.get('/',                  authenticate, ctrl.getAds);
router.post('/:id/impression',   authenticate, ctrl.recordImpression);
router.post('/:id/click',        authenticate, ctrl.recordClick);

// Admin only
router.get('/admin/all',         authenticate, requireAdmin, ctrl.listAllAds);
router.post('/',                 authenticate, requireAdmin, ctrl.createAd);
router.put('/:id',               authenticate, requireAdmin, ctrl.updateAd);
router.patch('/:id/toggle',      authenticate, requireAdmin, ctrl.toggleAd);
router.delete('/:id',            authenticate, requireAdmin, ctrl.deleteAd);

module.exports = router;

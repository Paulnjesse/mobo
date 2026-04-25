const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const ctrl         = require('../controllers/adsController');
const platformCtrl = require('../controllers/adPlatformController');

// ── Custom banner ads ─────────────────────────────────────────────────────────
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

// ── Ad Platform Config (AdMob + AdSense) + Animated Splash ───────────────────
// Public — mobile / admin web fetch their SDK config
router.get('/platform/config/:platform', authenticate, platformCtrl.getPlatformConfig);
router.get('/platform/splash',           authenticate, platformCtrl.getSplashConfig);

// Admin only
router.get('/platform/all',             authenticate, requireAdmin, platformCtrl.listAllPlatformConfigs);
router.put('/platform/:platform',       authenticate, requireAdmin, platformCtrl.upsertPlatformConfig);
router.put('/platform/splash/config',   authenticate, requireAdmin, platformCtrl.updateSplashConfig);

module.exports = router;

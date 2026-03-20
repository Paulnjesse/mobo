const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/socialController');

// Referrals
router.get('/referrals', authenticate, ctrl.getReferralInfo);
router.post('/referrals/apply', authenticate, ctrl.applyReferralCode);

// Family accounts
router.post('/family', authenticate, ctrl.createFamilyAccount);
router.get('/family', authenticate, ctrl.getFamilyAccount);
router.post('/family/members', authenticate, ctrl.inviteFamilyMember);
router.delete('/family/members/:user_id', authenticate, ctrl.removeFamilyMember);
router.patch('/family/members/:user_id', authenticate, ctrl.updateFamilyMember);

// Business profile
router.get('/business-profile', authenticate, ctrl.getBusinessProfile);
router.patch('/business-profile', authenticate, ctrl.toggleBusinessProfile);

// Women+ Connect
router.patch('/gender-preference', authenticate, ctrl.updateGenderPreference);

module.exports = router;

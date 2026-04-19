'use strict';
const { body, param, validationResult } = require('express-validator');

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const first = errors.array()[0];
    return res.status(400).json({ success: false, message: first.msg, details: errors.array() });
  }
  next();
};

// Charge ride — amount comes from ride record, not body; validate format only
const validateChargeRide = [
  body('ride_id').notEmpty().withMessage('ride_id is required'),
  body('method')
    .isIn(['cash', 'card', 'mtn_mobile_money', 'orange_money', 'wave', 'wallet', 'stripe'])
    .withMessage('Invalid payment method'),
  body('phone').optional().matches(/^\+?[0-9]{9,15}$/).withMessage('Invalid phone number format'),
  handleValidation,
];

// Add payment method
const validateAddPaymentMethod = [
  body('type')
    .isIn(['card', 'mtn_mobile_money', 'orange_money', 'wave', 'stripe', 'cash'])
    .withMessage('Invalid payment method type'),
  body('phone').optional().matches(/^\+?[0-9]{9,15}$/).withMessage('Invalid phone number'),
  body('token').optional().isString().isLength({ max: 500 }).withMessage('Invalid token'),
  handleValidation,
];

// Subscribe — method field matches controller's accepted values
const validateSubscription = [
  body('plan').isIn(['basic', 'premium']).withMessage('Plan must be basic or premium'),
  body('method')
    .optional()
    .isIn(['cash', 'wallet', 'mtn_mobile_money', 'orange_money', 'wave', 'stripe'])
    .withMessage('Invalid payment method'),
  handleValidation,
];

// Refund
const validateRefund = [
  param('id').notEmpty().withMessage('Payment ID required'),
  body('reason').optional().isString().isLength({ max: 500 }).withMessage('Reason too long'),
  handleValidation,
];

// Driver cashout — field names match controller: amount, method
const validateCashout = [
  body('amount').isInt({ min: 500 }).withMessage('Minimum cashout amount is 500 XAF'),
  body('method')
    .optional()
    .isIn(['mtn_mobile_money', 'orange_money', 'wave', 'mtn_momo'])
    .withMessage('Invalid cashout method'),
  body('phone').optional().matches(/^\+?[0-9]{9,15}$/).withMessage('Invalid phone number'),
  handleValidation,
];

module.exports = {
  validateChargeRide,
  validateAddPaymentMethod,
  validateSubscription,
  validateRefund,
  validateCashout,
  handleValidation,
};

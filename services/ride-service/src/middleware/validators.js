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

// Location object validator helper
const locationBody = (prefix) => [
  body(`${prefix}.lat`).isFloat({ min: -90, max: 90 }).withMessage(`${prefix}.lat must be a valid latitude`),
  body(`${prefix}.lng`).isFloat({ min: -180, max: 180 }).withMessage(`${prefix}.lng must be a valid longitude`),
];

const validateRequestRide = [
  ...locationBody('pickup_location'),
  ...locationBody('dropoff_location'),
  body('pickup_address').isString().trim().isLength({ min: 3, max: 255 }).withMessage('pickup_address required (3-255 chars)'),
  body('dropoff_address').isString().trim().isLength({ min: 3, max: 255 }).withMessage('dropoff_address required (3-255 chars)'),
  body('ride_type')
    .isIn(['moto','benskin','standard','xl','women','luxury','taxi','private','van','delivery','outstation'])
    .withMessage('Invalid ride_type'),
  body('scheduled_for').optional().isISO8601().withMessage('scheduled_for must be ISO8601 date'),
  body('scheduled_at').optional().isISO8601().withMessage('scheduled_at must be ISO8601 date'),
  body('promo_code').optional().isString().trim().isLength({ max: 50 }).withMessage('promo_code too long'),
  handleValidation,
];

// Use isString() not isUUID() — internal IDs may not be UUIDs in test data
const validateRateRide = [
  param('id').isString().notEmpty().withMessage('Ride ID required'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1-5'),
  body('comment').optional().isString().trim().isLength({ max: 500 }).withMessage('Comment too long (max 500 chars)'),
  handleValidation,
];

const validateSendMessage = [
  param('id').isString().notEmpty().withMessage('Ride ID required'),
  body('message').isString().trim().isLength({ min: 1, max: 1000 }).withMessage('Message must be 1-1000 chars'),
  handleValidation,
];

const validateCancelRide = [
  param('id').isString().notEmpty().withMessage('Ride ID required'),
  body('reason').optional().isString().trim().isLength({ max: 500 }).withMessage('Reason too long'),
  handleValidation,
];

const validateAddTip = [
  param('id').isString().notEmpty().withMessage('Ride ID required'),
  body('tip_amount').isInt({ min: 100, max: 50000 }).withMessage('tip_amount must be 100-50,000 XAF'),
  handleValidation,
];

const validateDispute = [
  body('ride_id').notEmpty().withMessage('ride_id is required'),
  body('description').optional().isString().trim().isLength({ min: 10, max: 1000 }).withMessage('Description too long'),
  body('category').optional().isIn(['overcharge','safety','rude_driver','wrong_route','vehicle_condition','other']).withMessage('Invalid dispute category'),
  handleValidation,
];

const validatePoolRequest = [
  ...locationBody('pickup_location'),
  ...locationBody('dropoff_location'),
  body('pickup_address').isString().trim().isLength({ min: 3, max: 255 }).withMessage('pickup_address required'),
  body('dropoff_address').isString().trim().isLength({ min: 3, max: 255 }).withMessage('dropoff_address required'),
  handleValidation,
];

module.exports = {
  validateRequestRide, validateRateRide, validateSendMessage,
  validateCancelRide, validateAddTip, validateDispute, validatePoolRequest,
  handleValidation,
};

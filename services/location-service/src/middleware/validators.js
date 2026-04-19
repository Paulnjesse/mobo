'use strict';
const { body, query, validationResult } = require('express-validator');

// Return response in the same format as the existing controllers: { success, message }
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const first = errors.array()[0];
    return res.status(400).json({ success: false, message: first.msg, details: errors.array() });
  }
  next();
};

const validateLocationUpdate = [
  body('lat')
    .notEmpty().withMessage('lat is required').bail()
    .isFloat().withMessage('Invalid lat value — must be a number').bail()
    .isFloat({ min: -90, max: 90 }).withMessage('lat out of valid range (-90 to 90)'),
  body('lng')
    .notEmpty().withMessage('lng is required').bail()
    .isFloat().withMessage('Invalid lng value — must be a number').bail()
    .isFloat({ min: -180, max: 180 }).withMessage('lng out of valid range (-180 to 180)'),
  body('heading').optional().isFloat({ min: 0, max: 360 }).withMessage('heading must be 0-360 degrees'),
  body('speed').optional().isFloat({ min: 0, max: 400 }).withMessage('speed must be 0-400 km/h'),
  body('accuracy').optional().isFloat({ min: 0, max: 10000 }).withMessage('accuracy must be 0-10000 meters'),
  handleValidation,
];

const validateGetNearbyDrivers = [
  query('lat')
    .notEmpty().withMessage('lat query param is required').bail()
    .isFloat({ min: -90, max: 90 }).withMessage('lat must be a valid latitude'),
  query('lng')
    .notEmpty().withMessage('lng query param is required').bail()
    .isFloat({ min: -180, max: 180 }).withMessage('lng must be a valid longitude'),
  query('radius_km').optional().isFloat({ min: 0.1, max: 100 }).withMessage('radius_km must be 0.1-100'),
  query('ride_type')
    .optional()
    .isIn(['moto','benskin','standard','xl','women','luxury','taxi','private','van','delivery'])
    .withMessage('Invalid ride_type'),
  handleValidation,
];

const validateRouteEstimate = [
  query('origin_lat').notEmpty().withMessage('origin_lat required').bail()
    .isFloat({ min: -90, max: 90 }).withMessage('origin_lat must be valid latitude'),
  query('origin_lng').notEmpty().withMessage('origin_lng required').bail()
    .isFloat({ min: -180, max: 180 }).withMessage('origin_lng must be valid longitude'),
  query('dest_lat').notEmpty().withMessage('dest_lat required').bail()
    .isFloat({ min: -90, max: 90 }).withMessage('dest_lat must be valid latitude'),
  query('dest_lng').notEmpty().withMessage('dest_lng required').bail()
    .isFloat({ min: -180, max: 180 }).withMessage('dest_lng must be valid longitude'),
  handleValidation,
];

module.exports = { validateLocationUpdate, validateGetNearbyDrivers, validateRouteEstimate, handleValidation };

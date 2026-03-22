'use strict';
const { body } = require('express-validator');

const signupValidator = [
  body('full_name')
    .trim().notEmpty().withMessage('Full name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Full name must be 2–100 characters'),
  body('phone')
    .notEmpty().withMessage('Phone number is required')
    .matches(/^\+?[\d\s\-()]{7,20}$/).withMessage('Invalid phone number format'),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role')
    .optional()
    .isIn(['rider', 'driver', 'fleet_owner']).withMessage('Role must be rider, driver, or fleet_owner'),
  body('email')
    .optional({ checkFalsy: true })
    .isEmail().withMessage('Invalid email address')
    .normalizeEmail(),
];

const loginValidator = [
  body('phone')
    .if((value, { req }) => !req.body.email)
    .notEmpty().withMessage('Phone or email is required'),
  body('email')
    .if((value, { req }) => !req.body.phone)
    .optional({ checkFalsy: true })
    .isEmail().withMessage('Invalid email address'),
  body('password')
    .notEmpty().withMessage('Password is required'),
];

const verifyOtpValidator = [
  body('phone').notEmpty().withMessage('Phone is required'),
  body('otp_code')
    .notEmpty().withMessage('OTP code is required')
    .isLength({ min: 6, max: 6 }).withMessage('OTP must be exactly 6 digits')
    .isNumeric().withMessage('OTP must be numeric'),
];

const forgotPasswordValidator = [
  body('identifier').notEmpty().withMessage('Phone number or email is required'),
];

const resetPasswordValidator = [
  body('identifier').notEmpty().withMessage('Phone number or email is required'),
  body('otp_code')
    .notEmpty().withMessage('OTP code is required')
    .isLength({ min: 6, max: 6 }).withMessage('OTP must be exactly 6 digits'),
  body('new_password')
    .notEmpty().withMessage('New password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
];

module.exports = {
  signupValidator,
  loginValidator,
  verifyOtpValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
};

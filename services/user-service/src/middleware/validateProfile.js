'use strict';

const AppError = require('../utils/AppError');

/**
 * Validation rules for profile update fields.
 * Applied as Express middleware before the controller.
 *
 * Constraints mirror the PostgreSQL column definitions + sensible UX limits.
 * Values are sanitized (trimmed, stripped of leading/trailing whitespace).
 */

const FIELD_RULES = {
  full_name:       { maxLen: 120,  pattern: /^[\p{L}\p{M}' \-]+$/u,  label: 'Full name' },
  city:            { maxLen: 100,  pattern: /^[\p{L}\p{M}' \-,]+$/u, label: 'City' },
  language:        { maxLen: 5,    enum: ['en', 'fr', 'sw'],          label: 'Language' },
  gender:          { maxLen: 20,   enum: ['male', 'female', 'other', 'prefer_not_to_say'], label: 'Gender' },
  date_of_birth:   { maxLen: 10,   pattern: /^\d{4}-\d{2}-\d{2}$/,   label: 'Date of birth' },
  profile_picture: { maxLen: 10_000_000,                              label: 'Profile picture' }, // base64
};

/**
 * Sanitizes a single string field value.
 * Returns the trimmed value or null if empty/undefined.
 * @param {any} val
 * @returns {string|null}
 */
function sanitize(val) {
  if (val === undefined || val === null) return null;
  if (typeof val !== 'string') return null;
  return val.trim() || null;
}

/**
 * Express middleware: validates and sanitizes profile update body.
 * Mutates req.body to contain clean values.
 * Calls next(AppError) on the first validation failure.
 */
function validateProfileUpdate(req, res, next) {
  const errors = [];

  for (const [field, rules] of Object.entries(FIELD_RULES)) {
    const raw = req.body[field];
    if (raw === undefined || raw === null) continue; // field not provided — skip

    const val = sanitize(raw);

    if (val === null) {
      req.body[field] = null;
      continue;
    }

    // Length check
    if (val.length > rules.maxLen) {
      errors.push(`${rules.label} must not exceed ${rules.maxLen} characters.`);
      continue;
    }

    // Enum check
    if (rules.enum && !rules.enum.includes(val)) {
      errors.push(`${rules.label} must be one of: ${rules.enum.join(', ')}.`);
      continue;
    }

    // Pattern check
    if (rules.pattern && !rules.pattern.test(val)) {
      errors.push(`${rules.label} contains invalid characters.`);
      continue;
    }

    // Assign cleaned value back to body
    req.body[field] = val;
  }

  if (errors.length > 0) {
    return next(new AppError(errors.join(' '), 400));
  }

  next();
}

/**
 * Express middleware: validates teen account creation body.
 */
function validateCreateTeenAccount(req, res, next) {
  const { full_name, phone, password } = req.body;
  const errors = [];

  if (!full_name || typeof full_name !== 'string' || full_name.trim().length < 2) {
    errors.push('full_name must be at least 2 characters.');
  }
  if (full_name && full_name.trim().length > 120) {
    errors.push('full_name must not exceed 120 characters.');
  }

  if (!phone || typeof phone !== 'string' || !/^\+?\d{7,15}$/.test(phone.trim())) {
    errors.push('phone must be a valid international number (7–15 digits, optional + prefix).');
  }

  if (!password || typeof password !== 'string' || password.length < 8) {
    errors.push('password must be at least 8 characters.');
  }
  if (password && password.length > 128) {
    errors.push('password must not exceed 128 characters.');
  }

  if (errors.length > 0) {
    return next(new AppError(errors.join(' '), 400));
  }

  // Sanitize
  req.body.full_name = full_name.trim();
  req.body.phone = phone.trim();

  next();
}

module.exports = { validateProfileUpdate, validateCreateTeenAccount };

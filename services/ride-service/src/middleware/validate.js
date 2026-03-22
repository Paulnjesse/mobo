'use strict';
const { validationResult } = require('express-validator');
const { ValidationError } = require('../utils/errors');

const validate = (req, res, next) => {
  const result = validationResult(req);
  if (result.isEmpty()) return next();
  const fields = result.array().map((e) => ({ field: e.path, message: e.msg }));
  return next(new ValidationError('Validation failed', fields));
};

module.exports = validate;

'use strict';

/**
 * Send a successful response.
 * @param {object} res - Express response object
 * @param {*} data - Payload to send
 * @param {string} message - Human-readable message
 * @param {number} statusCode - HTTP status (default 200)
 */
const success = (res, data = null, message = 'Success', statusCode = 200) => {
  const body = { success: true, message };
  if (data !== null) body.data = data;
  if (res.req?.id) body.requestId = res.req.id;
  return res.status(statusCode).json(body);
};

/**
 * Send a created (201) response.
 */
const created = (res, data = null, message = 'Created successfully') =>
  success(res, data, message, 201);

/**
 * Send a paginated list response.
 */
const paginated = (res, items, total, page, limit, message = 'Success') => {
  return res.status(200).json({
    success: true,
    message,
    data: { items, pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) } },
    requestId: res.req?.id,
  });
};

/**
 * Send an error response.
 * @param {object} res - Express response object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status (default 500)
 * @param {string} code - Machine-readable error code
 * @param {Array} fields - Validation field errors
 */
const error = (res, message = 'Internal server error', statusCode = 500, code = 'INTERNAL_ERROR', fields = []) => {
  const body = { success: false, message, code };
  if (fields.length) body.fields = fields;
  if (res.req?.id) body.requestId = res.req.id;
  return res.status(statusCode).json(body);
};

/**
 * Express error handler middleware that uses the response helpers.
 * Wire this AFTER Sentry.Handlers.errorHandler() and BEFORE the catch-all.
 */
const errorHandler = (err, req, res, next) => {
  const logger = req.logger || console;

  if (err.isOperational) {
    // Known application error
    logger.warn?.(`[${err.code}] ${err.message}`, { path: req.path, requestId: req.id });
    return error(res, err.message, err.statusCode, err.code, err.fields || []);
  }

  // Unknown / programming error — log full stack
  logger.error?.('Unhandled error', { error: err.message, stack: err.stack, requestId: req.id });
  return error(res, 'An unexpected error occurred', 500, 'INTERNAL_ERROR');
};

module.exports = { success, created, paginated, error, errorHandler };

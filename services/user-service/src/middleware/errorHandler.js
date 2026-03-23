'use strict';

const AppError = require('../utils/AppError');
const logger   = require('../../../shared/logger');

/**
 * Centralized Global Error Handler Middleware
 *
 * Separates operational errors (AppError.isOperational = true) from
 * programming errors (bugs, unexpected failures) and responds accordingly:
 *
 *   Operational  → 4xx/5xx with the original message (safe to expose to client)
 *   Programming  → 500 with a generic message (stack trace hidden from client)
 *
 * In development: full error + stack trace returned in JSON for debugging.
 * In production:  structured pino log, generic message to client.
 */
const globalErrorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status     = err.status     || 'error';

  // Structured log with request context and correlation ID
  const logCtx = {
    err,
    method:     req.method,
    url:        req.originalUrl,
    statusCode: err.statusCode,
    requestId:  req.id || req.headers['x-request-id'],
    userId:     req.user?.id,
  };

  if (err.statusCode >= 500) {
    logger.error(logCtx, err.message);
  } else {
    logger.warn(logCtx, err.message);
  }

  // ── Development: full details for debugging ──────────────────────────────
  if (process.env.NODE_ENV === 'development') {
    return res.status(err.statusCode).json({
      success:    false,
      status:     err.status,
      message:    err.message,
      stack:      err.stack,
    });
  }

  // ── Production: Operational error — message is safe to expose ────────────
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }

  // ── Production: Programming/unknown error — hide internals ───────────────
  logger.error({ err }, 'CRITICAL UNHANDLED ERROR — programming error or unexpected failure');
  return res.status(500).json({
    success: false,
    message: 'Something went wrong on our end. Please try again later.',
  });
};

module.exports = globalErrorHandler;

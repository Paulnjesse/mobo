'use strict';

/**
 * MOBO Structured Logger
 *
 * Built on pino — the fastest JSON logger for Node.js.
 * Automatically redacts sensitive fields so they never appear in log pipelines.
 *
 * Usage:
 *   const logger = require('../shared/logger');
 *   logger.info({ userId, rideId }, 'Ride accepted');
 *   logger.error({ err, userId }, 'Profile update failed');
 *
 * Install: npm install pino pino-pretty (pino-pretty for local dev only)
 *
 * Render/production: logs are emitted as JSON to stdout and ingested by
 * Render's built-in log drain. Forward to Datadog/Logtail via log drain URL.
 *
 * Correlation IDs:
 *   Each HTTP request gets a unique request ID (set by express-request-id or
 *   X-Request-ID header from the API gateway). Pass it to logger.child():
 *     const reqLogger = logger.child({ requestId: req.id });
 */

const pino = require('pino');

const REDACTED_PATHS = [
  // Auth
  'req.headers.authorization',
  'req.headers.cookie',
  'body.password',
  'body.password_hash',
  'body.otp_code',
  'body.otp',
  // Payment
  'body.card_number',
  'body.cvv',
  'body.card_expiry',
  // Personal
  'body.date_of_birth',
  'body.national_id',
  // Internal
  'req.headers["x-internal-service-key"]',
];

const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),

  // Redact sensitive fields — value replaced with "[Redacted]"
  redact: {
    paths: REDACTED_PATHS,
    censor: '[Redacted]',
  },

  // Serialize Error objects properly (pino doesn't serialize them by default)
  serializers: {
    err:   pino.stdSerializers.err,
    error: pino.stdSerializers.err,
    req:   pino.stdSerializers.req,
    res:   pino.stdSerializers.res,
  },

  // Base fields added to every log line
  base: {
    service: process.env.SERVICE_NAME || 'user-service',
    env:     process.env.NODE_ENV     || 'development',
  },

  // Pretty-print in development/test, JSON in production
  ...(process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize:        true,
        translateTime:   'SYS:HH:MM:ss',
        ignore:          'pid,hostname,service',
      },
    },
  }),
});

module.exports = logger;

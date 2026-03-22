'use strict';
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

/**
 * Attaches a unique request ID to every incoming request.
 * Reads X-Request-ID header if provided by upstream (e.g. API gateway),
 * otherwise generates a new UUID v4.
 *
 * Attaches:
 *   req.id         - the request ID string
 *   req.logger     - a child logger scoped to this request
 *   res header     - X-Request-ID echoed back to caller
 */
const requestId = (req, res, next) => {
  const id = req.headers['x-request-id'] || uuidv4();
  req.id = id;
  req.logger = logger.child({ requestId: id });
  res.setHeader('X-Request-ID', id);
  next();
};

module.exports = requestId;

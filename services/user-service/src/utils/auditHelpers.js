'use strict';
/**
 * Audit helpers — write structured audit log entries for sensitive operations
 * (payment changes, admin actions, data exports, etc.)
 */
const logger = require('./logger');

async function writePaymentAudit(event) {
  logger.info('[AUDIT] payment_event', event);
}

async function writeAdminAudit(event) {
  logger.info('[AUDIT] admin_event', event);
}

async function writeDataAudit(event) {
  logger.info('[AUDIT] data_event', event);
}

module.exports = { writePaymentAudit, writeAdminAudit, writeDataAudit };

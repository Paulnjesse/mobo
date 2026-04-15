'use strict';
const logger = require('./logger');
/**
 * Tamper-evident audit log writer.
 *
 * Writes immutable records to the audit_logs table. Each row is append-only —
 * the table should have no UPDATE/DELETE grants for application roles.
 *
 * Usage:
 *   const audit = require('../../../shared/auditLog');
 *   await audit.log(pool, {
 *     actor_id, actor_role, action, resource_type, resource_id,
 *     ip, user_agent, outcome, detail
 *   });
 *
 * Schema (add via migration if not present):
 *   CREATE TABLE IF NOT EXISTS audit_logs (
 *     id           BIGSERIAL PRIMARY KEY,
 *     actor_id     UUID,
 *     actor_role   TEXT,
 *     action       TEXT NOT NULL,        -- e.g. 'login', 'payment.initiate'
 *     resource_type TEXT,                -- e.g. 'ride', 'wallet', 'user'
 *     resource_id  TEXT,
 *     ip           INET,
 *     user_agent   TEXT,
 *     outcome      TEXT NOT NULL,        -- 'success' | 'failure' | 'blocked'
 *     detail       JSONB,
 *     created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
 *   );
 *   -- Prevent any row modification after insert
 *   REVOKE UPDATE, DELETE ON audit_logs FROM mobo_app;
 */

const AUDITABLE_ACTIONS = new Set([
  // Auth
  'auth.login', 'auth.login.fail', 'auth.logout', 'auth.token.refresh',
  'auth.otp.send', 'auth.otp.verify', 'auth.otp.fail',
  'auth.2fa.setup', 'auth.2fa.disable', 'auth.2fa.validate.fail',
  'auth.password.reset', 'auth.social.login',
  // Payments
  'payment.initiate', 'payment.complete', 'payment.fail',
  'payment.refund', 'payment.wallet.deduct', 'payment.wallet.topup',
  // Rides
  'ride.request', 'ride.accept', 'ride.complete', 'ride.cancel',
  'ride.tip.add', 'ride.promo.apply',
  // Admin
  'admin.user.suspend', 'admin.user.unsuspend', 'admin.driver.tier.update',
  'admin.fraud.flag', 'admin.dispute.resolve',
  // Security
  'security.device.mismatch', 'security.rate_limit.hit', 'security.idor.attempt',
]);

/**
 * Write an audit record. Fire-and-forget safe — errors are logged but never thrown
 * so audit failures never break the happy path.
 *
 * @param {import('pg').Pool} pool
 * @param {object} opts
 */
async function log(pool, {
  actor_id = null,
  actor_role = null,
  action,
  resource_type = null,
  resource_id = null,
  ip = null,
  user_agent = null,
  outcome = 'success',
  detail = null,
} = {}) {
  if (!action) return;
  try {
    await pool.query(
      `INSERT INTO audit_logs
         (actor_id, actor_role, action, resource_type, resource_id, ip, user_agent, outcome, detail)
       VALUES ($1, $2, $3, $4, $5, $6::inet, $7, $8, $9)`,
      [
        actor_id  || null,
        actor_role || null,
        action,
        resource_type || null,
        resource_id ? String(resource_id) : null,
        ip || null,
        user_agent || null,
        outcome,
        detail ? JSON.stringify(detail) : null,
      ]
    );
  } catch (err) {
    // Audit log failure must never crash the request — log and continue
    logger.error('[AuditLog] Write failed:', err.message);
  }
}

/**
 * Express middleware factory — automatically logs auth events from req context.
 *
 * @param {import('pg').Pool} pool
 * @param {string} action
 * @param {object} opts
 */
function middleware(pool, action, opts = {}) {
  return async (req, _res, next) => {
    await log(pool, {
      actor_id:    req.user?.id   || null,
      actor_role:  req.user?.role || null,
      action,
      ip:          req.ip,
      user_agent:  req.headers['user-agent'],
      outcome:     'success',
      ...opts,
    });
    next();
  };
}

module.exports = { log, middleware, AUDITABLE_ACTIONS };

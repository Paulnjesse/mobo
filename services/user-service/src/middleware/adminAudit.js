/**
 * Admin Action Audit Middleware
 *
 * Automatically records every admin action to admin_audit_logs.
 * Attach AFTER requireAdmin and AFTER the route handler has executed
 * using the response-finished hook pattern.
 *
 * Usage:
 *   router.patch('/users/:id/deactivate',
 *     requireAdmin,
 *     auditAdmin('user.deactivate', 'user', (req) => req.params.id),
 *     deactivateUserHandler
 *   );
 *
 * Or wrap the entire admin router:
 *   adminRouter.use(autoAuditAdmin);  // logs all admin routes generically
 */
'use strict';

const db = require('../config/database');

/**
 * Explicit audit log entry for a named action.
 *
 * @param {string}   action        - Dot-notation action name, e.g. 'user.deactivate'
 * @param {string}   resourceType  - Entity type: 'user', 'driver', 'payment', etc.
 * @param {Function} getResourceId - (req) => UUID of the target entity
 * @param {object}   [opts]
 * @param {Function} [opts.getOldValue] - (req) => object snapshot before change
 * @param {Function} [opts.getNewValue] - (req, res) => object snapshot after change
 */
function auditAdmin(action, resourceType, getResourceId, opts = {}) {
  return async (req, res, next) => {
    // Wrap res.json to capture what was actually sent and log after response
    const originalJson = res.json.bind(res);
    let responseBody   = null;

    res.json = function (body) {
      responseBody = body;
      return originalJson(body);
    };

    // Hook into the 'finish' event so we log after the response is sent
    res.on('finish', async () => {
      const success = res.statusCode < 400;
      try {
        const resourceId = getResourceId ? getResourceId(req) : null;
        const oldValue   = opts.getOldValue ? await opts.getOldValue(req) : null;
        const newValue   = opts.getNewValue ? await opts.getNewValue(req, responseBody) : null;

        await db.query(
          `INSERT INTO admin_audit_logs
             (admin_id, admin_email, action, resource_type, resource_id,
              old_value, new_value, ip_address, user_agent, request_id, success)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            req.user?.id    || null,
            req.user?.email || null,
            action,
            resourceType,
            resourceId      || null,
            oldValue ? JSON.stringify(oldValue) : null,
            newValue ? JSON.stringify(newValue) : null,
            req.ip          || null,
            req.get('user-agent') || null,
            req.id          || null,  // set by express-request-id or similar
            success,
          ]
        );
      } catch (err) {
        // Audit failures must never break the API — log and continue
        console.error('[adminAudit] Failed to write audit log:', err.message, { action, resourceType });
      }
    });

    next();
  };
}

/**
 * Generic catch-all audit middleware for an entire admin router.
 * Logs method + path as the action name. Less detailed than auditAdmin(),
 * but provides a baseline audit trail for any admin endpoint.
 *
 * Attach with: adminRouter.use(autoAuditAdmin);
 */
async function autoAuditAdmin(req, res, next) {
  const action = `${req.method.toLowerCase()}.${req.path.replace(/\//g, '.').replace(/^\./, '').replace(/\.[a-f0-9-]{36}/g, '.:id')}`;

  res.on('finish', async () => {
    if (!req.user || req.user.role !== 'admin') return;
    const success = res.statusCode < 400;
    try {
      await db.query(
        `INSERT INTO admin_audit_logs
           (admin_id, admin_email, action, ip_address, user_agent, request_id, success)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          req.user.id,
          req.user.email || null,
          action,
          req.ip || null,
          req.get('user-agent') || null,
          req.id || null,
          success,
        ]
      );
    } catch (err) {
      console.error('[adminAudit] auto-audit failed:', err.message);
    }
  });

  next();
}

module.exports = { auditAdmin, autoAuditAdmin };

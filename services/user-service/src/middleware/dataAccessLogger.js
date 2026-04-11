'use strict';

/**
 * dataAccessLogger.js
 *
 * Middleware that:
 *  1. Writes a row to data_access_logs whenever an admin reads sensitive data.
 *  2. Updates last_accessed_by / last_accessed_at on the target entity.
 *  3. Generates an admin_notification so super-admins are alerted in real time.
 *
 * Usage:
 *   router.get('/users/:id', authenticate, requireAdmin,
 *     logDataAccess('user', req => req.params.id, ['phone','email','national_id']),
 *     getUser
 *   );
 */

const db = require('../config/database');

/**
 * @param {string}   resourceType  'user' | 'driver' | 'vehicle' | 'document'
 * @param {Function} getResourceId (req) => UUID of target
 * @param {string[]} fields        PII fields being exposed
 * @param {string}   [action]      'view' | 'download' | 'export' | 'reveal_field'
 */
function logDataAccess(resourceType, getResourceId, fields = [], action = 'view') {
  return async (req, res, next) => {
    // Only log for admin users
    if (!req.user || req.user.role !== 'admin') return next();

    const originalJson = res.json.bind(res);
    res.json = function (body) {
      responseBody = body;
      return originalJson(body);
    };

    let responseBody = null;

    res.on('finish', async () => {
      if (res.statusCode >= 400) return; // don't log failed requests
      const resourceId   = getResourceId ? getResourceId(req) : null;
      const accessorId   = req.user?.id;
      const accessorEmail = req.user?.email || null;
      const accessorRole  = req.user?.admin_role || req.user?.role || null;

      // Extract resource owner name from response if available
      const ownerName = responseBody?.full_name || responseBody?.user?.full_name
        || responseBody?.data?.full_name || null;

      try {
        await db.query(
          `INSERT INTO data_access_logs
             (accessed_by, accessor_email, accessor_role, resource_type,
              resource_id, resource_owner, action, fields_accessed,
              ip_address, user_agent)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            accessorId, accessorEmail, accessorRole, resourceType,
            resourceId || null, ownerName, action,
            fields.length ? fields : null,
            req.ip || null, req.get('user-agent') || null,
          ]
        );

        // Update last_accessed_by on the entity (best-effort)
        if (resourceId) {
          if (resourceType === 'user') {
            await db.query(
              `UPDATE users SET last_accessed_by = $1, last_accessed_at = NOW()
               WHERE id = $2`,
              [accessorId, resourceId]
            ).catch(() => {});
          } else if (resourceType === 'driver') {
            await db.query(
              `UPDATE drivers SET last_accessed_by = $1, last_accessed_at = NOW()
               WHERE id = $2`,
              [accessorId, resourceId]
            ).catch(() => {});
          }
        }

        // Generate admin notification (broadcast to super-admins / full-admins)
        // Throttle: don't notify for the same accessor+resource more than once per 10 minutes
        const recentCheck = await db.query(
          `SELECT id FROM data_access_logs
           WHERE accessed_by = $1 AND resource_id = $2
             AND created_at > NOW() - INTERVAL '10 minutes'
             AND id != (SELECT id FROM data_access_logs
                        WHERE accessed_by = $1 AND resource_id = $2
                        ORDER BY created_at DESC LIMIT 1)
           LIMIT 1`,
          [accessorId, resourceId]
        ).catch(() => ({ rows: [] }));

        const shouldNotify = !recentCheck.rows.length;
        if (shouldNotify && resourceId) {
          const displayFields = fields.length
            ? ` (fields: ${fields.join(', ')})`
            : '';
          const message = `${accessorEmail || 'An admin'} (${accessorRole || 'admin'}) accessed ${resourceType} data${displayFields} from IP ${req.ip || 'unknown'}`;

          // Notify all super-admins (recipient_id = NULL = broadcast)
          await db.query(
            `INSERT INTO admin_notifications
               (recipient_id, type, title, message, metadata)
             VALUES (NULL, 'data_access', $1, $2, $3)`,
            [
              `Data Access: ${resourceType} record viewed`,
              message,
              JSON.stringify({
                accessor_id:    accessorId,
                accessor_email: accessorEmail,
                resource_type:  resourceType,
                resource_id:    resourceId,
                owner_name:     ownerName,
                action,
                fields,
                ip: req.ip,
              }),
            ]
          ).catch(() => {});
        }
      } catch (err) {
        // Never block the request on audit failure
        console.error('[DataAccessLogger] Failed to write access log:', err.message);
      }
    });

    next();
  };
}

/**
 * Convenience: log a document download.
 */
function logDocumentAccess(getDocId) {
  return logDataAccess('document', getDocId, ['encrypted_data'], 'download');
}

module.exports = { logDataAccess, logDocumentAccess };

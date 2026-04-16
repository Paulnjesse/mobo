'use strict';
const logger = require('../utils/logger');

/**
 * rbac.js — Granular Role-Based Access Control middleware
 *
 * Checks fine-grained permissions from the permissions + role_permissions tables.
 * Falls back to role-only check when DB is unavailable.
 *
 * Usage:
 *   router.delete('/users/:id', authenticate, requireAdmin, requirePermission('users:delete'), handler);
 *   router.post('/payments/:id/refund', authenticate, requireAdmin, requirePermission('payments:refund'), handler);
 */

const db = require('../config/database');

// In-memory permission cache (TTL: 60 seconds per user)
const _cache = new Map(); // userId → { permissions: Set, expiresAt: number }
const CACHE_TTL_MS = 60_000;

async function getUserPermissions(userId, role) {
  const now = Date.now();
  const cached = _cache.get(userId);
  if (cached && cached.expiresAt > now) return cached.permissions;

  try {
    // Role-based permissions
    const rolePerms = await db.query(
      'SELECT permission FROM role_permissions WHERE role = $1',
      [role]
    );

    // User-level overrides (grants + denies)
    const userPerms = await db.query(
      `SELECT permission, granted FROM user_permissions
       WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
      [userId]
    );

    const permissions = new Set(rolePerms.rows.map(r => r.permission));

    for (const row of userPerms.rows) {
      if (row.granted) {
        permissions.add(row.permission);
      } else {
        permissions.delete(row.permission);  // explicit deny overrides role grant
      }
    }

    _cache.set(userId, { permissions, expiresAt: now + CACHE_TTL_MS });
    return permissions;
  } catch (err) {
    logger.error('[RBAC] Permission lookup failed:', err.message);
    // Fallback: return empty set (deny by default)
    return new Set();
  }
}

/**
 * Middleware factory: require a specific permission.
 * Must be used AFTER authenticate and requireAdmin.
 *
 * @param {string} permission  e.g. 'payments:refund'
 */
function requirePermission(permission) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    try {
      const adminRole = req.user.admin_role || req.user.role;
      const permissions = await getUserPermissions(req.user.id, adminRole);

      if (!permissions.has(permission)) {
        logger.warn(`[RBAC] Permission denied: user=${req.user.id} role=${adminRole} required=${permission}`);
        return res.status(403).json({
          success: false,
          message: `Permission required: ${permission}`,
          code:    'PERMISSION_DENIED',
        });
      }

      next();
    } catch (err) {
      logger.error('[RBAC] Middleware error:', err.message);
      return res.status(500).json({ success: false, message: 'Authorization check failed' });
    }
  };
}

/**
 * Invalidate cached permissions for a user (call after role/permission change).
 */
function invalidatePermissionCache(userId) {
  _cache.delete(userId);
}

module.exports = { requirePermission, getUserPermissions, invalidatePermissionCache };

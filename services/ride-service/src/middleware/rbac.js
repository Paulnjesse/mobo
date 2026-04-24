'use strict';
/**
 * rbac.js — Granular Role-Based Access Control middleware for ride-service
 *
 * Mirrors user-service/src/middleware/rbac.js but references ride-service's own
 * database pool and logger so the module resolves correctly within this service.
 *
 * Both services share the same PostgreSQL DB (same role_permissions / user_permissions
 * tables), so permission lookups work identically regardless of which service calls them.
 */

const logger = require('../utils/logger');
const db     = require('../config/database');

// In-memory permission cache (TTL: 60 seconds per user)
const _cache = new Map(); // userId → { permissions: Set, expiresAt: number }
const CACHE_TTL_MS = 60_000;

async function getUserPermissions(userId, role) {
  const now    = Date.now();
  const cached = _cache.get(userId);
  if (cached && cached.expiresAt > now) return cached.permissions;

  try {
    const rolePerms = await db.query(
      'SELECT permission FROM role_permissions WHERE role = $1',
      [role]
    );
    const userPerms = await db.query(
      `SELECT permission, granted FROM user_permissions
       WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
      [userId]
    );

    const permissions = new Set(rolePerms.rows.map((r) => r.permission));
    for (const row of userPerms.rows) {
      if (row.granted) permissions.add(row.permission);
      else             permissions.delete(row.permission);
    }

    _cache.set(userId, { permissions, expiresAt: now + CACHE_TTL_MS });
    return permissions;
  } catch (err) {
    logger.error('[RBAC] Permission lookup failed:', err.message);
    return new Set();
  }
}

/**
 * Middleware factory: require a specific permission.
 * Must be used AFTER authenticate and requireAdmin.
 */
function requirePermission(permission) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    // Fast-path: if req.user.permissions is already an array (injected by auth middleware
    // or by tests), skip the DB lookup.
    if (Array.isArray(req.user.permissions)) {
      if (!req.user.permissions.includes(permission)) {
        return res.status(403).json({
          success: false,
          message: `Permission required: ${permission}`,
          error:   `Permission denied: ${permission}`,
          code:    'PERMISSION_DENIED',
        });
      }
      return next();
    }

    try {
      const adminRole  = req.user.admin_role || req.user.role;
      const permissions = await getUserPermissions(req.user.id, adminRole);

      if (!permissions.has(permission)) {
        logger.warn(`[RBAC] Permission denied: user=${req.user.id} role=${adminRole} required=${permission}`);
        return res.status(403).json({
          success: false,
          message: `Permission required: ${permission}`,
          error:   `Permission denied: ${permission}`,
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

function invalidatePermissionCache(userId) {
  _cache.delete(userId);
}

module.exports = { requirePermission, getUserPermissions, invalidatePermissionCache };

'use strict';
const logger = require('../utils/logger');

/**
 * adminManagementController.js
 *
 * Admin staff management + role/permission management.
 *
 * Design rules:
 *  - No hard deletes anywhere — everything uses is_deleted + deleted_at (soft archive).
 *  - System roles (is_system = true) cannot be archived.
 *  - Super-admin accounts (admin_role = 'admin') cannot be archived by others.
 *  - Only users with admin:manage_staff permission may create/edit/archive admin staff.
 *  - Only users with admin:manage_roles permission may create/edit/archive custom roles.
 */

const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { invalidatePermissionCache } = require('../middleware/rbac');

// ── Helpers ────────────────────────────────────────────────────────────────────

async function roleExists(name) {
  const { rows } = await db.query(
    'SELECT name FROM admin_roles WHERE name = $1 AND deleted_at IS NULL',
    [name]
  );
  return rows.length > 0;
}

// ── Admin Staff ────────────────────────────────────────────────────────────────

/**
 * GET /admin/admin-mgmt/staff
 * List all admin staff (including archived, for audit visibility).
 */
exports.listAdminStaff = async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        u.id,
        u.full_name,
        u.email,
        u.phone,
        u.admin_role,
        u.is_active,
        u.is_deleted,
        u.deleted_at,
        u.created_at,
        ar.display_name AS role_display_name,
        creator.full_name AS created_by_name
      FROM users u
      LEFT JOIN admin_roles ar ON ar.name = u.admin_role
      LEFT JOIN users creator ON creator.id = u.created_by
      WHERE u.role = 'admin'
      ORDER BY u.is_deleted ASC, u.created_at DESC
    `);
    res.json({ success: true, staff: rows });
  } catch (err) {
    logger.error('[AdminMgmt] listAdminStaff:', err);
    res.status(500).json({ success: false, message: 'Failed to list admin staff' });
  }
};

/**
 * POST /admin/admin-mgmt/staff
 * Create a new admin staff member.
 */
exports.createAdminStaff = async (req, res) => {
  try {
    const { full_name, email, phone, password, admin_role = 'read_only' } = req.body;

    if (!full_name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'full_name, email, and password are required',
      });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }

    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists' });
    }

    if (!(await roleExists(admin_role))) {
      return res.status(400).json({ success: false, message: `Role "${admin_role}" does not exist or is archived` });
    }

    const password_hash = await bcrypt.hash(password, 12);

    const { rows } = await db.query(
      `INSERT INTO users
         (full_name, email, phone, role, admin_role, password_hash,
          is_active, is_verified, is_deleted, created_by)
       VALUES ($1, $2, $3, 'admin', $4, $5, true, true, false, $6)
       RETURNING id, full_name, email, phone, admin_role, is_active, created_at`,
      [full_name, email, phone || null, admin_role, password_hash, req.user.id]
    );

    res.status(201).json({ success: true, staff: rows[0] });
  } catch (err) {
    logger.error('[AdminMgmt] createAdminStaff:', err);
    res.status(500).json({ success: false, message: 'Failed to create admin staff member' });
  }
};

/**
 * PATCH /admin/admin-mgmt/staff/:id
 * Update an admin staff member (name, phone, role, active status).
 */
exports.updateAdminStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, phone, admin_role, is_active } = req.body;

    const { rows: target } = await db.query(
      `SELECT id, admin_role FROM users WHERE id = $1 AND role = 'admin' AND is_deleted = false`,
      [id]
    );
    if (!target.length) {
      return res.status(404).json({ success: false, message: 'Admin staff member not found' });
    }
    // Guard: cannot demote another super-admin (unless you are that user)
    if (target[0].admin_role === 'admin' && req.user.id !== id && admin_role && admin_role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Cannot change the role of a super admin account' });
    }

    if (admin_role && !(await roleExists(admin_role))) {
      return res.status(400).json({ success: false, message: `Role "${admin_role}" does not exist or is archived` });
    }

    const fields = [];
    const values = [];
    let i = 1;
    if (full_name !== undefined) { fields.push(`full_name = $${i++}`); values.push(full_name); }
    if (phone      !== undefined) { fields.push(`phone = $${i++}`); values.push(phone); }
    if (admin_role !== undefined) { fields.push(`admin_role = $${i++}`); values.push(admin_role); }
    if (is_active  !== undefined) { fields.push(`is_active = $${i++}`); values.push(is_active); }
    if (!fields.length) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }
    values.push(id);

    const { rows } = await db.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${i} AND role = 'admin'
       RETURNING id, full_name, email, admin_role, is_active`,
      values
    );
    invalidatePermissionCache(id);
    res.json({ success: true, staff: rows[0] });
  } catch (err) {
    logger.error('[AdminMgmt] updateAdminStaff:', err);
    res.status(500).json({ success: false, message: 'Failed to update admin staff member' });
  }
};

/**
 * DELETE /admin/admin-mgmt/staff/:id
 * Archive (soft-delete) an admin staff member.
 * The record remains in the database for audit purposes.
 */
exports.archiveAdminStaff = async (req, res) => {
  try {
    const { id } = req.params;

    if (id === req.user.id) {
      return res.status(400).json({ success: false, message: 'You cannot archive your own account' });
    }

    const { rows: target } = await db.query(
      `SELECT admin_role FROM users WHERE id = $1 AND role = 'admin'`,
      [id]
    );
    if (!target.length) {
      return res.status(404).json({ success: false, message: 'Admin staff member not found' });
    }
    if (target[0].admin_role === 'admin') {
      return res.status(403).json({ success: false, message: 'Super admin accounts cannot be archived' });
    }

    await db.query(
      `UPDATE users SET is_deleted = true, deleted_at = NOW(), is_active = false WHERE id = $1`,
      [id]
    );
    invalidatePermissionCache(id);
    res.json({ success: true, message: 'Admin staff member archived successfully' });
  } catch (err) {
    logger.error('[AdminMgmt] archiveAdminStaff:', err);
    res.status(500).json({ success: false, message: 'Failed to archive admin staff member' });
  }
};

// ── Role Management ────────────────────────────────────────────────────────────

/**
 * GET /admin/admin-mgmt/roles
 * List all roles including their assigned permissions.
 */
exports.listRoles = async (req, res) => {
  try {
    const { rows: roles } = await db.query(`
      SELECT
        ar.id,
        ar.name,
        ar.display_name,
        ar.description,
        ar.is_system,
        ar.created_at,
        ar.deleted_at,
        creator.full_name AS created_by_name
      FROM admin_roles ar
      LEFT JOIN users creator ON creator.id = ar.created_by
      ORDER BY ar.is_system DESC, ar.created_at ASC
    `);

    const { rows: rolePerms } = await db.query(
      'SELECT role, permission FROM role_permissions ORDER BY role, permission'
    );
    const permMap = {};
    for (const rp of rolePerms) {
      if (!permMap[rp.role]) permMap[rp.role] = [];
      permMap[rp.role].push(rp.permission);
    }

    res.json({
      success: true,
      roles: roles.map(r => ({ ...r, permissions: permMap[r.name] || [] })),
    });
  } catch (err) {
    logger.error('[AdminMgmt] listRoles:', err);
    res.status(500).json({ success: false, message: 'Failed to list roles' });
  }
};

/**
 * GET /admin/admin-mgmt/permissions
 * List all available permissions (grouped by category).
 */
exports.listPermissions = async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT name, description, category FROM permissions ORDER BY category, name'
    );
    res.json({ success: true, permissions: rows });
  } catch (err) {
    logger.error('[AdminMgmt] listPermissions:', err);
    res.status(500).json({ success: false, message: 'Failed to list permissions' });
  }
};

/**
 * POST /admin/admin-mgmt/roles
 * Create a new custom role.
 */
exports.createRole = async (req, res) => {
  try {
    const { name, display_name, description, permissions = [] } = req.body;

    if (!name || !display_name) {
      return res.status(400).json({ success: false, message: 'name and display_name are required' });
    }
    if (!/^[a-z][a-z0-9_]{1,48}$/.test(name)) {
      return res.status(400).json({
        success: false,
        message: 'name must start with a letter, contain only lowercase letters, digits, and underscores (2–49 chars)',
      });
    }

    const { rows } = await db.query(
      `INSERT INTO admin_roles (name, display_name, description, is_system, created_by)
       VALUES ($1, $2, $3, false, $4)
       RETURNING id, name, display_name, description, is_system, created_at`,
      [name, display_name, description || null, req.user.id]
    );
    const role = rows[0];

    if (permissions.length > 0) {
      // Validate permissions exist
      const { rows: validPerms } = await db.query(
        'SELECT name FROM permissions WHERE name = ANY($1)',
        [permissions]
      );
      const validSet = new Set(validPerms.map(p => p.name));
      const invalid = permissions.filter(p => !validSet.has(p));
      if (invalid.length) {
        // Roll back the role insert
        await db.query('DELETE FROM admin_roles WHERE id = $1', [role.id]);
        return res.status(400).json({ success: false, message: `Unknown permissions: ${invalid.join(', ')}` });
      }

      const placeholders = permissions.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ');
      const params = permissions.flatMap(p => [name, p]);
      await db.query(
        `INSERT INTO role_permissions (role, permission) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
        params
      );
    }

    role.permissions = permissions;
    res.status(201).json({ success: true, role });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'A role with this name already exists' });
    }
    logger.error('[AdminMgmt] createRole:', err);
    res.status(500).json({ success: false, message: 'Failed to create role' });
  }
};

/**
 * PATCH /admin/admin-mgmt/roles/:id
 * Update a role's display_name, description, and/or permissions.
 * Permissions are replaced in full (send the complete desired list).
 */
exports.updateRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { display_name, description, permissions } = req.body;

    const { rows: existing } = await db.query(
      'SELECT name, is_system FROM admin_roles WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    if (!existing.length) return res.status(404).json({ success: false, message: 'Role not found' });
    const { name, is_system } = existing[0];

    // Allow editing permissions on system roles, but not metadata
    if (!is_system) {
      const fields = []; const vals = []; let i = 1;
      if (display_name !== undefined) { fields.push(`display_name = $${i++}`); vals.push(display_name); }
      if (description  !== undefined) { fields.push(`description = $${i++}`);  vals.push(description); }
      if (fields.length) {
        vals.push(id);
        await db.query(`UPDATE admin_roles SET ${fields.join(', ')} WHERE id = $${i}`, vals);
      }
    }

    if (permissions !== undefined) {
      await db.query('DELETE FROM role_permissions WHERE role = $1', [name]);
      if (permissions.length > 0) {
        const placeholders = permissions.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ');
        const params = permissions.flatMap(p => [name, p]);
        await db.query(
          `INSERT INTO role_permissions (role, permission) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
          params
        );
      }
      // Bust cache for all users who hold this role
      const { rows: affected } = await db.query(
        `SELECT id FROM users WHERE admin_role = $1`,
        [name]
      );
      affected.forEach(r => invalidatePermissionCache(r.id));
    }

    res.json({ success: true, message: 'Role updated' });
  } catch (err) {
    logger.error('[AdminMgmt] updateRole:', err);
    res.status(500).json({ success: false, message: 'Failed to update role' });
  }
};

/**
 * DELETE /admin/admin-mgmt/roles/:id
 * Archive (soft-delete) a custom role.
 * System roles cannot be archived.
 */
exports.archiveRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: existing } = await db.query(
      'SELECT name, is_system FROM admin_roles WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    if (!existing.length) return res.status(404).json({ success: false, message: 'Role not found' });
    if (existing[0].is_system) {
      return res.status(403).json({ success: false, message: 'System roles cannot be archived' });
    }
    // Check no active users hold this role
    const { rows: holders } = await db.query(
      `SELECT COUNT(*)::int AS cnt FROM users WHERE admin_role = $1 AND is_deleted = false`,
      [existing[0].name]
    );
    if (holders[0].cnt > 0) {
      return res.status(409).json({
        success: false,
        message: `${holders[0].cnt} active user(s) still have this role. Reassign them first.`,
      });
    }
    await db.query('UPDATE admin_roles SET deleted_at = NOW() WHERE id = $1', [id]);
    res.json({ success: true, message: 'Role archived' });
  } catch (err) {
    logger.error('[AdminMgmt] archiveRole:', err);
    res.status(500).json({ success: false, message: 'Failed to archive role' });
  }
};

// ── My Permissions (used by admin dashboard on login) ─────────────────────────

/**
 * GET /admin/admin-mgmt/my-permissions
 * Returns the permission list for the current admin user's role.
 */
exports.getMyPermissions = async (req, res) => {
  try {
    const adminRole = req.user.admin_role || req.user.role;
    const { rows: rolePerms } = await db.query(
      'SELECT permission FROM role_permissions WHERE role = $1',
      [adminRole]
    );
    const { rows: userPerms } = await db.query(
      `SELECT permission, granted FROM user_permissions
       WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
      [req.user.id]
    );

    const permissions = new Set(rolePerms.map(r => r.permission));
    for (const row of userPerms) {
      if (row.granted) permissions.add(row.permission);
      else permissions.delete(row.permission);
    }

    res.json({
      success: true,
      admin_role: adminRole,
      permissions: Array.from(permissions),
    });
  } catch (err) {
    logger.error('[AdminMgmt] getMyPermissions:', err);
    res.status(500).json({ success: false, message: 'Failed to load permissions' });
  }
};

// ── Soft Archive: Riders and Drivers ─────────────────────────────────────────

/**
 * PATCH /admin/admin-mgmt/users/:id/archive
 * Archive a rider/driver user account (soft delete).
 */
exports.archiveUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await db.query(
      `UPDATE users
       SET is_deleted = true, deleted_at = NOW(), is_active = false
       WHERE id = $1 AND role != 'admin'
       RETURNING id`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, message: 'User archived' });
  } catch (err) {
    logger.error('[AdminMgmt] archiveUser:', err);
    res.status(500).json({ success: false, message: 'Failed to archive user' });
  }
};

/**
 * PATCH /admin/admin-mgmt/drivers/:id/archive
 * Archive a driver account (soft delete). Sets is_approved = false as well.
 */
exports.archiveDriver = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await db.query(
      `UPDATE drivers
       SET is_deleted = true, deleted_at = NOW(), is_approved = false
       WHERE id = $1
       RETURNING id`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Driver not found' });
    res.json({ success: true, message: 'Driver archived' });
  } catch (err) {
    logger.error('[AdminMgmt] archiveDriver:', err);
    res.status(500).json({ success: false, message: 'Failed to archive driver' });
  }
};

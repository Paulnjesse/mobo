-- migration_033.sql
-- Admin staff management, role management, soft deletes
-- 2026-04-10

-- ── 1. Soft-delete columns on core tables ────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_deleted  BOOLEAN    NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ;

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS is_deleted  BOOLEAN    NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ;

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS is_deleted  BOOLEAN    NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ;

-- Partial indexes: fast lookup of active records
CREATE INDEX IF NOT EXISTS idx_users_not_deleted   ON users   (id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_drivers_not_deleted ON drivers (id) WHERE is_deleted = false;

-- ── 2. Admin roles registry ───────────────────────────────────────────────────
-- Tracks all named admin sub-roles (both system-defined and custom).
-- The name column matches users.admin_role and role_permissions.role (VARCHAR).
CREATE TABLE IF NOT EXISTS admin_roles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(50)  NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  description  TEXT,
  is_system    BOOLEAN      NOT NULL DEFAULT false,  -- system roles: protected from archive
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);

-- Seed system roles
INSERT INTO admin_roles (name, display_name, description, is_system) VALUES
  ('admin',      'Super Admin',   'Full system access including staff and role management', true),
  ('full_admin', 'Full Admin',    'Full data access — cannot manage admin staff or roles',  true),
  ('support',    'Support',       'Customer support: read + dispute management',            true),
  ('finance',    'Finance',       'Financial data, payment visibility, and refunds',        true),
  ('ops',        'Operations',    'Fleet and driver management',                             true),
  ('read_write', 'Read & Write',  'View and edit all data — no archive or admin actions',   true),
  ('read_only',  'Read Only',     'View all data — no modifications permitted',             true)
ON CONFLICT (name) DO NOTHING;

-- ── 3. New permissions ────────────────────────────────────────────────────────
INSERT INTO permissions (name, description, category) VALUES
  ('users:archive',        'Archive (soft-delete) rider accounts',           'users'),
  ('drivers:write',        'Edit driver profiles and documents',             'drivers'),
  ('drivers:archive',      'Archive (soft-delete) driver accounts',          'drivers'),
  ('vehicles:read',        'View vehicle details',                           'vehicles'),
  ('vehicles:write',       'Edit vehicle information',                       'vehicles'),
  ('vehicles:archive',     'Archive (soft-delete) vehicles',                 'vehicles'),
  ('admin:manage_staff',   'Create, edit, and archive admin staff accounts', 'admin'),
  ('admin:manage_roles',   'Create, edit, and archive custom roles',         'admin'),
  ('admin:erasure_execute','Execute GDPR right-to-erasure requests',         'admin'),
  ('surge:read',           'View surge pricing zones',                       'surge'),
  ('surge:write',          'Create and manage surge pricing zones',          'surge'),
  ('promotions:read',      'View promotions and discount codes',             'promotions'),
  ('promotions:write',     'Create and manage promotions',                   'promotions'),
  ('notifications:send',   'Send push notifications to users',               'notifications'),
  ('settings:write',       'Change system-level configuration settings',     'settings')
ON CONFLICT (name) DO NOTHING;

-- Grant ALL permissions to super-admin role (including the new ones above)
INSERT INTO role_permissions (role, permission)
SELECT 'admin', name FROM permissions
ON CONFLICT DO NOTHING;

-- full_admin: everything except staff/role management and impersonation
INSERT INTO role_permissions (role, permission)
SELECT 'full_admin', name FROM permissions
WHERE name NOT IN ('admin:manage_staff', 'admin:manage_roles', 'admin:user_impersonate')
ON CONFLICT DO NOTHING;

-- read_write: read + write — no archive, no admin actions
INSERT INTO role_permissions (role, permission)
SELECT 'read_write', name FROM permissions
WHERE name IN (
  'users:read', 'users:write', 'users:suspend', 'users:export',
  'drivers:read', 'drivers:write', 'drivers:approve', 'drivers:suspend',
  'vehicles:read', 'vehicles:write',
  'rides:read', 'rides:cancel', 'rides:dispute',
  'payments:read',
  'fleet:read', 'fleet:approve',
  'surge:read', 'promotions:read',
  'notifications:send',
  'admin:audit_logs'
)
ON CONFLICT DO NOTHING;

-- read_only: read permissions only — no modifications whatsoever
INSERT INTO role_permissions (role, permission)
SELECT 'read_only', name FROM permissions
WHERE name IN (
  'users:read', 'drivers:read', 'vehicles:read',
  'rides:read', 'payments:read', 'fleet:read',
  'surge:read', 'promotions:read', 'admin:audit_logs'
)
ON CONFLICT DO NOTHING;

-- ── 4. Track who created admin users ─────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

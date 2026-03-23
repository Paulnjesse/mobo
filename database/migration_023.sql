-- migration_023: Field-level encryption + granular RBAC permissions

BEGIN;

-- ── 1. Field-level encryption columns ────────────────────────────────────────
-- Add encrypted columns alongside existing plaintext columns.
-- Migration path: populate encrypted cols, then drop plaintext (future migration).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone_encrypted        TEXT,
  ADD COLUMN IF NOT EXISTS phone_hash             VARCHAR(64),   -- HMAC for lookup
  ADD COLUMN IF NOT EXISTS dob_encrypted          TEXT;          -- date_of_birth encrypted

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS license_number_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS license_number_hash      VARCHAR(64);

ALTER TABLE payment_methods
  ADD COLUMN IF NOT EXISTS phone_encrypted        TEXT,
  ADD COLUMN IF NOT EXISTS phone_hash             VARCHAR(64);

-- Lookup index on hash columns (allows WHERE phone_hash = ? without decrypting)
CREATE INDEX IF NOT EXISTS idx_users_phone_hash    ON users (phone_hash) WHERE phone_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_drivers_lic_hash    ON drivers (license_number_hash) WHERE license_number_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pm_phone_hash       ON payment_methods (phone_hash) WHERE phone_hash IS NOT NULL;

-- ── 2. Granular RBAC permissions ──────────────────────────────────────────────

-- Permission definitions (seed data)
CREATE TABLE IF NOT EXISTS permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL UNIQUE,  -- e.g. 'users:read', 'payments:refund'
  description TEXT,
  category    VARCHAR(50),  -- 'users' | 'payments' | 'rides' | 'drivers' | 'admin'
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Role-permission assignments
CREATE TABLE IF NOT EXISTS role_permissions (
  role        VARCHAR(50)  NOT NULL,  -- 'admin' | 'support' | 'finance' | 'ops'
  permission  VARCHAR(100) NOT NULL REFERENCES permissions(name) ON DELETE CASCADE,
  granted_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (role, permission)
);

-- User-level permission overrides (grant/deny individual permissions)
CREATE TABLE IF NOT EXISTS user_permissions (
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  permission  VARCHAR(100) NOT NULL REFERENCES permissions(name) ON DELETE CASCADE,
  granted     BOOLEAN NOT NULL DEFAULT true,  -- false = explicit deny
  granted_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, permission)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions (user_id);

-- ── 3. Seed permissions ───────────────────────────────────────────────────────

INSERT INTO permissions (name, description, category) VALUES
  ('users:read',           'View user profiles and account details',     'users'),
  ('users:write',          'Edit user profiles',                         'users'),
  ('users:suspend',        'Suspend or unsuspend user accounts',         'users'),
  ('users:delete',         'Permanently delete user accounts (GDPR)',    'users'),
  ('users:export',         'Export user personal data (GDPR)',           'users'),
  ('drivers:read',         'View driver profiles and documents',         'drivers'),
  ('drivers:approve',      'Approve or reject driver applications',      'drivers'),
  ('drivers:suspend',      'Suspend or unsuspend drivers',               'drivers'),
  ('rides:read',           'View ride history and details',              'rides'),
  ('rides:cancel',         'Cancel active rides',                        'rides'),
  ('rides:dispute',        'Manage ride disputes',                       'rides'),
  ('payments:read',        'View payment transactions',                  'payments'),
  ('payments:refund',      'Issue payment refunds',                      'payments'),
  ('payments:audit',       'View PCI audit logs',                        'payments'),
  ('fleet:read',           'View fleet information',                     'fleet'),
  ('fleet:approve',        'Approve fleet registrations',                'fleet'),
  ('admin:audit_logs',     'View admin audit logs',                      'admin'),
  ('admin:system_config',  'Change system configuration',                'admin'),
  ('admin:fraud_review',   'Review and resolve fraud flags',             'admin'),
  ('admin:user_impersonate','Temporarily access a user account',        'admin')
ON CONFLICT (name) DO NOTHING;

-- Assign all permissions to super-admin role
INSERT INTO role_permissions (role, permission)
SELECT 'admin', name FROM permissions
ON CONFLICT DO NOTHING;

-- Support role: read + dispute management, no payment refunds or user deletion
INSERT INTO role_permissions (role, permission)
SELECT 'support', name FROM permissions
WHERE name IN ('users:read','drivers:read','rides:read','rides:cancel','rides:dispute','payments:read','fleet:read')
ON CONFLICT DO NOTHING;

-- Finance role: payment visibility + refunds, no user management
INSERT INTO role_permissions (role, permission)
SELECT 'finance', name FROM permissions
WHERE name IN ('payments:read','payments:refund','payments:audit','rides:read','users:read')
ON CONFLICT DO NOTHING;

-- Ops role: fleet + driver management
INSERT INTO role_permissions (role, permission)
SELECT 'ops', name FROM permissions
WHERE name IN ('drivers:read','drivers:approve','fleet:read','fleet:approve','rides:read','users:read','admin:fraud_review')
ON CONFLICT DO NOTHING;

-- ── 4. Admin sub-role column ──────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS admin_role VARCHAR(50) DEFAULT 'admin';
  -- Values: 'admin' (super), 'support', 'finance', 'ops'

-- ── 5. GDPR right to erasure log ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gdpr_erasure_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,     -- not FK — user will be deleted
  user_email    VARCHAR(255),      -- denormalised for retention
  requested_by  UUID REFERENCES users(id) ON DELETE SET NULL,  -- null = self-request
  reason        TEXT,
  status        VARCHAR(20) DEFAULT 'pending',  -- pending | processing | completed | rejected
  completed_at  TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gdpr_erasure_user   ON gdpr_erasure_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_gdpr_erasure_status ON gdpr_erasure_requests (status, created_at DESC);

COMMIT;

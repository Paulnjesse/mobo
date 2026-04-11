-- migration_034.sql
-- Data access audit, admin notifications, encrypted document storage
-- 2026-04-10

-- ── 1. Data access log ────────────────────────────────────────────────────────
-- Records every time an admin views, downloads, exports, or reveals PII.
-- Separate from admin_audit_logs (which tracks writes) — this tracks reads.
CREATE TABLE IF NOT EXISTS data_access_logs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  accessed_by       UUID        REFERENCES users(id) ON DELETE SET NULL,
  accessor_email    VARCHAR(255),               -- denormalised for retention
  accessor_role     VARCHAR(50),
  resource_type     VARCHAR(50)  NOT NULL,      -- 'user' | 'driver' | 'vehicle' | 'document'
  resource_id       UUID,
  resource_owner    TEXT,                       -- denormalised display name
  action            VARCHAR(50)  NOT NULL,      -- 'view' | 'download' | 'export' | 'reveal_field' | 'file_upload'
  fields_accessed   TEXT[],                     -- e.g. {'phone','national_id'}
  ip_address        INET,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dal_accessor   ON data_access_logs (accessed_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dal_resource   ON data_access_logs (resource_type, resource_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dal_created    ON data_access_logs (created_at DESC);

-- ── 2. Admin notifications ────────────────────────────────────────────────────
-- Push notifications shown in the admin dashboard notification bell.
-- Generated automatically when sensitive data is accessed.
CREATE TABLE IF NOT EXISTS admin_notifications (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id  UUID        REFERENCES users(id) ON DELETE CASCADE,  -- NULL = all super-admins
  type          VARCHAR(50) NOT NULL,   -- 'data_access' | 'file_upload' | 'staff_created' | 'suspicious'
  title         TEXT        NOT NULL,
  message       TEXT        NOT NULL,
  metadata      JSONB,
  is_read       BOOLEAN     NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_recipient ON admin_notifications (recipient_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_broadcast ON admin_notifications (recipient_id, created_at DESC) WHERE recipient_id IS NULL;

-- ── 3. Encrypted document store ───────────────────────────────────────────────
-- All user/driver documents are stored AES-256-GCM encrypted at rest.
-- The application layer handles encrypt-on-upload / decrypt-on-download.
CREATE TABLE IF NOT EXISTS user_documents (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doc_type        VARCHAR(50) NOT NULL,  -- 'national_id' | 'driver_license' | 'vehicle_photo'
                                         -- | 'insurance' | 'profile_photo' | 'other'
  file_name       TEXT        NOT NULL,
  mime_type       VARCHAR(100),
  encrypted_data  TEXT        NOT NULL,  -- AES-256-GCM ciphertext, base64-encoded
  encryption_iv   VARCHAR(64) NOT NULL,  -- base64 IV used for this document
  file_size_kb    INTEGER,
  uploaded_by     UUID        REFERENCES users(id) ON DELETE SET NULL,
  verified        BOOLEAN     NOT NULL DEFAULT false,
  verified_by     UUID        REFERENCES users(id) ON DELETE SET NULL,
  verified_at     TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_userdoc_user     ON user_documents (user_id, doc_type);
CREATE INDEX IF NOT EXISTS idx_userdoc_active   ON user_documents (user_id) WHERE deleted_at IS NULL;

COMMENT ON TABLE user_documents IS
  'Encrypted document store for riders, drivers, and vehicles. '
  'All data is AES-256-GCM encrypted before INSERT. '
  'Access is logged in data_access_logs and triggers admin_notifications.';

-- ── 4. Encrypted PII columns ──────────────────────────────────────────────────
-- Extend existing users/drivers tables with encrypted PII columns.
-- Application encrypts on write; existing plaintext columns kept for migration period.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS full_name_encrypted   TEXT,   -- AES-encrypted full name
  ADD COLUMN IF NOT EXISTS email_encrypted       TEXT,   -- AES-encrypted email
  ADD COLUMN IF NOT EXISTS national_id_encrypted TEXT;   -- AES-encrypted national ID

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS national_id_encrypted TEXT;

-- ── 5. Track last access on user profiles ─────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_accessed_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_accessed_at   TIMESTAMPTZ;

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS last_accessed_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_accessed_at   TIMESTAMPTZ;

-- migration_024: tamper-evident audit log table + referral device fingerprinting

-- ── Audit log ────────────────────────────────────────────────────────────────
-- Append-only. The application role (mobo_app) must NOT have UPDATE or DELETE
-- grants on this table. Grants are set at the bottom of this file.

CREATE TABLE IF NOT EXISTS audit_logs (
  id            BIGSERIAL     PRIMARY KEY,
  actor_id      UUID,
  actor_role    TEXT,
  action        TEXT          NOT NULL,
  resource_type TEXT,
  resource_id   TEXT,
  ip            INET,
  user_agent    TEXT,
  outcome       TEXT          NOT NULL CHECK (outcome IN ('success', 'failure', 'blocked')),
  detail        JSONB,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Partition-friendly index for time-range queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at  ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id    ON audit_logs (actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_action      ON audit_logs (action);

-- Revoke modification privileges so rows are truly append-only for the app role
-- (DBA/superuser retains full access for compliance exports)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mobo_app') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM mobo_app;
  END IF;
END$$;

-- ── Referral device fingerprinting ───────────────────────────────────────────
-- Store the device_id that performed each referral so duplicate-device claims
-- can be detected across accounts.

ALTER TABLE users ADD COLUMN IF NOT EXISTS device_id TEXT;
CREATE INDEX IF NOT EXISTS idx_users_device_id ON users (device_id) WHERE device_id IS NOT NULL;

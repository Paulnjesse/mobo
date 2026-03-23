-- Migration 021: Payment audit logs (PCI DSS req 10.2), admin action audit logs,
--               mTLS service certificates table

BEGIN;

-- ── 1. Payment Audit Log (PCI DSS Requirement 10.2) ──────────────────────────
-- Records every payment event for regulatory audit trail.
-- Immutable: no UPDATE/DELETE allowed (enforced via app layer + DB role).
CREATE TABLE IF NOT EXISTS payment_audit_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id      UUID        REFERENCES payments(id) ON DELETE SET NULL,
  ride_id         UUID        REFERENCES rides(id) ON DELETE SET NULL,
  user_id         UUID        REFERENCES users(id) ON DELETE SET NULL,
  event_type      VARCHAR(50) NOT NULL
                    CHECK (event_type IN (
                      'payment_initiated', 'payment_completed', 'payment_failed',
                      'payment_refunded', 'payment_disputed', 'webhook_received',
                      'wallet_debit', 'wallet_credit', 'subscription_charged',
                      'refund_initiated', 'refund_completed'
                    )),
  amount_xaf      INTEGER,
  currency        VARCHAR(10) DEFAULT 'XAF',
  method          VARCHAR(30),
  provider        VARCHAR(50),  -- stripe, mtn, orange, wave, cash, wallet
  provider_ref    VARCHAR(255), -- external transaction ID
  status_before   VARCHAR(30),
  status_after    VARCHAR(30),
  ip_address      INET,
  user_agent      TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Prevent any modification of audit records (defence-in-depth)
-- Revoke UPDATE/DELETE from app role in production via:
--   REVOKE UPDATE, DELETE ON payment_audit_logs FROM mobo_app;

CREATE INDEX IF NOT EXISTS idx_payment_audit_user    ON payment_audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_audit_payment ON payment_audit_logs(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_audit_event   ON payment_audit_logs(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_audit_created ON payment_audit_logs(created_at DESC);

-- ── 2. Admin Action Audit Log ──────────────────────────────────────────────────
-- Records every privileged action taken by admin users.
-- Required for GDPR accountability and internal security investigations.
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id        UUID        REFERENCES users(id) ON DELETE SET NULL,
  admin_email     VARCHAR(255),  -- denormalised for retention after user deletion
  action          VARCHAR(100) NOT NULL,  -- e.g. 'user.deactivate', 'driver.approve'
  resource_type   VARCHAR(50),   -- e.g. 'user', 'driver', 'payment', 'fleet'
  resource_id     UUID,          -- target entity ID
  old_value       JSONB,         -- snapshot before change
  new_value       JSONB,         -- snapshot after change
  ip_address      INET,
  user_agent      TEXT,
  request_id      VARCHAR(100),  -- correlates with application logs
  success         BOOLEAN DEFAULT true,
  error_message   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_admin   ON admin_audit_logs(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action  ON admin_audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target  ON admin_audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_logs(created_at DESC);

-- ── 3. GDPR Data Export Requests (rate-limit tracking + audit) ────────────────
CREATE TABLE IF NOT EXISTS gdpr_export_requests (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        REFERENCES users(id) ON DELETE CASCADE,
  ip_address      INET,
  requested_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gdpr_export_user ON gdpr_export_requests(user_id, requested_at DESC);

-- ── 4. Service TLS Certificate Registry (for mTLS rotation tracking) ──────────
CREATE TABLE IF NOT EXISTS service_certificates (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name    VARCHAR(100) NOT NULL,
  cert_fingerprint VARCHAR(128) NOT NULL,  -- SHA-256 of DER-encoded cert
  common_name     VARCHAR(255),
  issued_at       TIMESTAMPTZ NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  is_active       BOOLEAN DEFAULT true,
  rotated_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_certs_service ON service_certificates(service_name, is_active);
CREATE INDEX IF NOT EXISTS idx_service_certs_expiry  ON service_certificates(expires_at) WHERE is_active = true;

COMMIT;

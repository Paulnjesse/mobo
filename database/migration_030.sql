-- migration_030.sql
-- GDPR consent management (Article 6 — lawful basis for data processing)
-- 2026-04-10
--
-- Tracks explicit consent per user per processing purpose.
-- Required for GDPR Article 6(1)(a) lawful basis and Article 7 (right to withdraw).

-- ── 1. Consent records ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_consents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Purpose identifies what the consent covers.
  -- Standard purposes (extend as needed):
  --   'terms_of_service'   — required to use MOBO
  --   'privacy_policy'     — required, links to full policy
  --   'marketing_sms'      — optional, promotional messages
  --   'marketing_email'    — optional, promotional emails
  --   'location_tracking'  — required for ride booking
  --   'data_analytics'     — optional, anonymised analytics
  --   'third_party_share'  — optional, sharing with partners
  purpose         VARCHAR(60) NOT NULL,

  -- The version of the document the user consented to (e.g. "2024-01-01")
  -- Lets us re-prompt users when terms change.
  document_version VARCHAR(20) NOT NULL DEFAULT 'v1',

  -- Consent state
  is_granted      BOOLEAN NOT NULL,
  granted_at      TIMESTAMPTZ,
  withdrawn_at    TIMESTAMPTZ,

  -- Audit trail
  ip_address      INET,
  user_agent      TEXT,
  channel         VARCHAR(20) DEFAULT 'app',  -- 'app' | 'web' | 'ussd' | 'admin'

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  -- Only one active record per user + purpose
  UNIQUE (user_id, purpose)
);

CREATE INDEX IF NOT EXISTS idx_user_consents_user    ON user_consents (user_id);
CREATE INDEX IF NOT EXISTS idx_user_consents_purpose ON user_consents (purpose, is_granted);

COMMENT ON TABLE user_consents IS
  'GDPR Article 6 consent log — one row per user per processing purpose. '
  'is_granted=true means consent active; set is_granted=false + withdrawn_at to record withdrawal.';

-- ── 2. Consent change audit log (append-only) ────────────────────────────────
-- Immutable record of every consent state change for regulatory evidence.
CREATE TABLE IF NOT EXISTS consent_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose         VARCHAR(60) NOT NULL,
  document_version VARCHAR(20),
  action          VARCHAR(20) NOT NULL CHECK (action IN ('granted', 'withdrawn', 'updated')),
  ip_address      INET,
  user_agent      TEXT,
  channel         VARCHAR(20),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consent_audit_user ON consent_audit_log (user_id, created_at DESC);

COMMENT ON TABLE consent_audit_log IS
  'Append-only audit trail of consent changes. Never UPDATE or DELETE rows here.';

-- ── 3. Seed: mandatory consent purposes ─────────────────────────────────────
-- Not inserting rows for users — consent is captured at signup.
-- This table just documents the known purposes for reference.
CREATE TABLE IF NOT EXISTS consent_purposes (
  purpose         VARCHAR(60) PRIMARY KEY,
  display_name    VARCHAR(120) NOT NULL,
  description     TEXT,
  is_required     BOOLEAN NOT NULL DEFAULT false,  -- required = cannot be withdrawn
  legal_basis     VARCHAR(30) NOT NULL DEFAULT 'consent',  -- 'consent' | 'contract' | 'legitimate_interest'
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO consent_purposes (purpose, display_name, is_required, legal_basis, description) VALUES
  ('terms_of_service',  'Terms of Service',         true,  'contract',             'Acceptance of MOBO Terms of Service'),
  ('privacy_policy',    'Privacy Policy',            true,  'contract',             'Acknowledgment of MOBO Privacy Policy'),
  ('location_tracking', 'Location Services',         true,  'contract',             'Real-time GPS location sharing required for ride booking'),
  ('marketing_sms',     'Promotional SMS',           false, 'consent',              'Receive promotional offers and ride discounts via SMS'),
  ('marketing_email',   'Promotional Emails',        false, 'consent',              'Receive newsletters and promotional emails'),
  ('data_analytics',    'Analytics & Improvement',   false, 'legitimate_interest',  'Anonymised usage data to improve MOBO services'),
  ('third_party_share', 'Partner Data Sharing',      false, 'consent',              'Sharing anonymised trip data with insurance and logistics partners')
ON CONFLICT (purpose) DO NOTHING;

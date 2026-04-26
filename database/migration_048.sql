-- migration_048.sql
-- Features: BGC (Checkr), composite performance score, insurance claims,
--           chat file attachments, OTP per-phone lockout support columns

-- ── 1. Driver BGC + composite score columns ───────────────────────────────────
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS bgc_status VARCHAR(50) DEFAULT 'not_started'
    CHECK (bgc_status IN ('not_started','submitted','in_progress','passed','failed','manually_approved')),
  ADD COLUMN IF NOT EXISTS bgc_report_id       TEXT,
  ADD COLUMN IF NOT EXISTS bgc_invitation_url  TEXT,
  ADD COLUMN IF NOT EXISTS bgc_submitted_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bgc_completed_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS performance_score   NUMERIC(5,2) DEFAULT 0
    CHECK (performance_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS acceptance_rate     NUMERIC(5,2) DEFAULT 100
    CHECK (acceptance_rate BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS completion_rate     NUMERIC(5,2) DEFAULT 100
    CHECK (completion_rate BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS cancellation_rate   NUMERIC(5,2) DEFAULT 0
    CHECK (cancellation_rate BETWEEN 0 AND 100);

COMMENT ON COLUMN drivers.bgc_status IS
  'Checkr background check status: not_started → submitted → in_progress → passed|failed. manually_approved = admin override.';
COMMENT ON COLUMN drivers.performance_score IS
  'Composite 0–100: rating×40% + acceptance_rate×30% + completion_rate×20% − cancellation_rate×10%.';

-- ── 2. Chat file attachments on messages ──────────────────────────────────────
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS attachment_url   TEXT,
  ADD COLUMN IF NOT EXISTS attachment_type  VARCHAR(50)
    CHECK (attachment_type IN ('image','document','audio') OR attachment_type IS NULL),
  ADD COLUMN IF NOT EXISTS attachment_name  TEXT;

COMMENT ON COLUMN messages.attachment_url  IS 'URL of uploaded file (S3 / local storage).';
COMMENT ON COLUMN messages.attachment_type IS 'MIME category: image | document | audio.';

-- ── 3. Insurance claims table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS insurance_claims (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_number     TEXT NOT NULL DEFAULT 'CLM-' || UPPER(SUBSTRING(gen_random_uuid()::TEXT, 1, 8)),
  ride_id          UUID REFERENCES rides(id) ON DELETE SET NULL,
  claimant_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  claim_type       VARCHAR(50) NOT NULL
    CHECK (claim_type IN ('accident','theft','damage','injury','other')),
  status           VARCHAR(50) DEFAULT 'submitted'
    CHECK (status IN ('submitted','under_review','approved','rejected','settled','closed')),
  description      TEXT NOT NULL,
  incident_date    TIMESTAMPTZ,
  amount_claimed_xaf BIGINT CHECK (amount_claimed_xaf IS NULL OR amount_claimed_xaf >= 0),
  amount_settled_xaf BIGINT CHECK (amount_settled_xaf IS NULL OR amount_settled_xaf >= 0),
  evidence_urls    JSONB   DEFAULT '[]'::jsonb,
  admin_notes      TEXT,
  assigned_to      UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_insurance_claim_number  ON insurance_claims(claim_number);
CREATE INDEX        IF NOT EXISTS idx_insurance_claimant      ON insurance_claims(claimant_id);
CREATE INDEX        IF NOT EXISTS idx_insurance_ride          ON insurance_claims(ride_id);
CREATE INDEX        IF NOT EXISTS idx_insurance_status_date   ON insurance_claims(status, created_at DESC);

COMMENT ON TABLE insurance_claims IS
  'Insurance claim submissions from riders and drivers following accidents, theft, or vehicle damage.';

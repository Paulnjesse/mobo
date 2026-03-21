-- MOBO Migration 007 — Medium Impact Security Features
-- 2FA, background checks, rating abuse, safety zones, ride audio recordings

-- ── Admin 2FA
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS totp_secret        TEXT,
  ADD COLUMN IF NOT EXISTS totp_enabled       BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS totp_verified_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS totp_backup_codes  JSONB DEFAULT '[]';

-- ── Driver background checks
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS background_check_date       DATE,
  ADD COLUMN IF NOT EXISTS background_check_expires_at DATE,
  ADD COLUMN IF NOT EXISTS background_check_status     VARCHAR(20) DEFAULT 'not_checked'
    CHECK (background_check_status IN ('not_checked','clear','flagged','pending','expired')),
  ADD COLUMN IF NOT EXISTS background_check_provider   VARCHAR(100),
  ADD COLUMN IF NOT EXISTS background_check_notes      TEXT;

-- ── Rider rating abuse tracking
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS rating_abuse_flagged    BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS rating_abuse_flagged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consecutive_low_ratings INTEGER DEFAULT 0;

-- ── Safety zones (extend surge_zones to support incident alerts)
ALTER TABLE surge_zones
  ADD COLUMN IF NOT EXISTS zone_type      VARCHAR(20) DEFAULT 'surge'
    CHECK (zone_type IN ('surge','safety_incident')),
  ADD COLUMN IF NOT EXISTS incident_type  VARCHAR(30)
    CHECK (incident_type IN ('crime','flooding','road_closure','construction','protest','other')),
  ADD COLUMN IF NOT EXISTS severity       VARCHAR(10) DEFAULT 'medium'
    CHECK (severity IN ('low','medium','high')),
  ADD COLUMN IF NOT EXISTS alert_message  TEXT,
  ADD COLUMN IF NOT EXISTS driver_alerted_ids JSONB DEFAULT '[]';

-- ── Ride audio recordings
CREATE TABLE IF NOT EXISTS ride_recordings (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id      UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  recorded_by  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         VARCHAR(10) NOT NULL CHECK (role IN ('rider','driver')),
  storage_url  TEXT NOT NULL,
  duration_sec INTEGER,
  file_size_kb INTEGER,
  is_encrypted BOOLEAN DEFAULT true,
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  accessed_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  accessed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recordings_ride    ON ride_recordings(ride_id);
CREATE INDEX IF NOT EXISTS idx_recordings_expires ON ride_recordings(expires_at);

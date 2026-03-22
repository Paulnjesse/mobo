-- Migration 019: Biometric verifications table + pool ride groups + social auth

-- ── Biometric driver verifications ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_biometric_verifications (
  driver_id          UUID        PRIMARY KEY REFERENCES drivers(id) ON DELETE CASCADE,
  verified_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  photo_size_kb      INTEGER,
  result             VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | verified | failed | manual_review
  smile_job_id       VARCHAR(255),
  smile_result_code  VARCHAR(20),
  smile_confidence   NUMERIC(5,2),
  id_number          VARCHAR(100),
  id_type            VARCHAR(50),  -- national_id | passport | drivers_license
  id_country         VARCHAR(10)   DEFAULT 'CM',
  raw_response       JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_biometric_result ON driver_biometric_verifications(result);

-- ── Pool / Carpool ride groups ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pool_ride_groups (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id       UUID        REFERENCES drivers(id),
  status          VARCHAR(20) NOT NULL DEFAULT 'forming',  -- forming | active | completed | cancelled
  max_riders      INTEGER     NOT NULL DEFAULT 4,
  current_riders  INTEGER     NOT NULL DEFAULT 0,
  pickup_area     GEOGRAPHY(Point, 4326),
  dropoff_area    GEOGRAPHY(Point, 4326),
  pickup_radius_m INTEGER     NOT NULL DEFAULT 1000,
  dropoff_radius_m INTEGER    NOT NULL DEFAULT 2000,
  scheduled_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Social auth providers ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_social_accounts (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider      VARCHAR(20) NOT NULL,   -- google | apple
  provider_id   VARCHAR(255) NOT NULL,  -- sub / user identifier from provider
  email         VARCHAR(255),
  name          VARCHAR(255),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_social_user_id ON user_social_accounts(user_id);

-- Add pool columns to rides table
ALTER TABLE rides ADD COLUMN IF NOT EXISTS is_pool       BOOLEAN     DEFAULT FALSE;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS pool_group_id UUID        REFERENCES pool_ride_groups(id);
ALTER TABLE rides ADD COLUMN IF NOT EXISTS pool_fare     INTEGER;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS pool_seat_count INTEGER   DEFAULT 1;

-- Add social provider link column to users (quick lookup)
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_id  VARCHAR(255);

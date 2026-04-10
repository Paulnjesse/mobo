-- migration_029.sql
-- Teen account safety enhancements
-- 2026-04-09

-- Ensure date_of_birth and teen safety fields exist on users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS date_of_birth       DATE,
  ADD COLUMN IF NOT EXISTS curfew_start_hour   SMALLINT DEFAULT 22,  -- 10 PM
  ADD COLUMN IF NOT EXISTS curfew_end_hour     SMALLINT DEFAULT 6,   -- 6 AM
  ADD COLUMN IF NOT EXISTS teen_ride_notifications BOOLEAN DEFAULT true;

-- Index: quickly find all teen accounts for a parent
CREATE INDEX IF NOT EXISTS idx_users_parent_id ON users (parent_id) WHERE is_teen_account = true;

-- Track teen ride bookings for parental review
CREATE TABLE IF NOT EXISTS teen_ride_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teen_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ride_id        UUID REFERENCES rides(id) ON DELETE SET NULL,
  action         TEXT NOT NULL CHECK (action IN ('requested','accepted','completed','cancelled','blocked')),
  block_reason   TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teen_ride_log_parent ON teen_ride_log (parent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_teen_ride_log_teen   ON teen_ride_log (teen_id,   created_at DESC);

COMMENT ON TABLE teen_ride_log IS 'Audit log of all ride events for teen accounts, visible to parents.';
COMMENT ON COLUMN users.curfew_start_hour IS 'Hour (0-23 UTC) after which teen cannot book rides. Default 22 = 10 PM.';
COMMENT ON COLUMN users.curfew_end_hour   IS 'Hour (0-23 UTC) before which teen cannot book rides. Default 6 = 6 AM.';

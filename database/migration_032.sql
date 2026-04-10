-- migration_032.sql
-- MOBO Hourly + Rider Identity Verification + Upfront Pricing improvements
-- 2026-04-10

-- ── 1. MOBO Hourly: add 10-hour package support ───────────────────────────────
-- The rental_package column is VARCHAR; just documenting the new allowed value.
-- Application code already validates against RENTAL_PACKAGES constant.
-- No schema change needed — the 10h package is enforced in code.

-- ── 2. Rider identity verification improvements ───────────────────────────────
-- is_rider_verified was added in migration_020. Ensure rider_verified_at exists.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS rider_verified_at TIMESTAMPTZ;

-- ── 3. Ride stops: track max stop limit per rider tier ────────────────────────
-- No schema change — stops are stored as JSONB, limit enforced in application code.

-- ── 4. Share trip: ensure driver_locations table has needed columns ───────────
-- driver_locations is expected by shareTripController to provide live location to non-app viewers.
CREATE TABLE IF NOT EXISTS driver_locations (
  driver_id   UUID PRIMARY KEY REFERENCES drivers(id) ON DELETE CASCADE,
  latitude    NUMERIC(10, 7) NOT NULL,
  longitude   NUMERIC(10, 7) NOT NULL,
  heading     NUMERIC(5, 2),
  speed       NUMERIC(6, 2),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_locations_updated ON driver_locations (updated_at DESC);

COMMENT ON TABLE driver_locations IS
  'Latest GPS position per driver — updated on every location socket event. '
  'Used by public share-trip endpoint so family/friends can track without the app.';

-- ── 5. Ride recordings: add accessed_by audit column if not present ──────────
ALTER TABLE ride_recordings
  ADD COLUMN IF NOT EXISTS accessed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accessed_at TIMESTAMPTZ;

COMMENT ON COLUMN ride_recordings.accessed_by IS
  'Admin user who last accessed this recording — audit trail for dispute resolution.';

-- ── 6. Scheduled rides: ensure 30-day advance booking is enforced at DB level ─
-- Application code enforces the 30-day window; this constraint is defense-in-depth.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'rides' AND constraint_name = 'chk_scheduled_at_max_advance'
  ) THEN
    ALTER TABLE rides
      ADD CONSTRAINT chk_scheduled_at_max_advance
        CHECK (scheduled_at IS NULL OR scheduled_at <= NOW() + INTERVAL '30 days' + INTERVAL '1 minute');
  END IF;
END $$;

-- migration_031.sql
-- Surge price cap: add max_multiplier column to surge_zones
-- Ensures no zone can push surge above the cap even if data is misconfigured.
-- Application code also enforces MAX_SURGE_MULTIPLIER = 3.5 as a defense-in-depth layer.
-- 2026-04-10

ALTER TABLE surge_zones
  ADD COLUMN IF NOT EXISTS max_multiplier NUMERIC(4,2) DEFAULT 3.50;

-- Back-fill: existing zones cap at 3.5x (Bolt-equivalent ceiling)
UPDATE surge_zones SET max_multiplier = 3.50 WHERE max_multiplier IS NULL;

-- Also ensure the multiplier column itself cannot exceed the cap at insertion time
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'surge_zones' AND constraint_name = 'chk_surge_max'
  ) THEN
    ALTER TABLE surge_zones
      ADD CONSTRAINT chk_surge_max CHECK (multiplier <= COALESCE(max_multiplier, 3.50));
  END IF;
END $$;

COMMENT ON COLUMN surge_zones.max_multiplier IS
  'Hard ceiling for surge multiplier in this zone (default 3.50×). '
  'Application code applies MIN(actual_multiplier, 3.50) as defense-in-depth.';

-- migration_052.sql
-- Add missing is_available column to drivers table.
-- is_available controls whether a driver can receive new ride offers
-- (distinct from is_online which tracks app session state).
-- Referenced in rideController dispatch queries and migration_036 GRANT,
-- but was missing from init.sql and never added via ALTER TABLE.

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_drivers_available
  ON drivers (is_available)
  WHERE is_available = true;

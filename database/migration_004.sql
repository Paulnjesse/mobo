-- MOBO Migration 004
-- Driver home location: GPS-based home address captured at registration/onboarding

-- Add home location columns to drivers
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS home_latitude  DECIMAL(10, 8),
  ADD COLUMN IF NOT EXISTS home_longitude DECIMAL(11, 8),
  ADD COLUMN IF NOT EXISTS home_address   TEXT,
  ADD COLUMN IF NOT EXISTS home_location  GEOMETRY(Point, 4326);

-- Spatial index for home location queries (e.g. destination mode matching)
CREATE INDEX IF NOT EXISTS idx_drivers_home_location ON drivers USING GIST(home_location);

-- Backfill home_location geometry from lat/lng if both present (safe to run multiple times)
UPDATE drivers
SET home_location = ST_SetSRID(ST_MakePoint(home_longitude, home_latitude), 4326)
WHERE home_latitude IS NOT NULL
  AND home_longitude IS NOT NULL
  AND home_location IS NULL;

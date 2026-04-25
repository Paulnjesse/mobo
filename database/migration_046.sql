-- migration_046.sql
-- Location accuracy: add accuracy_m column to driver_locations
-- Also adds geofence_radius_m constant for arrival detection reference

-- Store GPS accuracy (metres) alongside each driver location update.
-- NULL = accuracy not reported by the GPS hardware.
ALTER TABLE driver_locations
  ADD COLUMN IF NOT EXISTS accuracy_m NUMERIC(7,2);

COMMENT ON COLUMN driver_locations.accuracy_m IS
  'GPS accuracy in metres reported by the device. Lower = more accurate. NULL = not reported.';

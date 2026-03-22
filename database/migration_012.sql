-- Migration 012: Waiting time charges, WAV ride type, receipt email trigger marker
-- Run with: psql $DATABASE_URL -f migration_012.sql

-- ── 1. Waiting time charges ───────────────────────────────────────────────────
-- pickup_arrived_at is already stored as driver_arrived_at (from migration_011)
-- We just need the waiting_fee column on rides

ALTER TABLE rides ADD COLUMN IF NOT EXISTS waiting_fee INTEGER DEFAULT 0;

-- ── 2. WAV (Wheelchair Accessible Vehicle) ride type ─────────────────────────
ALTER TABLE rides DROP CONSTRAINT IF EXISTS rides_ride_type_check;
ALTER TABLE rides ADD CONSTRAINT rides_ride_type_check
  CHECK (ride_type IN (
    'standard','comfort','luxury','shared','bike','scooter',
    'delivery','scheduled','rental','outstation','wav'
  ));

-- ── 3. Ensure preferred_language column exists on users (for receipt email) ───
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(5) DEFAULT 'en';

-- ── 4. Index for WAV vehicle lookup ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_vehicles_wav ON vehicles(is_wheelchair_accessible)
  WHERE is_wheelchair_accessible = true;

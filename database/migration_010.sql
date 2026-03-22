-- Migration 010: Tipping, Fare Splitting, Rental Rides, Price Lock improvements
-- Run with: psql $DATABASE_URL -f migration_010.sql

-- ── 1. Tipping: ensure tip_amount column exists (may already be in rides)
ALTER TABLE rides ADD COLUMN IF NOT EXISTS tip_amount INTEGER DEFAULT 0;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS tip_paid_at TIMESTAMPTZ;

-- ── 2. Rental ride support
-- Extend ride_type enum to include 'rental'
ALTER TABLE rides DROP CONSTRAINT IF EXISTS rides_ride_type_check;
ALTER TABLE rides ADD CONSTRAINT rides_ride_type_check
  CHECK (ride_type IN ('standard','comfort','luxury','shared','bike','scooter','delivery','scheduled','rental'));

-- Rental-specific columns
ALTER TABLE rides ADD COLUMN IF NOT EXISTS rental_package   VARCHAR(10);   -- '1h','2h','4h','8h'
ALTER TABLE rides ADD COLUMN IF NOT EXISTS rental_hours     INTEGER;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS rental_km_limit  INTEGER;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS rental_extra_km  INTEGER DEFAULT 0;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS rental_extra_fare INTEGER DEFAULT 0;

-- ── 3. Price lock columns
ALTER TABLE rides ADD COLUMN IF NOT EXISTS locked_fare         INTEGER;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS price_lock_expires_at TIMESTAMPTZ;

-- ── 4. Fare splits table
CREATE TABLE IF NOT EXISTS fare_splits (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id       UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  initiator_id  UUID NOT NULL REFERENCES users(id),
  total_fare    INTEGER NOT NULL,
  split_count   INTEGER NOT NULL DEFAULT 2,
  amount_per_person INTEGER NOT NULL,
  note          TEXT,
  status        VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','partially_paid','paid','cancelled')),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fare_split_participants (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  split_id      UUID NOT NULL REFERENCES fare_splits(id) ON DELETE CASCADE,
  phone         VARCHAR(30) NOT NULL,
  name          TEXT,
  amount        INTEGER NOT NULL,
  paid          BOOLEAN DEFAULT false,
  paid_at       TIMESTAMPTZ,
  payment_method VARCHAR(30),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── 5. Driver earnings cache (optional — for fast dashboard queries)
CREATE TABLE IF NOT EXISTS driver_earnings_daily (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id  UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  rides      INTEGER DEFAULT 0,
  gross      INTEGER DEFAULT 0,   -- total fare collected
  tips       INTEGER DEFAULT 0,
  bonuses    INTEGER DEFAULT 0,
  net        INTEGER DEFAULT 0,   -- after platform fee
  online_hours DECIMAL(5,2) DEFAULT 0,
  UNIQUE(driver_id, date)
);

CREATE INDEX IF NOT EXISTS idx_fare_splits_ride ON fare_splits(ride_id);
CREATE INDEX IF NOT EXISTS idx_fare_splits_initiator ON fare_splits(initiator_id);
CREATE INDEX IF NOT EXISTS idx_driver_earnings_driver_date ON driver_earnings_daily(driver_id, date);

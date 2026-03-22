-- Migration 011: Outstation rides, Masked calls, Airport mode/queue, Cancellation fee enhancements
-- Run with: psql $DATABASE_URL -f migration_011.sql

-- ── 1. Outstation / Intercity rides ─────────────────────────────────────────
-- Extend ride_type enum
ALTER TABLE rides DROP CONSTRAINT IF EXISTS rides_ride_type_check;
ALTER TABLE rides ADD CONSTRAINT rides_ride_type_check
  CHECK (ride_type IN ('standard','comfort','luxury','shared','bike','scooter',
                       'delivery','scheduled','rental','outstation'));

CREATE TABLE IF NOT EXISTS outstation_bookings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id         UUID REFERENCES rides(id) ON DELETE CASCADE,
  rider_id        UUID NOT NULL REFERENCES users(id),
  origin_city     TEXT NOT NULL,
  destination_city TEXT NOT NULL,
  origin_address  TEXT,
  destination_address TEXT,
  travel_date     DATE NOT NULL,
  return_date     DATE,                     -- NULL = one-way
  days            INTEGER NOT NULL DEFAULT 1,
  vehicle_category VARCHAR(30) DEFAULT 'standard',
  num_passengers  INTEGER DEFAULT 1,
  distance_km     DECIMAL(10,2),
  package_price   INTEGER NOT NULL,         -- total quoted price
  status          VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','in_progress','completed','cancelled')),
  driver_id       UUID REFERENCES drivers(id),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outstation_rider ON outstation_bookings(rider_id);
CREATE INDEX IF NOT EXISTS idx_outstation_date  ON outstation_bookings(travel_date);

-- ── 2. Masked phone / call proxy ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS call_sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id         UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  caller_id       UUID NOT NULL REFERENCES users(id),
  callee_id       UUID NOT NULL REFERENCES users(id),
  masked_number   TEXT,                    -- Twilio/Africa's Talking proxy number
  session_token   TEXT UNIQUE NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  status          VARCHAR(20) DEFAULT 'active'
    CHECK (status IN ('active','expired','ended')),
  call_duration_s INTEGER,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_sessions_ride ON call_sessions(ride_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_token ON call_sessions(session_token);

-- ── 3. Airport mode & queue ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS airport_zones (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,                    -- e.g. "Yaoundé-Nsimalen Airport"
  city        TEXT NOT NULL,
  location    GEOMETRY(Point, 4326),
  radius_m    INTEGER DEFAULT 1000,
  is_active   BOOLEAN DEFAULT true,
  iata_code   VARCHAR(5),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS airport_queue (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  airport_zone_id UUID NOT NULL REFERENCES airport_zones(id) ON DELETE CASCADE,
  driver_id       UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  position        INTEGER,
  checked_in_at   TIMESTAMPTZ DEFAULT NOW(),
  dispatched_at   TIMESTAMPTZ,
  status          VARCHAR(20) DEFAULT 'waiting'
    CHECK (status IN ('waiting','dispatched','departed')),
  UNIQUE (airport_zone_id, driver_id, status)  -- one active spot per driver per airport
);

-- Add airport_mode column to drivers
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS airport_mode      BOOLEAN DEFAULT false;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS airport_zone_id   UUID REFERENCES airport_zones(id);

CREATE INDEX IF NOT EXISTS idx_airport_queue_zone   ON airport_queue(airport_zone_id, status);
CREATE INDEX IF NOT EXISTS idx_airport_queue_driver ON airport_queue(driver_id);

-- Seed example airport zones (Cameroon)
INSERT INTO airport_zones (name, city, location, radius_m, iata_code)
VALUES
  ('Yaoundé-Nsimalen International Airport', 'Yaoundé',
   ST_SetSRID(ST_MakePoint(11.5533, 3.7225), 4326), 1500, 'NSI'),
  ('Douala International Airport', 'Douala',
   ST_SetSRID(ST_MakePoint(9.7194, 4.0061), 4326), 1500, 'DLA'),
  ('Garoua International Airport', 'Garoua',
   ST_SetSRID(ST_MakePoint(13.3701, 9.3359), 4326), 1000, 'GOU')
ON CONFLICT DO NOTHING;

-- ── 4. Cancellation fee tracking enhancements ────────────────────────────────
ALTER TABLE rides ADD COLUMN IF NOT EXISTS accepted_at         TIMESTAMPTZ;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS driver_arrived_at   TIMESTAMPTZ;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS cancellation_fee_charged BOOLEAN DEFAULT false;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS cancellation_fee_credited BOOLEAN DEFAULT false;

-- Navigation / route cache
ALTER TABLE rides ADD COLUMN IF NOT EXISTS route_polyline     TEXT;   -- encoded polyline
ALTER TABLE rides ADD COLUMN IF NOT EXISTS route_steps        JSONB;  -- turn-by-turn steps

CREATE INDEX IF NOT EXISTS idx_rides_accepted_at ON rides(accepted_at);

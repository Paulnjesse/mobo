-- Migration 015 — Sprint 1-3 Feature Tables
-- Features: Driver Tier, Heat Map, Trip Radar, Saved Places, Recurring Rides,
--           Earnings Guarantee, Fuel Card, Maintenance Tracker, Developer Portal,
--           Upfront Pricing, Split Payment, USSD Booking, Child Seat, Ride-for-Others

BEGIN;

-- ─── Driver Tiers ──────────────────────────────────────────────────────────────
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS tier VARCHAR(20) DEFAULT 'Bronze' CHECK (tier IN ('Bronze','Gold','Platinum','Diamond')),
  ADD COLUMN IF NOT EXISTS tier_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acceptance_rate NUMERIC(5,2) DEFAULT 100,
  ADD COLUMN IF NOT EXISTS lifetime_trips INT DEFAULT 0;

-- ─── Heat Map Zones ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS demand_zones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city        VARCHAR(100) NOT NULL,
  label       VARCHAR(150) NOT NULL,
  lat         NUMERIC(10,6) NOT NULL,
  lng         NUMERIC(10,6) NOT NULL,
  radius_m    INT NOT NULL DEFAULT 500,
  intensity   VARCHAR(10) NOT NULL CHECK (intensity IN ('low','medium','high')),
  demand      INT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_demand_zones_city ON demand_zones(city);

-- ─── Driver Radar (pre-position view of upcoming rides) ─────────────────────
-- No extra table needed — reads from rides WHERE status='pending' within radius

-- ─── Saved Places ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_places (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label       VARCHAR(100) NOT NULL,
  type        VARCHAR(20)  NOT NULL DEFAULT 'custom',
  address     TEXT NOT NULL,
  lat         NUMERIC(10,6),
  lng         NUMERIC(10,6),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_saved_places_user ON saved_places(user_id);

-- ─── Recurring Ride Series ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recurring_rides (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  frequency        VARCHAR(20) NOT NULL CHECK (frequency IN ('daily','weekdays','weekends','weekly')),
  ride_type        VARCHAR(20) NOT NULL DEFAULT 'standard',
  pickup_address   TEXT NOT NULL,
  pickup_lat       NUMERIC(10,6),
  pickup_lng       NUMERIC(10,6),
  dropoff_address  TEXT NOT NULL,
  dropoff_lat      NUMERIC(10,6),
  dropoff_lng      NUMERIC(10,6),
  time             VARCHAR(5)  NOT NULL, -- HH:MM
  active           BOOLEAN DEFAULT TRUE,
  next_ride_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recurring_rides_user ON recurring_rides(user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_rides_active ON recurring_rides(active, next_ride_at) WHERE active = TRUE;

-- ─── Earnings Guarantee ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS earnings_guarantee_windows (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id           UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  window_date         DATE NOT NULL,
  guarantee_xaf_per_hr NUMERIC(10,2) NOT NULL,
  hours_online        NUMERIC(5,2) DEFAULT 0,
  actual_earnings     NUMERIC(12,2) DEFAULT 0,
  guaranteed_earnings NUMERIC(12,2) DEFAULT 0,
  topup_owed          NUMERIC(12,2) DEFAULT 0,
  topup_paid          BOOLEAN DEFAULT FALSE,
  topup_paid_at       TIMESTAMPTZ,
  UNIQUE(driver_id, window_date)
);
CREATE INDEX IF NOT EXISTS idx_guarantee_driver_date ON earnings_guarantee_windows(driver_id, window_date);

-- ─── Fuel Card ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fuel_cards (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id     UUID NOT NULL UNIQUE REFERENCES drivers(id) ON DELETE CASCADE,
  card_number   VARCHAR(50) NOT NULL UNIQUE,
  balance_xaf   NUMERIC(12,2) DEFAULT 0,
  discount_pct  INT DEFAULT 5,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fuel_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fuel_card_id  UUID NOT NULL REFERENCES fuel_cards(id) ON DELETE CASCADE,
  station       VARCHAR(200) NOT NULL,
  liters        NUMERIC(8,2) NOT NULL,
  amount_xaf    NUMERIC(12,2) NOT NULL,
  discount_xaf  NUMERIC(12,2) NOT NULL DEFAULT 0,
  transacted_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fuel_tx_card ON fuel_transactions(fuel_card_id, transacted_at DESC);

-- ─── Maintenance Tracker ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicle_maintenance (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id        UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  service_key      VARCHAR(50) NOT NULL,
  last_service_km  INT NOT NULL,
  next_service_km  INT NOT NULL,
  serviced_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(driver_id, service_key)
);
CREATE INDEX IF NOT EXISTS idx_maintenance_driver ON vehicle_maintenance(driver_id);

-- ─── Developer Portal / API Keys ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS developer_api_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  api_key         VARCHAR(100) NOT NULL UNIQUE,
  plan            VARCHAR(50) DEFAULT 'Starter',
  calls_this_month INT DEFAULT 0,
  calls_limit     INT DEFAULT 1000,
  last_call_at    TIMESTAMPTZ,
  webhooks        TEXT[] DEFAULT '{}',
  active          BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON developer_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key ON developer_api_keys(api_key) WHERE active = TRUE;

-- ─── Rides: USSD phone field ─────────────────────────────────────────────────
ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS user_phone VARCHAR(30);

-- ─── Rides: extended fields ────────────────────────────────────────────────────
ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS is_for_other        BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS other_passenger_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS other_passenger_phone VARCHAR(30),
  ADD COLUMN IF NOT EXISTS child_seat_required  BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS child_seat_count     INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS upfront_fare_xaf     NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS fare_locked_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS split_payment        BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS split_wallet_pct     INT DEFAULT 100,
  ADD COLUMN IF NOT EXISTS split_momo_pct       INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS booked_via_ussd      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS recurring_ride_id    UUID REFERENCES recurring_rides(id) ON DELETE SET NULL;

-- ─── USSD Sessions ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ussd_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      VARCHAR(100) NOT NULL,
  phone           VARCHAR(30)  NOT NULL,
  step            VARCHAR(50)  NOT NULL DEFAULT 'menu',
  pickup_area     VARCHAR(200),
  dropoff_area    VARCHAR(200),
  ride_id         UUID REFERENCES rides(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ussd_session ON ussd_sessions(session_id);

-- ─── Driver Biometric Verifications ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_biometric_verifications (
  driver_id       UUID PRIMARY KEY REFERENCES drivers(id) ON DELETE CASCADE,
  verified_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  photo_size_kb   INT,
  result          VARCHAR(20) DEFAULT 'verified'
);

COMMIT;

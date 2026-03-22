-- Migration 016 — WhatsApp Sessions + Ride History View
-- Features: WhatsApp booking sessions, per-ride-type fare config, driver stats index

BEGIN;

-- ─── WhatsApp booking sessions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  phone       VARCHAR(30) PRIMARY KEY,
  step        VARCHAR(50) NOT NULL DEFAULT 'menu',
  data        JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Per-ride-type fare configuration (admin-editable) ────────────────────────
CREATE TABLE IF NOT EXISTS ride_type_fares (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_type     VARCHAR(30) NOT NULL UNIQUE,
  city          VARCHAR(100) NOT NULL DEFAULT 'all',
  base_fare     NUMERIC(10,2) NOT NULL,
  per_km        NUMERIC(10,2) NOT NULL,
  per_min       NUMERIC(10,2) NOT NULL,
  booking_fee   NUMERIC(10,2) NOT NULL DEFAULT 500,
  min_fare      NUMERIC(10,2) NOT NULL DEFAULT 500,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO ride_type_fares (ride_type, base_fare, per_km, per_min, booking_fee, min_fare) VALUES
  ('moto',     300,  80,  12, 200, 300),
  ('benskin',  300,  80,  12, 200, 300),
  ('standard', 1000, 700, 100, 500, 500),
  ('xl',       1400, 900, 130, 500, 700),
  ('women',    1000, 700, 100, 500, 500),
  ('delivery', 500,  150, 40, 300, 400)
ON CONFLICT (ride_type) DO NOTHING;

-- ─── Driver stats materialised columns (already added in 015, just safety) ────
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS total_online_hours NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_active_at     TIMESTAMPTZ;

-- ─── Index for WhatsApp ride lookups ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rides_user_phone ON rides(user_phone)
  WHERE user_phone IS NOT NULL;

COMMIT;

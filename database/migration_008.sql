-- MOBO Migration 008 — Parcel Delivery Feature

-- ── Main deliveries table
CREATE TABLE IF NOT EXISTS deliveries (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  driver_id             UUID REFERENCES drivers(id) ON DELETE SET NULL,

  -- Package details
  package_description   TEXT NOT NULL,
  package_size          VARCHAR(20) NOT NULL DEFAULT 'small'
    CHECK (package_size IN ('envelope','small','medium','large','extra_large')),
  package_weight_kg     DECIMAL(6,2),
  is_fragile            BOOLEAN DEFAULT false,
  requires_signature    BOOLEAN DEFAULT false,
  package_photo_url     TEXT,         -- sender uploads photo of package at booking

  -- Addresses
  pickup_address        TEXT NOT NULL,
  pickup_location       GEOMETRY(Point, 4326) NOT NULL,
  dropoff_address       TEXT NOT NULL,
  dropoff_location      GEOMETRY(Point, 4326) NOT NULL,
  distance_km           DECIMAL(8,3),

  -- Recipient
  recipient_name        VARCHAR(255) NOT NULL,
  recipient_phone       VARCHAR(30) NOT NULL,
  recipient_otp         VARCHAR(6),
  recipient_otp_verified BOOLEAN DEFAULT false,

  -- Proof of delivery
  pickup_photo_url      TEXT,         -- driver takes photo when picking up
  delivery_photo_url    TEXT,         -- driver takes photo when delivering
  delivery_signature_url TEXT,        -- optional digital signature

  -- Pricing
  fare_estimate         DECIMAL(10,2),
  final_fare            DECIMAL(10,2),
  currency              VARCHAR(10) DEFAULT 'XAF',
  payment_method        VARCHAR(30) DEFAULT 'cash'
    CHECK (payment_method IN ('cash','card','mobile_money','wallet')),
  payment_status        VARCHAR(20) DEFAULT 'pending'
    CHECK (payment_status IN ('pending','paid','failed','refunded')),

  -- Status workflow
  status                VARCHAR(30) DEFAULT 'pending'
    CHECK (status IN (
      'pending',          -- awaiting driver
      'driver_assigned',  -- driver accepted
      'driver_arriving',  -- driver on way to pickup
      'picked_up',        -- package collected, photo taken
      'in_transit',       -- on the way to recipient
      'delivered',        -- successfully delivered
      'cancelled',        -- cancelled by sender or system
      'failed'            -- could not deliver (recipient not home, etc.)
    )),

  -- Notes
  sender_note           TEXT,         -- instructions for driver
  cancellation_reason   TEXT,
  failure_reason        TEXT,

  -- Timestamps
  scheduled_at          TIMESTAMPTZ,
  driver_assigned_at    TIMESTAMPTZ,
  picked_up_at          TIMESTAMPTZ,
  delivered_at          TIMESTAMPTZ,
  estimated_delivery_at TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_deliveries_sender   ON deliveries(sender_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_driver   ON deliveries(driver_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status   ON deliveries(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_pickup   ON deliveries USING GIST(pickup_location);
CREATE INDEX IF NOT EXISTS idx_deliveries_dropoff  ON deliveries USING GIST(dropoff_location);
CREATE INDEX IF NOT EXISTS idx_deliveries_created  ON deliveries(created_at DESC);

-- Delivery pricing tiers
CREATE TABLE IF NOT EXISTS delivery_pricing (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  city         VARCHAR(100) NOT NULL,
  package_size VARCHAR(20) NOT NULL,
  base_fare    DECIMAL(10,2) NOT NULL,
  per_km_rate  DECIMAL(10,2) NOT NULL,
  fragile_surcharge DECIMAL(10,2) DEFAULT 0,
  min_fare     DECIMAL(10,2) NOT NULL,
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(city, package_size)
);

-- Default pricing for Douala/Yaoundé (XAF)
INSERT INTO delivery_pricing (city, package_size, base_fare, per_km_rate, fragile_surcharge, min_fare) VALUES
  ('Douala', 'envelope',    500,   150, 0,   500),
  ('Douala', 'small',       800,   200, 100, 800),
  ('Douala', 'medium',      1200,  250, 200, 1200),
  ('Douala', 'large',       2000,  350, 300, 2000),
  ('Douala', 'extra_large', 3500,  500, 500, 3500),
  ('Yaoundé','envelope',    500,   150, 0,   500),
  ('Yaoundé','small',       800,   200, 100, 800),
  ('Yaoundé','medium',      1200,  250, 200, 1200),
  ('Yaoundé','large',       2000,  350, 300, 2000),
  ('Yaoundé','extra_large', 3500,  500, 500, 3500)
ON CONFLICT (city, package_size) DO NOTHING;

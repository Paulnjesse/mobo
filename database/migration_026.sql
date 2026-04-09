-- Migration 026: Full Delivery Feature
-- Extends deliveries with delivery types (parcel, document, grocery, pharmacy,
-- laundry, ecommerce, b2b), express delivery, public tracking tokens, package
-- insurance, ratings, batch/multi-drop shipments, and pricing for all 8 target
-- markets (Cameroon, Nigeria, Kenya, South Africa, Ivory Coast, Gabon, Benin, Niger).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Extend deliveries table
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS delivery_type       VARCHAR(20)   DEFAULT 'parcel'
    CHECK (delivery_type IN ('parcel','document','grocery','pharmacy','laundry','ecommerce','b2b')),
  ADD COLUMN IF NOT EXISTS is_express          BOOLEAN       DEFAULT false,
  ADD COLUMN IF NOT EXISTS tracking_token      VARCHAR(64),
  ADD COLUMN IF NOT EXISTS insurance_value_xaf INTEGER       DEFAULT 0,
  ADD COLUMN IF NOT EXISTS insurance_fee_xaf   INTEGER       DEFAULT 0,
  ADD COLUMN IF NOT EXISTS express_surcharge_xaf INTEGER     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_mins      INTEGER,
  ADD COLUMN IF NOT EXISTS driver_rating       SMALLINT      CHECK (driver_rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS driver_rating_comment TEXT,
  ADD COLUMN IF NOT EXISTS driver_rated_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS surge_multiplier    DECIMAL(4,2)  DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS batch_id            UUID;

-- Backfill tracking tokens for existing deliveries
UPDATE deliveries
  SET tracking_token = encode(gen_random_bytes(32), 'hex')
WHERE tracking_token IS NULL;

ALTER TABLE deliveries ALTER COLUMN tracking_token SET NOT NULL;

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_deliveries_tracking_token
  ON deliveries(tracking_token);
CREATE INDEX IF NOT EXISTS idx_deliveries_type
  ON deliveries(delivery_type);
CREATE INDEX IF NOT EXISTS idx_deliveries_driver_rating
  ON deliveries(driver_id, driver_rating) WHERE driver_rating IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Delivery batches table (B2B multi-drop shipments)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_batches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id       UUID NOT NULL REFERENCES users(id),
  driver_id       UUID REFERENCES drivers(id),
  business_name   VARCHAR(200),
  batch_note      TEXT,
  total_fare_xaf  INTEGER DEFAULT 0,
  stop_count      INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  status          VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','completed','partially_delivered','cancelled')),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE deliveries
  ADD CONSTRAINT fk_deliveries_batch
  FOREIGN KEY (batch_id) REFERENCES delivery_batches(id)
  NOT VALID;

CREATE INDEX IF NOT EXISTS idx_deliveries_batch
  ON deliveries(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_delivery_batches_sender
  ON delivery_batches(sender_id);
CREATE INDEX IF NOT EXISTS idx_delivery_batches_driver
  ON delivery_batches(driver_id);
CREATE INDEX IF NOT EXISTS idx_delivery_batches_status
  ON delivery_batches(status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Delivery ratings table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_ratings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id  UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  rater_id     UUID NOT NULL REFERENCES users(id),
  ratee_id     UUID NOT NULL REFERENCES users(id),
  rating       SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment      TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(delivery_id, rater_id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_ratings_delivery ON delivery_ratings(delivery_id);
CREATE INDEX IF NOT EXISTS idx_delivery_ratings_ratee    ON delivery_ratings(ratee_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Extend delivery_pricing with delivery_type support
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE delivery_pricing
  ADD COLUMN IF NOT EXISTS delivery_type      VARCHAR(20)  DEFAULT 'parcel',
  ADD COLUMN IF NOT EXISTS express_multiplier DECIMAL(4,2) DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS type_discount_pct  INTEGER      DEFAULT 0;

-- Document deliveries cost 20% less than parcels; grocery/pharmacy same as parcel
UPDATE delivery_pricing SET type_discount_pct = 20 WHERE delivery_type = 'document';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Pricing for all target markets
--    Stored in XAF integers per platform standard (CLAUDE.md).
--    All fares based on market equivalence at time of launch.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO delivery_pricing (city, package_size, base_fare, per_km_rate, fragile_surcharge, min_fare, is_active)
VALUES
  -- Lagos, Nigeria
  ('Lagos',        'envelope',     600, 180,   0,  600, true),
  ('Lagos',        'small',        900, 220, 120,  900, true),
  ('Lagos',        'medium',      1500, 280, 250, 1500, true),
  ('Lagos',        'large',       2500, 400, 350, 2500, true),
  ('Lagos',        'extra_large', 4000, 600, 600, 4000, true),
  -- Abuja, Nigeria
  ('Abuja',        'envelope',     600, 170,   0,  600, true),
  ('Abuja',        'small',        900, 210, 120,  900, true),
  ('Abuja',        'medium',      1500, 270, 250, 1500, true),
  ('Abuja',        'large',       2500, 380, 350, 2500, true),
  ('Abuja',        'extra_large', 4000, 580, 600, 4000, true),
  -- Nairobi, Kenya
  ('Nairobi',      'envelope',     550, 160,   0,  550, true),
  ('Nairobi',      'small',        850, 200, 110,  850, true),
  ('Nairobi',      'medium',      1400, 260, 230, 1400, true),
  ('Nairobi',      'large',       2300, 370, 330, 2300, true),
  ('Nairobi',      'extra_large', 3800, 560, 550, 3800, true),
  -- Johannesburg, South Africa
  ('Johannesburg', 'envelope',     700, 220,   0,  700, true),
  ('Johannesburg', 'small',       1100, 280, 150, 1100, true),
  ('Johannesburg', 'medium',      1800, 350, 300, 1800, true),
  ('Johannesburg', 'large',       3000, 500, 450, 3000, true),
  ('Johannesburg', 'extra_large', 5000, 700, 700, 5000, true),
  -- Cape Town, South Africa
  ('Cape Town',    'envelope',     700, 210,   0,  700, true),
  ('Cape Town',    'small',       1100, 270, 150, 1100, true),
  ('Cape Town',    'medium',      1800, 340, 300, 1800, true),
  ('Cape Town',    'large',       2900, 490, 450, 2900, true),
  ('Cape Town',    'extra_large', 4900, 680, 700, 4900, true),
  -- Abidjan, Ivory Coast (XOF ≈ XAF parity)
  ('Abidjan',      'envelope',     500, 150,   0,  500, true),
  ('Abidjan',      'small',        800, 200, 100,  800, true),
  ('Abidjan',      'medium',      1200, 250, 200, 1200, true),
  ('Abidjan',      'large',       2000, 350, 300, 2000, true),
  ('Abidjan',      'extra_large', 3500, 500, 500, 3500, true),
  -- Libreville, Gabon (XAF)
  ('Libreville',   'envelope',     550, 160,   0,  550, true),
  ('Libreville',   'small',        900, 210, 110,  900, true),
  ('Libreville',   'medium',      1300, 260, 220, 1300, true),
  ('Libreville',   'large',       2200, 360, 320, 2200, true),
  ('Libreville',   'extra_large', 3700, 520, 520, 3700, true),
  -- Cotonou, Benin (XOF ≈ XAF parity)
  ('Cotonou',      'envelope',     450, 140,   0,  450, true),
  ('Cotonou',      'small',        750, 190,  90,  750, true),
  ('Cotonou',      'medium',      1100, 240, 190, 1100, true),
  ('Cotonou',      'large',       1900, 330, 280, 1900, true),
  ('Cotonou',      'extra_large', 3200, 480, 480, 3200, true),
  -- Niamey, Niger (XOF ≈ XAF parity)
  ('Niamey',       'envelope',     400, 130,   0,  400, true),
  ('Niamey',       'small',        700, 175,  85,  700, true),
  ('Niamey',       'medium',      1000, 220, 180, 1000, true),
  ('Niamey',       'large',       1800, 310, 260, 1800, true),
  ('Niamey',       'extra_large', 3000, 450, 450, 3000, true)
ON CONFLICT (city, package_size) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Row-Level Security for new delivery tables
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE delivery_ratings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS delivery_ratings_participant_policy ON delivery_ratings;
CREATE POLICY delivery_ratings_participant_policy ON delivery_ratings
  USING (
    rater_id::text = current_setting('app.current_user_id', true)
    OR
    ratee_id::text = current_setting('app.current_user_id', true)
  );

ALTER TABLE delivery_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS delivery_batches_owner_policy ON delivery_batches;
CREATE POLICY delivery_batches_owner_policy ON delivery_batches
  USING (sender_id::text = current_setting('app.current_user_id', true));

-- Enable RLS on deliveries (in addition to migration_025's policy which may
-- not have been applied if deliveries table didn't exist then).
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deliveries_participant_policy ON deliveries;
CREATE POLICY deliveries_participant_policy ON deliveries
  USING (
    sender_id::text = current_setting('app.current_user_id', true)
    OR driver_id IN (
      SELECT id FROM drivers
      WHERE user_id::text = current_setting('app.current_user_id', true)
    )
  );

-- migration_018.sql
-- Adds ride preferences, pickup instructions, and waiting fee to rides table
-- Also creates food delivery tables for Feature 1

-- ── Ride preferences (Feature 4) ─────────────────────────────────────────────
ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS pickup_instructions TEXT,
  ADD COLUMN IF NOT EXISTS quiet_mode          BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ac_preference       VARCHAR(10) DEFAULT 'auto', -- 'auto','on','off'
  ADD COLUMN IF NOT EXISTS music_preference    BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS waiting_fee         INTEGER DEFAULT 0;

-- ── Food delivery tables (Feature 1) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS restaurants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(200) NOT NULL,
  description   TEXT,
  category      VARCHAR(100),           -- 'Pizza','Burgers','African','Fast Food', etc.
  address       TEXT,
  city          VARCHAR(100),
  location      GEOGRAPHY(POINT,4326),
  phone         VARCHAR(30),
  logo_url      TEXT,
  banner_url    TEXT,
  opening_hours JSONB,                  -- { "mon": ["08:00","22:00"], ... }
  delivery_fee  INTEGER DEFAULT 500,    -- XAF
  min_order     INTEGER DEFAULT 2000,   -- XAF
  avg_rating    NUMERIC(3,2) DEFAULT 0,
  review_count  INTEGER DEFAULT 0,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS menu_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  category        VARCHAR(100),
  price           INTEGER NOT NULL,   -- XAF
  image_url       TEXT,
  is_available    BOOLEAN DEFAULT true,
  is_popular      BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS food_orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id),
  restaurant_id    UUID NOT NULL REFERENCES restaurants(id),
  driver_id        UUID REFERENCES drivers(id),
  items            JSONB NOT NULL,          -- [{ menu_item_id, name, price, qty }]
  subtotal         INTEGER NOT NULL,        -- XAF
  delivery_fee     INTEGER DEFAULT 500,
  total            INTEGER NOT NULL,
  special_note     TEXT,
  delivery_address TEXT,
  delivery_location GEOGRAPHY(POINT,4326),
  status           VARCHAR(30) DEFAULT 'pending',  -- pending,confirmed,preparing,picked_up,delivered,cancelled
  payment_method   VARCHAR(30) DEFAULT 'cash',
  pickup_otp       VARCHAR(6),
  estimated_minutes INTEGER,
  confirmed_at     TIMESTAMPTZ,
  ready_at         TIMESTAMPTZ,
  picked_up_at     TIMESTAMPTZ,
  delivered_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_restaurants_location ON restaurants USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_restaurants_city     ON restaurants(city);
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant ON menu_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_food_orders_user     ON food_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_food_orders_driver   ON food_orders(driver_id);
CREATE INDEX IF NOT EXISTS idx_food_orders_status   ON food_orders(status);

-- ── Seed restaurants for Yaoundé & Douala ────────────────────────────────────
INSERT INTO restaurants (name, description, category, address, city, delivery_fee, min_order, is_active) VALUES
  ('La Terrasse', 'Camerounian & continental dishes. Fast delivery.', 'African', 'Bastos, Yaoundé', 'Yaoundé', 500, 2000, true),
  ('Pizza Palace', 'Fresh wood-fired pizzas and pasta.', 'Italian', 'Hippodrome, Yaoundé', 'Yaoundé', 600, 3000, true),
  ('Chez Yannick', 'Grilled fish, ndolé and plantain.', 'African', 'Akwa, Douala', 'Douala', 500, 1500, true),
  ('Burger Boss', 'Smash burgers, crispy fries and shakes.', 'Burgers', 'Bonanjo, Douala', 'Douala', 400, 2500, true),
  ('Saveurs du Monde', 'International cuisine, sushi & tapas.', 'International', 'Centre Commercial, Yaoundé', 'Yaoundé', 700, 4000, true)
ON CONFLICT DO NOTHING;

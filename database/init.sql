-- MOBO Database Initialization
-- PostgreSQL + PostGIS schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'rider' CHECK (role IN ('rider','driver','admin')),
  profile_picture TEXT,
  date_of_birth DATE,
  gender VARCHAR(10),
  country VARCHAR(100) DEFAULT 'Cameroon',
  city VARCHAR(100),
  language VARCHAR(10) DEFAULT 'fr' CHECK (language IN ('en','fr','sw')),
  is_verified BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  is_suspended BOOLEAN DEFAULT false,
  otp_code VARCHAR(6),
  otp_expiry TIMESTAMPTZ,
  rating DECIMAL(3,2) DEFAULT 5.00,
  total_rides INTEGER DEFAULT 0,
  loyalty_points INTEGER DEFAULT 0,
  wallet_balance INTEGER DEFAULT 0,
  subscription_plan VARCHAR(20) DEFAULT 'none' CHECK (subscription_plan IN ('none','basic','premium')),
  subscription_expiry TIMESTAMPTZ,
  is_teen_account BOOLEAN DEFAULT false,
  parent_id UUID REFERENCES users(id) ON DELETE SET NULL,
  corporate_account_id UUID,
  corporate_role VARCHAR(20) DEFAULT 'employee' CHECK (corporate_role IN ('admin','manager','employee')),
  expo_push_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DRIVERS
-- ============================================================
CREATE TABLE IF NOT EXISTS drivers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  license_number VARCHAR(100) UNIQUE NOT NULL,
  license_expiry DATE NOT NULL,
  license_doc_url TEXT,
  national_id VARCHAR(100),
  national_id_doc_url TEXT,
  is_approved BOOLEAN DEFAULT false,
  is_online BOOLEAN DEFAULT false,
  vehicle_id UUID,
  current_location GEOMETRY(Point, 4326),
  total_earnings INTEGER DEFAULT 0,
  acceptance_rate DECIMAL(5,2) DEFAULT 100.00,
  cancellation_rate DECIMAL(5,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- VEHICLES
-- ============================================================
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  make VARCHAR(100) NOT NULL,
  model VARCHAR(100) NOT NULL,
  year INTEGER NOT NULL,
  plate VARCHAR(30) UNIQUE NOT NULL,
  color VARCHAR(50),
  vehicle_type VARCHAR(30) NOT NULL CHECK (vehicle_type IN ('standard','comfort','luxury','bike','scooter','shared','van')),
  seats INTEGER DEFAULT 4,
  is_wheelchair_accessible BOOLEAN DEFAULT false,
  insurance_doc_url TEXT,
  insurance_expiry DATE,
  photos JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RIDES
-- ============================================================
CREATE TABLE IF NOT EXISTS rides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rider_id UUID NOT NULL REFERENCES users(id),
  driver_id UUID REFERENCES drivers(id),
  vehicle_id UUID REFERENCES vehicles(id),
  ride_type VARCHAR(30) DEFAULT 'standard' CHECK (ride_type IN ('standard','comfort','luxury','shared','bike','scooter','delivery','scheduled')),
  status VARCHAR(30) DEFAULT 'requested' CHECK (status IN ('requested','searching','accepted','arriving','in_progress','completed','cancelled')),
  pickup_address TEXT NOT NULL,
  pickup_location GEOMETRY(Point, 4326) NOT NULL,
  dropoff_address TEXT NOT NULL,
  dropoff_location GEOMETRY(Point, 4326) NOT NULL,
  distance_km DECIMAL(10,2),
  duration_minutes INTEGER,
  base_fare INTEGER DEFAULT 1000,
  per_km_fare INTEGER DEFAULT 700,
  per_minute_fare INTEGER DEFAULT 100,
  surge_multiplier DECIMAL(4,2) DEFAULT 1.00,
  surge_active BOOLEAN DEFAULT false,
  estimated_fare INTEGER,
  final_fare INTEGER,
  service_fee INTEGER,
  cancellation_fee INTEGER DEFAULT 0,
  booking_fee INTEGER DEFAULT 500,
  tip_amount INTEGER DEFAULT 0,
  round_up_amount INTEGER DEFAULT 0,
  payment_method VARCHAR(30) DEFAULT 'cash' CHECK (payment_method IN ('cash','card','mobile_money','wallet','points')),
  payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending','paid','failed','refunded')),
  is_shared BOOLEAN DEFAULT false,
  shared_ride_group_id UUID,
  scheduled_at TIMESTAMPTZ,
  is_scheduled BOOLEAN DEFAULT false,
  notes TEXT,
  pickup_otp VARCHAR(4),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by VARCHAR(10) CHECK (cancelled_by IN ('rider','driver','system')),
  cancellation_reason TEXT,
  is_delivery BOOLEAN DEFAULT false,
  delivery_refused BOOLEAN DEFAULT false,
  route_polyline TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RIDE RATINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS ride_ratings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  rater_id UUID NOT NULL REFERENCES users(id),
  rated_id UUID NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ride_id, rater_id)
);

-- ============================================================
-- PAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id UUID REFERENCES rides(id),
  user_id UUID NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  currency VARCHAR(10) DEFAULT 'XAF',
  method VARCHAR(30) NOT NULL CHECK (method IN ('cash','card','mtn_mobile_money','orange_money','wave','stripe','wallet')),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','refunded')),
  transaction_id VARCHAR(255),
  provider_ref VARCHAR(255),
  failure_reason TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PAYMENT METHODS
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL CHECK (type IN ('card','mtn_mobile_money','orange_money','wave')),
  label VARCHAR(100),
  phone VARCHAR(20),
  card_last4 VARCHAR(4),
  card_brand VARCHAR(20),
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- LOCATIONS (real-time tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location GEOMETRY(Point, 4326) NOT NULL,
  heading DECIMAL(5,2),
  speed DECIMAL(6,2),
  accuracy DECIMAL(6,2),
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_locations_user ON locations(user_id);
CREATE INDEX IF NOT EXISTS idx_locations_recorded ON locations(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_drivers_location ON drivers USING GIST(current_location);
CREATE INDEX IF NOT EXISTS idx_rides_pickup ON rides USING GIST(pickup_location);
CREATE INDEX IF NOT EXISTS idx_rides_dropoff ON rides USING GIST(dropoff_location);

-- ============================================================
-- SURGE ZONES
-- ============================================================
CREATE TABLE IF NOT EXISTS surge_zones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  city VARCHAR(100) NOT NULL,
  zone GEOMETRY(Polygon, 4326) NOT NULL,
  multiplier DECIMAL(4,2) DEFAULT 1.5,
  is_active BOOLEAN DEFAULT true,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_surge_zones ON surge_zones USING GIST(zone);

-- ============================================================
-- MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id),
  receiver_id UUID NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(30) DEFAULT 'system',
  is_read BOOLEAN DEFAULT false,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- LOYALTY TRANSACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  action VARCHAR(50) NOT NULL,
  ride_id UUID REFERENCES rides(id),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SHARED RIDE GROUPS
-- ============================================================
CREATE TABLE IF NOT EXISTS shared_ride_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID REFERENCES drivers(id),
  vehicle_id UUID REFERENCES vehicles(id),
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open','full','in_progress','completed')),
  max_passengers INTEGER DEFAULT 3,
  current_passengers INTEGER DEFAULT 0,
  route_direction TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SUBSCRIPTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan VARCHAR(20) NOT NULL CHECK (plan IN ('basic','premium')),
  price INTEGER NOT NULL,
  currency VARCHAR(10) DEFAULT 'XAF',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT true,
  payment_id UUID REFERENCES payments(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PROMO CODES
-- ============================================================
CREATE TABLE IF NOT EXISTS promo_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(20) UNIQUE NOT NULL,
  discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percent','fixed')),
  discount_value INTEGER NOT NULL,
  min_fare INTEGER DEFAULT 0,
  max_uses INTEGER DEFAULT 100,
  used_count INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TRIGGERS: auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS drivers_updated_at ON drivers;
CREATE TRIGGER drivers_updated_at
  BEFORE UPDATE ON drivers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS rides_updated_at ON rides;
CREATE TRIGGER rides_updated_at
  BEFORE UPDATE ON rides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS payments_updated_at ON payments;
CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

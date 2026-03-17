-- MOBO Database Initialization
-- PostgreSQL + PostGIS schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;

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
-- MOBO Seed Data
-- African cities: Douala & Yaoundé (Cameroon), Lagos (Nigeria),
--                 Nairobi (Kenya), Abidjan (Ivory Coast)

-- ============================================================
-- ADMIN USERS
-- password: Admin@1234 => bcrypt hash
-- ============================================================
INSERT INTO users (id, full_name, phone, email, password_hash, role, country, city, language, is_verified, is_active, loyalty_points, wallet_balance)
VALUES
  ('00000000-0000-0000-0000-000000000001',
   'Mobo Admin Douala',
   '+237600000001',
   'admin.douala@mobo.cm',
   '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHu2',
   'admin', 'Cameroon', 'Douala', 'fr', true, true, 500, 25000),

  ('00000000-0000-0000-0000-000000000002',
   'Mobo Admin Lagos',
   '+2348000000001',
   'admin.lagos@mobo.ng',
   '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHu2',
   'admin', 'Nigeria', 'Lagos', 'en', true, true, 500, 25000)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- DRIVER USERS (5 drivers)
-- ============================================================
INSERT INTO users (id, full_name, phone, email, password_hash, role, country, city, language, is_verified, is_active, rating, total_rides, loyalty_points)
VALUES
  ('00000000-0000-0000-0001-000000000001',
   'Jean-Baptiste Mbida',
   '+237677001001',
   'jb.mbida@mobo.cm',
   '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHu2',
   'driver', 'Cameroon', 'Douala', 'fr', true, true, 4.85, 312, 1200),

  ('00000000-0000-0000-0001-000000000002',
   'Aminata Diallo',
   '+237699002002',
   'aminata.diallo@mobo.cm',
   '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHu2',
   'driver', 'Cameroon', 'Yaoundé', 'fr', true, true, 4.92, 540, 2100),

  ('00000000-0000-0000-0001-000000000003',
   'Chukwuemeka Okafor',
   '+2348033003003',
   'emeka.okafor@mobo.ng',
   '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHu2',
   'driver', 'Nigeria', 'Lagos', 'en', true, true, 4.78, 890, 3500),

  ('00000000-0000-0000-0001-000000000004',
   'Wanjiru Kamau',
   '+254701004004',
   'wanjiru.kamau@mobo.ke',
   '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHu2',
   'driver', 'Kenya', 'Nairobi', 'sw', true, true, 4.95, 721, 2800),

  ('00000000-0000-0000-0001-000000000005',
   'Kouassi Adjobi',
   '+22507005005',
   'kouassi.adjobi@mobo.ci',
   '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHu2',
   'driver', 'Ivory Coast', 'Abidjan', 'fr', true, true, 4.70, 445, 1750)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- RIDER USERS (10 riders)
-- ============================================================
INSERT INTO users (id, full_name, phone, email, password_hash, role, country, city, language, is_verified, is_active, rating, total_rides, loyalty_points, wallet_balance)
VALUES
  ('00000000-0000-0000-0002-000000000001',
   'Marie-Claire Nkomo',
   '+237655101001',
   'mc.nkomo@gmail.com',
   '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHu2',
   'rider', 'Cameroon', 'Douala', 'fr', true, true, 4.80, 45, 350, 5000),

  ('00000000-0000-0000-0002-000000000002',
   'Patrick Fotso',
   '+237691102002',
   'patrick.fotso@gmail.com',
   '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHu2',
   'rider', 'Cameroon', 'Yaoundé', 'fr', true, true, 4.60, 23, 180, 2000),

  ('00000000-0000-0000-0002-000000000003',
   'Ngozi Adeyemi',
   '+2348123103003',
   'ngozi.adeyemi@gmail.com',
   '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHu2',
   'rider', 'Nigeria', 'Lagos', 'en', true, true, 4.90, 112, 900, 15000),

  ('00000000-0000-0000-0002-000000000004',
   'Femi Adesanya',
   '+2347034104004',
   'femi.adesanya@gmail.com',
   '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHu2',
   'rider', 'Nigeria', 'Lagos', 'en', true, true, 4.75, 67, 520, 8000),

  ('00000000-0000-0000-0002-000000000005',
   'Achieng Otieno',
   '+254712105005',
   'achieng.otieno@gmail.com',
   '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHu2',
   'rider', 'Kenya', 'Nairobi', 'sw', true, true, 4.85, 89, 710, 10000),

  ('00000000-0000-0000-0002-000000000006',
   'Sirine Coulibaly',
   '+22507106006',
   'sirine.coulibaly@gmail.com',
   '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHu2',
   'rider', 'Ivory Coast', 'Abidjan', 'fr', true, true, 4.70, 34, 270, 3500),

  ('00000000-0000-0000-0002-000000000007',
   'Brice Nzinga',
   '+24106107007',
   'brice.nzinga@gmail.com',
   '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHu2',
   'rider', 'Gabon', 'Libreville', 'fr', true, true, 4.50, 18, 140, 1500),

  ('00000000-0000-0000-0002-000000000008',
   'Rokhaya Diop',
   '+22177108008',
   'rokhaya.diop@gmail.com',
   '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHu2',
   'rider', 'Benin', 'Cotonou', 'fr', true, true, 4.65, 29, 230, 2500),

  ('00000000-0000-0000-0002-000000000009',
   'Moussa Maiga',
   '+22797109009',
   'moussa.maiga@gmail.com',
   '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHu2',
   'rider', 'Niger', 'Niamey', 'fr', true, true, 4.55, 12, 90, 1000),

  ('00000000-0000-0000-0002-000000000010',
   'Thabo Dlamini',
   '+27810110010',
   'thabo.dlamini@gmail.com',
   '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHu2',
   'rider', 'South Africa', 'Johannesburg', 'en', true, true, 4.88, 156, 1200, 20000)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- DRIVERS (linked to driver users)
-- Douala center: 4.0511, 9.7679
-- Yaoundé center: 3.8480, 11.5021
-- Lagos Island: 6.4541, 3.3947
-- Nairobi CBD: -1.2921, 36.8219
-- Abidjan Plateau: 5.3600, -4.0083
-- ============================================================
INSERT INTO drivers (id, user_id, license_number, license_expiry, national_id, is_approved, is_online, current_location, total_earnings, acceptance_rate, cancellation_rate)
VALUES
  ('00000000-0000-0001-0001-000000000001',
   '00000000-0000-0000-0001-000000000001',
   'CMR-DLA-2021-001234', '2026-12-31', 'CM1234567',
   true, true,
   ST_SetSRID(ST_Point(9.7580, 4.0411), 4326),
   4580000, 94.20, 3.10),

  ('00000000-0000-0001-0001-000000000002',
   '00000000-0000-0000-0001-000000000002',
   'CMR-YDE-2022-005678', '2027-06-30', 'CM5678901',
   true, false,
   ST_SetSRID(ST_Point(11.5121, 3.8580), 4326),
   7920000, 96.50, 1.80),

  ('00000000-0000-0001-0001-000000000003',
   '00000000-0000-0000-0001-000000000003',
   'NGR-LOS-2020-009012', '2025-11-30', 'NG9012345',
   true, true,
   ST_SetSRID(ST_Point(3.3847, 6.4441), 4326),
   13450000, 91.30, 4.50),

  ('00000000-0000-0001-0001-000000000004',
   '00000000-0000-0000-0001-000000000004',
   'KEN-NRB-2021-003456', '2026-09-30', 'KE3456789',
   true, true,
   ST_SetSRID(ST_Point(36.8119, -1.2821), 4326),
   10890000, 97.80, 0.90),

  ('00000000-0000-0001-0001-000000000005',
   '00000000-0000-0000-0001-000000000005',
   'CIV-ABJ-2022-007890', '2027-03-31', 'CI7890123',
   true, true,
   ST_SetSRID(ST_Point(-4.0183, 5.3500), 4326),
   6720000, 88.60, 5.20)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- VEHICLES (one per driver)
-- ============================================================
INSERT INTO vehicles (id, driver_id, make, model, year, plate, color, vehicle_type, seats, is_active)
VALUES
  ('00000000-0000-0002-0001-000000000001',
   '00000000-0000-0001-0001-000000000001',
   'Toyota', 'Corolla', 2020, 'LT-1234-DLA', 'White', 'standard', 4, true),

  ('00000000-0000-0002-0001-000000000002',
   '00000000-0000-0001-0001-000000000002',
   'Honda', 'Accord', 2021, 'CE-5678-YDE', 'Silver', 'comfort', 4, true),

  ('00000000-0000-0002-0001-000000000003',
   '00000000-0000-0001-0001-000000000003',
   'Toyota', 'Camry', 2019, 'KJA-456-LG', 'Black', 'comfort', 4, true),

  ('00000000-0000-0002-0001-000000000004',
   '00000000-0000-0001-0001-000000000004',
   'Nissan', 'X-Trail', 2022, 'KDA 789Z', 'Grey', 'luxury', 7, true),

  ('00000000-0000-0002-0001-000000000005',
   '00000000-0000-0001-0001-000000000005',
   'Hyundai', 'Accent', 2021, 'AB-0001-CI', 'Blue', 'standard', 4, true)
ON CONFLICT (id) DO NOTHING;

-- Link vehicles to drivers
UPDATE drivers SET vehicle_id = '00000000-0000-0002-0001-000000000001' WHERE id = '00000000-0000-0001-0001-000000000001';
UPDATE drivers SET vehicle_id = '00000000-0000-0002-0001-000000000002' WHERE id = '00000000-0000-0001-0001-000000000002';
UPDATE drivers SET vehicle_id = '00000000-0000-0002-0001-000000000003' WHERE id = '00000000-0000-0001-0001-000000000003';
UPDATE drivers SET vehicle_id = '00000000-0000-0002-0001-000000000004' WHERE id = '00000000-0000-0001-0001-000000000004';
UPDATE drivers SET vehicle_id = '00000000-0000-0002-0001-000000000005' WHERE id = '00000000-0000-0001-0001-000000000005';

-- ============================================================
-- COMPLETED RIDES (10 rides across cities)
-- ============================================================
INSERT INTO rides (
  id, rider_id, driver_id, vehicle_id, ride_type, status,
  pickup_address, pickup_location, dropoff_address, dropoff_location,
  distance_km, duration_minutes,
  base_fare, per_km_fare, per_minute_fare, surge_multiplier, surge_active,
  estimated_fare, final_fare, service_fee, booking_fee, tip_amount,
  payment_method, payment_status,
  pickup_otp, started_at, completed_at, created_at
) VALUES
  -- Ride 1: Douala Akwa → Bonabéri
  ('00000000-0000-0003-0001-000000000001',
   '00000000-0000-0000-0002-000000000001',
   '00000000-0000-0001-0001-000000000001',
   '00000000-0000-0002-0001-000000000001',
   'standard', 'completed',
   'Akwa, Douala', ST_SetSRID(ST_Point(9.7044, 4.0469), 4326),
   'Bonabéri, Douala', ST_SetSRID(ST_Point(9.6650, 4.0700), 4326),
   6.2, 22, 1000, 700, 100, 1.00, false,
   7840, 7840, 1308, 500, 500,
   'cash', 'paid', '3841',
   NOW() - INTERVAL '2 days 3 hours',
   NOW() - INTERVAL '2 days 2 hours 38 minutes',
   NOW() - INTERVAL '2 days 3 hours 15 minutes'),

  -- Ride 2: Douala Bonapriso → Bonamoussadi
  ('00000000-0000-0003-0001-000000000002',
   '00000000-0000-0000-0002-000000000002',
   '00000000-0000-0001-0001-000000000001',
   '00000000-0000-0002-0001-000000000001',
   'comfort', 'completed',
   'Bonapriso, Douala', ST_SetSRID(ST_Point(9.6900, 4.0550), 4326),
   'Bonamoussadi, Douala', ST_SetSRID(ST_Point(9.7350, 4.0750), 4326),
   5.8, 25, 1000, 700, 100, 1.50, true,
   11350, 11350, 1892, 500, 0,
   'mobile_money', 'paid', '7290',
   NOW() - INTERVAL '1 day 5 hours',
   NOW() - INTERVAL '1 day 4 hours 35 minutes',
   NOW() - INTERVAL '1 day 5 hours 10 minutes'),

  -- Ride 3: Yaoundé Centre → Mvan
  ('00000000-0000-0003-0001-000000000003',
   '00000000-0000-0000-0002-000000000003',
   '00000000-0000-0001-0001-000000000002',
   '00000000-0000-0002-0001-000000000002',
   'standard', 'completed',
   'Centre-ville, Yaoundé', ST_SetSRID(ST_Point(11.5021, 3.8480), 4326),
   'Mvan, Yaoundé', ST_SetSRID(ST_Point(11.5280, 3.8150), 4326),
   4.5, 18, 1000, 700, 100, 1.00, false,
   6050, 6050, 1008, 500, 200,
   'cash', 'paid', '1923',
   NOW() - INTERVAL '3 days 2 hours',
   NOW() - INTERVAL '3 days 1 hour 42 minutes',
   NOW() - INTERVAL '3 days 2 hours 20 minutes'),

  -- Ride 4: Lagos Island → Victoria Island
  ('00000000-0000-0003-0001-000000000004',
   '00000000-0000-0000-0002-000000000003',
   '00000000-0000-0001-0001-000000000003',
   '00000000-0000-0002-0001-000000000003',
   'comfort', 'completed',
   'Lagos Island', ST_SetSRID(ST_Point(3.3947, 6.4541), 4326),
   'Victoria Island, Lagos', ST_SetSRID(ST_Point(3.4219, 6.4280), 4326),
   3.8, 20, 1000, 700, 100, 2.00, true,
   12360, 12360, 2060, 500, 1000,
   'card', 'paid', '5512',
   NOW() - INTERVAL '5 hours',
   NOW() - INTERVAL '4 hours 40 minutes',
   NOW() - INTERVAL '5 hours 15 minutes'),

  -- Ride 5: Lagos Lekki → Ikeja
  ('00000000-0000-0003-0001-000000000005',
   '00000000-0000-0000-0002-000000000004',
   '00000000-0000-0001-0001-000000000003',
   '00000000-0000-0002-0001-000000000003',
   'standard', 'completed',
   'Lekki Phase 1, Lagos', ST_SetSRID(ST_Point(3.4700, 6.4400), 4326),
   'Ikeja, Lagos', ST_SetSRID(ST_Point(3.3478, 6.6018), 4326),
   18.5, 45, 1000, 700, 100, 1.00, false,
   19450, 19450, 3242, 500, 0,
   'mobile_money', 'paid', '8834',
   NOW() - INTERVAL '1 day 8 hours',
   NOW() - INTERVAL '1 day 7 hours 15 minutes',
   NOW() - INTERVAL '1 day 8 hours 20 minutes'),

  -- Ride 6: Nairobi CBD → Westlands
  ('00000000-0000-0003-0001-000000000006',
   '00000000-0000-0000-0002-000000000005',
   '00000000-0000-0001-0001-000000000004',
   '00000000-0000-0002-0001-000000000004',
   'luxury', 'completed',
   'Nairobi CBD', ST_SetSRID(ST_Point(36.8219, -1.2921), 4326),
   'Westlands, Nairobi', ST_SetSRID(ST_Point(36.8073, -1.2676), 4326),
   4.2, 16, 1000, 700, 100, 1.00, false,
   6540, 6540, 1090, 500, 500,
   'mobile_money', 'paid', '6670',
   NOW() - INTERVAL '6 hours',
   NOW() - INTERVAL '5 hours 44 minutes',
   NOW() - INTERVAL '6 hours 10 minutes'),

  -- Ride 7: Nairobi Kilimani → Karen
  ('00000000-0000-0003-0001-000000000007',
   '00000000-0000-0000-0002-000000000005',
   '00000000-0000-0001-0001-000000000004',
   '00000000-0000-0002-0001-000000000004',
   'standard', 'completed',
   'Kilimani, Nairobi', ST_SetSRID(ST_Point(36.7870, -1.2940), 4326),
   'Karen, Nairobi', ST_SetSRID(ST_Point(36.7010, -1.3420), 4326),
   10.1, 28, 1000, 700, 100, 1.00, false,
   11770, 11770, 1962, 500, 0,
   'cash', 'paid', '2291',
   NOW() - INTERVAL '2 days 10 hours',
   NOW() - INTERVAL '2 days 9 hours 32 minutes',
   NOW() - INTERVAL '2 days 10 hours 15 minutes'),

  -- Ride 8: Abidjan Plateau → Cocody
  ('00000000-0000-0003-0001-000000000008',
   '00000000-0000-0000-0002-000000000006',
   '00000000-0000-0001-0001-000000000005',
   '00000000-0000-0002-0001-000000000005',
   'standard', 'completed',
   'Plateau, Abidjan', ST_SetSRID(ST_Point(-4.0083, 5.3600), 4326),
   'Cocody, Abidjan', ST_SetSRID(ST_Point(-3.9800, 5.3650), 4326),
   3.5, 14, 1000, 700, 100, 1.00, false,
   5450, 5450, 908, 500, 300,
   'cash', 'paid', '4450',
   NOW() - INTERVAL '4 days',
   NOW() - INTERVAL '3 days 23 hours 46 minutes',
   NOW() - INTERVAL '4 days 20 minutes'),

  -- Ride 9: Douala Bassa → Logpom (shared ride)
  ('00000000-0000-0003-0001-000000000009',
   '00000000-0000-0000-0002-000000000001',
   '00000000-0000-0001-0001-000000000001',
   '00000000-0000-0002-0001-000000000001',
   'shared', 'completed',
   'Bassa, Douala', ST_SetSRID(ST_Point(9.7800, 4.0200), 4326),
   'Logpom, Douala', ST_SetSRID(ST_Point(9.7550, 4.0850), 4326),
   4.8, 20, 1000, 700, 100, 1.00, false,
   5160, 5160, 860, 500, 0,
   'cash', 'paid', '7733',
   NOW() - INTERVAL '7 days 2 hours',
   NOW() - INTERVAL '7 days 1 hour 40 minutes',
   NOW() - INTERVAL '7 days 2 hours 10 minutes'),

  -- Ride 10: Lagos Ikoyi → Surulere
  ('00000000-0000-0003-0001-000000000010',
   '00000000-0000-0000-0002-000000000004',
   '00000000-0000-0001-0001-000000000003',
   '00000000-0000-0002-0001-000000000003',
   'standard', 'completed',
   'Ikoyi, Lagos', ST_SetSRID(ST_Point(3.4350, 6.4600), 4326),
   'Surulere, Lagos', ST_SetSRID(ST_Point(3.3567, 6.4981), 4326),
   8.9, 32, 1000, 700, 100, 1.50, true,
   16185, 16185, 2698, 500, 0,
   'mobile_money', 'paid', '9901',
   NOW() - INTERVAL '10 hours',
   NOW() - INTERVAL '9 hours 28 minutes',
   NOW() - INTERVAL '10 hours 20 minutes')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- PAYMENTS (matching completed rides)
-- ============================================================
INSERT INTO payments (id, ride_id, user_id, amount, currency, method, status, transaction_id, provider_ref)
VALUES
  ('00000000-0000-0004-0001-000000000001',
   '00000000-0000-0003-0001-000000000001',
   '00000000-0000-0000-0002-000000000001',
   7840, 'XAF', 'cash', 'completed', 'TXN-CASH-001', 'MOBO-001'),

  ('00000000-0000-0004-0001-000000000002',
   '00000000-0000-0003-0001-000000000002',
   '00000000-0000-0000-0002-000000000002',
   11350, 'XAF', 'mtn_mobile_money', 'completed', 'TXN-MTN-002', 'MTN-REF-4821'),

  ('00000000-0000-0004-0001-000000000003',
   '00000000-0000-0003-0001-000000000003',
   '00000000-0000-0000-0002-000000000003',
   6050, 'XAF', 'cash', 'completed', 'TXN-CASH-003', 'MOBO-003'),

  ('00000000-0000-0004-0001-000000000004',
   '00000000-0000-0003-0001-000000000004',
   '00000000-0000-0000-0002-000000000003',
   12360, 'XAF', 'card', 'completed', 'TXN-STRIPE-004', 'pi_test_004'),

  ('00000000-0000-0004-0001-000000000005',
   '00000000-0000-0003-0001-000000000005',
   '00000000-0000-0000-0002-000000000004',
   19450, 'XAF', 'mtn_mobile_money', 'completed', 'TXN-MTN-005', 'MTN-REF-9934'),

  ('00000000-0000-0004-0001-000000000006',
   '00000000-0000-0003-0001-000000000006',
   '00000000-0000-0000-0002-000000000005',
   6540, 'XAF', 'mtn_mobile_money', 'completed', 'TXN-MTN-006', 'MTN-REF-1122'),

  ('00000000-0000-0004-0001-000000000007',
   '00000000-0000-0003-0001-000000000007',
   '00000000-0000-0000-0002-000000000005',
   11770, 'XAF', 'cash', 'completed', 'TXN-CASH-007', 'MOBO-007'),

  ('00000000-0000-0004-0001-000000000008',
   '00000000-0000-0003-0001-000000000008',
   '00000000-0000-0000-0002-000000000006',
   5450, 'XAF', 'cash', 'completed', 'TXN-CASH-008', 'MOBO-008'),

  ('00000000-0000-0004-0001-000000000009',
   '00000000-0000-0003-0001-000000000009',
   '00000000-0000-0000-0002-000000000001',
   5160, 'XAF', 'cash', 'completed', 'TXN-CASH-009', 'MOBO-009'),

  ('00000000-0000-0004-0001-000000000010',
   '00000000-0000-0003-0001-000000000010',
   '00000000-0000-0000-0002-000000000004',
   16185, 'XAF', 'mtn_mobile_money', 'completed', 'TXN-MTN-010', 'MTN-REF-7755')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- RIDE RATINGS
-- ============================================================
INSERT INTO ride_ratings (ride_id, rater_id, rated_id, rating, comment) VALUES
  ('00000000-0000-0003-0001-000000000001', '00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0001-000000000001', 5, 'Très bon conducteur, trajet rapide et confortable!'),
  ('00000000-0000-0003-0001-000000000002', '00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0001-000000000001', 4, 'Bonne conduite, voiture propre.'),
  ('00000000-0000-0003-0001-000000000003', '00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0001-000000000002', 5, 'Excellent service!'),
  ('00000000-0000-0003-0001-000000000004', '00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0001-000000000003', 5, 'Great driver, knew all the shortcuts!'),
  ('00000000-0000-0003-0001-000000000006', '00000000-0000-0000-0002-000000000005', '00000000-0000-0000-0001-000000000004', 5, 'Wanjiru ni dereva bora sana. Asante!'),
  ('00000000-0000-0003-0001-000000000008', '00000000-0000-0000-0002-000000000006', '00000000-0000-0000-0001-000000000005', 4, 'Service correct, à recommander.')
ON CONFLICT (ride_id, rater_id) DO NOTHING;

-- ============================================================
-- SURGE ZONES
-- Douala downtown polygon (approximate)
-- Lagos Island polygon (approximate)
-- ============================================================
INSERT INTO surge_zones (id, name, city, zone, multiplier, is_active)
VALUES
  ('00000000-0000-0005-0001-000000000001',
   'Centre-ville Douala', 'Douala',
   ST_SetSRID(
     ST_GeomFromText('POLYGON((9.680 4.030, 9.730 4.030, 9.730 4.070, 9.680 4.070, 9.680 4.030))'),
     4326
   ),
   1.50, true),

  ('00000000-0000-0005-0001-000000000002',
   'Lagos Island Central', 'Lagos',
   ST_SetSRID(
     ST_GeomFromText('POLYGON((3.360 6.430, 3.430 6.430, 3.430 6.470, 3.360 6.470, 3.360 6.430))'),
     4326
   ),
   2.00, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- PROMO CODES
-- ============================================================
INSERT INTO promo_codes (id, code, discount_type, discount_value, min_fare, max_uses, expires_at, is_active)
VALUES
  ('00000000-0000-0006-0001-000000000001',
   'MOBO2025', 'percent', 15, 3000, 500, NOW() + INTERVAL '6 months', true),

  ('00000000-0000-0006-0001-000000000002',
   'BIENVENUE', 'fixed', 1000, 2000, 1000, NOW() + INTERVAL '3 months', true),

  ('00000000-0000-0006-0001-000000000003',
   'LAGOS50', 'percent', 10, 5000, 200, NOW() + INTERVAL '2 months', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- SAMPLE NOTIFICATIONS
-- ============================================================
INSERT INTO notifications (user_id, title, message, type, is_read)
VALUES
  ('00000000-0000-0000-0002-000000000001',
   'Bienvenue sur MOBO! 🎉',
   'Votre compte a été créé avec succès. Profitez de 50 points de fidélité offerts!',
   'welcome', false),

  ('00000000-0000-0000-0002-000000000001',
   'Trajet terminé',
   'Votre trajet Akwa → Bonabéri est terminé. Coût: 7,840 XAF. Merci de voyager avec MOBO!',
   'ride', true),

  ('00000000-0000-0000-0002-000000000003',
   'Welcome to MOBO!',
   'Your account is ready. You have 50 bonus loyalty points to get you started!',
   'welcome', false),

  ('00000000-0000-0000-0002-000000000003',
   'Ride Completed',
   'Your ride Lagos Island → Victoria Island is done. Fare: 12,360 XAF. See you next time!',
   'ride', true),

  ('00000000-0000-0000-0002-000000000005',
   'Karibu MOBO!',
   'Akaunti yako imefunguliwa. Una pointi 50 za uaminifu za bure!',
   'welcome', false),

  ('00000000-0000-0000-0001-000000000001',
   'Nouvelle course disponible',
   'Une nouvelle demande de course est disponible près de chez vous. Acceptez maintenant!',
   'ride_request', false),

  ('00000000-0000-0000-0002-000000000001',
   'Code promo disponible',
   'Utilisez le code BIENVENUE pour 1000 XAF de réduction sur votre prochain trajet!',
   'promo', false)
ON CONFLICT DO NOTHING;

-- ============================================================
-- LOYALTY TRANSACTIONS (signup bonuses)
-- ============================================================
INSERT INTO loyalty_transactions (user_id, points, action, description)
VALUES
  ('00000000-0000-0000-0002-000000000001', 50, 'signup_bonus', 'MOBO signup bonus - 50 points offered'),
  ('00000000-0000-0000-0002-000000000002', 50, 'signup_bonus', 'MOBO signup bonus - 50 points offered'),
  ('00000000-0000-0000-0002-000000000003', 50, 'signup_bonus', 'MOBO signup bonus - 50 points offered'),
  ('00000000-0000-0000-0002-000000000004', 50, 'signup_bonus', 'MOBO signup bonus - 50 points offered'),
  ('00000000-0000-0000-0002-000000000005', 50, 'signup_bonus', 'MOBO signup bonus - 50 points offered'),
  ('00000000-0000-0000-0002-000000000006', 50, 'signup_bonus', 'MOBO signup bonus - 50 points offered'),
  ('00000000-0000-0000-0002-000000000007', 50, 'signup_bonus', 'MOBO signup bonus - 50 points offered'),
  ('00000000-0000-0000-0002-000000000008', 50, 'signup_bonus', 'MOBO signup bonus - 50 points offered'),
  ('00000000-0000-0000-0002-000000000009', 50, 'signup_bonus', 'MOBO signup bonus - 50 points offered'),
  ('00000000-0000-0000-0002-000000000010', 50, 'signup_bonus', 'MOBO signup bonus - 50 points offered')
ON CONFLICT DO NOTHING;

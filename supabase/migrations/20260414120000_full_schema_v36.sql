-- ============================================================
-- MOBO Full Schema Migration
-- Generated: 2026-04-14T22:14:43Z
-- Combines: init.sql + migrations 001–036
-- All statements are idempotent (IF NOT EXISTS / IF EXISTS guards).
-- Safe to run against an empty OR an existing database.
-- ============================================================

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


-- ── migration_001.sql ─────────────────────────────────────────────
-- Migration 001: Add expo_push_token, corporate accounts support
ALTER TABLE users ADD COLUMN IF NOT EXISTS expo_push_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS corporate_account_id UUID;
ALTER TABLE users ADD COLUMN IF NOT EXISTS corporate_role VARCHAR(20) DEFAULT 'employee' CHECK (corporate_role IN ('admin','manager','employee'));

CREATE TABLE IF NOT EXISTS corporate_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name VARCHAR(255) NOT NULL,
  admin_user_id UUID NOT NULL REFERENCES users(id),
  billing_email VARCHAR(255) NOT NULL,
  monthly_budget INTEGER DEFAULT 0,
  current_spend INTEGER DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'XAF',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS corporate_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  corporate_account_id UUID NOT NULL REFERENCES corporate_accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) DEFAULT 'employee' CHECK (role IN ('admin','manager','employee')),
  spending_limit INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(corporate_account_id, user_id)
);

CREATE TABLE IF NOT EXISTS promo_code_uses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  promo_code_id UUID NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ride_id UUID REFERENCES rides(id),
  discount_applied INTEGER NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(promo_code_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_users_push_token ON users(expo_push_token) WHERE expo_push_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_corporate_members ON corporate_members(corporate_account_id, user_id);

-- ── migration_002.sql ─────────────────────────────────────────────
-- Migration 002: Fleet Owner support

-- Add fleet_owner role to users
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('rider','driver','admin','fleet_owner'));

-- FLEETS table
CREATE TABLE IF NOT EXISTS fleets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  city VARCHAR(100),
  country VARCHAR(100) DEFAULT 'Cameroon',
  fleet_number INTEGER NOT NULL DEFAULT 1, -- 1st fleet, 2nd fleet etc for same owner
  max_vehicles INTEGER NOT NULL DEFAULT 15,
  min_vehicles INTEGER NOT NULL DEFAULT 5,
  is_active BOOLEAN DEFAULT false, -- becomes active once min_vehicles reached
  is_approved BOOLEAN DEFAULT false, -- admin must approve
  total_earnings INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- FLEET VEHICLES table
CREATE TABLE IF NOT EXISTS fleet_vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fleet_id UUID NOT NULL REFERENCES fleets(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  make VARCHAR(100) NOT NULL,
  model VARCHAR(100) NOT NULL,
  year INTEGER NOT NULL CHECK (year >= 2000 AND year <= 2030),
  plate VARCHAR(30) UNIQUE NOT NULL,
  color VARCHAR(50),
  vehicle_type VARCHAR(30) NOT NULL CHECK (vehicle_type IN ('standard','comfort','luxury','van','bike','scooter')),
  seats INTEGER DEFAULT 4,
  is_wheelchair_accessible BOOLEAN DEFAULT false,
  insurance_doc_url TEXT,
  insurance_expiry DATE,
  vehicle_doc_url TEXT,
  photos JSONB DEFAULT '[]',
  assigned_driver_id UUID REFERENCES users(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  is_approved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add fleet_id to drivers table
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS fleet_id UUID REFERENCES fleets(id) ON DELETE SET NULL;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS fleet_vehicle_id UUID REFERENCES fleet_vehicles(id) ON DELETE SET NULL;

-- Update vehicles table to link to fleet
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS fleet_id UUID REFERENCES fleets(id) ON DELETE SET NULL;

-- Add registration_step to users (track multi-step registration progress)
ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_step VARCHAR(30) DEFAULT 'complete';
ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_completed BOOLEAN DEFAULT true;

-- Add otp_attempts column if not already present
ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_attempts INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_fleets_owner ON fleets(owner_id);
CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_fleet ON fleet_vehicles(fleet_id);
CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_owner ON fleet_vehicles(owner_id);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS fleets_updated_at ON fleets;
CREATE TRIGGER fleets_updated_at BEFORE UPDATE ON fleets FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS fleet_vehicles_updated_at ON fleet_vehicles;
CREATE TRIGGER fleet_vehicles_updated_at BEFORE UPDATE ON fleet_vehicles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── migration_003.sql ─────────────────────────────────────────────
-- MOBO Migration 003
-- New Lyft-parity features: multiple stops, preferred drivers, Women+ Connect,
-- ride check-ins, lost & found, destination mode, driver bonuses/streaks,
-- referrals, family accounts, concierge bookings, business profiles, express pay

-- ============================================================
-- ADD COLUMNS TO EXISTING TABLES
-- ============================================================

-- Users: gender preference (Women+ Connect), referral, business profile
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS gender_preference VARCHAR(20) DEFAULT 'any' CHECK (gender_preference IN ('any','women_nonbinary')),
  ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20) UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_credits INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS business_profile_active BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS business_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS family_account_id UUID;

-- Rides: multiple stops, preferred driver, price lock, concierge
ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS stops JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS preferred_driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS price_locked BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS price_lock_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS concierge_booked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS concierge_passenger_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS concierge_passenger_phone VARCHAR(20);

-- Drivers: destination mode, express pay, gender
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS destination_mode BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS destination_address TEXT,
  ADD COLUMN IF NOT EXISTS destination_location GEOMETRY(Point, 4326),
  ADD COLUMN IF NOT EXISTS destination_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS express_pay_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS express_pay_account VARCHAR(255),
  ADD COLUMN IF NOT EXISTS current_streak INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS longest_streak INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_bonuses_earned INTEGER DEFAULT 0;

-- ============================================================
-- PREFERRED DRIVERS
-- ============================================================
CREATE TABLE IF NOT EXISTS preferred_drivers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  ride_id UUID REFERENCES rides(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, driver_id)
);

-- ============================================================
-- RIDE CHECK-INS (unusual stop detection)
-- ============================================================
CREATE TABLE IF NOT EXISTS ride_checkins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  checkin_type VARCHAR(30) NOT NULL CHECK (checkin_type IN ('unusual_stop','long_pause','route_deviation','manual')),
  location GEOMETRY(Point, 4326),
  address TEXT,
  response VARCHAR(20) CHECK (response IN ('safe','need_help','no_response')),
  responded_at TIMESTAMPTZ,
  escalated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- LOST AND FOUND
-- ============================================================
CREATE TABLE IF NOT EXISTS lost_and_found (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES users(id),
  driver_id UUID REFERENCES drivers(id),
  item_description TEXT NOT NULL,
  item_category VARCHAR(50),
  status VARCHAR(20) DEFAULT 'reported' CHECK (status IN ('reported','driver_contacted','found','returned','not_found','closed')),
  driver_response TEXT,
  contact_attempts INTEGER DEFAULT 0,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DRIVER BONUS CHALLENGES
-- ============================================================
CREATE TABLE IF NOT EXISTS bonus_challenges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  challenge_type VARCHAR(30) NOT NULL CHECK (challenge_type IN ('rides_count','hours_online','acceptance_rate','streak','rating')),
  target_value INTEGER NOT NULL,
  bonus_amount INTEGER NOT NULL,
  currency VARCHAR(10) DEFAULT 'XAF',
  city VARCHAR(100),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS driver_challenge_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  challenge_id UUID NOT NULL REFERENCES bonus_challenges(id) ON DELETE CASCADE,
  current_value INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  bonus_paid BOOLEAN DEFAULT false,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(driver_id, challenge_id)
);

-- ============================================================
-- REFERRALS
-- ============================================================
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referrer_credit INTEGER DEFAULT 1000,
  referred_credit INTEGER DEFAULT 500,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','qualified','paid')),
  qualified_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(referred_id)
);

-- ============================================================
-- FAMILY ACCOUNTS
-- ============================================================
CREATE TABLE IF NOT EXISTS family_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL DEFAULT 'My Family',
  max_members INTEGER DEFAULT 5,
  payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL,
  monthly_limit INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS family_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_account_id UUID NOT NULL REFERENCES family_accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('owner','member')),
  monthly_spend_limit INTEGER,
  can_see_rides BOOLEAN DEFAULT false,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(family_account_id, user_id)
);

-- ============================================================
-- CONCIERGE BOOKINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS concierge_bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booked_by UUID NOT NULL REFERENCES users(id),
  ride_id UUID REFERENCES rides(id) ON DELETE SET NULL,
  passenger_name VARCHAR(255) NOT NULL,
  passenger_phone VARCHAR(20) NOT NULL,
  pickup_address TEXT NOT NULL,
  dropoff_address TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ,
  notes TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','assigned','completed','cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- EXPRESS PAY TRANSACTIONS (driver instant payout)
-- ============================================================
CREATE TABLE IF NOT EXISTS express_pay_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  fee INTEGER DEFAULT 0,
  net_amount INTEGER NOT NULL,
  currency VARCHAR(10) DEFAULT 'XAF',
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  provider_ref VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ============================================================
-- GENERATE REFERRAL CODES FOR EXISTING USERS (collision-safe)
-- ============================================================
DO $$
DECLARE
  u RECORD;
  new_code TEXT;
  done BOOLEAN;
BEGIN
  FOR u IN SELECT id FROM users WHERE referral_code IS NULL LOOP
    done := FALSE;
    WHILE NOT done LOOP
      new_code := UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 8));
      BEGIN
        UPDATE users SET referral_code = new_code WHERE id = u.id;
        done := TRUE;
      EXCEPTION WHEN unique_violation THEN
        -- retry with a new random code
      END;
    END LOOP;
  END LOOP;
END;
$$;

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_preferred_drivers_user ON preferred_drivers(user_id);
CREATE INDEX IF NOT EXISTS idx_ride_checkins_ride ON ride_checkins(ride_id);
CREATE INDEX IF NOT EXISTS idx_lost_found_ride ON lost_and_found(ride_id);
CREATE INDEX IF NOT EXISTS idx_lost_found_status ON lost_and_found(status);
CREATE INDEX IF NOT EXISTS idx_driver_challenges ON driver_challenge_progress(driver_id, completed);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_family_members_account ON family_members(family_account_id);
CREATE INDEX IF NOT EXISTS idx_family_members_user ON family_members(user_id);
CREATE INDEX IF NOT EXISTS idx_drivers_destination ON drivers USING GIST(destination_location) WHERE destination_mode = true;

-- ── migration_004.sql ─────────────────────────────────────────────
-- MOBO Migration 004
-- Driver home location: GPS-based home address captured at registration/onboarding

-- Add home location columns to drivers
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS home_latitude  DECIMAL(10, 8),
  ADD COLUMN IF NOT EXISTS home_longitude DECIMAL(11, 8),
  ADD COLUMN IF NOT EXISTS home_address   TEXT,
  ADD COLUMN IF NOT EXISTS home_location  GEOMETRY(Point, 4326);

-- Spatial index for home location queries (e.g. destination mode matching)
CREATE INDEX IF NOT EXISTS idx_drivers_home_location ON drivers USING GIST(home_location);

-- Backfill home_location geometry from lat/lng if both present (safe to run multiple times)
UPDATE drivers
SET home_location = ST_SetSRID(ST_MakePoint(home_longitude, home_latitude), 4326)
WHERE home_latitude IS NOT NULL
  AND home_longitude IS NOT NULL
  AND home_location IS NULL;

-- ── migration_005.sql ─────────────────────────────────────────────
-- MOBO Migration 005 — Security Features
-- Shareable trip links, disputes, trusted contacts (backend), driver real-ID checks,
-- route deviation tracking, speed alerts, fatigue tracking, document expiry alerts

-- ── Rides: share token + route deviation tracking
ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS share_token         VARCHAR(64) UNIQUE,
  ADD COLUMN IF NOT EXISTS share_token_expires TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS route_polyline      TEXT,
  ADD COLUMN IF NOT EXISTS route_deviation_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS route_deviation_alerted BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_speed_recorded  DECIMAL(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS speed_alert_sent    BOOLEAN DEFAULT false;

-- ── Trusted contacts (backend storage, linked to users)
CREATE TABLE IF NOT EXISTS trusted_contacts (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       VARCHAR(255) NOT NULL,
  phone      VARCHAR(30) NOT NULL,
  email      VARCHAR(255),
  notify_on_trip_start BOOLEAN DEFAULT true,
  notify_on_sos        BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, phone)
);
CREATE INDEX IF NOT EXISTS idx_trusted_contacts_user ON trusted_contacts(user_id);

-- ── Ride disputes
CREATE TABLE IF NOT EXISTS ride_disputes (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id        UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  reporter_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reporter_role  VARCHAR(20) NOT NULL CHECK (reporter_role IN ('rider','driver')),
  category       VARCHAR(50) NOT NULL CHECK (category IN (
                   'overcharge','wrong_route','driver_behavior','rider_behavior',
                   'vehicle_condition','item_damage','safety','other')),
  description    TEXT NOT NULL,
  evidence_urls  JSONB DEFAULT '[]',
  status         VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open','under_review','resolved','dismissed')),
  resolution     TEXT,
  resolved_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_disputes_ride   ON ride_disputes(ride_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON ride_disputes(status);
CREATE INDEX IF NOT EXISTS idx_disputes_reporter ON ride_disputes(reporter_id);

-- ── Driver Real-ID checks (selfie before going online)
CREATE TABLE IF NOT EXISTS driver_realid_checks (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id    UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  selfie_url   TEXT NOT NULL,
  status       VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','passed','failed','skipped')),
  checked_at   TIMESTAMPTZ DEFAULT NOW(),
  reviewed_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at  TIMESTAMPTZ,
  fail_reason  TEXT
);
CREATE INDEX IF NOT EXISTS idx_realid_driver ON driver_realid_checks(driver_id);
CREATE INDEX IF NOT EXISTS idx_realid_status ON driver_realid_checks(status, checked_at DESC);

-- ── Drivers: fatigue tracking, speed history, online hours
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS online_since              TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_trips_today         INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_break_prompted_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS realid_check_required     BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS realid_last_checked_at    TIMESTAMPTZ;

-- ── Speed alert logs
CREATE TABLE IF NOT EXISTS speed_alerts (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id    UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  driver_id  UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  speed_kmh  DECIMAL(6,2) NOT NULL,
  latitude   DECIMAL(10,8),
  longitude  DECIMAL(11,8),
  alerted_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_speed_alerts_ride ON speed_alerts(ride_id);

-- ── migration_006.sql ─────────────────────────────────────────────
-- MOBO Migration 006 — Safety enforcement additions
-- Adds escalated_at timestamp to ride_checkins for auto-escalation tracking
-- Resets driver trip counters daily via pg_cron (if enabled) or application job

ALTER TABLE ride_checkins
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;

-- Reset total_trips_today each day at midnight (requires pg_cron extension)
-- If pg_cron is not available, the application job handles this
-- SELECT cron.schedule('reset-driver-trips', '0 0 * * *',
--   $$UPDATE drivers SET total_trips_today = 0, online_since = NULL$$);

-- Index for escalation job polling performance
CREATE INDEX IF NOT EXISTS idx_checkins_unescalated
  ON ride_checkins(created_at)
  WHERE response IS NULL AND escalated IS NOT TRUE;

-- ── migration_007.sql ─────────────────────────────────────────────
-- MOBO Migration 007 — Medium Impact Security Features
-- 2FA, background checks, rating abuse, safety zones, ride audio recordings

-- ── Admin 2FA
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS totp_secret        TEXT,
  ADD COLUMN IF NOT EXISTS totp_enabled       BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS totp_verified_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS totp_backup_codes  JSONB DEFAULT '[]';

-- ── Driver background checks
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS background_check_date       DATE,
  ADD COLUMN IF NOT EXISTS background_check_expires_at DATE,
  ADD COLUMN IF NOT EXISTS background_check_status     VARCHAR(20) DEFAULT 'not_checked'
    CHECK (background_check_status IN ('not_checked','clear','flagged','pending','expired')),
  ADD COLUMN IF NOT EXISTS background_check_provider   VARCHAR(100),
  ADD COLUMN IF NOT EXISTS background_check_notes      TEXT;

-- ── Rider rating abuse tracking
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS rating_abuse_flagged    BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS rating_abuse_flagged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consecutive_low_ratings INTEGER DEFAULT 0;

-- ── Safety zones (extend surge_zones to support incident alerts)
ALTER TABLE surge_zones
  ADD COLUMN IF NOT EXISTS zone_type      VARCHAR(20) DEFAULT 'surge'
    CHECK (zone_type IN ('surge','safety_incident')),
  ADD COLUMN IF NOT EXISTS incident_type  VARCHAR(30)
    CHECK (incident_type IN ('crime','flooding','road_closure','construction','protest','other')),
  ADD COLUMN IF NOT EXISTS severity       VARCHAR(10) DEFAULT 'medium'
    CHECK (severity IN ('low','medium','high')),
  ADD COLUMN IF NOT EXISTS alert_message  TEXT,
  ADD COLUMN IF NOT EXISTS driver_alerted_ids JSONB DEFAULT '[]';

-- ── Ride audio recordings
CREATE TABLE IF NOT EXISTS ride_recordings (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id      UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  recorded_by  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         VARCHAR(10) NOT NULL CHECK (role IN ('rider','driver')),
  storage_url  TEXT NOT NULL,
  duration_sec INTEGER,
  file_size_kb INTEGER,
  is_encrypted BOOLEAN DEFAULT true,
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  accessed_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  accessed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recordings_ride    ON ride_recordings(ride_id);
CREATE INDEX IF NOT EXISTS idx_recordings_expires ON ride_recordings(expires_at);

-- ── migration_008.sql ─────────────────────────────────────────────
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

-- ── migration_009.sql ─────────────────────────────────────────────
-- Migration 009: Password reset OTP columns
-- Run in Supabase SQL editor

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reset_otp          VARCHAR(6),
  ADD COLUMN IF NOT EXISTS reset_otp_expiry   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reset_otp_attempts INT NOT NULL DEFAULT 0;

-- Index for fast lookup during reset flow
CREATE INDEX IF NOT EXISTS idx_users_reset_otp ON users (reset_otp)
  WHERE reset_otp IS NOT NULL;

-- ── migration_010.sql ─────────────────────────────────────────────
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

-- ── migration_011.sql ─────────────────────────────────────────────
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

-- ── migration_012.sql ─────────────────────────────────────────────
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

-- ── migration_013.sql ─────────────────────────────────────────────
-- Migration 013: Commuter passes, Support chat, EV vehicles, AR enforcement
-- Run with: psql $DATABASE_URL -f migration_013.sql

-- ── 1. EV / Green ride type ───────────────────────────────────────────────────
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS is_electric BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_vehicles_electric ON vehicles(is_electric) WHERE is_electric = true;

-- Extend ride_type CHECK to include 'ev'
ALTER TABLE rides DROP CONSTRAINT IF EXISTS rides_ride_type_check;
ALTER TABLE rides ADD CONSTRAINT rides_ride_type_check
  CHECK (ride_type IN (
    'standard','comfort','luxury','shared','bike','scooter',
    'delivery','scheduled','rental','outstation','wav','ev'
  ));

-- ── 2. Commuter passes ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS commuter_passes (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  route_name        TEXT NOT NULL,                         -- e.g. "Home → Work"
  origin_address    TEXT NOT NULL,
  origin_lat        DECIMAL(10,7) NOT NULL,
  origin_lng        DECIMAL(10,7) NOT NULL,
  destination_address TEXT NOT NULL,
  destination_lat   DECIMAL(10,7) NOT NULL,
  destination_lng   DECIMAL(10,7) NOT NULL,
  match_radius_m    INTEGER DEFAULT 500,                   -- geo-fence tolerance
  discount_percent  INTEGER NOT NULL DEFAULT 20            -- % off fare
    CHECK (discount_percent BETWEEN 5 AND 50),
  rides_total       INTEGER NOT NULL DEFAULT 40,           -- rides in the pass
  rides_used        INTEGER NOT NULL DEFAULT 0,
  price_paid        INTEGER NOT NULL,                      -- XAF paid
  valid_from        DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until       DATE NOT NULL,
  is_active         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commuter_passes_user ON commuter_passes(user_id) WHERE is_active = true;

-- ── 3. Support chat ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_tickets (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id),
  subject     TEXT NOT NULL,
  category    VARCHAR(40) DEFAULT 'general'
    CHECK (category IN ('general','payment','cancellation','safety','lost_item','driver','account','other')),
  status      VARCHAR(20) DEFAULT 'open'
    CHECK (status IN ('open','in_progress','waiting_user','resolved','closed')),
  priority    VARCHAR(10) DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  assigned_agent_id UUID REFERENCES users(id),
  ride_id     UUID REFERENCES rides(id),
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support_messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id   UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id   UUID REFERENCES users(id),          -- NULL = bot
  sender_role VARCHAR(20) DEFAULT 'user'
    CHECK (sender_role IN ('user','agent','bot')),
  content     TEXT NOT NULL,
  attachments JSONB DEFAULT '[]',
  is_read     BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user   ON support_tickets(user_id, status);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages(ticket_id, created_at);

-- ── 4. Driver AR enforcement ──────────────────────────────────────────────────
-- Track total offers sent to driver (denominator for acceptance_rate)
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS total_offers_received INTEGER DEFAULT 0;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS total_offers_accepted INTEGER DEFAULT 0;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS ar_warning_sent_at    TIMESTAMPTZ;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS ar_suspended_until    TIMESTAMPTZ;

-- ── 5. Rides: store commuter pass used ───────────────────────────────────────
ALTER TABLE rides ADD COLUMN IF NOT EXISTS commuter_pass_id UUID REFERENCES commuter_passes(id);
ALTER TABLE rides ADD COLUMN IF NOT EXISTS commuter_discount INTEGER DEFAULT 0;

-- ── migration_014.sql ─────────────────────────────────────────────
-- Migration 014: Scheduled Ride Reminders + Profile Photo + Offline Cache
-- Run with: psql $DATABASE_URL -f migration_014.sql

-- ── 1. Scheduled ride reminder tracking ────────────────────────────────────
ALTER TABLE rides ADD COLUMN IF NOT EXISTS reminder_24h_sent  BOOLEAN DEFAULT false;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS reminder_1h_sent   BOOLEAN DEFAULT false;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS auto_dispatched_at TIMESTAMPTZ;

-- ── 2. Rider push token on users ────────────────────────────────────────────
-- Already expected by pushNotifications.js; ensure column exists
ALTER TABLE users ADD COLUMN IF NOT EXISTS push_token TEXT;

-- ── 3. Driver profile photo ──────────────────────────────────────────────────
-- Feature 28: include driver photo in arrival push
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;

-- ── 4. Index for upcoming scheduled ride polling ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rides_scheduled_pending
  ON rides (scheduled_at)
  WHERE is_scheduled = true AND status = 'pending';

-- ── migration_015.sql ─────────────────────────────────────────────
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

-- ── migration_016.sql ─────────────────────────────────────────────
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

-- ── migration_017.sql ─────────────────────────────────────────────
-- Migration 017: Ads management table
-- Stores all ad banners shown in the mobile app, managed from admin dashboard.

CREATE TABLE IF NOT EXISTS ads (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type           VARCHAR(20)  NOT NULL DEFAULT 'internal' CHECK (type IN ('internal', 'business')),
  title          VARCHAR(120) NOT NULL,
  subtitle       VARCHAR(200) NOT NULL,
  cta            VARCHAR(40)  NOT NULL DEFAULT 'Learn More',
  icon           VARCHAR(60)  NOT NULL DEFAULT 'megaphone-outline',   -- Ionicons name
  color          VARCHAR(20)  NOT NULL DEFAULT '#FF00BF',              -- hex color
  sponsor        VARCHAR(100),                                         -- business name (NULL for internal)
  url            VARCHAR(300),                                         -- tap-through URL (NULL for internal)
  image_url      VARCHAR(300),                                         -- optional banner image URL
  context        VARCHAR(20)  NOT NULL DEFAULT 'home' CHECK (context IN ('home', 'ride', 'auth', 'all')),
  active         BOOLEAN      NOT NULL DEFAULT TRUE,
  priority       SMALLINT     NOT NULL DEFAULT 0,                      -- higher = shown first
  impressions    INTEGER      NOT NULL DEFAULT 0,
  clicks         INTEGER      NOT NULL DEFAULT 0,
  start_date     DATE,
  end_date       DATE,
  created_by     UUID,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ads_context_active ON ads (context, active);
CREATE INDEX IF NOT EXISTS idx_ads_type ON ads (type);

-- Seed default internal ads (mirrors AdBanner hardcoded fallback)
INSERT INTO ads (type, title, subtitle, cta, icon, color, context, priority) VALUES
  ('internal', 'Ride 5x, Save 20%',        'Complete 5 trips this week — get 20% off your next ride.',  'Activate',   'flash-outline',    '#FF6B00', 'all',  10),
  ('internal', 'Go Green — Try EV Rides',   'Zero-emission rides now available in Yaoundé & Douala.',    'Try Green',  'leaf-outline',     '#00A651', 'home', 9),
  ('internal', 'Commuter Pass — Save 25%',  'Buy a 40-ride pack and save 25% on your daily commute.',   'Get Pass',   'train-outline',    '#FF00BF', 'home', 8),
  ('internal', 'Refer & Earn',              'Invite friends to MOBO — you both get ride credits.',       'Share Now',  'people-outline',   '#0077CC', 'auth', 7),
  ('internal', 'Benskin — Fastest in Town!','Beat traffic with our moto taxi. From 500 FCFA.',          'Book Moto',  'bicycle-outline',  '#8B4513', 'home', 6),
  ('business', 'La Belle Époque — 15% Off', 'Fine dining in Bastos, Yaoundé. Show your MOBO receipt.',  'View Menu',  'restaurant-outline','#E74C3C','all',  5),
  ('business', 'ModeAfrica Boutique',       'Fashion & accessories — Akwa, Douala.',                    'Shop Now',   'bag-handle-outline','#8E44AD','home', 4),
  ('business', 'FitCam Gym — Free Trial',   '3-day free pass for MOBO riders. Yaoundé & Douala.',       'Claim Pass', 'fitness-outline',  '#1ABC9C', 'home', 3),
  ('business', 'Café Terrasse — Happy Hour','Coffee & pastries, Hippodrome. Code RIDE10.',              'Get Code',   'cafe-outline',     '#F39C12', 'auth', 2),
  ('business', 'PharmaCam — Home Delivery', 'Medicines delivered in 30 min. Yaoundé & Douala.',         'Order Now',  'medkit-outline',   '#2980B9', 'ride', 1)
ON CONFLICT DO NOTHING;

-- ── migration_018.sql ─────────────────────────────────────────────
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

-- ── migration_019.sql ─────────────────────────────────────────────
-- Migration 019: Biometric verifications table + pool ride groups + social auth

-- ── Biometric driver verifications ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_biometric_verifications (
  driver_id          UUID        PRIMARY KEY REFERENCES drivers(id) ON DELETE CASCADE,
  verified_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  photo_size_kb      INTEGER,
  result             VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | verified | failed | manual_review
  smile_job_id       VARCHAR(255),
  smile_result_code  VARCHAR(20),
  smile_confidence   NUMERIC(5,2),
  id_number          VARCHAR(100),
  id_type            VARCHAR(50),  -- national_id | passport | drivers_license
  id_country         VARCHAR(10)   DEFAULT 'CM',
  raw_response       JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_biometric_result ON driver_biometric_verifications(result);

-- ── Pool / Carpool ride groups ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pool_ride_groups (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id       UUID        REFERENCES drivers(id),
  status          VARCHAR(20) NOT NULL DEFAULT 'forming',  -- forming | active | completed | cancelled
  max_riders      INTEGER     NOT NULL DEFAULT 4,
  current_riders  INTEGER     NOT NULL DEFAULT 0,
  pickup_area     GEOGRAPHY(Point, 4326),
  dropoff_area    GEOGRAPHY(Point, 4326),
  pickup_radius_m INTEGER     NOT NULL DEFAULT 1000,
  dropoff_radius_m INTEGER    NOT NULL DEFAULT 2000,
  scheduled_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Social auth providers ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_social_accounts (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider      VARCHAR(20) NOT NULL,   -- google | apple
  provider_id   VARCHAR(255) NOT NULL,  -- sub / user identifier from provider
  email         VARCHAR(255),
  name          VARCHAR(255),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_social_user_id ON user_social_accounts(user_id);

-- Add pool columns to rides table
ALTER TABLE rides ADD COLUMN IF NOT EXISTS is_pool       BOOLEAN     DEFAULT FALSE;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS pool_group_id UUID        REFERENCES pool_ride_groups(id);
ALTER TABLE rides ADD COLUMN IF NOT EXISTS pool_fare     INTEGER;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS pool_seat_count INTEGER   DEFAULT 1;

-- Add social provider link column to users (quick lookup)
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_id  VARCHAR(255);

-- ── migration_020.sql ─────────────────────────────────────────────
-- Migration 020: Rider verification badge, new ride types (airport_transfer, ev, shuttle),
--               shuttle groups, driver blocking, min rider rating filter,
--               deactivation appeals, single-package delivery fields

BEGIN;

-- ── 1. Rider Verification Badge ───────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_rider_verified   BOOLEAN     DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rider_verified_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rider_verified_by   UUID        REFERENCES users(id) ON DELETE SET NULL; -- admin who approved

CREATE INDEX IF NOT EXISTS idx_users_rider_verified ON users(is_rider_verified) WHERE is_rider_verified = TRUE;

-- ── 2. Extend ride_type to include airport_transfer, ev, shuttle ──────────────
ALTER TABLE rides DROP CONSTRAINT IF EXISTS rides_ride_type_check;
ALTER TABLE rides ADD CONSTRAINT rides_ride_type_check
  CHECK (ride_type IN (
    'standard','comfort','luxury','shared','bike','scooter',
    'delivery','scheduled','rental','outstation','wav',
    'pool','airport_transfer','ev','shuttle'
  ));

-- Airport transfer extra fields
ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS flight_number        VARCHAR(20),
  ADD COLUMN IF NOT EXISTS terminal             VARCHAR(20),
  ADD COLUMN IF NOT EXISTS meet_and_greet       BOOLEAN     DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS flight_tracked       BOOLEAN     DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_ev_ride           BOOLEAN     DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS carbon_saved_kg      NUMERIC(8,2) DEFAULT 0;

-- ── 3. Shuttle / Group Rides ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shuttle_routes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(200) NOT NULL,
  city            VARCHAR(100) NOT NULL,
  origin_address  TEXT        NOT NULL,
  origin_lat      NUMERIC(10,6),
  origin_lng      NUMERIC(10,6),
  dest_address    TEXT        NOT NULL,
  dest_lat        NUMERIC(10,6),
  dest_lng        NUMERIC(10,6),
  capacity        INTEGER     NOT NULL DEFAULT 14,
  fare_xaf        INTEGER     NOT NULL,
  schedule_times  TEXT[]      DEFAULT '{}',  -- e.g. ['07:00','08:00','12:00']
  is_active       BOOLEAN     DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shuttle_bookings (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id        UUID        NOT NULL REFERENCES shuttle_routes(id) ON DELETE CASCADE,
  ride_id         UUID        REFERENCES rides(id) ON DELETE SET NULL,
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seats           INTEGER     NOT NULL DEFAULT 1,
  departure_time  VARCHAR(10) NOT NULL,  -- HH:MM
  departure_date  DATE        NOT NULL,
  status          VARCHAR(20) DEFAULT 'confirmed'
                    CHECK (status IN ('confirmed','cancelled','completed')),
  payment_method  VARCHAR(30) DEFAULT 'cash',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shuttle_routes_city   ON shuttle_routes(city, is_active);
CREATE INDEX IF NOT EXISTS idx_shuttle_bookings_user ON shuttle_bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_shuttle_bookings_route ON shuttle_bookings(route_id, departure_date);

-- ── 4. Driver Blocked Riders ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_blocked_riders (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id   UUID        NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  rider_id    UUID        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  reason      TEXT,
  blocked_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(driver_id, rider_id)
);

CREATE INDEX IF NOT EXISTS idx_blocked_riders_driver ON driver_blocked_riders(driver_id);

-- ── 5. Minimum Rider Rating Filter (on drivers) ───────────────────────────────
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS min_rider_rating    NUMERIC(3,2) DEFAULT 0.0
    CHECK (min_rider_rating >= 0 AND min_rider_rating <= 5),
  ADD COLUMN IF NOT EXISTS rider_filter_enabled BOOLEAN     DEFAULT FALSE;

-- ── 6. Deactivation Appeals ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deactivation_appeals (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason          TEXT        NOT NULL,
  details         TEXT,
  evidence_urls   JSONB       DEFAULT '[]',
  status          VARCHAR(20) NOT NULL DEFAULT 'submitted'
                    CHECK (status IN ('submitted','under_review','approved','rejected')),
  reviewed_by     UUID        REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  reviewer_notes  TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appeals_driver ON deactivation_appeals(driver_id);
CREATE INDEX IF NOT EXISTS idx_appeals_status ON deactivation_appeals(status);

-- ── 7. Single Package Delivery Fields (on rides) ──────────────────────────────
ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS package_description   TEXT,
  ADD COLUMN IF NOT EXISTS package_recipient_name  VARCHAR(200),
  ADD COLUMN IF NOT EXISTS package_recipient_phone VARCHAR(30),
  ADD COLUMN IF NOT EXISTS package_photo_url     TEXT,
  ADD COLUMN IF NOT EXISTS package_note          TEXT,   -- comment like Lyft: special instructions
  ADD COLUMN IF NOT EXISTS package_value_xaf     INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS package_signature_required BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS package_delivered_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS package_delivery_otp  VARCHAR(6);

-- ── 8. GDPR Data Deletion Log ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gdpr_deletion_requests (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL,  -- NOT a FK — user may be deleted by the time we process
  email           VARCHAR(255),
  phone           VARCHAR(30),
  reason          TEXT,
  status          VARCHAR(20) DEFAULT 'pending'
                    CHECK (status IN ('pending','processing','completed')),
  requested_at    TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  processed_by    UUID -- admin who confirmed
);

CREATE INDEX IF NOT EXISTS idx_gdpr_status ON gdpr_deletion_requests(status);

-- ── 9. API Key Rotation Audit Log ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_key_rotation_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id      UUID        REFERENCES developer_api_keys(id) ON DELETE SET NULL,
  user_id         UUID        REFERENCES users(id) ON DELETE SET NULL,
  old_key_prefix  VARCHAR(20),   -- first 8 chars of old key for audit
  rotated_by      VARCHAR(20) DEFAULT 'user'
                    CHECK (rotated_by IN ('user','admin','scheduled')),
  rotated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_key_rotation_user ON api_key_rotation_log(user_id);

COMMIT;

-- ── migration_021.sql ─────────────────────────────────────────────
-- Migration 021: Payment audit logs (PCI DSS req 10.2), admin action audit logs,
--               mTLS service certificates table

BEGIN;

-- ── 1. Payment Audit Log (PCI DSS Requirement 10.2) ──────────────────────────
-- Records every payment event for regulatory audit trail.
-- Immutable: no UPDATE/DELETE allowed (enforced via app layer + DB role).
CREATE TABLE IF NOT EXISTS payment_audit_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id      UUID        REFERENCES payments(id) ON DELETE SET NULL,
  ride_id         UUID        REFERENCES rides(id) ON DELETE SET NULL,
  user_id         UUID        REFERENCES users(id) ON DELETE SET NULL,
  event_type      VARCHAR(50) NOT NULL
                    CHECK (event_type IN (
                      'payment_initiated', 'payment_completed', 'payment_failed',
                      'payment_refunded', 'payment_disputed', 'webhook_received',
                      'wallet_debit', 'wallet_credit', 'subscription_charged',
                      'refund_initiated', 'refund_completed'
                    )),
  amount_xaf      INTEGER,
  currency        VARCHAR(10) DEFAULT 'XAF',
  method          VARCHAR(30),
  provider        VARCHAR(50),  -- stripe, mtn, orange, wave, cash, wallet
  provider_ref    VARCHAR(255), -- external transaction ID
  status_before   VARCHAR(30),
  status_after    VARCHAR(30),
  ip_address      INET,
  user_agent      TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Prevent any modification of audit records (defence-in-depth)
-- Revoke UPDATE/DELETE from app role in production via:
--   REVOKE UPDATE, DELETE ON payment_audit_logs FROM mobo_app;

CREATE INDEX IF NOT EXISTS idx_payment_audit_user    ON payment_audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_audit_payment ON payment_audit_logs(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_audit_event   ON payment_audit_logs(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_audit_created ON payment_audit_logs(created_at DESC);

-- ── 2. Admin Action Audit Log ──────────────────────────────────────────────────
-- Records every privileged action taken by admin users.
-- Required for GDPR accountability and internal security investigations.
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id        UUID        REFERENCES users(id) ON DELETE SET NULL,
  admin_email     VARCHAR(255),  -- denormalised for retention after user deletion
  action          VARCHAR(100) NOT NULL,  -- e.g. 'user.deactivate', 'driver.approve'
  resource_type   VARCHAR(50),   -- e.g. 'user', 'driver', 'payment', 'fleet'
  resource_id     UUID,          -- target entity ID
  old_value       JSONB,         -- snapshot before change
  new_value       JSONB,         -- snapshot after change
  ip_address      INET,
  user_agent      TEXT,
  request_id      VARCHAR(100),  -- correlates with application logs
  success         BOOLEAN DEFAULT true,
  error_message   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_admin   ON admin_audit_logs(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action  ON admin_audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target  ON admin_audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_logs(created_at DESC);

-- ── 3. GDPR Data Export Requests (rate-limit tracking + audit) ────────────────
CREATE TABLE IF NOT EXISTS gdpr_export_requests (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        REFERENCES users(id) ON DELETE CASCADE,
  ip_address      INET,
  requested_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gdpr_export_user ON gdpr_export_requests(user_id, requested_at DESC);

-- ── 4. Service TLS Certificate Registry (for mTLS rotation tracking) ──────────
CREATE TABLE IF NOT EXISTS service_certificates (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name    VARCHAR(100) NOT NULL,
  cert_fingerprint VARCHAR(128) NOT NULL,  -- SHA-256 of DER-encoded cert
  common_name     VARCHAR(255),
  issued_at       TIMESTAMPTZ NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  is_active       BOOLEAN DEFAULT true,
  rotated_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_certs_service ON service_certificates(service_name, is_active);
CREATE INDEX IF NOT EXISTS idx_service_certs_expiry  ON service_certificates(expires_at) WHERE is_active = true;

COMMIT;

-- ── migration_022.sql ─────────────────────────────────────────────
-- migration_022: Stripe idempotency keys + webhook event deduplication
-- Prevents double-charges on network retries and duplicate webhook delivery

BEGIN;

-- Add idempotency_key to payments (NULL for legacy rows)
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS idempotency_key UUID;

CREATE UNIQUE INDEX IF NOT EXISTS payments_idempotency_key_idx
  ON payments (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Stripe webhook event log — prevents duplicate processing of retried events
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT NOT NULL UNIQUE,       -- e.g. evt_1ABC...
  event_type    TEXT NOT NULL,                 -- e.g. payment_intent.succeeded
  payment_intent_id TEXT,
  processed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_payload   JSONB
);

CREATE INDEX IF NOT EXISTS stripe_webhook_events_pi_idx
  ON stripe_webhook_events (payment_intent_id);

-- Fraud flags table (needed by Fix #3)
CREATE TABLE IF NOT EXISTS fraud_flags (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id),
  ride_id       UUID REFERENCES rides(id),
  flag_type     TEXT NOT NULL,       -- 'gps_spoofing' | 'ride_collusion' | 'fare_manipulation'
  severity      TEXT NOT NULL DEFAULT 'medium', -- 'low' | 'medium' | 'high' | 'critical'
  details       JSONB NOT NULL DEFAULT '{}',
  resolved      BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_by   UUID REFERENCES users(id),
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fraud_flags_user_idx ON fraud_flags (user_id);
CREATE INDEX IF NOT EXISTS fraud_flags_ride_idx ON fraud_flags (ride_id);
CREATE INDEX IF NOT EXISTS fraud_flags_type_idx ON fraud_flags (flag_type, resolved);
CREATE INDEX IF NOT EXISTS fraud_flags_created_idx ON fraud_flags (created_at DESC);

COMMIT;

-- ── migration_023.sql ─────────────────────────────────────────────
-- migration_023: Field-level encryption + granular RBAC permissions

BEGIN;

-- ── 1. Field-level encryption columns ────────────────────────────────────────
-- Add encrypted columns alongside existing plaintext columns.
-- Migration path: populate encrypted cols, then drop plaintext (future migration).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone_encrypted        TEXT,
  ADD COLUMN IF NOT EXISTS phone_hash             VARCHAR(64),   -- HMAC for lookup
  ADD COLUMN IF NOT EXISTS dob_encrypted          TEXT;          -- date_of_birth encrypted

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS license_number_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS license_number_hash      VARCHAR(64);

ALTER TABLE payment_methods
  ADD COLUMN IF NOT EXISTS phone_encrypted        TEXT,
  ADD COLUMN IF NOT EXISTS phone_hash             VARCHAR(64);

-- Lookup index on hash columns (allows WHERE phone_hash = ? without decrypting)
CREATE INDEX IF NOT EXISTS idx_users_phone_hash    ON users (phone_hash) WHERE phone_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_drivers_lic_hash    ON drivers (license_number_hash) WHERE license_number_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pm_phone_hash       ON payment_methods (phone_hash) WHERE phone_hash IS NOT NULL;

-- ── 2. Granular RBAC permissions ──────────────────────────────────────────────

-- Permission definitions (seed data)
CREATE TABLE IF NOT EXISTS permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL UNIQUE,  -- e.g. 'users:read', 'payments:refund'
  description TEXT,
  category    VARCHAR(50),  -- 'users' | 'payments' | 'rides' | 'drivers' | 'admin'
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Role-permission assignments
CREATE TABLE IF NOT EXISTS role_permissions (
  role        VARCHAR(50)  NOT NULL,  -- 'admin' | 'support' | 'finance' | 'ops'
  permission  VARCHAR(100) NOT NULL REFERENCES permissions(name) ON DELETE CASCADE,
  granted_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (role, permission)
);

-- User-level permission overrides (grant/deny individual permissions)
CREATE TABLE IF NOT EXISTS user_permissions (
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  permission  VARCHAR(100) NOT NULL REFERENCES permissions(name) ON DELETE CASCADE,
  granted     BOOLEAN NOT NULL DEFAULT true,  -- false = explicit deny
  granted_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, permission)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions (user_id);

-- ── 3. Seed permissions ───────────────────────────────────────────────────────

INSERT INTO permissions (name, description, category) VALUES
  ('users:read',           'View user profiles and account details',     'users'),
  ('users:write',          'Edit user profiles',                         'users'),
  ('users:suspend',        'Suspend or unsuspend user accounts',         'users'),
  ('users:delete',         'Permanently delete user accounts (GDPR)',    'users'),
  ('users:export',         'Export user personal data (GDPR)',           'users'),
  ('drivers:read',         'View driver profiles and documents',         'drivers'),
  ('drivers:approve',      'Approve or reject driver applications',      'drivers'),
  ('drivers:suspend',      'Suspend or unsuspend drivers',               'drivers'),
  ('rides:read',           'View ride history and details',              'rides'),
  ('rides:cancel',         'Cancel active rides',                        'rides'),
  ('rides:dispute',        'Manage ride disputes',                       'rides'),
  ('payments:read',        'View payment transactions',                  'payments'),
  ('payments:refund',      'Issue payment refunds',                      'payments'),
  ('payments:audit',       'View PCI audit logs',                        'payments'),
  ('fleet:read',           'View fleet information',                     'fleet'),
  ('fleet:approve',        'Approve fleet registrations',                'fleet'),
  ('admin:audit_logs',     'View admin audit logs',                      'admin'),
  ('admin:system_config',  'Change system configuration',                'admin'),
  ('admin:fraud_review',   'Review and resolve fraud flags',             'admin'),
  ('admin:user_impersonate','Temporarily access a user account',        'admin')
ON CONFLICT (name) DO NOTHING;

-- Assign all permissions to super-admin role
INSERT INTO role_permissions (role, permission)
SELECT 'admin', name FROM permissions
ON CONFLICT DO NOTHING;

-- Support role: read + dispute management, no payment refunds or user deletion
INSERT INTO role_permissions (role, permission)
SELECT 'support', name FROM permissions
WHERE name IN ('users:read','drivers:read','rides:read','rides:cancel','rides:dispute','payments:read','fleet:read')
ON CONFLICT DO NOTHING;

-- Finance role: payment visibility + refunds, no user management
INSERT INTO role_permissions (role, permission)
SELECT 'finance', name FROM permissions
WHERE name IN ('payments:read','payments:refund','payments:audit','rides:read','users:read')
ON CONFLICT DO NOTHING;

-- Ops role: fleet + driver management
INSERT INTO role_permissions (role, permission)
SELECT 'ops', name FROM permissions
WHERE name IN ('drivers:read','drivers:approve','fleet:read','fleet:approve','rides:read','users:read','admin:fraud_review')
ON CONFLICT DO NOTHING;

-- ── 4. Admin sub-role column ──────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS admin_role VARCHAR(50) DEFAULT 'admin';
  -- Values: 'admin' (super), 'support', 'finance', 'ops'

-- ── 5. GDPR right to erasure log ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gdpr_erasure_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,     -- not FK — user will be deleted
  user_email    VARCHAR(255),      -- denormalised for retention
  requested_by  UUID REFERENCES users(id) ON DELETE SET NULL,  -- null = self-request
  reason        TEXT,
  status        VARCHAR(20) DEFAULT 'pending',  -- pending | processing | completed | rejected
  completed_at  TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gdpr_erasure_user   ON gdpr_erasure_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_gdpr_erasure_status ON gdpr_erasure_requests (status, created_at DESC);

COMMIT;

-- ── migration_024.sql ─────────────────────────────────────────────
-- migration_024: tamper-evident audit log table + referral device fingerprinting

-- ── Audit log ────────────────────────────────────────────────────────────────
-- Append-only. The application role (mobo_app) must NOT have UPDATE or DELETE
-- grants on this table. Grants are set at the bottom of this file.

CREATE TABLE IF NOT EXISTS audit_logs (
  id            BIGSERIAL     PRIMARY KEY,
  actor_id      UUID,
  actor_role    TEXT,
  action        TEXT          NOT NULL,
  resource_type TEXT,
  resource_id   TEXT,
  ip            INET,
  user_agent    TEXT,
  outcome       TEXT          NOT NULL CHECK (outcome IN ('success', 'failure', 'blocked')),
  detail        JSONB,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Partition-friendly index for time-range queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at  ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id    ON audit_logs (actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_action      ON audit_logs (action);

-- Revoke modification privileges so rows are truly append-only for the app role
-- (DBA/superuser retains full access for compliance exports)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mobo_app') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM mobo_app;
  END IF;
END$$;

-- ── Referral device fingerprinting ───────────────────────────────────────────
-- Store the device_id that performed each referral so duplicate-device claims
-- can be detected across accounts.

ALTER TABLE users ADD COLUMN IF NOT EXISTS device_id TEXT;
CREATE INDEX IF NOT EXISTS idx_users_device_id ON users (device_id) WHERE device_id IS NOT NULL;

-- ── migration_025.sql ─────────────────────────────────────────────
-- Migration 025: Row-Level Security (RLS) policies
-- Adds PostgreSQL database-level tenant isolation so no application bug
-- can accidentally leak one user's data to another.
--
-- Pattern used:
--   1. Enable RLS on each sensitive table.
--   2. Create a PERMISSIVE policy that allows access only when
--      current_setting('app.current_user_id') matches the row's owner column.
--   3. Service accounts (postgres superuser / Supabase service role) bypass RLS
--      by design — they are used only by the backend, never by end users.
--
-- The application sets the user context at the start of each DB transaction:
--   SET LOCAL app.current_user_id = '<uuid>';
--
-- Tables covered: users, rides, payments, locations, driver_profiles,
--   notifications, support_tickets, trusted_contacts, saved_places,
--   gdpr_deletion_requests, gdpr_erasure_requests, gdpr_export_requests,
--   payment_methods, ride_ratings, fare_splits, preferred_drivers.

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: create the app.current_user_id setting if it does not exist yet.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM set_config('app.current_user_id', '', false);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- users
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_owner_policy ON users;
CREATE POLICY users_owner_policy ON users
  USING (id::text = current_setting('app.current_user_id', true));

-- ─────────────────────────────────────────────────────────────────────────────
-- rides  (accessible to the rider OR the assigned driver)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE rides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rides_participant_policy ON rides;
CREATE POLICY rides_participant_policy ON rides
  USING (
    rider_id::text  = current_setting('app.current_user_id', true)
    OR
    driver_id::text = current_setting('app.current_user_id', true)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- payments
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payments_owner_policy ON payments;
CREATE POLICY payments_owner_policy ON payments
  USING (user_id::text = current_setting('app.current_user_id', true));

-- ─────────────────────────────────────────────────────────────────────────────
-- payment_methods
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_methods_owner_policy ON payment_methods;
CREATE POLICY payment_methods_owner_policy ON payment_methods
  USING (user_id::text = current_setting('app.current_user_id', true));

-- ─────────────────────────────────────────────────────────────────────────────
-- locations  (drivers own their own location rows)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS locations_owner_policy ON locations;
CREATE POLICY locations_owner_policy ON locations
  USING (user_id::text = current_setting('app.current_user_id', true));

-- ─────────────────────────────────────────────────────────────────────────────
-- notifications
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_owner_policy ON notifications;
CREATE POLICY notifications_owner_policy ON notifications
  USING (user_id::text = current_setting('app.current_user_id', true));

-- ─────────────────────────────────────────────────────────────────────────────
-- support_tickets
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_tickets_owner_policy ON support_tickets;
CREATE POLICY support_tickets_owner_policy ON support_tickets
  USING (user_id::text = current_setting('app.current_user_id', true));

-- ─────────────────────────────────────────────────────────────────────────────
-- trusted_contacts
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE trusted_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trusted_contacts_owner_policy ON trusted_contacts;
CREATE POLICY trusted_contacts_owner_policy ON trusted_contacts
  USING (user_id::text = current_setting('app.current_user_id', true));

-- ─────────────────────────────────────────────────────────────────────────────
-- saved_places
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE saved_places ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saved_places_owner_policy ON saved_places;
CREATE POLICY saved_places_owner_policy ON saved_places
  USING (user_id::text = current_setting('app.current_user_id', true));

-- ─────────────────────────────────────────────────────────────────────────────
-- ride_ratings
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE ride_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ride_ratings_participant_policy ON ride_ratings;
CREATE POLICY ride_ratings_participant_policy ON ride_ratings
  USING (
    rater_id::text = current_setting('app.current_user_id', true)
    OR
    rated_id::text = current_setting('app.current_user_id', true)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- fare_splits
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE fare_splits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fare_splits_participant_policy ON fare_splits;
CREATE POLICY fare_splits_participant_policy ON fare_splits
  USING (initiator_id::text = current_setting('app.current_user_id', true));

-- ─────────────────────────────────────────────────────────────────────────────
-- preferred_drivers
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE preferred_drivers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS preferred_drivers_owner_policy ON preferred_drivers;
CREATE POLICY preferred_drivers_owner_policy ON preferred_drivers
  USING (user_id::text = current_setting('app.current_user_id', true));

-- ─────────────────────────────────────────────────────────────────────────────
-- GDPR tables
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE gdpr_deletion_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gdpr_deletion_owner_policy ON gdpr_deletion_requests;
CREATE POLICY gdpr_deletion_owner_policy ON gdpr_deletion_requests
  USING (user_id::text = current_setting('app.current_user_id', true));

ALTER TABLE gdpr_erasure_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gdpr_erasure_owner_policy ON gdpr_erasure_requests;
CREATE POLICY gdpr_erasure_owner_policy ON gdpr_erasure_requests
  USING (user_id::text = current_setting('app.current_user_id', true));

ALTER TABLE gdpr_export_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gdpr_export_owner_policy ON gdpr_export_requests;
CREATE POLICY gdpr_export_owner_policy ON gdpr_export_requests
  USING (user_id::text = current_setting('app.current_user_id', true));

-- ─────────────────────────────────────────────────────────────────────────────
-- developer_api_keys
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE developer_api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS developer_api_keys_owner_policy ON developer_api_keys;
CREATE POLICY developer_api_keys_owner_policy ON developer_api_keys
  USING (user_id::text = current_setting('app.current_user_id', true));

-- ── migration_026.sql ─────────────────────────────────────────────
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

DO $$ BEGIN
  ALTER TABLE deliveries
    ADD CONSTRAINT fk_deliveries_batch
    FOREIGN KEY (batch_id) REFERENCES delivery_batches(id)
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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

-- ── migration_027.sql ─────────────────────────────────────────────
-- migration_027: Message TTL + Multi-currency support
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Message TTL ────────────────────────────────────────────────────────────
-- Add expires_at so the nightly purge job can DELETE in a simple index scan.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Backfill: existing messages expire 90 days after they were created.
UPDATE messages
   SET expires_at = created_at + INTERVAL '90 days'
 WHERE expires_at IS NULL;

-- Set a server-side default so future inserts are covered automatically.
ALTER TABLE messages
  ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '90 days');

-- Index to make the nightly purge cheap (partial: only un-expired rows matter
-- for the live query path; expired ones are purged by the job).
CREATE INDEX IF NOT EXISTS idx_messages_expires_at
  ON messages (expires_at)
  WHERE expires_at IS NOT NULL;

-- ── 2. Quick replies table (optional override — static defaults live in code) ──
-- Allows ops to add/translate quick-reply strings without a code deploy.
CREATE TABLE IF NOT EXISTS quick_replies (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role        VARCHAR(10)  NOT NULL CHECK (role IN ('rider','driver')),
  context     VARCHAR(20)  NOT NULL CHECK (context IN ('waiting','arriving','in_progress','general')),
  locale      CHAR(5)      NOT NULL DEFAULT 'en',
  text        TEXT         NOT NULL,
  display_order SMALLINT   NOT NULL DEFAULT 0,
  is_active   BOOLEAN      DEFAULT true,
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quick_replies_lookup
  ON quick_replies (role, context, locale, is_active);

-- ── 3. Country / currency configuration ───────────────────────────────────────
-- Stores the canonical currency for each country MOBO operates in.
-- xaf_rate_x1000: how many local currency units equal 1000 XAF (integer math).
--   e.g. NGN: 2750 → 1 XAF = 2.75 NGN
--        KES:  210 → 1 XAF = 0.21 KES
--        ZAR:   31 → 1 XAF = 0.031 ZAR
-- Rates are approximate and should be updated periodically via an ops migration.
CREATE TABLE IF NOT EXISTS country_currency_config (
  country_code    CHAR(2)      PRIMARY KEY,   -- ISO 3166-1 alpha-2
  country_name    VARCHAR(100) NOT NULL,
  currency_code   CHAR(3)      NOT NULL,       -- ISO 4217
  currency_symbol VARCHAR(10)  NOT NULL,
  xaf_rate_x1000  INTEGER      NOT NULL CHECK (xaf_rate_x1000 > 0),
  -- Stripe currency code (lowercase) — NULL if Stripe not available for this market
  stripe_currency CHAR(3),
  -- Primary mobile-money provider for this country (NULL = card/wallet only)
  mobile_money_provider VARCHAR(30),
  is_active       BOOLEAN      DEFAULT true,
  updated_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- ── Seed: all countries where MOBO is initially live ─────────────────────────
INSERT INTO country_currency_config
  (country_code, country_name, currency_code, currency_symbol, xaf_rate_x1000, stripe_currency, mobile_money_provider)
VALUES
  -- CFA Franc zone (XAF is native — rate 1000 = parity)
  ('CM', 'Cameroon',      'XAF', 'FCFA', 1000, 'xaf', 'mtn_mobile_money'),
  ('CI', 'Ivory Coast',   'XOF', 'CFA',   997, 'xof', 'orange_money'),   -- XOF ≈ XAF (both pegged 1:1 to EUR at 655.957)
  ('GA', 'Gabon',         'XAF', 'FCFA', 1000, 'xaf', 'airtel_money'),
  ('BJ', 'Benin',         'XOF', 'CFA',   997, 'xof', 'mtn_mobile_money'),
  ('NE', 'Niger',         'XOF', 'CFA',   997, 'xof', 'orange_money'),
  -- Non-XAF African markets
  ('NG', 'Nigeria',       'NGN', '₦',    2750, 'ngn', 'flutterwave'),
  ('KE', 'Kenya',         'KES', 'KSh',   210, 'kes', 'mpesa'),
  ('ZA', 'South Africa',  'ZAR', 'R',      31, 'zar', NULL),
  -- Additional high-opportunity markets
  ('GH', 'Ghana',         'GHS', 'GH₵',    16, 'ghs', 'mtn_mobile_money'),
  ('TZ', 'Tanzania',      'TZS', 'TSh',   450, 'tzs', 'mpesa'),
  ('UG', 'Uganda',        'UGX', 'USh',  6700, 'ugx', 'mtn_mobile_money'),
  ('RW', 'Rwanda',        'RWF', 'RF',    200, 'rwf', 'mtn_mobile_money'),
  ('SN', 'Senegal',       'XOF', 'CFA',   997, 'xof', 'wave'),
  ('ET', 'Ethiopia',      'ETB', 'Br',    110, NULL,   NULL),
  ('EG', 'Egypt',         'EGP', 'E£',    820, 'egp',  NULL)
ON CONFLICT (country_code) DO UPDATE
  SET country_name          = EXCLUDED.country_name,
      currency_code         = EXCLUDED.currency_code,
      currency_symbol       = EXCLUDED.currency_symbol,
      xaf_rate_x1000        = EXCLUDED.xaf_rate_x1000,
      stripe_currency       = EXCLUDED.stripe_currency,
      mobile_money_provider = EXCLUDED.mobile_money_provider,
      updated_at            = NOW();

-- ── migration_028.sql ─────────────────────────────────────────────
-- migration_028: Add country_code (ISO alpha-2) to users table
-- Enables precise currency resolution without relying on free-text country names.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add the column (nullable first so backfill can run without constraint issues)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS country_code CHAR(2);

-- 2. Backfill from existing free-text country field using a CASE map.
--    Any unrecognised value stays NULL and the app falls back to 'CM'.
UPDATE users
SET country_code = CASE country
  WHEN 'Cameroon'      THEN 'CM'
  WHEN 'Nigeria'       THEN 'NG'
  WHEN 'Kenya'         THEN 'KE'
  WHEN 'South Africa'  THEN 'ZA'
  WHEN 'Ivory Coast'   THEN 'CI'
  WHEN 'Côte d''Ivoire' THEN 'CI'
  WHEN 'Gabon'         THEN 'GA'
  WHEN 'Benin'         THEN 'BJ'
  WHEN 'Niger'         THEN 'NE'
  WHEN 'Ghana'         THEN 'GH'
  WHEN 'Tanzania'      THEN 'TZ'
  WHEN 'Uganda'        THEN 'UG'
  WHEN 'Rwanda'        THEN 'RW'
  WHEN 'Senegal'       THEN 'SN'
  WHEN 'Ethiopia'      THEN 'ET'
  WHEN 'Egypt'         THEN 'EG'
  ELSE NULL
END
WHERE country_code IS NULL;

-- 3. Default remaining NULLs to Cameroon (safe fallback for legacy rows)
UPDATE users SET country_code = 'CM' WHERE country_code IS NULL;

-- 4. Now that backfill is complete, apply NOT NULL + default
ALTER TABLE users
  ALTER COLUMN country_code SET NOT NULL,
  ALTER COLUMN country_code SET DEFAULT 'CM';

-- 5. FK to country_currency_config ensures only supported country codes are stored
--    (DEFERRABLE so bulk inserts don't race with the config table seed)
DO $$ BEGIN
  ALTER TABLE users
    ADD CONSTRAINT fk_users_country_currency
      FOREIGN KEY (country_code)
      REFERENCES country_currency_config (country_code)
      ON UPDATE CASCADE
      DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 6. Index for fast currency lookups without full table scans
CREATE INDEX IF NOT EXISTS idx_users_country_code ON users (country_code);

-- 7. Add country_code to the drivers table as a convenience denorm
--    (resolved from the linked user record on read; stored here for fast queries)
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS country_code CHAR(2)
    REFERENCES country_currency_config (country_code)
    ON UPDATE CASCADE
    DEFERRABLE INITIALLY DEFERRED;

UPDATE drivers d
   SET country_code = u.country_code
  FROM users u
 WHERE d.user_id = u.id
   AND d.country_code IS NULL;

-- 8. Currency preference for wallet top-ups (riders can top up in local currency)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferred_currency CHAR(3)
    GENERATED ALWAYS AS (
      CASE country_code
        WHEN 'NG' THEN 'NGN'
        WHEN 'KE' THEN 'KES'
        WHEN 'ZA' THEN 'ZAR'
        WHEN 'GH' THEN 'GHS'
        WHEN 'TZ' THEN 'TZS'
        WHEN 'UG' THEN 'UGX'
        WHEN 'RW' THEN 'RWF'
        WHEN 'ET' THEN 'ETB'
        WHEN 'EG' THEN 'EGP'
        WHEN 'CI' THEN 'XOF'
        WHEN 'BJ' THEN 'XOF'
        WHEN 'NE' THEN 'XOF'
        WHEN 'SN' THEN 'XOF'
        ELSE 'XAF'
      END
    ) STORED;

-- ── migration_029.sql ─────────────────────────────────────────────
-- migration_029.sql
-- Teen account safety enhancements
-- 2026-04-09

-- Ensure date_of_birth and teen safety fields exist on users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS date_of_birth       DATE,
  ADD COLUMN IF NOT EXISTS curfew_start_hour   SMALLINT DEFAULT 22,  -- 10 PM
  ADD COLUMN IF NOT EXISTS curfew_end_hour     SMALLINT DEFAULT 6,   -- 6 AM
  ADD COLUMN IF NOT EXISTS teen_ride_notifications BOOLEAN DEFAULT true;

-- Index: quickly find all teen accounts for a parent
CREATE INDEX IF NOT EXISTS idx_users_parent_id ON users (parent_id) WHERE is_teen_account = true;

-- Track teen ride bookings for parental review
CREATE TABLE IF NOT EXISTS teen_ride_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teen_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ride_id        UUID REFERENCES rides(id) ON DELETE SET NULL,
  action         TEXT NOT NULL CHECK (action IN ('requested','accepted','completed','cancelled','blocked')),
  block_reason   TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teen_ride_log_parent ON teen_ride_log (parent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_teen_ride_log_teen   ON teen_ride_log (teen_id,   created_at DESC);

COMMENT ON TABLE teen_ride_log IS 'Audit log of all ride events for teen accounts, visible to parents.';
COMMENT ON COLUMN users.curfew_start_hour IS 'Hour (0-23 UTC) after which teen cannot book rides. Default 22 = 10 PM.';
COMMENT ON COLUMN users.curfew_end_hour   IS 'Hour (0-23 UTC) before which teen cannot book rides. Default 6 = 6 AM.';

-- ── migration_030.sql ─────────────────────────────────────────────
-- migration_030.sql
-- GDPR consent management (Article 6 — lawful basis for data processing)
-- 2026-04-10
--
-- Tracks explicit consent per user per processing purpose.
-- Required for GDPR Article 6(1)(a) lawful basis and Article 7 (right to withdraw).

-- ── 1. Consent records ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_consents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Purpose identifies what the consent covers.
  -- Standard purposes (extend as needed):
  --   'terms_of_service'   — required to use MOBO
  --   'privacy_policy'     — required, links to full policy
  --   'marketing_sms'      — optional, promotional messages
  --   'marketing_email'    — optional, promotional emails
  --   'location_tracking'  — required for ride booking
  --   'data_analytics'     — optional, anonymised analytics
  --   'third_party_share'  — optional, sharing with partners
  purpose         VARCHAR(60) NOT NULL,

  -- The version of the document the user consented to (e.g. "2024-01-01")
  -- Lets us re-prompt users when terms change.
  document_version VARCHAR(20) NOT NULL DEFAULT 'v1',

  -- Consent state
  is_granted      BOOLEAN NOT NULL,
  granted_at      TIMESTAMPTZ,
  withdrawn_at    TIMESTAMPTZ,

  -- Audit trail
  ip_address      INET,
  user_agent      TEXT,
  channel         VARCHAR(20) DEFAULT 'app',  -- 'app' | 'web' | 'ussd' | 'admin'

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  -- Only one active record per user + purpose
  UNIQUE (user_id, purpose)
);

CREATE INDEX IF NOT EXISTS idx_user_consents_user    ON user_consents (user_id);
CREATE INDEX IF NOT EXISTS idx_user_consents_purpose ON user_consents (purpose, is_granted);

COMMENT ON TABLE user_consents IS
  'GDPR Article 6 consent log — one row per user per processing purpose. '
  'is_granted=true means consent active; set is_granted=false + withdrawn_at to record withdrawal.';

-- ── 2. Consent change audit log (append-only) ────────────────────────────────
-- Immutable record of every consent state change for regulatory evidence.
CREATE TABLE IF NOT EXISTS consent_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose         VARCHAR(60) NOT NULL,
  document_version VARCHAR(20),
  action          VARCHAR(20) NOT NULL CHECK (action IN ('granted', 'withdrawn', 'updated')),
  ip_address      INET,
  user_agent      TEXT,
  channel         VARCHAR(20),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consent_audit_user ON consent_audit_log (user_id, created_at DESC);

COMMENT ON TABLE consent_audit_log IS
  'Append-only audit trail of consent changes. Never UPDATE or DELETE rows here.';

-- ── 3. Seed: mandatory consent purposes ─────────────────────────────────────
-- Not inserting rows for users — consent is captured at signup.
-- This table just documents the known purposes for reference.
CREATE TABLE IF NOT EXISTS consent_purposes (
  purpose         VARCHAR(60) PRIMARY KEY,
  display_name    VARCHAR(120) NOT NULL,
  description     TEXT,
  is_required     BOOLEAN NOT NULL DEFAULT false,  -- required = cannot be withdrawn
  legal_basis     VARCHAR(30) NOT NULL DEFAULT 'consent',  -- 'consent' | 'contract' | 'legitimate_interest'
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO consent_purposes (purpose, display_name, is_required, legal_basis, description) VALUES
  ('terms_of_service',  'Terms of Service',         true,  'contract',             'Acceptance of MOBO Terms of Service'),
  ('privacy_policy',    'Privacy Policy',            true,  'contract',             'Acknowledgment of MOBO Privacy Policy'),
  ('location_tracking', 'Location Services',         true,  'contract',             'Real-time GPS location sharing required for ride booking'),
  ('marketing_sms',     'Promotional SMS',           false, 'consent',              'Receive promotional offers and ride discounts via SMS'),
  ('marketing_email',   'Promotional Emails',        false, 'consent',              'Receive newsletters and promotional emails'),
  ('data_analytics',    'Analytics & Improvement',   false, 'legitimate_interest',  'Anonymised usage data to improve MOBO services'),
  ('third_party_share', 'Partner Data Sharing',      false, 'consent',              'Sharing anonymised trip data with insurance and logistics partners')
ON CONFLICT (purpose) DO NOTHING;

-- ── migration_031.sql ─────────────────────────────────────────────
-- migration_031.sql
-- Surge price cap: add max_multiplier column to surge_zones
-- Ensures no zone can push surge above the cap even if data is misconfigured.
-- Application code also enforces MAX_SURGE_MULTIPLIER = 3.5 as a defense-in-depth layer.
-- 2026-04-10

ALTER TABLE surge_zones
  ADD COLUMN IF NOT EXISTS max_multiplier NUMERIC(4,2) DEFAULT 3.50;

-- Back-fill: existing zones cap at 3.5x (Bolt-equivalent ceiling)
UPDATE surge_zones SET max_multiplier = 3.50 WHERE max_multiplier IS NULL;

-- Also ensure the multiplier column itself cannot exceed the cap at insertion time
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'surge_zones' AND constraint_name = 'chk_surge_max'
  ) THEN
    ALTER TABLE surge_zones
      ADD CONSTRAINT chk_surge_max CHECK (multiplier <= COALESCE(max_multiplier, 3.50));
  END IF;
END $$;

COMMENT ON COLUMN surge_zones.max_multiplier IS
  'Hard ceiling for surge multiplier in this zone (default 3.50×). '
  'Application code applies MIN(actual_multiplier, 3.50) as defense-in-depth.';

-- ── migration_032.sql ─────────────────────────────────────────────
-- migration_032.sql
-- MOBO Hourly + Rider Identity Verification + Upfront Pricing improvements
-- 2026-04-10

-- ── 1. MOBO Hourly: add 10-hour package support ───────────────────────────────
-- The rental_package column is VARCHAR; just documenting the new allowed value.
-- Application code already validates against RENTAL_PACKAGES constant.
-- No schema change needed — the 10h package is enforced in code.

-- ── 2. Rider identity verification improvements ───────────────────────────────
-- is_rider_verified was added in migration_020. Ensure rider_verified_at exists.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS rider_verified_at TIMESTAMPTZ;

-- ── 3. Ride stops: track max stop limit per rider tier ────────────────────────
-- No schema change — stops are stored as JSONB, limit enforced in application code.

-- ── 4. Share trip: ensure driver_locations table has needed columns ───────────
-- driver_locations is expected by shareTripController to provide live location to non-app viewers.
CREATE TABLE IF NOT EXISTS driver_locations (
  driver_id   UUID PRIMARY KEY REFERENCES drivers(id) ON DELETE CASCADE,
  latitude    NUMERIC(10, 7) NOT NULL,
  longitude   NUMERIC(10, 7) NOT NULL,
  heading     NUMERIC(5, 2),
  speed       NUMERIC(6, 2),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_locations_updated ON driver_locations (updated_at DESC);

COMMENT ON TABLE driver_locations IS
  'Latest GPS position per driver — updated on every location socket event. '
  'Used by public share-trip endpoint so family/friends can track without the app.';

-- ── 5. Ride recordings: add accessed_by audit column if not present ──────────
ALTER TABLE ride_recordings
  ADD COLUMN IF NOT EXISTS accessed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accessed_at TIMESTAMPTZ;

COMMENT ON COLUMN ride_recordings.accessed_by IS
  'Admin user who last accessed this recording — audit trail for dispute resolution.';

-- ── 6. Scheduled rides: ensure 30-day advance booking is enforced at DB level ─
-- Application code enforces the 30-day window; this constraint is defense-in-depth.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'rides' AND constraint_name = 'chk_scheduled_at_max_advance'
  ) THEN
    ALTER TABLE rides
      ADD CONSTRAINT chk_scheduled_at_max_advance
        CHECK (scheduled_at IS NULL OR scheduled_at <= NOW() + INTERVAL '30 days' + INTERVAL '1 minute');
  END IF;
END $$;

-- ── migration_033.sql ─────────────────────────────────────────────
-- migration_033.sql
-- Admin staff management, role management, soft deletes
-- 2026-04-10

-- ── 1. Soft-delete columns on core tables ────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_deleted  BOOLEAN    NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ;

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS is_deleted  BOOLEAN    NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ;

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS is_deleted  BOOLEAN    NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ;

-- Partial indexes: fast lookup of active records
CREATE INDEX IF NOT EXISTS idx_users_not_deleted   ON users   (id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_drivers_not_deleted ON drivers (id) WHERE is_deleted = false;

-- ── 2. Admin roles registry ───────────────────────────────────────────────────
-- Tracks all named admin sub-roles (both system-defined and custom).
-- The name column matches users.admin_role and role_permissions.role (VARCHAR).
CREATE TABLE IF NOT EXISTS admin_roles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(50)  NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  description  TEXT,
  is_system    BOOLEAN      NOT NULL DEFAULT false,  -- system roles: protected from archive
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);

-- Seed system roles
INSERT INTO admin_roles (name, display_name, description, is_system) VALUES
  ('admin',      'Super Admin',   'Full system access including staff and role management', true),
  ('full_admin', 'Full Admin',    'Full data access — cannot manage admin staff or roles',  true),
  ('support',    'Support',       'Customer support: read + dispute management',            true),
  ('finance',    'Finance',       'Financial data, payment visibility, and refunds',        true),
  ('ops',        'Operations',    'Fleet and driver management',                             true),
  ('read_write', 'Read & Write',  'View and edit all data — no archive or admin actions',   true),
  ('read_only',  'Read Only',     'View all data — no modifications permitted',             true)
ON CONFLICT (name) DO NOTHING;

-- ── 3. New permissions ────────────────────────────────────────────────────────
INSERT INTO permissions (name, description, category) VALUES
  ('users:archive',        'Archive (soft-delete) rider accounts',           'users'),
  ('drivers:write',        'Edit driver profiles and documents',             'drivers'),
  ('drivers:archive',      'Archive (soft-delete) driver accounts',          'drivers'),
  ('vehicles:read',        'View vehicle details',                           'vehicles'),
  ('vehicles:write',       'Edit vehicle information',                       'vehicles'),
  ('vehicles:archive',     'Archive (soft-delete) vehicles',                 'vehicles'),
  ('admin:manage_staff',   'Create, edit, and archive admin staff accounts', 'admin'),
  ('admin:manage_roles',   'Create, edit, and archive custom roles',         'admin'),
  ('admin:erasure_execute','Execute GDPR right-to-erasure requests',         'admin'),
  ('surge:read',           'View surge pricing zones',                       'surge'),
  ('surge:write',          'Create and manage surge pricing zones',          'surge'),
  ('promotions:read',      'View promotions and discount codes',             'promotions'),
  ('promotions:write',     'Create and manage promotions',                   'promotions'),
  ('notifications:send',   'Send push notifications to users',               'notifications'),
  ('settings:write',       'Change system-level configuration settings',     'settings')
ON CONFLICT (name) DO NOTHING;

-- Grant ALL permissions to super-admin role (including the new ones above)
INSERT INTO role_permissions (role, permission)
SELECT 'admin', name FROM permissions
ON CONFLICT DO NOTHING;

-- full_admin: everything except staff/role management and impersonation
INSERT INTO role_permissions (role, permission)
SELECT 'full_admin', name FROM permissions
WHERE name NOT IN ('admin:manage_staff', 'admin:manage_roles', 'admin:user_impersonate')
ON CONFLICT DO NOTHING;

-- read_write: read + write — no archive, no admin actions
INSERT INTO role_permissions (role, permission)
SELECT 'read_write', name FROM permissions
WHERE name IN (
  'users:read', 'users:write', 'users:suspend', 'users:export',
  'drivers:read', 'drivers:write', 'drivers:approve', 'drivers:suspend',
  'vehicles:read', 'vehicles:write',
  'rides:read', 'rides:cancel', 'rides:dispute',
  'payments:read',
  'fleet:read', 'fleet:approve',
  'surge:read', 'promotions:read',
  'notifications:send',
  'admin:audit_logs'
)
ON CONFLICT DO NOTHING;

-- read_only: read permissions only — no modifications whatsoever
INSERT INTO role_permissions (role, permission)
SELECT 'read_only', name FROM permissions
WHERE name IN (
  'users:read', 'drivers:read', 'vehicles:read',
  'rides:read', 'payments:read', 'fleet:read',
  'surge:read', 'promotions:read', 'admin:audit_logs'
)
ON CONFLICT DO NOTHING;

-- ── 4. Track who created admin users ─────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- ── migration_034.sql ─────────────────────────────────────────────
-- migration_034.sql
-- Data access audit, admin notifications, encrypted document storage
-- 2026-04-10

-- ── 1. Data access log ────────────────────────────────────────────────────────
-- Records every time an admin views, downloads, exports, or reveals PII.
-- Separate from admin_audit_logs (which tracks writes) — this tracks reads.
CREATE TABLE IF NOT EXISTS data_access_logs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  accessed_by       UUID        REFERENCES users(id) ON DELETE SET NULL,
  accessor_email    VARCHAR(255),               -- denormalised for retention
  accessor_role     VARCHAR(50),
  resource_type     VARCHAR(50)  NOT NULL,      -- 'user' | 'driver' | 'vehicle' | 'document'
  resource_id       UUID,
  resource_owner    TEXT,                       -- denormalised display name
  action            VARCHAR(50)  NOT NULL,      -- 'view' | 'download' | 'export' | 'reveal_field' | 'file_upload'
  fields_accessed   TEXT[],                     -- e.g. {'phone','national_id'}
  ip_address        INET,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dal_accessor   ON data_access_logs (accessed_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dal_resource   ON data_access_logs (resource_type, resource_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dal_created    ON data_access_logs (created_at DESC);

-- ── 2. Admin notifications ────────────────────────────────────────────────────
-- Push notifications shown in the admin dashboard notification bell.
-- Generated automatically when sensitive data is accessed.
CREATE TABLE IF NOT EXISTS admin_notifications (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id  UUID        REFERENCES users(id) ON DELETE CASCADE,  -- NULL = all super-admins
  type          VARCHAR(50) NOT NULL,   -- 'data_access' | 'file_upload' | 'staff_created' | 'suspicious'
  title         TEXT        NOT NULL,
  message       TEXT        NOT NULL,
  metadata      JSONB,
  is_read       BOOLEAN     NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_recipient ON admin_notifications (recipient_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_broadcast ON admin_notifications (recipient_id, created_at DESC) WHERE recipient_id IS NULL;

-- ── 3. Encrypted document store ───────────────────────────────────────────────
-- All user/driver documents are stored AES-256-GCM encrypted at rest.
-- The application layer handles encrypt-on-upload / decrypt-on-download.
CREATE TABLE IF NOT EXISTS user_documents (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doc_type        VARCHAR(50) NOT NULL,  -- 'national_id' | 'driver_license' | 'vehicle_photo'
                                         -- | 'insurance' | 'profile_photo' | 'other'
  file_name       TEXT        NOT NULL,
  mime_type       VARCHAR(100),
  encrypted_data  TEXT        NOT NULL,  -- AES-256-GCM ciphertext, base64-encoded
  encryption_iv   VARCHAR(64) NOT NULL,  -- base64 IV used for this document
  file_size_kb    INTEGER,
  uploaded_by     UUID        REFERENCES users(id) ON DELETE SET NULL,
  verified        BOOLEAN     NOT NULL DEFAULT false,
  verified_by     UUID        REFERENCES users(id) ON DELETE SET NULL,
  verified_at     TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_userdoc_user     ON user_documents (user_id, doc_type);
CREATE INDEX IF NOT EXISTS idx_userdoc_active   ON user_documents (user_id) WHERE deleted_at IS NULL;

COMMENT ON TABLE user_documents IS
  'Encrypted document store for riders, drivers, and vehicles. '
  'All data is AES-256-GCM encrypted before INSERT. '
  'Access is logged in data_access_logs and triggers admin_notifications.';

-- ── 4. Encrypted PII columns ──────────────────────────────────────────────────
-- Extend existing users/drivers tables with encrypted PII columns.
-- Application encrypts on write; existing plaintext columns kept for migration period.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS full_name_encrypted   TEXT,   -- AES-encrypted full name
  ADD COLUMN IF NOT EXISTS email_encrypted       TEXT,   -- AES-encrypted email
  ADD COLUMN IF NOT EXISTS national_id_encrypted TEXT;   -- AES-encrypted national ID

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS national_id_encrypted TEXT;

-- ── 5. Track last access on user profiles ─────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_accessed_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_accessed_at   TIMESTAMPTZ;

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS last_accessed_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_accessed_at   TIMESTAMPTZ;

-- ── migration_035.sql ─────────────────────────────────────────────
-- Migration 035: Vehicle categories, inspections, driver shift-selfie, police emergency contacts
-- Features:
--   1. New ride/vehicle categories: luxury, taxi, private, van (+ fix ride_type constraint)
--   2. vehicle_category on vehicles table
--   3. vehicle_inspections workflow (FREE NOW / Uber style)
--   4. driver_selfie_checks — Real-Time ID check before each shift (Uber style)
--   5. police_emergency_contacts — per-country emergency numbers for SOS dispatch
-- Run: node database/run_migrations.js

-- ── 1. Fix ride_type constraint to match actual code values ──────────────────
ALTER TABLE rides DROP CONSTRAINT IF EXISTS rides_ride_type_check;
ALTER TABLE rides ADD CONSTRAINT rides_ride_type_check
  CHECK (ride_type IN (
    'moto','benskin','standard','xl','women',
    'luxury','taxi','private','van',
    'delivery','scheduled','rental','outstation',
    'shared','comfort','ev','wav','pool'
  ));

-- ── 2. vehicle_category on vehicles ──────────────────────────────────────────
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS vehicle_category VARCHAR(30) DEFAULT 'standard'
  CHECK (vehicle_category IN ('moto','benskin','standard','xl','luxury','taxi','private','van'));

CREATE INDEX IF NOT EXISTS idx_vehicles_category ON vehicles(vehicle_category);

-- ── 3. vehicle_inspections ───────────────────────────────────────────────────
-- Modeled on FREE NOW / Uber annual + triggered inspections
CREATE TABLE IF NOT EXISTS vehicle_inspections (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id        UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  driver_id         UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  inspection_type   VARCHAR(30) NOT NULL DEFAULT 'routine'
    CHECK (inspection_type IN ('routine','pre_shift','annual','triggered','compliance')),
  status            VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','submitted','approved','rejected','expired')),

  -- Checklist items (driver self-reports, admin verifies)
  exterior_ok       BOOLEAN,
  interior_ok       BOOLEAN,
  tires_ok          BOOLEAN,
  brakes_ok         BOOLEAN,
  lights_ok         BOOLEAN,
  windshield_ok     BOOLEAN,
  seatbelts_ok      BOOLEAN,
  airbags_ok        BOOLEAN,
  first_aid_ok      BOOLEAN,
  fire_ext_ok       BOOLEAN,

  -- Photos (URLs after upload)
  photo_front       TEXT,
  photo_rear        TEXT,
  photo_driver_side TEXT,
  photo_passenger_side TEXT,
  photo_interior    TEXT,
  photo_dashboard   TEXT,

  -- Odometer reading
  odometer_km       INTEGER,

  -- Driver notes
  driver_notes      TEXT,

  -- Admin review
  reviewed_by       UUID REFERENCES users(id),
  reviewed_at       TIMESTAMPTZ,
  admin_notes       TEXT,
  rejection_reason  TEXT,

  -- Scheduling
  due_date          DATE,
  completed_at      TIMESTAMPTZ,

  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inspections_vehicle   ON vehicle_inspections(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_inspections_driver    ON vehicle_inspections(driver_id);
CREATE INDEX IF NOT EXISTS idx_inspections_status    ON vehicle_inspections(status);
CREATE INDEX IF NOT EXISTS idx_inspections_due       ON vehicle_inspections(due_date);

-- Track last inspection on vehicles for quick lookup
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS last_inspection_id UUID REFERENCES vehicle_inspections(id);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS last_inspection_at TIMESTAMPTZ;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS inspection_status  VARCHAR(20) DEFAULT 'not_inspected';

-- ── 4. driver_selfie_checks (Uber Real-Time ID Check) ────────────────────────
-- Required before driver goes online each shift
CREATE TABLE IF NOT EXISTS driver_selfie_checks (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id     UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id)  ON DELETE CASCADE,

  -- Smile ID / liveness result
  selfie_url    TEXT NOT NULL,
  match_score   DECIMAL(5,4),             -- 0.0000 – 1.0000
  liveness_score DECIMAL(5,4),
  status        VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','passed','failed','manual_review')),
  provider      VARCHAR(30) DEFAULT 'smile_id',
  provider_ref  TEXT,

  -- When
  shift_date    DATE DEFAULT CURRENT_DATE,
  checked_at    TIMESTAMPTZ DEFAULT NOW(),
  expires_at    TIMESTAMPTZ,  -- set at insert: checked_at + 12 hours

  -- Failure handling
  failure_reason TEXT,
  attempt_count  SMALLINT DEFAULT 1,

  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_selfie_driver   ON driver_selfie_checks(driver_id, shift_date);
CREATE INDEX IF NOT EXISTS idx_selfie_status   ON driver_selfie_checks(status);

-- Track on drivers table for fast online-toggle gate
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS last_selfie_check_id  UUID REFERENCES driver_selfie_checks(id);
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS last_selfie_passed_at TIMESTAMPTZ;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS selfie_check_required  BOOLEAN DEFAULT false;

-- ── 5. police_emergency_contacts (per-country SOS dispatch) ──────────────────
CREATE TABLE IF NOT EXISTS police_emergency_contacts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_code CHAR(2) NOT NULL,
  city         TEXT,
  agency_name  TEXT NOT NULL,
  phone        TEXT NOT NULL,
  sms_capable  BOOLEAN DEFAULT false,
  api_endpoint TEXT,           -- Optional REST endpoint for direct dispatch
  priority     SMALLINT DEFAULT 1,
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_police_country ON police_emergency_contacts(country_code, is_active);

-- Seed data — African market emergency numbers
INSERT INTO police_emergency_contacts (country_code, city, agency_name, phone, sms_capable, priority) VALUES
  ('CM', NULL,     'Police Cameroun',              '117',    false, 1),
  ('CM', NULL,     'Gendarmerie Cameroun',          '113',    false, 2),
  ('CM', NULL,     'Pompiers / SAMU Cameroun',      '118',    false, 3),
  ('NG', NULL,     'Nigeria Police Force',           '112',    false, 1),
  ('NG', NULL,     'Nigeria Emergency (NEMA)',       '0800-CALL-NEMA', false, 2),
  ('KE', NULL,     'Kenya Police',                   '999',    false, 1),
  ('KE', NULL,     'Kenya Emergency',                '112',    false, 2),
  ('CI', NULL,     'Police Côte d''Ivoire',         '111',    false, 1),
  ('CI', NULL,     'Gendarmerie Côte d''Ivoire',    '110',    false, 2),
  ('GA', NULL,     'Police Gabon',                   '1730',   false, 1),
  ('BJ', NULL,     'Police Bénin',                   '117',    false, 1),
  ('NE', NULL,     'Police Niger',                   '17',     false, 1),
  ('ZA', NULL,     'South Africa Police (SAPS)',     '10111',  false, 1),
  ('ZA', NULL,     'South Africa Emergency',         '112',    false, 2)
ON CONFLICT DO NOTHING;

-- Police dispatch audit log (standalone, no dependency on sos_events table)
CREATE TABLE IF NOT EXISTS sos_police_dispatches (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id          UUID REFERENCES rides(id) ON DELETE SET NULL,
  triggered_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  country_code     CHAR(2),
  police_agency    TEXT,
  police_phone     TEXT,
  dispatch_method  VARCHAR(20) DEFAULT 'sms',
  dispatched_at    TIMESTAMPTZ DEFAULT NOW(),
  anonymous_call   BOOLEAN DEFAULT false
);

-- ── migration_036.sql ─────────────────────────────────────────────
-- Migration 036: Least-privilege database roles (SEC-004)
-- Creates one PostgreSQL role per service with only the access it needs.
-- Previously all services shared a single superuser DATABASE_URL.
--
-- Roles created:
--   mobo_user_svc   → user-service   (users, auth, GDPR, KYC, fleet)
--   mobo_ride_svc   → ride-service   (ride lifecycle, fare, inspections, surge)
--   mobo_pay_svc    → payment-service (wallets, payments, refunds)
--   mobo_loc_svc    → location-service (driver GPS, safety)
--   mobo_readonly   → read replicas / analytics / reporting (SELECT only)
--
-- After applying:
--   1. Set per-service DATABASE_URL env vars in Render dashboard / .env files
--   2. Rotate the CHANGE_ME passwords to strong random values before use
--   3. The master DATABASE_URL (superuser) is only used for migrations
--
-- Run: node database/run_migrations.js

-- ── Helper: conditional per-table grant (skips tables that don't exist yet) ──
-- We use a DO block so this migration is safe to run on any schema state.
CREATE OR REPLACE FUNCTION _grant_if_exists(
  p_privilege TEXT,
  p_table     TEXT,
  p_role      TEXT
) RETURNS void AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = p_table
  ) THEN
    EXECUTE format('GRANT %s ON %I TO %I', p_privilege, p_table, p_role);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ── 1. Create roles (idempotent) ──────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mobo_user_svc') THEN
    CREATE ROLE mobo_user_svc WITH LOGIN PASSWORD 'CHANGE_ME_user_svc';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mobo_ride_svc') THEN
    CREATE ROLE mobo_ride_svc WITH LOGIN PASSWORD 'CHANGE_ME_ride_svc';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mobo_pay_svc') THEN
    CREATE ROLE mobo_pay_svc WITH LOGIN PASSWORD 'CHANGE_ME_pay_svc';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mobo_loc_svc') THEN
    CREATE ROLE mobo_loc_svc WITH LOGIN PASSWORD 'CHANGE_ME_loc_svc';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mobo_readonly') THEN
    CREATE ROLE mobo_readonly WITH LOGIN PASSWORD 'CHANGE_ME_readonly';
  END IF;
END
$$;

-- ── 2. Schema usage ───────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA public
  TO mobo_user_svc, mobo_ride_svc, mobo_pay_svc, mobo_loc_svc, mobo_readonly;

-- ── 3. mobo_user_svc — user service owns auth, profiles, GDPR, KYC ──────────
DO $$
DECLARE
  r TEXT;
  dml_tables TEXT[] := ARRAY[
    'users', 'user_documents', 'user_consents', 'consent_audit_log',
    'consent_purposes', 'notifications', 'trusted_contacts', 'saved_places',
    'teen_ride_log', 'loyalty_transactions', 'referrals',
    'corporate_accounts', 'corporate_members', 'fleets', 'fleet_vehicles',
    'driver_selfie_checks', 'gdpr_export_requests', 'gdpr_deletion_requests',
    'gdpr_erasure_requests', 'data_access_logs', 'admin_notifications',
    'admin_roles', 'permissions', 'role_permissions', 'user_permissions',
    'deactivation_appeals', 'user_social_accounts', 'family_accounts',
    'family_members', 'subscriptions', 'fraud_flags', 'audit_logs',
    'admin_audit_logs', 'api_key_rotation_log', 'developer_api_keys',
    'service_certificates', 'driver_biometric_verifications',
    'driver_realid_checks', 'whatsapp_sessions', 'ussd_sessions'
  ];
  -- Read-only access to tables owned by other services
  ro_tables TEXT[] := ARRAY['drivers', 'vehicles', 'rides', 'payments'];
BEGIN
  FOREACH r IN ARRAY dml_tables LOOP
    PERFORM _grant_if_exists('SELECT, INSERT, UPDATE, DELETE', r, 'mobo_user_svc');
  END LOOP;
  FOREACH r IN ARRAY ro_tables LOOP
    PERFORM _grant_if_exists('SELECT', r, 'mobo_user_svc');
  END LOOP;
END
$$;

-- ── 4. mobo_ride_svc — ride service owns ride lifecycle, fares, dispatch ─────
DO $$
DECLARE
  r TEXT;
  dml_tables TEXT[] := ARRAY[
    'rides', 'ride_ratings', 'ride_disputes', 'ride_recordings',
    'ride_checkins', 'ride_type_fares', 'recurring_rides',
    'fare_splits', 'fare_split_participants',
    'promo_codes', 'promo_code_uses',
    'surge_zones', 'demand_zones',
    'sos_police_dispatches', 'police_emergency_contacts',
    'vehicle_inspections', 'vehicle_maintenance',
    'commuter_passes', 'driver_challenge_progress', 'bonus_challenges',
    'call_sessions', 'messages', 'quick_replies',
    'shared_ride_groups', 'pool_ride_groups',
    'preferred_drivers', 'driver_blocked_riders',
    'lost_and_found', 'support_tickets', 'support_messages',
    'ride_disputes', 'outstation_bookings',
    'shuttle_routes', 'shuttle_bookings',
    'concierge_bookings', 'airport_zones', 'airport_queue',
    'speed_alerts'
  ];
  ro_tables TEXT[] := ARRAY[
    'users', 'drivers', 'vehicles', 'driver_selfie_checks',
    'driver_locations', 'locations', 'payment_methods'
  ];
BEGIN
  FOREACH r IN ARRAY dml_tables LOOP
    PERFORM _grant_if_exists('SELECT, INSERT, UPDATE, DELETE', r, 'mobo_ride_svc');
  END LOOP;
  FOREACH r IN ARRAY ro_tables LOOP
    PERFORM _grant_if_exists('SELECT', r, 'mobo_ride_svc');
  END LOOP;
END
$$;

-- ride service may update driver availability and acceptance rate (column-level)
DO $$
BEGIN
  EXECUTE 'GRANT UPDATE (is_available, acceptance_rate, ar_suspended_until, last_ride_at) ON drivers TO mobo_ride_svc';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'ride_svc driver column grant skipped: %', SQLERRM;
END
$$;

-- ── 5. mobo_pay_svc — payment service owns payments, wallet column ────────────
DO $$
DECLARE
  r TEXT;
  dml_tables TEXT[] := ARRAY[
    'payments', 'payment_methods', 'stripe_webhook_events',
    'express_pay_transactions', 'payment_audit_logs',
    'country_currency_config',
    'driver_earnings_daily', 'earnings_guarantee_windows',
    'fuel_cards', 'fuel_transactions', 'payout_requests'
  ];
  ro_tables TEXT[] := ARRAY['rides', 'users', 'drivers'];
BEGIN
  FOREACH r IN ARRAY dml_tables LOOP
    PERFORM _grant_if_exists('SELECT, INSERT, UPDATE, DELETE', r, 'mobo_pay_svc');
  END LOOP;
  FOREACH r IN ARRAY ro_tables LOOP
    PERFORM _grant_if_exists('SELECT', r, 'mobo_pay_svc');
  END LOOP;
END
$$;

-- payment service updates wallet_balance (column-level, not full row access)
DO $$
BEGIN
  EXECUTE 'GRANT UPDATE (wallet_balance) ON users TO mobo_pay_svc';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'pay_svc wallet_balance grant skipped: %', SQLERRM;
END
$$;
-- payment service updates payment state on rides
DO $$
BEGIN
  EXECUTE 'GRANT UPDATE (final_fare, payment_method, payment_status, tip_amount) ON rides TO mobo_pay_svc';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'pay_svc rides columns grant skipped: %', SQLERRM;
END
$$;

-- ── 6. mobo_loc_svc — location service owns GPS data and safety ───────────────
DO $$
DECLARE
  r TEXT;
  dml_tables TEXT[] := ARRAY[
    'driver_locations', 'locations', 'speed_alerts'
  ];
  ro_tables TEXT[] := ARRAY[
    'rides', 'drivers', 'users', 'user_consents',  -- consent check (SEC-003)
    'surge_zones', 'demand_zones'
  ];
BEGIN
  FOREACH r IN ARRAY dml_tables LOOP
    PERFORM _grant_if_exists('SELECT, INSERT, UPDATE, DELETE', r, 'mobo_loc_svc');
  END LOOP;
  FOREACH r IN ARRAY ro_tables LOOP
    PERFORM _grant_if_exists('SELECT', r, 'mobo_loc_svc');
  END LOOP;
END
$$;

-- location service updates driver availability and last-seen coordinates
DO $$
BEGIN
  EXECUTE 'GRANT UPDATE (is_available, last_seen_at) ON drivers TO mobo_loc_svc';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'loc_svc driver column grant skipped: %', SQLERRM;
END
$$;

-- ── 7. mobo_readonly — SELECT-only across all tables ─────────────────────────
-- Used by read replicas, Metabase/analytics, and reporting pipelines.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO mobo_readonly;

-- Auto-apply SELECT to tables created by future migrations
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO mobo_readonly;

-- ── 8. Sequence access (required for INSERT with uuid_generate_v4 / gen_random_uuid) ─
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO mobo_user_svc, mobo_ride_svc, mobo_pay_svc, mobo_loc_svc;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES
  TO mobo_user_svc, mobo_ride_svc, mobo_pay_svc, mobo_loc_svc;

-- ── 9. Revoke table-creation rights from service roles (defence-in-depth) ─────
-- Service roles must not be able to create or alter schema objects.
REVOKE CREATE ON SCHEMA public
  FROM mobo_user_svc, mobo_ride_svc, mobo_pay_svc, mobo_loc_svc, mobo_readonly;

-- ── 10. Clean up helper function (not needed at runtime) ──────────────────────
DROP FUNCTION IF EXISTS _grant_if_exists(TEXT, TEXT, TEXT);

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

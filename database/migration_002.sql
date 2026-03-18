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

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

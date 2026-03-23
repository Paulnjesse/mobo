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

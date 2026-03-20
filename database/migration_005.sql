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

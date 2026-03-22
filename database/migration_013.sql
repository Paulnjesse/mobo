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

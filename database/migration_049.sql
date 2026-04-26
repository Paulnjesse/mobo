-- migration_049.sql
-- New tables and columns required by the P0–P3 fix pass
-- Covers: Flutterwave webhook deduplication, admin alerts, ride idempotency keys,
--         driver session binding, no_drivers_available status

-- ─── 1. Flutterwave webhook deduplication ─────────────────────────────────────
-- Mirrors stripe_webhook_events for Flutterwave callbacks.
-- ON CONFLICT on flw_event_id prevents double-processing on retried webhooks.
CREATE TABLE IF NOT EXISTS flutterwave_webhook_events (
  id            BIGSERIAL     PRIMARY KEY,
  flw_event_id  TEXT          NOT NULL,
  event_type    TEXT          NOT NULL DEFAULT 'unknown',
  tx_ref        TEXT,
  raw_payload   JSONB,
  received_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_flw_event_id UNIQUE (flw_event_id)
);
CREATE INDEX IF NOT EXISTS idx_flw_webhook_tx_ref ON flutterwave_webhook_events (tx_ref);
CREATE INDEX IF NOT EXISTS idx_flw_webhook_received ON flutterwave_webhook_events (received_at);

-- ─── 2. Admin alerts ──────────────────────────────────────────────────────────
-- Stores platform-level alerts triggered by the escalation job or manual triggers.
-- Acknowledged via PATCH /admin/alerts/:id/acknowledge
CREATE TABLE IF NOT EXISTS admin_alerts (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type       TEXT          NOT NULL,   -- 'stuck_ride', 'fraud_detected', 'driver_offline', etc.
  severity         TEXT          NOT NULL DEFAULT 'medium'
                     CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title            TEXT          NOT NULL,
  message          TEXT,
  metadata         JSONB         NOT NULL DEFAULT '{}',
  acknowledged     BOOLEAN       NOT NULL DEFAULT false,
  acknowledged_by  UUID          REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at  TIMESTAMPTZ,
  notes            TEXT,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_alerts_acknowledged ON admin_alerts (acknowledged, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_alerts_severity    ON admin_alerts (severity, created_at DESC);

-- ─── 3. Ride idempotency keys ─────────────────────────────────────────────────
-- Durable idempotency store (Redis TTL can expire; this is the fallback).
-- The ride-service also uses Redis for hot-path checks (ride_idem:<userId>:<key>).
CREATE TABLE IF NOT EXISTS ride_idempotency_keys (
  idempotency_key  TEXT          NOT NULL,
  user_id          UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ride_id          UUID          REFERENCES rides(id) ON DELETE SET NULL,
  response_payload JSONB,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
  PRIMARY KEY (idempotency_key, user_id)
);
CREATE INDEX IF NOT EXISTS idx_ride_idem_expires ON ride_idempotency_keys (expires_at);

-- ─── 4. no_drivers_available ride status ──────────────────────────────────────
-- Extend the rides.status check constraint to include the new system status.
DO $$
BEGIN
  -- Drop the existing check constraint if it exists (PG doesn't support ADD CONSTRAINT IF NOT EXISTS for checks)
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'rides' AND constraint_type = 'CHECK' AND constraint_name = 'rides_status_check'
  ) THEN
    ALTER TABLE rides DROP CONSTRAINT rides_status_check;
  END IF;
EXCEPTION WHEN others THEN NULL;
END$$;

ALTER TABLE rides
  ADD CONSTRAINT rides_status_check CHECK (
    status IN (
      'requested', 'no_drivers_available', 'accepted', 'arriving',
      'in_progress', 'completed', 'cancelled'
    )
  );

-- ─── 5. Driver sessions — multi-device binding ────────────────────────────────
-- Tracks which device_id is the canonical active session per driver.
-- A driver logging in from a new device invalidates the previous session.
CREATE TABLE IF NOT EXISTS driver_sessions (
  id          BIGSERIAL     PRIMARY KEY,
  driver_id   UUID          NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  device_id   TEXT          NOT NULL,
  socket_id   TEXT,
  is_active   BOOLEAN       NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_driver_active_session UNIQUE (driver_id, is_active) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX IF NOT EXISTS idx_driver_sessions_driver ON driver_sessions (driver_id, is_active);

-- ─── 6. Notification read tracking ───────────────────────────────────────────
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at  TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (user_id, is_read) WHERE is_read = false;

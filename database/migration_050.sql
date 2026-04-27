-- migration_050.sql
-- General-purpose event DLQ persistence table
-- Dead-letter events that exhausted all retries are stored here for manual inspection/replay.

CREATE TABLE IF NOT EXISTS dead_letter_events (
  id               BIGSERIAL PRIMARY KEY,
  event_type       VARCHAR(100)   NOT NULL,
  payload          JSONB          NOT NULL DEFAULT '{}',
  failure_reason   VARCHAR(200),
  resolved         BOOLEAN        NOT NULL DEFAULT false,
  resolved_by      UUID           REFERENCES users(id) ON DELETE SET NULL,
  resolved_at      TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dead_letter_events_type       ON dead_letter_events(event_type);
CREATE INDEX IF NOT EXISTS idx_dead_letter_events_created_at ON dead_letter_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dead_letter_events_resolved   ON dead_letter_events(resolved) WHERE resolved = false;

-- Ensure audit:read permission exists before granting it to roles
INSERT INTO permissions (name, description, category)
  VALUES ('audit:read', 'View dead-letter events and replay audit log', 'audit')
  ON CONFLICT (name) DO NOTHING;

-- Grant audit:read permission to super_admin and ops_admin roles
-- so they can access GET /admin/events/replay
INSERT INTO role_permissions (role, permission)
  VALUES
    ('super_admin', 'audit:read'),
    ('ops_admin',   'audit:read')
  ON CONFLICT (role, permission) DO NOTHING;

-- payment_events table (for payment DLQ handler fallback)
CREATE TABLE IF NOT EXISTS payment_events (
  id           BIGSERIAL    PRIMARY KEY,
  payment_id   UUID         REFERENCES payments(id) ON DELETE CASCADE,
  event_type   VARCHAR(100) NOT NULL,
  status       VARCHAR(50),
  amount       BIGINT,
  metadata     JSONB        NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_payment_id  ON payment_events(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_created_at  ON payment_events(created_at DESC);

-- Unique constraint to support ON CONFLICT DO NOTHING in eventDlq handler
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_events_payment_id_event_type
  ON payment_events(payment_id, event_type)
  WHERE payment_id IS NOT NULL;

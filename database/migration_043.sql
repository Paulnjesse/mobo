-- migration_043.sql
-- Fixes for production blockers CF-003, CF-005
--   1. ride_waypoints  — per-trip GPS trail for trip replay and dispute resolution
--   2. incidents       — incident lifecycle management (Open → Investigating → Resolved)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. RIDE WAYPOINTS ────────────────────────────────────────────────────────
-- Records the driver's GPS position every ~15s while a ride is in_progress.
-- Append-only immutable ledger — no UPDATEs or DELETEs.
-- Used for: trip replay, route verification, fare dispute resolution, insurance.

CREATE TABLE IF NOT EXISTS ride_waypoints (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ride_id     UUID        NOT NULL,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  bearing     SMALLINT,                    -- degrees 0–359, NULL if unknown
  speed_kmh   SMALLINT,                    -- km/h, NULL if unknown
  accuracy_m  SMALLINT,                    -- GPS accuracy in metres
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup: all waypoints for a ride ordered chronologically
CREATE INDEX IF NOT EXISTS idx_ride_waypoints_ride_id_ts
  ON ride_waypoints (ride_id, recorded_at ASC);

-- Additional index for time-range replay queries (DESC for latest-first scans)
CREATE INDEX IF NOT EXISTS idx_ride_waypoints_recorded_at
  ON ride_waypoints (recorded_at DESC);

COMMENT ON TABLE ride_waypoints IS
  'Append-only GPS trail per trip. Written by location-service every ~15s during in_progress rides.';

-- ── 2. INCIDENTS ─────────────────────────────────────────────────────────────
-- Incident lifecycle: open → investigating → resolved
-- Linked to optional ride_id, payment_id, driver_id, user_id for context.
-- Supports SLA tracking, root cause tagging, and escalation.

CREATE TABLE IF NOT EXISTS incidents (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type            TEXT        NOT NULL,   -- 'payment_failure'|'driver_fraud'|'system_outage'|'gps_anomaly'|'delay'|'safety'|'other'
  severity        TEXT        NOT NULL DEFAULT 'medium'
                  CHECK (severity IN ('low','medium','high','critical')),
  status          TEXT        NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','investigating','resolved','closed')),
  title           TEXT        NOT NULL,
  description     TEXT,
  root_cause_tag  TEXT,                   -- e.g. 'provider_api_down', 'driver_app_crash', 'payment_timeout'
  ride_id         UUID,
  payment_id      UUID,
  driver_id       UUID,
  user_id         UUID,
  created_by      UUID        NOT NULL,   -- admin user who opened the incident
  assigned_to     UUID,                   -- admin user currently handling it
  resolved_by     UUID,
  sla_deadline    TIMESTAMPTZ,            -- computed at creation: created_at + SLA by severity
  resolved_at     TIMESTAMPTZ,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SLA deadlines by severity (wall-clock):
--   critical → 30 min
--   high     →  2 h
--   medium   →  8 h
--   low      → 24 h
-- Set automatically by trigger below.

CREATE OR REPLACE FUNCTION set_incident_sla_deadline()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sla_deadline IS NULL THEN
    NEW.sla_deadline := CASE NEW.severity
      WHEN 'critical' THEN NEW.created_at + INTERVAL '30 minutes'
      WHEN 'high'     THEN NEW.created_at + INTERVAL '2 hours'
      WHEN 'medium'   THEN NEW.created_at + INTERVAL '8 hours'
      ELSE                 NEW.created_at + INTERVAL '24 hours'
    END;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_incident_sla ON incidents;
CREATE TRIGGER trg_incident_sla
  BEFORE INSERT OR UPDATE ON incidents
  FOR EACH ROW EXECUTE FUNCTION set_incident_sla_deadline();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_incidents_status_severity
  ON incidents (status, severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_incidents_ride_id
  ON incidents (ride_id) WHERE ride_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_incidents_created_by
  ON incidents (created_by);

-- SLA breach query: open/investigating incidents past their deadline
CREATE INDEX IF NOT EXISTS idx_incidents_sla_breach
  ON incidents (sla_deadline)
  WHERE status NOT IN ('resolved','closed');

COMMENT ON TABLE incidents IS
  'Incident lifecycle management. Severity-based SLA deadlines auto-set on INSERT.';

-- ── 3. TOKEN BLOCKLIST ───────────────────────────────────────────────────────
-- Revoked JWT IDs (jti). Checked on every authenticated request.
-- TTL-based cleanup: entries older than the token expiry are useless;
-- a nightly job (or Redis TTL in the primary path) handles cleanup.

CREATE TABLE IF NOT EXISTS revoked_tokens (
  jti         TEXT        NOT NULL PRIMARY KEY,
  user_id     UUID,
  revoked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL   -- token's original expiry — safe to prune after this
);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires_at
  ON revoked_tokens (expires_at);

COMMENT ON TABLE revoked_tokens IS
  'Blocklist for revoked JWTs. Primary check done in Redis; DB is the durable fallback.';

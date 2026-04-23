-- migration_039.sql
-- Admin dashboard support tables:
--   admin_notifications — audit trail for bulk notifications sent from dashboard
--   system_settings     — key-value store for platform configuration
--   Adds is_archived / archived_at to users (soft-delete support for admin archive)
--   Adds is_online / last_lat / last_lng / last_seen to drivers (live map)

-- ── admin_notifications ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT        NOT NULL,
  body        TEXT        NOT NULL,
  target      VARCHAR(20) NOT NULL DEFAULT 'all',   -- 'all','role','user'
  target_role VARCHAR(20),                           -- 'driver','rider', etc.
  target_user UUID REFERENCES users(id) ON DELETE SET NULL,
  sent_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_notifications_sent_at_idx ON admin_notifications(sent_at DESC);
CREATE INDEX IF NOT EXISTS admin_notifications_sent_by_idx ON admin_notifications(sent_by);

COMMENT ON TABLE admin_notifications IS
  'Audit trail of bulk notifications dispatched from the admin dashboard.';

-- ── system_settings ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_settings (
  key         VARCHAR(100) PRIMARY KEY,
  value       TEXT         NOT NULL,
  description TEXT,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed sensible defaults
INSERT INTO system_settings (key, value, description) VALUES
  ('platform_name',           'MOBO',         'Brand name displayed in app'),
  ('max_surge_multiplier',    '3.0',          'Hard cap on surge pricing multiplier'),
  ('referral_bonus_xaf',      '1000',         'XAF credited to referrer on first ride'),
  ('min_fare_xaf',            '500',          'Minimum ride fare in XAF'),
  ('driver_commission_pct',   '80',           'Percentage of fare credited to driver'),
  ('platform_commission_pct', '20',           'Percentage of fare retained by platform'),
  ('fraud_threshold_score',   '0.7',          'ML score above which ride is flagged for fraud review'),
  ('wallet_max_balance_xaf',  '500000',       'Maximum wallet balance per user in XAF')
ON CONFLICT (key) DO NOTHING;

-- ── Soft-delete support on users ──────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_archived  BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS users_is_archived_idx ON users(is_archived) WHERE is_archived = false;

-- ── Live-map fields on drivers ────────────────────────────────────────────────
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS is_online   BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_lat    DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS last_lng    DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS last_seen   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS drivers_is_online_idx ON drivers(is_online) WHERE is_online = true;
CREATE INDEX IF NOT EXISTS drivers_last_seen_idx  ON drivers(last_seen DESC);

-- ── promo_codes updated_at column (needed for admin update) ───────────────────
ALTER TABLE promo_codes
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- ── surge_zones updated_at column ─────────────────────────────────────────────
ALTER TABLE surge_zones
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

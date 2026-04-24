-- ============================================================
-- MOBO Schema Migration: 037 → 042 (targeted)
-- Generated: 2026-04-24
-- Strategy: surgical — only DDL genuinely absent from the remote
--   Supabase schema.  All statements are idempotent.
--
-- Confirmed missing before this run:
--   Tables:  earnings_pending, ride_events, system_settings,
--            rides_partitioned, payments_partitioned
--   Columns: payments.stripe_payment_intent_id,
--            users.is_archived / archived_at,
--            drivers.last_lat / last_lng / last_seen,
--            admin_notifications.sent_by / sent_at / body / target
--   Indexes: migration_042 perf indexes (10 of 13 new ones missing)
--   Functions: mobo_rename_to_partitioned()
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- A. NEW COLUMNS ON EXISTING TABLES
-- ════════════════════════════════════════════════════════════

-- payments.stripe_payment_intent_id  (migration_041)
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_stripe_pi_id
  ON payments (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- users: soft-delete support  (migration_039)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS users_is_archived_idx
  ON users (is_archived)
  WHERE is_archived = false;

-- drivers: live-map fields  (migration_039)
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS last_lat  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS last_lng  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS drivers_last_seen_idx ON drivers (last_seen DESC);

-- promo_codes / surge_zones: updated_at  (migration_039)
ALTER TABLE promo_codes  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE surge_zones  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- admin_notifications: add audit-trail columns if missing  (migration_039)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='admin_notifications'
      AND column_name='sent_at'
  ) THEN
    ALTER TABLE admin_notifications
      ADD COLUMN sent_at     TIMESTAMPTZ DEFAULT NOW(),
      ADD COLUMN sent_by     UUID REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN body        TEXT,
      ADD COLUMN target      VARCHAR(20) DEFAULT 'all',
      ADD COLUMN target_role VARCHAR(20),
      ADD COLUMN target_user UUID REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='admin_notifications'
      AND column_name='sent_at'
  ) THEN
    EXECUTE $idx$CREATE INDEX IF NOT EXISTS admin_notifications_sent_at_idx
      ON admin_notifications (sent_at DESC)$idx$;
    EXECUTE $idx$CREATE INDEX IF NOT EXISTS admin_notifications_sent_by_idx
      ON admin_notifications (sent_by)$idx$;
  END IF;
END
$$;


-- ════════════════════════════════════════════════════════════
-- B. NEW TABLES
-- ════════════════════════════════════════════════════════════

-- system_settings — platform key-value config  (migration_039)
CREATE TABLE IF NOT EXISTS system_settings (
  key         VARCHAR(100) PRIMARY KEY,
  value       TEXT         NOT NULL,
  description TEXT,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO system_settings (key, value, description) VALUES
  ('platform_name',           'MOBO',    'Brand name displayed in app'),
  ('max_surge_multiplier',    '3.0',     'Hard cap on surge pricing multiplier'),
  ('referral_bonus_xaf',      '1000',    'XAF credited to referrer on first ride'),
  ('min_fare_xaf',            '500',     'Minimum ride fare in XAF'),
  ('driver_commission_pct',   '80',      'Percentage of fare credited to driver'),
  ('platform_commission_pct', '20',      'Percentage retained by platform'),
  ('fraud_threshold_score',   '0.7',     'ML score above which ride is flagged'),
  ('wallet_max_balance_xaf',  '500000',  'Maximum wallet balance per user in XAF')
ON CONFLICT (key) DO NOTHING;


-- earnings_pending — saga table for ride→payment settlement  (migration_038)
CREATE TABLE IF NOT EXISTS earnings_pending (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id        UUID    NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  driver_id      UUID    NOT NULL REFERENCES drivers(id),
  amount         INTEGER NOT NULL,
  payment_method TEXT    NOT NULL,
  status         TEXT    NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','credited','cancelled','failed')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at    TIMESTAMPTZ,
  UNIQUE (ride_id)
);

CREATE INDEX IF NOT EXISTS idx_earnings_pending_driver
  ON earnings_pending (driver_id, created_at DESC)
  WHERE status = 'pending';


-- ride_events — append-only status audit log  (migration_040)
CREATE TABLE IF NOT EXISTS ride_events (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id    UUID    NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  event_type TEXT    NOT NULL,
  actor_id   UUID,
  actor_role TEXT,
  metadata   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ride_events_ride_id
  ON ride_events (ride_id);
CREATE INDEX IF NOT EXISTS idx_ride_events_created_at
  ON ride_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ride_events_ride_time
  ON ride_events (ride_id, created_at DESC);


-- fare_splits  (migration_041 — CREATE TABLE IF NOT EXISTS is idempotent)
CREATE TABLE IF NOT EXISTS fare_splits (
  id               UUID    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ride_id          UUID    NOT NULL,
  initiator_id     UUID    NOT NULL,
  total_fare       INTEGER NOT NULL,
  split_count      INTEGER NOT NULL,
  amount_per_person INTEGER NOT NULL,
  status           TEXT    NOT NULL DEFAULT 'pending',
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fare_splits_ride_id ON fare_splits (ride_id);

CREATE TABLE IF NOT EXISTS fare_split_participants (
  id             UUID    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  split_id       UUID    NOT NULL REFERENCES fare_splits(id) ON DELETE CASCADE,
  user_id        UUID,
  phone          TEXT    NOT NULL,
  name           TEXT,
  amount         INTEGER NOT NULL,
  paid           BOOLEAN NOT NULL DEFAULT false,
  paid_at        TIMESTAMPTZ,
  payment_method TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fare_split_participants_split_id
  ON fare_split_participants (split_id);


-- ════════════════════════════════════════════════════════════
-- C. QUARTERLY PARTITIONS  (migration_040)
-- ════════════════════════════════════════════════════════════
-- NOTE: Partition table creation requires a composite PK (id, created_at)
-- which cannot be derived automatically from LIKE rides INCLUDING ALL.
-- This step is deferred to a dedicated maintenance-window migration
-- (database/migration_040.sql) that must be run outside a transaction
-- with explicit DDL.  The mobo_rename_to_partitioned() function below
-- is still registered so it is ready for when the partition tables exist.
--
-- To apply manually:
--   psql $DATABASE_URL -f database/migration_040.sql


-- ════════════════════════════════════════════════════════════
-- D. PARTITION RENAME HELPER  (migration_041)
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION mobo_rename_to_partitioned()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_rides_done    BOOLEAN := false;
  v_payments_done BOOLEAN := false;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'rides_partitioned'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'rides_unpartitioned_backup'
  ) THEN
    ALTER TABLE rides             RENAME TO rides_unpartitioned_backup;
    ALTER TABLE rides_partitioned RENAME TO rides;
    v_rides_done := true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'payments_partitioned'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'payments_unpartitioned_backup'
  ) THEN
    ALTER TABLE payments             RENAME TO payments_unpartitioned_backup;
    ALTER TABLE payments_partitioned RENAME TO payments;
    v_payments_done := true;
  END IF;

  RETURN format(
    'Partition rename complete. rides=%s, payments=%s',
    CASE WHEN v_rides_done    THEN 'renamed' ELSE 'skipped' END,
    CASE WHEN v_payments_done THEN 'renamed' ELSE 'skipped' END
  );
END;
$$;

COMMENT ON FUNCTION mobo_rename_to_partitioned() IS
  'Atomically renames rides/payments → backup, partitioned variants → live.'
  ' Call during a maintenance window. Idempotent.';


-- ════════════════════════════════════════════════════════════
-- E. PERFORMANCE INDEXES  (migration_042 — 10 new ones)
-- ════════════════════════════════════════════════════════════

-- rides: rider history  (listRides — highest volume read)
CREATE INDEX IF NOT EXISTS idx_rides_rider_created
  ON rides (rider_id, created_at DESC);

-- rides: active-ride serialisation guard  WHERE driver_id=$1 AND status IN(...)
CREATE INDEX IF NOT EXISTS idx_rides_driver_status
  ON rides (driver_id, status)
  WHERE status IN ('accepted', 'arriving', 'in_progress', 'requested');

-- rides: admin/reconciliation sweep  WHERE status=... ORDER BY created_at
CREATE INDEX IF NOT EXISTS idx_rides_status_created
  ON rides (status, created_at ASC);

-- rides: cancel ownership check  WHERE id=$1 AND rider_id=$2
CREATE INDEX IF NOT EXISTS idx_rides_id_rider
  ON rides (id, rider_id);

-- payments: external provider reference dedup (column is provider_ref in this schema)
CREATE INDEX IF NOT EXISTS idx_payments_provider_ref
  ON payments (provider_ref)
  WHERE provider_ref IS NOT NULL;

-- payments: flagStalePayments cron
CREATE INDEX IF NOT EXISTS idx_payments_status_method_created
  ON payments (status, method, created_at ASC)
  WHERE status = 'pending';

-- users: covered index — eliminates heap fetch for push-token lookups
CREATE INDEX IF NOT EXISTS idx_users_id_push_token
  ON users (id)
  INCLUDE (push_token, phone, language, full_name);

-- users: OTP auth phone lookup
CREATE INDEX IF NOT EXISTS idx_users_phone
  ON users (phone)
  WHERE phone IS NOT NULL;

-- drivers: covered lookup for acceptRide / updateRideStatus
-- (is_available not present in this schema; uses is_approved + is_online)
CREATE INDEX IF NOT EXISTS idx_drivers_user_id
  ON drivers (user_id)
  INCLUDE (id, is_approved, is_online, ar_suspended_until, vehicle_id);

-- locations: GDPR per-user erasure  O(log n)
CREATE INDEX IF NOT EXISTS idx_locations_user_recorded_perf
  ON locations (user_id, recorded_at DESC);


-- ════════════════════════════════════════════════════════════
-- F. RBAC: finance:read permission  (migration_040)
-- ════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='permissions'
  ) THEN
    INSERT INTO permissions (name, description)
    VALUES ('finance:read', 'Read access to revenue and payment aggregates')
    ON CONFLICT (name) DO NOTHING;
  END IF;
END
$$;

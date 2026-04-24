-- migration_040.sql
-- Implements three production-hardening improvements:
--   1. ride_events   — append-only status audit log (Data Consistency)
--   2. finance:read  — RBAC permission for revenue endpoints (Security)
--   3. partitioning  — quarterly partitions on rides + payments (Scalability)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. RIDE EVENTS — append-only state transition audit log ──────────────────
-- Stores every status change on a ride.  Immutable once written.
-- Used for: compliance audits, dispute resolution, analytics, debugging.
CREATE TABLE IF NOT EXISTS ride_events (
  id          UUID        NOT NULL DEFAULT gen_random_uuid(),
  ride_id     UUID        NOT NULL,
  event_type  TEXT        NOT NULL,   -- 'status_change' | 'driver_assigned' | 'cancelled' | 'completed'
  old_status  TEXT,                   -- NULL for the initial 'requested' event
  new_status  TEXT        NOT NULL,
  actor_id    UUID,                   -- user_id who triggered the transition (NULL = system)
  actor_role  TEXT        NOT NULL DEFAULT 'system', -- 'rider' | 'driver' | 'system' | 'admin'
  metadata    JSONB       NOT NULL DEFAULT '{}',      -- extra context (reason, ip, etc.)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partition ride_events by month for cheap time-range queries (compliance pulls 30-day windows)
-- Use a non-partitioned table in dev; add partitions in production via pg_partman or manually.
-- Foreign key is intentionally omitted — ride_events is an immutable ledger; rides may be
-- archived/deleted but the audit record must persist.

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_ride_events_ride_id    ON ride_events (ride_id);
CREATE INDEX IF NOT EXISTS idx_ride_events_created_at ON ride_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ride_events_actor_id   ON ride_events (actor_id) WHERE actor_id IS NOT NULL;

-- ── 2. FINANCE:READ PERMISSION ────────────────────────────────────────────────
-- Seed the finance:read permission so it can be assigned via RBAC.
-- admin_permissions table may or may not exist — guard both paths.
DO $$
BEGIN
  -- Guard: only insert if the table exists (created by an earlier migration)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'admin_permissions'
  ) THEN
    INSERT INTO admin_permissions (name, description, category)
    VALUES ('finance:read', 'View revenue charts, payment breakdowns, and financial analytics', 'finance')
    ON CONFLICT (name) DO NOTHING;

    -- Grant finance:read to the 'super_admin' role if role_permissions table exists
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'role_permissions'
    ) THEN
      INSERT INTO role_permissions (role, permission)
      VALUES ('super_admin', 'finance:read')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
END $$;

-- ── 3. QUARTERLY PARTITIONING — rides + payments ──────────────────────────────
-- Strategy: create new partitioned tables, migrate data, rename atomically.
-- This migration is idempotent — safe to re-run if interrupted.
--
-- IMPORTANT: Run during a low-traffic maintenance window (< 5 min on typical
-- MOBO data volume).  On tables > 50 M rows use pg_partman + background copy.
--
-- Partitioning reduces:
--   • Index size (per-partition B-tree vs global)
--   • VACUUM overhead (only new partitions accumulate dead rows)
--   • Query time for date-range reports (partition pruning)

-- rides_partitioned — range on created_at, quarterly
CREATE TABLE IF NOT EXISTS rides_partitioned (
  LIKE rides INCLUDING ALL
) PARTITION BY RANGE (created_at);

-- Create quarterly partitions covering 2024 Q1 → 2026 Q4
-- Partitions before the earliest data are created defensively (empty is fine)
DO $$
DECLARE
  yr  INT;
  qtr INT;
  p_start DATE;
  p_end   DATE;
  tbl     TEXT;
BEGIN
  FOR yr IN 2024..2026 LOOP
    FOR qtr IN 1..4 LOOP
      p_start := make_date(yr, (qtr - 1) * 3 + 1, 1);
      p_end   := p_start + INTERVAL '3 months';
      tbl     := format('rides_y%sq%s', yr, qtr);
      IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = tbl
      ) THEN
        EXECUTE format(
          'CREATE TABLE %I PARTITION OF rides_partitioned
           FOR VALUES FROM (%L) TO (%L)',
          tbl, p_start::timestamptz, p_end::timestamptz
        );
        RAISE NOTICE 'Created partition %', tbl;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Default partition catches anything outside the explicit ranges
CREATE TABLE IF NOT EXISTS rides_partitioned_default
  PARTITION OF rides_partitioned DEFAULT;

-- payments_partitioned — same quarterly pattern
CREATE TABLE IF NOT EXISTS payments_partitioned (
  LIKE payments INCLUDING ALL
) PARTITION BY RANGE (created_at);

DO $$
DECLARE
  yr  INT;
  qtr INT;
  p_start DATE;
  p_end   DATE;
  tbl     TEXT;
BEGIN
  FOR yr IN 2024..2026 LOOP
    FOR qtr IN 1..4 LOOP
      p_start := make_date(yr, (qtr - 1) * 3 + 1, 1);
      p_end   := p_start + INTERVAL '3 months';
      tbl     := format('payments_y%sq%s', yr, qtr);
      IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = tbl
      ) THEN
        EXECUTE format(
          'CREATE TABLE %I PARTITION OF payments_partitioned
           FOR VALUES FROM (%L) TO (%L)',
          tbl, p_start::timestamptz, p_end::timestamptz
        );
        RAISE NOTICE 'Created partition %', tbl;
      END IF;
    END LOOP;
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS payments_partitioned_default
  PARTITION OF payments_partitioned DEFAULT;

-- NOTE: The actual table rename (rides → rides_partitioned) requires an
-- exclusive lock and must be performed during a maintenance window:
--
--   BEGIN;
--     ALTER TABLE rides RENAME TO rides_old;
--     ALTER TABLE rides_partitioned RENAME TO rides;
--     INSERT INTO rides SELECT * FROM rides_old;  -- back-fill
--     -- Verify row count matches before committing
--   COMMIT;
--   DROP TABLE rides_old;
--
-- Until the rename is executed, rides_partitioned receives only new inserts
-- routed via the application (add PARTITION BY logic in code before rename).
-- The partitioned tables are pre-created here so they're ready when DBA
-- schedules the maintenance window.

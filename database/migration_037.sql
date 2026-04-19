-- =============================================================================
-- Migration 037: Production-quality indexes, constraints, and deduplication tables
-- =============================================================================
-- Purpose: Add all missing composite/partial indexes for hot query paths,
--          enforce data-integrity CHECK constraints that were absent from DDL,
--          and create the idempotency_keys and scheduled_cleanups tables needed
--          for payment deduplication and background-job tracking.
--
-- Design principles:
--   • Every CREATE INDEX uses CONCURRENTLY so it can run without locking tables
--     in production. Run this outside a transaction block (psql \i) or via the
--     run_migrations.js runner which sets autocommit for DDL.
--   • Every index uses IF NOT EXISTS — safe to apply multiple times.
--   • Every constraint addition is wrapped in a DO block that swallows
--     duplicate_object errors — re-entrant and safe to run multiple times.
--   • Columns that were added in later migrations are guarded with
--     information_schema existence checks before referencing them.
--
-- Prerequisites: migrations 001-036 applied.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. RIDES TABLE
-- ─────────────────────────────────────────────────────────────────────────────

-- "My active rides" — rider inbox
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rides_rider_status
  ON rides (rider_id, status);

-- Driver's assigned / in-progress rides
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rides_driver_status
  ON rides (driver_id, status);

-- Recent rides list (admin dashboard, user history)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rides_created_at
  ON rides (created_at DESC);

-- Financial reconciliation: unpaid / failed rides ordered by completion time
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rides_payment_status_completed
  ON rides (payment_status, completed_at DESC);

-- Partial index: dispatcher queue — only live rides, no historical noise
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rides_active_partial
  ON rides (status)
  WHERE status IN ('requested', 'accepted', 'arriving', 'in_progress');


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. USERS TABLE
-- ─────────────────────────────────────────────────────────────────────────────

-- Wallet balance queries (e.g. top-up prompts, bonus eligibility)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_wallet_balance
  ON users (wallet_balance)
  WHERE wallet_balance > 0;

-- User list sorting (admin dashboard)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_created_at
  ON users (created_at DESC);

-- Role-based queries (RBAC middleware, admin filters)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_role
  ON users (role);

-- Fast lookup of active (non-suspended, non-deleted) users
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_active_partial
  ON users (is_active)
  WHERE is_active = true;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. PAYMENTS TABLE
-- ─────────────────────────────────────────────────────────────────────────────

-- Payment history per user (profile screen, statements)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_user_created
  ON payments (user_id, created_at DESC);

-- Ride payment lookup (ride completion flow, refund checks)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_ride_id
  ON payments (ride_id);

-- Webhook deduplication — transaction_id must be unique per provider
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_transaction_id
  ON payments (transaction_id);

-- Pending / failed payment sweep jobs
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_status_created
  ON payments (status, created_at DESC);

-- Provider reconciliation reports — index on `method` (payments.provider
-- does not exist as a standalone column; the equivalent column is `method`)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_method_created
  ON payments (method, created_at DESC);


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. PAYMENT_METHODS TABLE
-- ─────────────────────────────────────────────────────────────────────────────

-- Default payment method lookup (checkout pre-fill)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_methods_user_default
  ON payment_methods (user_id, is_default);

-- Active (non-deleted) methods per user.
-- is_deleted was added in migration_033; guard against missing column.
-- Note: CREATE INDEX CONCURRENTLY cannot run inside a DO block (no transaction).
-- Using regular CREATE INDEX here — safe for migration-time execution.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'payment_methods'
      AND column_name  = 'is_deleted'
  ) THEN
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_payment_methods_active
        ON payment_methods (user_id, is_deleted)
        WHERE is_deleted = false
    $idx$;
  ELSE
    -- Fall back to is_active which has been present since init.sql
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_payment_methods_active
        ON payment_methods (user_id, is_active)
        WHERE is_active = true
    $idx$;
  END IF;
END
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. LOCATIONS TABLE (PostGIS)
-- ─────────────────────────────────────────────────────────────────────────────

-- Location history per user (breadcrumb trail, safety replay)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_locations_user_recorded
  ON locations (user_id, recorded_at DESC);

-- Spatial index on the PostGIS point column (supports ST_DWithin etc.)
-- idx_locations_user already exists from init.sql; add the GIST separately.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_locations_gist
  ON locations USING GIST (location);


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. DRIVER_LOCATIONS TABLE
-- ─────────────────────────────────────────────────────────────────────────────
-- Schema (migration_032): driver_id PK, latitude, longitude, heading, speed,
-- updated_at. No recorded_at or is_online columns on this table — those live
-- on the drivers table (is_online) and locations table (recorded_at).

-- Most-recent position lookups (share-trip, dispatcher)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_driver_locations_driver_updated
  ON driver_locations (driver_id, updated_at DESC);

-- Online-driver spatial dispatch: index drivers.is_online (on drivers table)
-- so the JOIN from driver_locations to drivers is fast.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_drivers_is_online
  ON drivers (is_online)
  WHERE is_online = true;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. MESSAGES TABLE
-- ─────────────────────────────────────────────────────────────────────────────

-- In-ride chat history (ordered chronologically)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_ride_created
  ON messages (ride_id, created_at ASC);

-- TTL cleanup job: idx_messages_expires_at already created in migration_027.
-- Include here as a no-op IF NOT EXISTS for completeness.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_expires_at
  ON messages (expires_at)
  WHERE expires_at IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. VEHICLE_INSPECTIONS TABLE
-- ─────────────────────────────────────────────────────────────────────────────
-- idx_inspections_driver and idx_inspections_status already created in
-- migration_035. Adding the composite (driver_id, created_at DESC) variant
-- and the status-only index as IF NOT EXISTS so this is idempotent.

-- Driver inspection timeline
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inspections_driver_created
  ON vehicle_inspections (driver_id, created_at DESC);

-- Pending inspection queue (ops dashboard)
-- idx_inspections_status already exists but is named differently; safe to
-- add the new name — the planner will pick the most selective one.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inspections_status_pending
  ON vehicle_inspections (status);


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. RIDE_RATINGS TABLE
-- ─────────────────────────────────────────────────────────────────────────────

-- Rating lookup by ride (post-ride rating screen)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ride_ratings_ride_id
  ON ride_ratings (ride_id);

-- Driver rating history (profile, weighted average computation)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ride_ratings_driver_created
  ON ride_ratings (driver_id, created_at DESC)
  WHERE driver_id IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- 10. CALL_SESSIONS TABLE
-- ─────────────────────────────────────────────────────────────────────────────
-- idx_call_sessions_ride already created in migration_011.
-- Add a composite for active session lookup (expiry sweep + status filter).

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_sessions_ride_status_expires
  ON call_sessions (ride_id, status, expires_at);


-- ─────────────────────────────────────────────────────────────────────────────
-- 11. AUDIT_LOGS / ADMIN_AUDIT_LOGS
-- ─────────────────────────────────────────────────────────────────────────────

-- audit_logs: per-user timeline (GDPR export, support investigations)
-- Note: audit_logs uses actor_id not user_id; idx_audit_logs_actor_id already
-- exists from migration_024. Adding a user_id alias index guards against any
-- schema variant that has a user_id column instead.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'audit_logs'
      AND column_name  = 'user_id'
  ) THEN
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created
        ON audit_logs (user_id, created_at DESC)
    $idx$;
  END IF;
  -- If only actor_id exists (current schema) the existing idx_audit_logs_actor_id
  -- already covers this query path — nothing extra needed.
END
$$;

-- admin_audit_logs: per-admin timeline — idx_admin_audit_admin already created
-- in migration_021; adding IF NOT EXISTS variant is a safe no-op.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admin_audit_admin_created
  ON admin_audit_logs (admin_id, created_at DESC);


-- ─────────────────────────────────────────────────────────────────────────────
-- 12. POOL_RIDE_GROUPS TABLE
-- ─────────────────────────────────────────────────────────────────────────────

-- Pool matching: find open/forming groups ordered by creation time
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pool_ride_groups_status_created
  ON pool_ride_groups (status, created_at);


-- ─────────────────────────────────────────────────────────────────────────────
-- 13. SURGE_ZONES TABLE
-- ─────────────────────────────────────────────────────────────────────────────

-- Active surge zone lookups (spatial query pre-filter)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_surge_zones_active
  ON surge_zones (is_active)
  WHERE is_active = true;


-- ─────────────────────────────────────────────────────────────────────────────
-- 14. PROMO_CODES TABLE
-- ─────────────────────────────────────────────────────────────────────────────

-- Promo code redemption lookup (exact match on code string)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_promo_codes_code
  ON promo_codes (code);

-- Active, non-expired promo codes (admin dashboard, expiry sweep)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_promo_codes_expires_active
  ON promo_codes (expires_at)
  WHERE is_active = true;


-- =============================================================================
-- CHECK CONSTRAINTS
-- =============================================================================
-- Each constraint is added inside a DO block that catches duplicate_object so
-- the migration is idempotent (running it twice does not error).

-- ── rides: latitude bounds on recurring_rides.pickup_lat ─────────────────────
-- The rides table uses PostGIS geometry columns (pickup_location) — lat/lng are
-- not stored as separate numeric columns there. The pickup_lat column exists on
-- recurring_rides (migration_015). We guard with an existence check.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'recurring_rides'
      AND column_name  = 'pickup_lat'
  ) THEN
    ALTER TABLE recurring_rides
      ADD CONSTRAINT chk_recurring_rides_pickup_lat
        CHECK (pickup_lat BETWEEN -90 AND 90);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- Guard: if a future migration adds pickup_lat directly to rides, add it here.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'rides'
      AND column_name  = 'pickup_lat'
  ) THEN
    ALTER TABLE rides
      ADD CONSTRAINT chk_rides_pickup_lat
        CHECK (pickup_lat BETWEEN -90 AND 90);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- ── payments: amount must be positive (XAF — always integer, never zero) ─────
DO $$
BEGIN
  ALTER TABLE payments
    ADD CONSTRAINT chk_payments_amount_positive
      CHECK (amount > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- ── users: wallet balance must never go negative ───────────────────────────
DO $$
BEGIN
  ALTER TABLE users
    ADD CONSTRAINT chk_users_wallet_balance_nonneg
      CHECK (wallet_balance >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;


-- =============================================================================
-- IDEMPOTENCY KEYS TABLE
-- =============================================================================
-- Used by payment-service to deduplicate API calls. When a client retries a
-- payment request with the same Idempotency-Key header, the service returns
-- the cached response without reprocessing.

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key             TEXT        PRIMARY KEY,
  service         TEXT        NOT NULL,
  endpoint        TEXT        NOT NULL,
  user_id         TEXT        NOT NULL,
  request_hash    TEXT        NOT NULL,   -- SHA-256 of canonicalised request body
  response_status INT         NOT NULL,
  response_body   JSONB       NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL
);

-- TTL sweep: nightly job deletes rows WHERE expires_at < NOW()
CREATE INDEX IF NOT EXISTS idx_idempotency_expires
  ON idempotency_keys (expires_at);


-- =============================================================================
-- SCHEDULED CLEANUPS TABLE
-- =============================================================================
-- Tracks background maintenance jobs (message TTL purge, expired OTP sweep,
-- idempotency key expiry, etc.) so ops can monitor last/next run times and
-- catch stalled jobs.

CREATE TABLE IF NOT EXISTS scheduled_cleanups (
  id        SERIAL      PRIMARY KEY,
  job_name  TEXT        NOT NULL UNIQUE,
  last_run  TIMESTAMPTZ,
  next_run  TIMESTAMPTZ,
  status    TEXT        DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed'))
);

-- Seed the known cleanup jobs so the scheduler has rows to UPDATE rather than
-- having to INSERT on first run. ON CONFLICT keeps this idempotent.
INSERT INTO scheduled_cleanups (job_name, status) VALUES
  ('purge_expired_messages',         'pending'),
  ('purge_expired_idempotency_keys', 'pending'),
  ('purge_expired_otps',             'pending'),
  ('purge_expired_call_sessions',    'pending'),
  ('purge_soft_deleted_users',       'pending'),
  ('update_surge_zones',             'pending'),
  ('driver_earnings_rollup',         'pending')
ON CONFLICT (job_name) DO NOTHING;

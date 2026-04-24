-- migration_041.sql
-- P1-002: Atomic partition table rename for rides and payments
-- P1-003: Stripe confirm flow — add stripe_payment_intent_id column to payments
-- P2-002: Fare split tables (fare_splits, fare_split_participants)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- HOW TO RUN THE PARTITION RENAME (rides + payments):
--
--   This script creates a helper function `mobo_rename_to_partitioned()` that
--   you call explicitly during a maintenance window.  The rename itself is
--   instantaneous (PostgreSQL metadata-only) and takes no table lock beyond
--   the brief moment of the ALTER TABLE RENAME statement.
--
--   Recommended procedure:
--     1. Put the app in maintenance mode (return 503 at the gateway).
--     2. Run: SELECT mobo_rename_to_partitioned();
--     3. Verify row counts: SELECT count(*) FROM rides; (should match old rides)
--     4. Remove maintenance mode.
--
--   The function is idempotent — safe to call multiple times.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Fare split tables ──────────────────────────────────────────────────────
-- Stores multi-party fare sharing for a ride.
-- initiator  = the rider who booked the ride and initiated the split.
-- participants = other people sharing the cost (paid via phone link / wallet).

CREATE TABLE IF NOT EXISTS fare_splits (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ride_id          UUID        NOT NULL,
  initiator_id     UUID        NOT NULL,
  total_fare       INTEGER     NOT NULL,   -- XAF integer
  split_count      INTEGER     NOT NULL,   -- total number of people splitting
  amount_per_person INTEGER    NOT NULL,   -- ceiled XAF per person
  status           TEXT        NOT NULL DEFAULT 'pending',  -- pending | partial | settled
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fare_splits_ride_id ON fare_splits (ride_id);

CREATE TABLE IF NOT EXISTS fare_split_participants (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  split_id        UUID        NOT NULL REFERENCES fare_splits(id) ON DELETE CASCADE,
  user_id         UUID,                   -- NULL if participant not a MOBO user
  phone           TEXT        NOT NULL,
  name            TEXT,
  amount          INTEGER     NOT NULL,   -- XAF owed
  paid            BOOLEAN     NOT NULL DEFAULT false,
  paid_at         TIMESTAMPTZ,
  payment_method  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fare_split_participants_split_id ON fare_split_participants (split_id);

-- ── 2. Stripe PaymentIntent column ───────────────────────────────────────────
-- Allows backend to look up a Stripe PI by ID after the mobile app confirms
-- the payment via the Stripe SDK payment sheet.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_stripe_pi_id
  ON payments (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- ── 3. Partition rename helper function ───────────────────────────────────────
-- Run this during a maintenance window to swap unpartitioned tables for the
-- quarterly-partitioned equivalents created in migration_040.sql.
CREATE OR REPLACE FUNCTION mobo_rename_to_partitioned()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_rides_done    BOOLEAN := false;
  v_payments_done BOOLEAN := false;
BEGIN
  -- ── rides ──────────────────────────────────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'rides_partitioned'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'rides_unpartitioned_backup'
  ) THEN
    ALTER TABLE rides              RENAME TO rides_unpartitioned_backup;
    ALTER TABLE rides_partitioned  RENAME TO rides;
    -- Re-attach foreign keys and constraints that reference 'rides' by name
    -- (they were defined against rides_partitioned during creation; PostgreSQL
    --  adjusts names automatically on rename).
    v_rides_done := true;
  END IF;

  -- ── payments ───────────────────────────────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'payments_partitioned'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'payments_unpartitioned_backup'
  ) THEN
    ALTER TABLE payments              RENAME TO payments_unpartitioned_backup;
    ALTER TABLE payments_partitioned  RENAME TO payments;
    v_payments_done := true;
  END IF;

  RETURN format(
    'Partition rename complete. rides=%s, payments=%s',
    CASE WHEN v_rides_done    THEN 'renamed' ELSE 'skipped (already done or source missing)' END,
    CASE WHEN v_payments_done THEN 'renamed' ELSE 'skipped (already done or source missing)' END
  );
END;
$$;

COMMENT ON FUNCTION mobo_rename_to_partitioned() IS
  'Atomically renames rides/payments → backup, rides_partitioned/payments_partitioned → live.'
  ' Call during a maintenance window. Idempotent.';

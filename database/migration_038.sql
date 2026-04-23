-- migration_038.sql
-- Saga pattern: earnings_pending table for ride completion ↔ payment settlement.
--
-- Problem (HIGH-001): rideController credits drivers.total_earnings at ride
-- completion even when payment_status is still 'pending' for wallet/MoMo rides.
-- If the payment later fails, driver earnings are over-stated and the platform
-- cannot recover the shortfall.
--
-- Solution: hold driver earnings in `earnings_pending` at ride completion.
-- A BullMQ job (earningsSettler) watches for payment_status = 'paid' events and
-- atomically moves the pending amount to drivers.total_earnings.
-- A 24-hour cron job flags unclaimed pending earnings for ops review.

-- ── earnings_pending ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS earnings_pending (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id         UUID        NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  driver_id       UUID        NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  amount_xaf      INTEGER     NOT NULL CHECK (amount_xaf >= 0),
  payment_method  VARCHAR(50) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'settled', 'failed', 'review')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at      TIMESTAMPTZ,
  failed_at       TIMESTAMPTZ,
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS earnings_pending_ride_id_idx    ON earnings_pending(ride_id);
CREATE INDEX IF NOT EXISTS earnings_pending_driver_id_idx  ON earnings_pending(driver_id);
CREATE INDEX IF NOT EXISTS earnings_pending_status_idx     ON earnings_pending(status);
CREATE INDEX IF NOT EXISTS earnings_pending_created_at_idx ON earnings_pending(created_at);

-- Unique constraint: one pending row per ride (prevents double settlement)
CREATE UNIQUE INDEX IF NOT EXISTS earnings_pending_ride_unique
  ON earnings_pending(ride_id) WHERE status = 'pending';

COMMENT ON TABLE earnings_pending IS
  'Saga intermediate state: driver earnings held here after ride completion, '
  'settled to drivers.total_earnings only after payment is confirmed paid. '
  'Cash rides are settled immediately (payment collected in person). '
  'Rows older than 24h in status=pending are flagged for ops review.';

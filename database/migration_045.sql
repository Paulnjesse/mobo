-- migration_045.sql
-- Wallet Credit Packs, Pack Purchases, Loyalty Bonus Log
-- Adds total_spend_xaf tracking and 2% loyalty bonus on 20,000 XAF milestone
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. SPEND TRACKING ON USERS ───────────────────────────────────────────────
-- Tracks cumulative XAF spent on rides for loyalty bonus calculation.
-- next_loyalty_threshold is the next 20,000 XAF multiple that triggers a bonus.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS total_spend_xaf              BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_loyalty_threshold_xaf   BIGINT NOT NULL DEFAULT 20000;

-- ── 2. WALLET CREDIT PACKS ───────────────────────────────────────────────────
-- Admin-created packs that riders and/or drivers can purchase to top up their
-- wallet. Packs can carry a bonus percentage on top of the credited amount.
-- Use-cases:
--   rider  — pre-load wallet credit for rides
--   driver — prepay commission / keep emergency balance for the road
--   both   — available to all users

CREATE TABLE IF NOT EXISTS wallet_credit_packs (
  id              SERIAL PRIMARY KEY,
  name            TEXT    NOT NULL,
  pack_type       TEXT    NOT NULL CHECK (pack_type IN ('rider', 'driver', 'both')),
  price_xaf       INTEGER NOT NULL CHECK (price_xaf > 0),
  credit_xaf      INTEGER NOT NULL CHECK (credit_xaf > 0),
  bonus_percent   NUMERIC(5,2) NOT NULL DEFAULT 0
                  CHECK (bonus_percent >= 0 AND bonus_percent <= 100),
  description     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  valid_days      INTEGER,           -- NULL = no expiry on credited balance
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. WALLET PACK PURCHASES ─────────────────────────────────────────────────
-- Audit trail of every pack purchase. Wallet is credited at purchase time.

CREATE TABLE IF NOT EXISTS wallet_pack_purchases (
  id                  SERIAL PRIMARY KEY,
  user_id             UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pack_id             INTEGER NOT NULL REFERENCES wallet_credit_packs(id),
  amount_paid_xaf     INTEGER NOT NULL,
  credit_xaf          INTEGER NOT NULL,
  bonus_xaf           INTEGER NOT NULL DEFAULT 0,
  total_credited_xaf  INTEGER NOT NULL,
  expires_at          TIMESTAMPTZ,
  payment_method      TEXT,
  payment_ref         TEXT UNIQUE,
  status              TEXT NOT NULL DEFAULT 'completed'
                      CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. LOYALTY BONUS LOG ─────────────────────────────────────────────────────
-- Records every 400 XAF (2% × 20,000 XAF) bonus credited to a rider's wallet
-- when they cross a 20,000 XAF cumulative spend milestone.

CREATE TABLE IF NOT EXISTS loyalty_bonus_log (
  id                    SERIAL PRIMARY KEY,
  user_id               UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  threshold_xaf         INTEGER NOT NULL DEFAULT 20000,
  cumulative_spend_xaf  BIGINT  NOT NULL,
  bonus_xaf             INTEGER NOT NULL,
  ride_id               UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_wallet_credit_packs_type
  ON wallet_credit_packs (pack_type, is_active);

CREATE INDEX IF NOT EXISTS idx_wallet_pack_purchases_user
  ON wallet_pack_purchases (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_loyalty_bonus_log_user
  ON loyalty_bonus_log (user_id, created_at DESC);

-- ── Seed default packs ────────────────────────────────────────────────────────
INSERT INTO wallet_credit_packs
  (name, pack_type, price_xaf, credit_xaf, bonus_percent, description, sort_order)
VALUES
  ('Starter',    'both',   5000,  5000,  0,    'Top up 5,000 XAF to your wallet',                          1),
  ('Silver',     'both',   10000, 10000, 5,    'Top up 10,000 XAF + 5% bonus = 10,500 XAF credited',       2),
  ('Gold',       'both',   25000, 25000, 10,   'Top up 25,000 XAF + 10% bonus = 27,500 XAF credited',      3),
  ('Platinum',   'both',   50000, 50000, 15,   'Top up 50,000 XAF + 15% bonus = 57,500 XAF credited',      4),
  ('Driver Starter', 'driver', 5000,  5000,  0, 'Commission prepay — 5,000 XAF',                           5),
  ('Driver Pro',     'driver', 20000, 20000, 8, 'Commission prepay — 20,000 XAF + 8% bonus = 21,600 XAF', 6)
ON CONFLICT DO NOTHING;

-- ── Comments ──────────────────────────────────────────────────────────────────
COMMENT ON TABLE wallet_credit_packs IS
  'Admin-created wallet credit packs available for riders and drivers to purchase.';

COMMENT ON TABLE wallet_pack_purchases IS
  'Audit log of every wallet pack purchase; wallet_balance on users is updated at purchase time.';

COMMENT ON TABLE loyalty_bonus_log IS
  'Records 2% loyalty bonus (400 XAF) credited to riders each time cumulative spend crosses a 20,000 XAF milestone.';

COMMENT ON COLUMN users.total_spend_xaf IS
  'Cumulative XAF spent on completed rides; used for loyalty bonus threshold tracking.';

COMMENT ON COLUMN users.next_loyalty_threshold_xaf IS
  'Next cumulative spend milestone (multiple of 20,000) at which a 2% wallet bonus is awarded.';

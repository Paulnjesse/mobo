-- migration_022: Stripe idempotency keys + webhook event deduplication
-- Prevents double-charges on network retries and duplicate webhook delivery

BEGIN;

-- Add idempotency_key to payments (NULL for legacy rows)
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS idempotency_key UUID;

CREATE UNIQUE INDEX IF NOT EXISTS payments_idempotency_key_idx
  ON payments (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Stripe webhook event log — prevents duplicate processing of retried events
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT NOT NULL UNIQUE,       -- e.g. evt_1ABC...
  event_type    TEXT NOT NULL,                 -- e.g. payment_intent.succeeded
  payment_intent_id TEXT,
  processed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_payload   JSONB
);

CREATE INDEX IF NOT EXISTS stripe_webhook_events_pi_idx
  ON stripe_webhook_events (payment_intent_id);

-- Fraud flags table (needed by Fix #3)
CREATE TABLE IF NOT EXISTS fraud_flags (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id),
  ride_id       UUID REFERENCES rides(id),
  flag_type     TEXT NOT NULL,       -- 'gps_spoofing' | 'ride_collusion' | 'fare_manipulation'
  severity      TEXT NOT NULL DEFAULT 'medium', -- 'low' | 'medium' | 'high' | 'critical'
  details       JSONB NOT NULL DEFAULT '{}',
  resolved      BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_by   UUID REFERENCES users(id),
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fraud_flags_user_idx ON fraud_flags (user_id);
CREATE INDEX IF NOT EXISTS fraud_flags_ride_idx ON fraud_flags (ride_id);
CREATE INDEX IF NOT EXISTS fraud_flags_type_idx ON fraud_flags (flag_type, resolved);
CREATE INDEX IF NOT EXISTS fraud_flags_created_idx ON fraud_flags (created_at DESC);

COMMIT;

-- migration_027: Message TTL + Multi-currency support
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Message TTL ────────────────────────────────────────────────────────────
-- Add expires_at so the nightly purge job can DELETE in a simple index scan.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Backfill: existing messages expire 90 days after they were created.
UPDATE messages
   SET expires_at = created_at + INTERVAL '90 days'
 WHERE expires_at IS NULL;

-- Set a server-side default so future inserts are covered automatically.
ALTER TABLE messages
  ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '90 days');

-- Index to make the nightly purge cheap (partial: only un-expired rows matter
-- for the live query path; expired ones are purged by the job).
CREATE INDEX IF NOT EXISTS idx_messages_expires_at
  ON messages (expires_at)
  WHERE expires_at IS NOT NULL;

-- ── 2. Quick replies table (optional override — static defaults live in code) ──
-- Allows ops to add/translate quick-reply strings without a code deploy.
CREATE TABLE IF NOT EXISTS quick_replies (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role        VARCHAR(10)  NOT NULL CHECK (role IN ('rider','driver')),
  context     VARCHAR(20)  NOT NULL CHECK (context IN ('waiting','arriving','in_progress','general')),
  locale      CHAR(5)      NOT NULL DEFAULT 'en',
  text        TEXT         NOT NULL,
  display_order SMALLINT   NOT NULL DEFAULT 0,
  is_active   BOOLEAN      DEFAULT true,
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quick_replies_lookup
  ON quick_replies (role, context, locale, is_active);

-- ── 3. Country / currency configuration ───────────────────────────────────────
-- Stores the canonical currency for each country MOBO operates in.
-- xaf_rate_x1000: how many local currency units equal 1000 XAF (integer math).
--   e.g. NGN: 2750 → 1 XAF = 2.75 NGN
--        KES:  210 → 1 XAF = 0.21 KES
--        ZAR:   31 → 1 XAF = 0.031 ZAR
-- Rates are approximate and should be updated periodically via an ops migration.
CREATE TABLE IF NOT EXISTS country_currency_config (
  country_code    CHAR(2)      PRIMARY KEY,   -- ISO 3166-1 alpha-2
  country_name    VARCHAR(100) NOT NULL,
  currency_code   CHAR(3)      NOT NULL,       -- ISO 4217
  currency_symbol VARCHAR(10)  NOT NULL,
  xaf_rate_x1000  INTEGER      NOT NULL CHECK (xaf_rate_x1000 > 0),
  -- Stripe currency code (lowercase) — NULL if Stripe not available for this market
  stripe_currency CHAR(3),
  -- Primary mobile-money provider for this country (NULL = card/wallet only)
  mobile_money_provider VARCHAR(30),
  is_active       BOOLEAN      DEFAULT true,
  updated_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- ── Seed: all countries where MOBO is initially live ─────────────────────────
INSERT INTO country_currency_config
  (country_code, country_name, currency_code, currency_symbol, xaf_rate_x1000, stripe_currency, mobile_money_provider)
VALUES
  -- CFA Franc zone (XAF is native — rate 1000 = parity)
  ('CM', 'Cameroon',      'XAF', 'FCFA', 1000, 'xaf', 'mtn_mobile_money'),
  ('CI', 'Ivory Coast',   'XOF', 'CFA',   997, 'xof', 'orange_money'),   -- XOF ≈ XAF (both pegged 1:1 to EUR at 655.957)
  ('GA', 'Gabon',         'XAF', 'FCFA', 1000, 'xaf', 'airtel_money'),
  ('BJ', 'Benin',         'XOF', 'CFA',   997, 'xof', 'mtn_mobile_money'),
  ('NE', 'Niger',         'XOF', 'CFA',   997, 'xof', 'orange_money'),
  -- Non-XAF African markets
  ('NG', 'Nigeria',       'NGN', '₦',    2750, 'ngn', 'flutterwave'),
  ('KE', 'Kenya',         'KES', 'KSh',   210, 'kes', 'mpesa'),
  ('ZA', 'South Africa',  'ZAR', 'R',      31, 'zar', NULL),
  -- Additional high-opportunity markets
  ('GH', 'Ghana',         'GHS', 'GH₵',    16, 'ghs', 'mtn_mobile_money'),
  ('TZ', 'Tanzania',      'TZS', 'TSh',   450, 'tzs', 'mpesa'),
  ('UG', 'Uganda',        'UGX', 'USh',  6700, 'ugx', 'mtn_mobile_money'),
  ('RW', 'Rwanda',        'RWF', 'RF',    200, 'rwf', 'mtn_mobile_money'),
  ('SN', 'Senegal',       'XOF', 'CFA',   997, 'xof', 'wave'),
  ('ET', 'Ethiopia',      'ETB', 'Br',    110, NULL,   NULL),
  ('EG', 'Egypt',         'EGP', 'E£',    820, 'egp',  NULL)
ON CONFLICT (country_code) DO UPDATE
  SET country_name          = EXCLUDED.country_name,
      currency_code         = EXCLUDED.currency_code,
      currency_symbol       = EXCLUDED.currency_symbol,
      xaf_rate_x1000        = EXCLUDED.xaf_rate_x1000,
      stripe_currency       = EXCLUDED.stripe_currency,
      mobile_money_provider = EXCLUDED.mobile_money_provider,
      updated_at            = NOW();

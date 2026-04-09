-- migration_028: Add country_code (ISO alpha-2) to users table
-- Enables precise currency resolution without relying on free-text country names.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add the column (nullable first so backfill can run without constraint issues)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS country_code CHAR(2);

-- 2. Backfill from existing free-text country field using a CASE map.
--    Any unrecognised value stays NULL and the app falls back to 'CM'.
UPDATE users
SET country_code = CASE country
  WHEN 'Cameroon'      THEN 'CM'
  WHEN 'Nigeria'       THEN 'NG'
  WHEN 'Kenya'         THEN 'KE'
  WHEN 'South Africa'  THEN 'ZA'
  WHEN 'Ivory Coast'   THEN 'CI'
  WHEN 'Côte d''Ivoire' THEN 'CI'
  WHEN 'Gabon'         THEN 'GA'
  WHEN 'Benin'         THEN 'BJ'
  WHEN 'Niger'         THEN 'NE'
  WHEN 'Ghana'         THEN 'GH'
  WHEN 'Tanzania'      THEN 'TZ'
  WHEN 'Uganda'        THEN 'UG'
  WHEN 'Rwanda'        THEN 'RW'
  WHEN 'Senegal'       THEN 'SN'
  WHEN 'Ethiopia'      THEN 'ET'
  WHEN 'Egypt'         THEN 'EG'
  ELSE NULL
END
WHERE country_code IS NULL;

-- 3. Default remaining NULLs to Cameroon (safe fallback for legacy rows)
UPDATE users SET country_code = 'CM' WHERE country_code IS NULL;

-- 4. Now that backfill is complete, apply NOT NULL + default
ALTER TABLE users
  ALTER COLUMN country_code SET NOT NULL,
  ALTER COLUMN country_code SET DEFAULT 'CM';

-- 5. FK to country_currency_config ensures only supported country codes are stored
--    (DEFERRABLE so bulk inserts don't race with the config table seed)
ALTER TABLE users
  ADD CONSTRAINT fk_users_country_currency
    FOREIGN KEY (country_code)
    REFERENCES country_currency_config (country_code)
    ON UPDATE CASCADE
    DEFERRABLE INITIALLY DEFERRED;

-- 6. Index for fast currency lookups without full table scans
CREATE INDEX IF NOT EXISTS idx_users_country_code ON users (country_code);

-- 7. Add country_code to the drivers table as a convenience denorm
--    (resolved from the linked user record on read; stored here for fast queries)
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS country_code CHAR(2)
    REFERENCES country_currency_config (country_code)
    ON UPDATE CASCADE
    DEFERRABLE INITIALLY DEFERRED;

UPDATE drivers d
   SET country_code = u.country_code
  FROM users u
 WHERE d.user_id = u.id
   AND d.country_code IS NULL;

-- 8. Currency preference for wallet top-ups (riders can top up in local currency)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferred_currency CHAR(3)
    GENERATED ALWAYS AS (
      CASE country_code
        WHEN 'NG' THEN 'NGN'
        WHEN 'KE' THEN 'KES'
        WHEN 'ZA' THEN 'ZAR'
        WHEN 'GH' THEN 'GHS'
        WHEN 'TZ' THEN 'TZS'
        WHEN 'UG' THEN 'UGX'
        WHEN 'RW' THEN 'RWF'
        WHEN 'ET' THEN 'ETB'
        WHEN 'EG' THEN 'EGP'
        WHEN 'CI' THEN 'XOF'
        WHEN 'BJ' THEN 'XOF'
        WHEN 'NE' THEN 'XOF'
        WHEN 'SN' THEN 'XOF'
        ELSE 'XAF'
      END
    ) STORED;

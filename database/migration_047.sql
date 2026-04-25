-- migration_047.sql
-- Performance indexes identified in QA audit (April 2026)
-- All use IF NOT EXISTS / CONCURRENTLY — safe to run on live database.

-- 1. Admin ride list: filtered by status + sorted by created_at (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_rides_status_created
  ON rides (status, created_at DESC);

-- 2. OTP / phone verification: lookup by phone + active filter
CREATE INDEX IF NOT EXISTS idx_users_phone_active
  ON users (phone)
  WHERE is_active = true;

-- 3. Rider payment history: user_id + newest-first ordering
CREATE INDEX IF NOT EXISTS idx_payments_user_created
  ON payments (user_id, created_at DESC);

COMMENT ON INDEX idx_rides_status_created IS
  'Supports admin ride list filtered by status; eliminates O(n) full-table scan.';
COMMENT ON INDEX idx_users_phone_active IS
  'Supports OTP verification and phone-lookup auth queries on active accounts only.';
COMMENT ON INDEX idx_payments_user_created IS
  'Supports rider/driver payment history queries ordered by newest first.';

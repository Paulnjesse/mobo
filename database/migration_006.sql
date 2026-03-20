-- MOBO Migration 006 — Safety enforcement additions
-- Adds escalated_at timestamp to ride_checkins for auto-escalation tracking
-- Resets driver trip counters daily via pg_cron (if enabled) or application job

ALTER TABLE ride_checkins
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;

-- Reset total_trips_today each day at midnight (requires pg_cron extension)
-- If pg_cron is not available, the application job handles this
-- SELECT cron.schedule('reset-driver-trips', '0 0 * * *',
--   $$UPDATE drivers SET total_trips_today = 0, online_since = NULL$$);

-- Index for escalation job polling performance
CREATE INDEX IF NOT EXISTS idx_checkins_unescalated
  ON ride_checkins(created_at)
  WHERE response IS NULL AND escalated IS NOT TRUE;

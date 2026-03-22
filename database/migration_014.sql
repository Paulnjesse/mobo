-- Migration 014: Scheduled Ride Reminders + Profile Photo + Offline Cache
-- Run with: psql $DATABASE_URL -f migration_014.sql

-- ── 1. Scheduled ride reminder tracking ────────────────────────────────────
ALTER TABLE rides ADD COLUMN IF NOT EXISTS reminder_24h_sent  BOOLEAN DEFAULT false;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS reminder_1h_sent   BOOLEAN DEFAULT false;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS auto_dispatched_at TIMESTAMPTZ;

-- ── 2. Rider push token on users ────────────────────────────────────────────
-- Already expected by pushNotifications.js; ensure column exists
ALTER TABLE users ADD COLUMN IF NOT EXISTS push_token TEXT;

-- ── 3. Driver profile photo ──────────────────────────────────────────────────
-- Feature 28: include driver photo in arrival push
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;

-- ── 4. Index for upcoming scheduled ride polling ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rides_scheduled_pending
  ON rides (scheduled_at)
  WHERE is_scheduled = true AND status = 'pending';

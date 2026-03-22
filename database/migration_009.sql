-- Migration 009: Password reset OTP columns
-- Run in Supabase SQL editor

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reset_otp          VARCHAR(6),
  ADD COLUMN IF NOT EXISTS reset_otp_expiry   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reset_otp_attempts INT NOT NULL DEFAULT 0;

-- Index for fast lookup during reset flow
CREATE INDEX IF NOT EXISTS idx_users_reset_otp ON users (reset_otp)
  WHERE reset_otp IS NOT NULL;

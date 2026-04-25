-- migration_044.sql
-- Ad Platform Configuration (AdMob + AdSense) and Animated Splash Settings
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. AD PLATFORM CONFIG ────────────────────────────────────────────────────
-- Stores per-platform config for Google AdMob (mobile) and Google AdSense (web).
-- Admins configure publisher IDs and unit IDs from the dashboard.
-- Mobile app and admin web read these to activate the relevant SDK.

CREATE TABLE IF NOT EXISTS ad_platform_config (
  id                   SERIAL PRIMARY KEY,
  platform             TEXT NOT NULL CHECK (platform IN ('admob', 'adsense')),
  is_enabled           BOOLEAN NOT NULL DEFAULT false,
  test_mode            BOOLEAN NOT NULL DEFAULT true,   -- use Google test ad unit IDs
  publisher_id         TEXT,   -- AdMob: ca-app-pub-XXXX / AdSense: ca-pub-XXXX
  app_id               TEXT,   -- AdMob only: ca-app-pub-XXXX~APPXXXX (Android)
  app_id_ios           TEXT,   -- AdMob only: ca-app-pub-XXXX~APPXXXX (iOS)
  banner_unit_id       TEXT,   -- AdMob banner / AdSense ad slot
  interstitial_unit_id TEXT,   -- AdMob interstitial unit ID
  rewarded_unit_id     TEXT,   -- AdMob rewarded video unit ID
  native_unit_id       TEXT,   -- AdMob native advanced unit ID
  adsense_client       TEXT,   -- AdSense: data-ad-client (same as publisher_id)
  adsense_slot_header  TEXT,   -- AdSense slot for admin header banner
  adsense_slot_sidebar TEXT,   -- AdSense slot for admin sidebar
  config_json          JSONB   NOT NULL DEFAULT '{}',
  updated_by           UUID,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (platform)
);

-- ── 2. APP SPLASH CONFIG ─────────────────────────────────────────────────────
-- Controls the animated splash screen shown on mobile app launch.
-- Only one row (id=1) used; updated via admin dashboard.

CREATE TABLE IF NOT EXISTS app_splash_config (
  id               INTEGER PRIMARY KEY DEFAULT 1,  -- singleton
  enabled          BOOLEAN NOT NULL DEFAULT true,
  animation_type   TEXT    NOT NULL DEFAULT 'logo_pulse'
                   CHECK (animation_type IN ('logo_pulse', 'logo_slide', 'logo_fade', 'full_screen')),
  duration_ms      INTEGER NOT NULL DEFAULT 2500   CHECK (duration_ms BETWEEN 500 AND 8000),
  background_color TEXT    NOT NULL DEFAULT '#1A1A2E',
  logo_color       TEXT    NOT NULL DEFAULT '#FF00BF',
  show_tagline     BOOLEAN NOT NULL DEFAULT true,
  tagline_text     TEXT    NOT NULL DEFAULT 'Your ride, your way.',
  updated_by       UUID,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Seed defaults ─────────────────────────────────────────────────────────────
INSERT INTO ad_platform_config (platform, is_enabled, test_mode)
VALUES ('admob', false, true), ('adsense', false, true)
ON CONFLICT (platform) DO NOTHING;

INSERT INTO app_splash_config (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ad_platform_config_platform
  ON ad_platform_config (platform);

COMMENT ON TABLE ad_platform_config IS
  'Google AdMob (mobile) and AdSense (web) publisher/unit IDs, managed via admin dashboard.';

COMMENT ON TABLE app_splash_config IS
  'Singleton config for the mobile animated splash screen (animation type, colors, duration).';

'use strict';
/**
 * adPlatformController.js
 * Manages Google AdMob + AdSense configuration and animated splash settings.
 *
 * Public (mobile/web):
 *   GET  /ads/platform/config/:platform   — fetch config for one platform
 *   GET  /ads/platform/splash             — fetch splash screen config
 *
 * Admin:
 *   GET  /ads/platform/all                — list all platform configs
 *   PUT  /ads/platform/:platform          — upsert AdMob or AdSense config
 *   PUT  /ads/platform/splash/config      — update splash config
 */

const logger = require('../utils/logger');
const db = require('../db');

// ── Public: get config for one platform (mobile / admin web read) ─────────────
exports.getPlatformConfig = async (req, res) => {
  try {
    const { platform } = req.params;
    if (!['admob', 'adsense'].includes(platform)) {
      return res.status(400).json({ error: 'platform must be admob or adsense' });
    }
    const { rows } = await db.query(
      `SELECT platform, is_enabled, test_mode, publisher_id, app_id, app_id_ios,
              banner_unit_id, interstitial_unit_id, rewarded_unit_id, native_unit_id,
              adsense_client, adsense_slot_header, adsense_slot_sidebar, config_json
       FROM ad_platform_config WHERE platform = $1`, [platform]
    );
    if (!rows.length) return res.status(404).json({ error: 'Config not found' });

    // Mask sensitive fields in non-admin context — return only what the SDK needs
    const cfg = rows[0];
    if (!cfg.is_enabled) return res.json({ enabled: false });

    return res.json({
      enabled:              cfg.is_enabled,
      test_mode:            cfg.test_mode,
      publisher_id:         cfg.publisher_id,
      app_id:               cfg.app_id,
      app_id_ios:           cfg.app_id_ios,
      banner_unit_id:       cfg.banner_unit_id,
      interstitial_unit_id: cfg.interstitial_unit_id,
      rewarded_unit_id:     cfg.rewarded_unit_id,
      native_unit_id:       cfg.native_unit_id,
      adsense_client:       cfg.adsense_client,
      adsense_slot_header:  cfg.adsense_slot_header,
      adsense_slot_sidebar: cfg.adsense_slot_sidebar,
    });
  } catch (err) {
    logger.error('[AdPlatform] getPlatformConfig:', err);
    res.status(500).json({ error: 'Failed to load platform config' });
  }
};

// ── Public: get splash config ─────────────────────────────────────────────────
exports.getSplashConfig = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT enabled, animation_type, duration_ms, background_color,
              logo_color, show_tagline, tagline_text
       FROM app_splash_config WHERE id = 1`
    );
    if (!rows.length) return res.json({ enabled: true, animation_type: 'logo_pulse', duration_ms: 2500 });
    res.json(rows[0]);
  } catch (err) {
    logger.error('[AdPlatform] getSplashConfig:', err);
    res.status(500).json({ error: 'Failed to load splash config' });
  }
};

// ── Admin: list all platform configs ─────────────────────────────────────────
exports.listAllPlatformConfigs = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM ad_platform_config ORDER BY platform ASC`
    );
    const splash = await db.query(`SELECT * FROM app_splash_config WHERE id = 1`);
    res.json({ platforms: rows, splash: splash.rows[0] || null });
  } catch (err) {
    logger.error('[AdPlatform] listAllPlatformConfigs:', err);
    res.status(500).json({ error: 'Failed to list platform configs' });
  }
};

// ── Admin: upsert one platform config ────────────────────────────────────────
exports.upsertPlatformConfig = async (req, res) => {
  try {
    const { platform } = req.params;
    if (!['admob', 'adsense'].includes(platform)) {
      return res.status(400).json({ error: 'platform must be admob or adsense' });
    }

    const {
      is_enabled, test_mode,
      publisher_id, app_id, app_id_ios,
      banner_unit_id, interstitial_unit_id, rewarded_unit_id, native_unit_id,
      adsense_client, adsense_slot_header, adsense_slot_sidebar,
      config_json,
    } = req.body;

    // Validate: if enabling, require at minimum a publisher_id
    if (is_enabled && !publisher_id) {
      return res.status(400).json({ error: 'publisher_id is required to enable the platform' });
    }

    const { rows } = await db.query(
      `INSERT INTO ad_platform_config
         (platform, is_enabled, test_mode, publisher_id, app_id, app_id_ios,
          banner_unit_id, interstitial_unit_id, rewarded_unit_id, native_unit_id,
          adsense_client, adsense_slot_header, adsense_slot_sidebar, config_json, updated_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
       ON CONFLICT (platform) DO UPDATE SET
         is_enabled           = EXCLUDED.is_enabled,
         test_mode            = EXCLUDED.test_mode,
         publisher_id         = COALESCE(EXCLUDED.publisher_id, ad_platform_config.publisher_id),
         app_id               = COALESCE(EXCLUDED.app_id, ad_platform_config.app_id),
         app_id_ios           = COALESCE(EXCLUDED.app_id_ios, ad_platform_config.app_id_ios),
         banner_unit_id       = COALESCE(EXCLUDED.banner_unit_id, ad_platform_config.banner_unit_id),
         interstitial_unit_id = COALESCE(EXCLUDED.interstitial_unit_id, ad_platform_config.interstitial_unit_id),
         rewarded_unit_id     = COALESCE(EXCLUDED.rewarded_unit_id, ad_platform_config.rewarded_unit_id),
         native_unit_id       = COALESCE(EXCLUDED.native_unit_id, ad_platform_config.native_unit_id),
         adsense_client       = COALESCE(EXCLUDED.adsense_client, ad_platform_config.adsense_client),
         adsense_slot_header  = COALESCE(EXCLUDED.adsense_slot_header, ad_platform_config.adsense_slot_header),
         adsense_slot_sidebar = COALESCE(EXCLUDED.adsense_slot_sidebar, ad_platform_config.adsense_slot_sidebar),
         config_json          = COALESCE(EXCLUDED.config_json, ad_platform_config.config_json),
         updated_by           = EXCLUDED.updated_by,
         updated_at           = NOW()
       RETURNING *`,
      [platform, is_enabled ?? false, test_mode ?? true,
       publisher_id || null, app_id || null, app_id_ios || null,
       banner_unit_id || null, interstitial_unit_id || null,
       rewarded_unit_id || null, native_unit_id || null,
       adsense_client || publisher_id || null,
       adsense_slot_header || null, adsense_slot_sidebar || null,
       config_json ? JSON.stringify(config_json) : '{}',
       req.user?.id || null]
    );

    logger.info(`[AdPlatform] ${platform} config updated by ${req.user?.id}`);
    res.json({ config: rows[0] });
  } catch (err) {
    logger.error('[AdPlatform] upsertPlatformConfig:', err);
    res.status(500).json({ error: 'Failed to update platform config' });
  }
};

// ── Admin: update splash config ───────────────────────────────────────────────
exports.updateSplashConfig = async (req, res) => {
  try {
    const {
      enabled, animation_type, duration_ms,
      background_color, logo_color, show_tagline, tagline_text,
    } = req.body;

    const { rows } = await db.query(
      `INSERT INTO app_splash_config
         (id, enabled, animation_type, duration_ms, background_color,
          logo_color, show_tagline, tagline_text, updated_by, updated_at)
       VALUES (1,$1,$2,$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT (id) DO UPDATE SET
         enabled          = COALESCE(EXCLUDED.enabled, app_splash_config.enabled),
         animation_type   = COALESCE(EXCLUDED.animation_type, app_splash_config.animation_type),
         duration_ms      = COALESCE(EXCLUDED.duration_ms, app_splash_config.duration_ms),
         background_color = COALESCE(EXCLUDED.background_color, app_splash_config.background_color),
         logo_color       = COALESCE(EXCLUDED.logo_color, app_splash_config.logo_color),
         show_tagline     = COALESCE(EXCLUDED.show_tagline, app_splash_config.show_tagline),
         tagline_text     = COALESCE(EXCLUDED.tagline_text, app_splash_config.tagline_text),
         updated_by       = EXCLUDED.updated_by,
         updated_at       = NOW()
       RETURNING *`,
      [enabled ?? true, animation_type || 'logo_pulse', duration_ms || 2500,
       background_color || '#1A1A2E', logo_color || '#FF00BF',
       show_tagline ?? true, tagline_text || 'Your ride, your way.',
       req.user?.id || null]
    );

    logger.info(`[AdPlatform] splash config updated by ${req.user?.id}`);
    res.json({ splash: rows[0] });
  } catch (err) {
    logger.error('[AdPlatform] updateSplashConfig:', err);
    res.status(500).json({ error: 'Failed to update splash config' });
  }
};
